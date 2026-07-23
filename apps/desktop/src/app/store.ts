import { create } from "zustand";
import {
  AtriaBlock,
  AtriaBlockType,
  Page,
  WorkspaceFolder,
  WorkspaceSnapshot,
} from "@atria/schema";
import { createBlock, createEmptyDocument, nowIso, slugify } from "@atria/core";
import {
  createDirectory,
  checkpointWorkspacePaths,
  createPageFilePath,
  deleteWorkspacePath,
  importImageDataUrl,
  moveWorkspacePath,
  queueWorkspaceSave,
  readWorkspaceTextFile,
  scheduleDocumentCheckpoint,
  writeWorkspaceTextFile,
} from "./workspaceClient";
import { existingRecentFiles } from "./workspaceNavigation";
import { workspaceAssetFromEntry } from "./workspaceFiles";
import {
  isSourceDraftDirty,
  persistSourceDraft,
  type SourceDraft,
  type SourceDraftSaveResult,
} from "./sourceDrafts";
import { mutateWorkspaceTag, normalizeTagName } from "./tagMutations";

export type ActiveTool = "files" | "search" | "graph" | "tags" | "history" | "settings";
export type TabType = "page" | "artifact" | "asset" | "timeline";
export type FileNodeType = Exclude<TabType, "timeline">;
export type WorkspaceSaveStatus = "idle" | "saving" | "saved" | "error";

export interface WorkspaceTab {
  key: string;
  type: TabType;
  id: string;
  title: string;
  source: "human" | "ai";
  dirty?: boolean;
}

interface AddBlockOptions {
  afterBlockId?: string;
  beforeBlockId?: string;
}

interface AtriaState {
  activeTool: ActiveTool;
  activeTabKey: string;
  activeBlockId?: string;
  activeBlockPageId?: string;
  filter: string;
  selectedFolderId: string;
  saveStatus: WorkspaceSaveStatus;
  saveError: string;
  sourceDrafts: Record<string, SourceDraft>;
  snapshot?: WorkspaceSnapshot;
  tabs: WorkspaceTab[];
  setSnapshot(snapshot: WorkspaceSnapshot): void;
  setActiveTool(tool: ActiveTool): void;
  setFilter(filter: string): void;
  setSelectedFolder(folderId: string): void;
  setActiveBlock(pageId: string, blockId: string): void;
  toggleFolder(folderId: string): void;
  openNode(type: TabType, id: string): void;
  closeTab(key: string): void;
  setSourceDraft(draft: SourceDraft): void;
  clearSourceDraft(key: string): void;
  saveSourceDraft(key: string): Promise<SourceDraftSaveResult>;
  createFolder(parentFolderId?: string | null, name?: string): Promise<void>;
  renameFolder(folderId: string, name: string): Promise<void>;
  moveFolder(folderId: string, parentFolderId: string | null): Promise<void>;
  deleteFolder(folderId: string): Promise<void>;
  createPage(folderId?: string, title?: string): Promise<void>;
  createTextFile(folderId?: string, name?: string): Promise<void>;
  renameNode(type: FileNodeType, id: string, name: string): Promise<void>;
  moveNode(type: FileNodeType, id: string, folderId: string | null): Promise<void>;
  updatePage(pageId: string, patch: Partial<Page>): void;
  renameTag(currentTag: string, nextTag: string): Promise<void>;
  deleteTag(tag: string): Promise<void>;
  deleteNode(type: FileNodeType, id: string): Promise<void>;
  addBlock(type: AtriaBlockType, options?: AddBlockOptions): void;
  addImageFromDataUrl(dataUrl: string, pageId?: string, afterBlockId?: string): Promise<void>;
  updateBlock(pageId: string, blockId: string, patch: Partial<AtriaBlock>): void;
  deleteBlock(pageId: string, blockId: string): void;
  moveBlock(pageId: string, blockId: string, direction: -1 | 1): void;
  retrySave(): void;
}

function nodeKey(type: TabType, id: string): string {
  return `${type}:${id}`;
}

function titleFor(snapshot: WorkspaceSnapshot, type: TabType, id: string): string {
  if (type === "artifact") return snapshot.artifacts.find((item) => item.id === id)?.title ?? id;
  if (type === "asset") return snapshot.assets.find((item) => item.id === id)?.title ?? id;
  if (type === "timeline") return snapshot.timeline.find((item) => item.id === id)?.title ?? id;
  return snapshot.pages.find((item) => item.id === id)?.title ?? id;
}

function sourceFor(snapshot: WorkspaceSnapshot, type: TabType, id: string): "human" | "ai" {
  if (type === "artifact") return snapshot.artifacts.find((item) => item.id === id)?.source ?? "ai";
  if (type === "page") return snapshot.pages.find((item) => item.id === id)?.source ?? "human";
  return "human";
}

let saveSequence = 0;

function persist(snapshot: WorkspaceSnapshot | undefined): void {
  if (!snapshot) return;
  const sequence = ++saveSequence;
  queueMicrotask(() => useAtriaStore.setState({ saveStatus: "saving", saveError: "" }));
  void queueWorkspaceSave(snapshot)
    .then(() => {
      if (sequence !== saveSequence) return;
      useAtriaStore.setState({ saveStatus: "saved", saveError: "" });
      window.setTimeout(() => {
        if (sequence === saveSequence) useAtriaStore.setState({ saveStatus: "idle" });
      }, 1400);
    })
    .catch((error) => {
      if (sequence !== saveSequence) return;
      useAtriaStore.setState({
        saveStatus: "error",
        saveError: error instanceof Error ? error.message : String(error),
      });
    });
}

function withUpdatedPage(
  snapshot: WorkspaceSnapshot | undefined,
  pageId: string,
  updater: (page: Page) => Page,
): WorkspaceSnapshot | undefined {
  if (!snapshot) return snapshot;
  let updatedPage: Page | undefined;
  const pages = snapshot.pages.map((page) => {
    if (page.id !== pageId) return page;
    updatedPage = updater(page);
    return updatedPage;
  });
  return {
    ...snapshot,
    pages,
    documents: updatedPage
      ? snapshot.documents.map((document) =>
          document.id === pageId
            ? {
                ...document,
                path: updatedPage!.filePath ?? document.path,
                title: updatedPage!.title,
                tags: updatedPage!.tags,
                updatedAt: updatedPage!.updatedAt,
              }
            : document,
        )
      : snapshot.documents,
    updatedAt: nowIso(),
  };
}

function activePageId(state: AtriaState): string | undefined {
  return state.tabs.find((tab) => tab.key === state.activeTabKey && tab.type === "page")?.id;
}

function insertBlock(blocks: AtriaBlock[], block: AtriaBlock, options: AddBlockOptions = {}): AtriaBlock[] {
  if (options.beforeBlockId) {
    const index = blocks.findIndex((item) => item.id === options.beforeBlockId);
    if (index >= 0) return [...blocks.slice(0, index), block, ...blocks.slice(index)];
  }
  if (options.afterBlockId) {
    const index = blocks.findIndex((item) => item.id === options.afterBlockId);
    if (index >= 0) return [...blocks.slice(0, index + 1), block, ...blocks.slice(index + 1)];
  }
  return [...blocks, block];
}

function uniquePageFilePath(snapshot: WorkspaceSnapshot, folderId: string, title: string): string {
  const base = createPageFilePath(snapshot, folderId, title);
  const used = workspaceFilePaths(snapshot);
  if (!used.has(base)) return base;
  const suffix = crypto.randomUUID().slice(0, 6);
  return base.replace(/\.html$/i, `-${suffix}.html`);
}

function uniqueWorkspaceFilePath(snapshot: WorkspaceSnapshot, requestedPath: string): string {
  const used = workspaceFilePaths(snapshot);
  if (!used.has(requestedPath)) return requestedPath;
  const parent = workspaceParentPath(requestedPath);
  const fileName = workspaceFileName(requestedPath);
  const dot = fileName.lastIndexOf(".");
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const extension = dot > 0 ? fileName.slice(dot) : "";
  let counter = 2;
  let candidate = joinWorkspacePath(parent, `${stem}-${counter}${extension}`);
  while (used.has(candidate)) {
    counter += 1;
    candidate = joinWorkspacePath(parent, `${stem}-${counter}${extension}`);
  }
  return candidate;
}

function workspaceFilePaths(snapshot: WorkspaceSnapshot): Set<string> {
  return new Set(snapshot.tree.map((item) => item.filePath).filter((path): path is string => Boolean(path)));
}

function folderContains(folder: WorkspaceFolder, path: string | undefined): boolean {
  if (!folder.path || !path) return false;
  return path === folder.path || path.startsWith(`${folder.path}/`);
}

function joinWorkspacePath(...parts: Array<string | undefined>): string {
  return parts
    .filter(Boolean)
    .join("/")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "");
}

function workspaceParentPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index < 0 ? "" : normalized.slice(0, index);
}

function workspaceFileName(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}

function cleanWorkspaceName(name: string, fallback = "Untitled"): string {
  return name.replace(/[<>:"\\|?*]+/g, "-").trim().replace(/[. ]+$/g, "") || fallback;
}

function replaceWorkspacePath(path: string | undefined, fromPath: string, toPath: string): string | undefined {
  if (!path) return path;
  if (path === fromPath) return toPath;
  return path.startsWith(`${fromPath}/`) ? `${toPath}${path.slice(fromPath.length)}` : path;
}

function remapFolderSnapshot(
  snapshot: WorkspaceSnapshot,
  folderId: string,
  parentFolderId: string | null,
  fromPath: string,
  toPath: string,
): WorkspaceSnapshot {
  const name = workspaceFileName(toPath);
  return {
    ...snapshot,
    folders: snapshot.folders.map((folder) => ({
      ...folder,
      name: folder.id === folderId ? name : folder.name,
      parentId: folder.id === folderId ? parentFolderId : folder.parentId,
      path: replaceWorkspacePath(folder.path, fromPath, toPath),
    })),
    pages: snapshot.pages.map((page) => ({
      ...page,
      filePath: replaceWorkspacePath(page.filePath, fromPath, toPath),
    })),
    artifacts: snapshot.artifacts.map((artifact) => ({
      ...artifact,
      filePath: replaceWorkspacePath(artifact.filePath, fromPath, toPath),
    })),
    assets: snapshot.assets.map((asset) => ({
      ...asset,
      filePath: replaceWorkspacePath(asset.filePath, fromPath, toPath) ?? asset.filePath,
    })),
    documents: snapshot.documents.map((document) => ({
      ...document,
      path: replaceWorkspacePath(document.path, fromPath, toPath) ?? document.path,
    })),
    tree: snapshot.tree.map((item) => ({
      ...item,
      filePath: replaceWorkspacePath(item.filePath, fromPath, toPath),
    })),
    updatedAt: nowIso(),
  };
}

function movedWorkspacePaths(
  before: WorkspaceSnapshot,
  after: WorkspaceSnapshot,
  folderPath: string,
): string[] {
  const beforeFiles = [
    ...before.documents.map((document) => ({ key: `document:${document.id}`, path: document.path })),
    ...before.assets.map((asset) => ({ key: `asset:${asset.id}`, path: asset.filePath })),
  ];
  const nextById = new Map<string, string>([
    ...after.documents.map((document) => [`document:${document.id}`, document.path] as const),
    ...after.assets.map((asset) => [`asset:${asset.id}`, asset.filePath] as const),
  ]);
  return beforeFiles.flatMap((file) =>
    file.path === folderPath || file.path.startsWith(`${folderPath}/`)
      ? [file.path, nextById.get(file.key)].filter((path): path is string => Boolean(path))
      : [],
  );
}

function retainDraftsForTabs(
  drafts: Record<string, SourceDraft>,
  tabs: WorkspaceTab[],
): Record<string, SourceDraft> {
  const tabKeys = new Set(tabs.map((tab) => tab.key));
  return Object.fromEntries(Object.entries(drafts).filter(([key]) => tabKeys.has(key)));
}

function remapSourceDraftPaths(
  drafts: Record<string, SourceDraft>,
  fromPath: string,
  toPath: string,
): Record<string, SourceDraft> {
  return Object.fromEntries(
    Object.entries(drafts).map(([key, draft]) => [
      key,
      { ...draft, filePath: replaceWorkspacePath(draft.filePath, fromPath, toPath) ?? draft.filePath },
    ]),
  );
}

export const useAtriaStore = create<AtriaState>((set, get) => ({
  activeTool: "files",
  activeTabKey: "",
  activeBlockId: undefined,
  activeBlockPageId: undefined,
  filter: "",
  selectedFolderId: "",
  saveStatus: "idle",
  saveError: "",
  sourceDrafts: {},
  tabs: [],

  setSnapshot(nextSnapshot) {
    const recentFiles = existingRecentFiles(nextSnapshot);
    const snapshot = {
      ...nextSnapshot,
      settings: { ...nextSnapshot.settings, recentFiles },
    };
    set((state) => {
      const sourceDrafts = state.snapshot && state.snapshot.settings.workspacePath !== snapshot.settings.workspacePath
        ? {}
        : state.sourceDrafts;
      const tabs = state.tabs
        .map((tab) => {
          const exists =
            tab.type === "artifact"
              ? snapshot.artifacts.some((item) => item.id === tab.id)
              : tab.type === "asset"
                ? snapshot.assets.some((item) => item.id === tab.id)
              : tab.type === "timeline"
                ? snapshot.timeline.some((item) => item.id === tab.id)
                : snapshot.pages.some((item) => item.id === tab.id);
          return exists
            ? {
                ...tab,
                title: titleFor(snapshot, tab.type, tab.id),
                source: sourceFor(snapshot, tab.type, tab.id),
                dirty: isSourceDraftDirty(sourceDrafts[tab.key]),
              }
            : null;
        })
        .filter(Boolean) as WorkspaceTab[];

      if (!tabs.length) {
        const firstPage = snapshot.pages[0];
        const firstArtifact = snapshot.artifacts[0];
        const firstAsset = snapshot.assets[0];
        const first = firstPage
          ? {
              key: nodeKey("page", firstPage.id),
              type: "page" as const,
              id: firstPage.id,
              title: firstPage.title,
              source: firstPage.source,
            }
          : firstArtifact
            ? {
                key: nodeKey("artifact", firstArtifact.id),
                type: "artifact" as const,
                id: firstArtifact.id,
                title: firstArtifact.title,
                source: "ai" as const,
              }
            : firstAsset
              ? {
                  key: nodeKey("asset", firstAsset.id),
                  type: "asset" as const,
                  id: firstAsset.id,
                  title: firstAsset.title,
                  source: "human" as const,
                }
              : undefined;
        if (first) tabs.push(first);
      }

      const activeTabKey = tabs.some((tab) => tab.key === state.activeTabKey)
        ? state.activeTabKey
        : (tabs[0]?.key ?? "");
      const activePage = tabs.find((tab) => tab.key === activeTabKey && tab.type === "page");
      const page = activePage ? snapshot.pages.find((item) => item.id === activePage.id) : undefined;
      const activeBlockId = page?.blocks.some((block) => block.id === state.activeBlockId)
        ? state.activeBlockId
        : page?.blocks[0]?.id;

      return {
        snapshot,
        tabs,
        sourceDrafts: retainDraftsForTabs(sourceDrafts, tabs),
        selectedFolderId: snapshot.folders.some((folder) => folder.id === state.selectedFolderId)
          ? state.selectedFolderId
          : snapshot.folders[0]?.id || "",
        activeTabKey,
        activeBlockId,
        activeBlockPageId: activeBlockId && activePage ? activePage.id : undefined,
      };
    });
  },

  setActiveTool(tool) {
    set({ activeTool: tool });
  },

  setFilter(filter) {
    set({ filter });
  },

  setSelectedFolder(folderId) {
    set({ selectedFolderId: folderId });
  },

  setActiveBlock(pageId, blockId) {
    set({ activeBlockPageId: pageId, activeBlockId: blockId });
  },

  toggleFolder(folderId) {
    set((state) => {
      if (!state.snapshot) return state;
      const snapshot = {
        ...state.snapshot,
        folders: state.snapshot.folders.map((folder) =>
          folder.id === folderId ? { ...folder, expanded: !folder.expanded } : folder,
        ),
        updatedAt: nowIso(),
      };
      persist(snapshot);
      return { snapshot };
    });
  },

  openNode(type, id) {
    const snapshot = get().snapshot;
    if (!snapshot) return;
    const key = nodeKey(type, id);
    const title = titleFor(snapshot, type, id);
    const source = sourceFor(snapshot, type, id);
    const openedAt = nowIso();

    set((state) => {
      const exists = state.tabs.some((tab) => tab.key === key);
      const page = type === "page" ? state.snapshot?.pages.find((item) => item.id === id) : undefined;
      const firstBlockId = page?.blocks[0]?.id;
      const nextSnapshot = state.snapshot
        ? {
            ...state.snapshot,
            settings: {
              ...state.snapshot.settings,
              recentFiles: [
                { type, id, title, source, openedAt },
                ...(state.snapshot.settings.recentFiles ?? []).filter((item) => !(item.type === type && item.id === id)),
              ].slice(0, 20),
            },
            updatedAt: nowIso(),
          }
        : state.snapshot;
      persist(nextSnapshot);
      return {
        snapshot: nextSnapshot,
        activeTabKey: key,
        activeBlockId: type === "page" ? firstBlockId : undefined,
        activeBlockPageId: type === "page" && firstBlockId ? id : undefined,
        tabs: exists
          ? state.tabs
          : [
              ...state.tabs,
              {
                key,
                type,
                id,
                title,
                source,
              },
            ],
      };
    });
  },

  closeTab(key) {
    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.key === key);
      if (index < 0) return state;
      const tabs = state.tabs.filter((tab) => tab.key !== key);
      const nextActive =
        state.activeTabKey === key
          ? (tabs[index]?.key ?? tabs[index - 1]?.key ?? tabs[0]?.key ?? "")
          : state.activeTabKey;
      const sourceDrafts = { ...state.sourceDrafts };
      delete sourceDrafts[key];
      return { tabs, activeTabKey: nextActive, sourceDrafts };
    });
  },

  setSourceDraft(draft) {
    set((state) => ({
      sourceDrafts: { ...state.sourceDrafts, [draft.key]: draft },
      tabs: state.tabs.map((tab) =>
        tab.key === draft.key ? { ...tab, dirty: isSourceDraftDirty(draft) } : tab,
      ),
    }));
  },

  clearSourceDraft(key) {
    set((state) => {
      const sourceDrafts = { ...state.sourceDrafts };
      delete sourceDrafts[key];
      return {
        sourceDrafts,
        tabs: state.tabs.map((tab) => tab.key === key ? { ...tab, dirty: false } : tab),
      };
    });
  },

  async saveSourceDraft(key) {
    const state = get();
    const draft = state.sourceDrafts[key];
    const rootPath = state.snapshot?.settings.workspacePath;
    if (!draft || !rootPath) {
      return { status: "error", message: "No local source draft is available to save." };
    }
    if (!isSourceDraftDirty(draft)) return { status: "saved", savedSource: draft.source };

    const result = await persistSourceDraft(draft, {
      read: () => readWorkspaceTextFile(rootPath, draft.filePath),
      write: (source) => writeWorkspaceTextFile(rootPath, draft.filePath, source),
      checkpoint: async () => {
        await checkpointWorkspacePaths(rootPath, [draft.filePath], `Edit ${draft.title}`, {
          actorName: "Local user",
          transactionId: crypto.randomUUID(),
        });
      },
    });
    if (result.status !== "saved") return result;

    set((current) => {
      const latest = current.sourceDrafts[key];
      if (!latest) return current;
      const savedDraft = { ...latest, baselineSource: result.savedSource };
      return {
        sourceDrafts: { ...current.sourceDrafts, [key]: savedDraft },
        tabs: current.tabs.map((tab) =>
          tab.key === key ? { ...tab, dirty: isSourceDraftDirty(savedDraft) } : tab,
        ),
      };
    });
    return result;
  },

  async createFolder(parentFolderId = get().selectedFolderId || null, name = "New Folder") {
    const snapshot = get().snapshot;
    if (!snapshot) return;
    const path = await createDirectory(snapshot, parentFolderId, name);
    const parent = parentFolderId ? snapshot.folders.find((folder) => folder.id === parentFolderId) : undefined;
    const folder: WorkspaceFolder = {
      id: `folder:${path}`,
      name,
      path,
      parentId: parent?.id ?? null,
      order: Date.now(),
      expanded: true,
    };
    const next = {
      ...snapshot,
      folders: [...snapshot.folders.filter((item) => item.id !== folder.id), folder],
      updatedAt: nowIso(),
    };
    set({ snapshot: next, selectedFolderId: folder.id });
    persist(next);
  },

  async renameFolder(folderId, name) {
    const snapshot = get().snapshot;
    const folder = snapshot?.folders.find((item) => item.id === folderId);
    if (!snapshot || !folder?.path) return;
    const folderPath = folder.path;
    const cleanName = cleanWorkspaceName(name, folder.name);
    const destination = joinWorkspacePath(workspaceParentPath(folderPath), cleanName);
    if (destination === folderPath) return;
    await queueWorkspaceSave(snapshot);
    await moveWorkspacePath(snapshot, folderPath, destination);
    const next = remapFolderSnapshot(snapshot, folderId, folder.parentId, folderPath, destination);
    set((state) => ({
      snapshot: next,
      selectedFolderId: folderId,
      sourceDrafts: remapSourceDraftPaths(state.sourceDrafts, folderPath, destination),
    }));
    await queueWorkspaceSave(next);
    await checkpointWorkspacePaths(
      next.settings.workspacePath,
      movedWorkspacePaths(snapshot, next, folderPath),
      `Rename folder ${folder.name} to ${cleanName}`,
      { actorName: "Local user", transactionId: crypto.randomUUID() },
    );
  },

  async moveFolder(folderId, parentFolderId) {
    const snapshot = get().snapshot;
    const folder = snapshot?.folders.find((item) => item.id === folderId);
    const parent = parentFolderId ? snapshot?.folders.find((item) => item.id === parentFolderId) : undefined;
    if (!snapshot || !folder?.path || parentFolderId === folderId) return;
    const folderPath = folder.path;
    if (parent?.path && (parent.path === folderPath || parent.path.startsWith(`${folderPath}/`))) return;
    const destination = joinWorkspacePath(parent?.path, folder.name);
    if (destination === folderPath) return;
    await queueWorkspaceSave(snapshot);
    await moveWorkspacePath(snapshot, folderPath, destination);
    const next = remapFolderSnapshot(snapshot, folderId, parent?.id ?? null, folderPath, destination);
    set((state) => ({
      snapshot: next,
      selectedFolderId: folderId,
      sourceDrafts: remapSourceDraftPaths(state.sourceDrafts, folderPath, destination),
    }));
    await queueWorkspaceSave(next);
    await checkpointWorkspacePaths(
      next.settings.workspacePath,
      movedWorkspacePaths(snapshot, next, folderPath),
      `Move folder ${folder.name}`,
      { actorName: "Local user", transactionId: crypto.randomUUID() },
    );
  },

  async deleteFolder(folderId) {
    const snapshot = get().snapshot;
    const folder = snapshot?.folders.find((item) => item.id === folderId);
    if (!snapshot || !folder?.path) return;
    const deletedPaths = [
      ...snapshot.documents.filter((document) => folderContains(folder, document.path)).map((document) => document.path),
      ...snapshot.assets.filter((asset) => folderContains(folder, asset.filePath)).map((asset) => asset.filePath),
    ];
    await deleteWorkspacePath(snapshot, folder.path);
    const next = {
      ...snapshot,
      folders: snapshot.folders.filter((item) => !folderContains(folder, item.path)),
      pages: snapshot.pages.filter((page) => !folderContains(folder, page.filePath)),
      artifacts: snapshot.artifacts.filter((artifact) => !folderContains(folder, artifact.filePath)),
      assets: snapshot.assets.filter((asset) => !folderContains(folder, asset.filePath)),
      documents: snapshot.documents.filter((document) => !folderContains(folder, document.path)),
      tree: snapshot.tree.filter((item) => !folderContains(folder, item.filePath)),
      settings: {
        ...snapshot.settings,
        recentFiles: snapshot.settings.recentFiles.filter((recent) => {
          const treeItem = snapshot.tree.find((item) => item.type === recent.type && item.id === recent.id);
          return !folderContains(folder, treeItem?.filePath);
        }),
      },
      updatedAt: nowIso(),
    };
    const tabs = get().tabs.filter((tab) => {
      if (tab.type === "page") return next.pages.some((page) => page.id === tab.id);
      if (tab.type === "artifact") return next.artifacts.some((artifact) => artifact.id === tab.id);
      if (tab.type === "asset") return next.assets.some((asset) => asset.id === tab.id);
      return true;
    });
    set({
      snapshot: next,
      tabs,
      sourceDrafts: retainDraftsForTabs(get().sourceDrafts, tabs),
      activeTabKey: tabs[0]?.key ?? "",
      activeBlockId: undefined,
      activeBlockPageId: undefined,
      selectedFolderId: next.folders[0]?.id ?? "",
    });
    persist(next);
    await queueWorkspaceSave(next);
    if (deletedPaths.length) {
      await checkpointWorkspacePaths(next.settings.workspacePath, deletedPaths, `Delete folder ${folder.name}`, {
        actorName: "Local user",
        transactionId: crypto.randomUUID(),
      });
    }
  },

  async createPage(folderId = get().selectedFolderId || get().snapshot?.folders[0]?.id || "", title = "Untitled") {
    const snapshot = get().snapshot;
    if (!snapshot) return;
    const createdAt = nowIso();
    const id = `${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}-note`;
    const filePath = uniquePageFilePath(snapshot, folderId, title);
    const page: Page = {
      id,
      title,
      source: "human",
      kind: "note",
      content: createEmptyDocument(),
      html: "<p></p>",
      body: "",
      filePath,
      tags: [],
      blocks: [],
      createdAt,
      updatedAt: createdAt,
    };

    const next: WorkspaceSnapshot = {
      ...snapshot,
      pages: [...snapshot.pages, page],
      documents: [
        ...snapshot.documents,
        {
          id: page.id,
          path: filePath,
          title: page.title,
          kind: "rich-document",
          tags: [],
          createdBy: { id: "local-user", label: "Local user", kind: "human" },
          createdAt,
          updatedAt: createdAt,
        },
      ],
      tree: [
        ...snapshot.tree,
        { id: page.id, type: "page", parentId: folderId, filePath, order: Date.now() },
      ],
      updatedAt: nowIso(),
    };
    set({ snapshot: next, selectedFolderId: folderId, activeBlockPageId: undefined, activeBlockId: undefined });
    persist(next);
    await queueWorkspaceSave(next);
    await checkpointWorkspacePaths(next.settings.workspacePath, [filePath], `Create ${page.title}`, {
      actorName: "Local user",
      transactionId: crypto.randomUUID(),
    });
    get().openNode("page", page.id);
  },

  async createTextFile(folderId = get().selectedFolderId || "", name = "Untitled.md") {
    const snapshot = get().snapshot;
    if (!snapshot) return;
    const folder = snapshot.folders.find((item) => item.id === folderId);
    const requestedName = cleanWorkspaceName(name, "Untitled.md");
    const fileName = requestedName.includes(".") ? requestedName : `${requestedName}.md`;
    const filePath = uniqueWorkspaceFilePath(snapshot, joinWorkspacePath(folder?.path, fileName));
    await writeWorkspaceTextFile(snapshot.settings.workspacePath, filePath, "");
    const asset = workspaceAssetFromEntry({
      name: workspaceFileName(filePath),
      relative_path: filePath,
      absolute_path: "",
      kind: "file",
      size: 0,
      modified_ms: Date.now(),
    });
    const next: WorkspaceSnapshot = {
      ...snapshot,
      assets: [...snapshot.assets, asset],
      tree: [
        ...snapshot.tree,
        { id: asset.id, type: "asset", parentId: folder?.id ?? null, filePath, order: Date.now() },
      ],
      updatedAt: nowIso(),
    };
    set({ snapshot: next, selectedFolderId: folder?.id ?? "" });
    persist(next);
    await queueWorkspaceSave(next);
    await checkpointWorkspacePaths(next.settings.workspacePath, [filePath], `Create ${asset.title}`, {
      actorName: "Local user",
      transactionId: crypto.randomUUID(),
    });
    get().openNode("asset", asset.id);
  },

  async renameNode(type, id, name) {
    const snapshot = get().snapshot;
    const item = type === "page"
      ? snapshot?.pages.find((page) => page.id === id)
      : type === "artifact"
        ? snapshot?.artifacts.find((artifact) => artifact.id === id)
        : snapshot?.assets.find((asset) => asset.id === id);
    if (!snapshot || !item?.filePath) return;
    const currentName = workspaceFileName(item.filePath);
    const extension = currentName.includes(".") ? currentName.slice(currentName.lastIndexOf(".")) : "";
    const requestedName = cleanWorkspaceName(name, currentName);
    const nextFileName = type === "asset" || !extension || requestedName.toLowerCase().endsWith(extension.toLowerCase())
      ? requestedName
      : `${requestedName}${extension}`;
    const destination = joinWorkspacePath(workspaceParentPath(item.filePath), nextFileName);
    await queueWorkspaceSave(snapshot);
    if (destination !== item.filePath) await moveWorkspacePath(snapshot, item.filePath, destination);
    const nextTitle = type === "page" && extension ? nextFileName.slice(0, -extension.length) : nextFileName;
    const next: WorkspaceSnapshot = {
      ...snapshot,
      pages: snapshot.pages.map((page) =>
        type === "page" && page.id === id ? { ...page, title: nextTitle, filePath: destination, updatedAt: nowIso() } : page,
      ),
      artifacts: snapshot.artifacts.map((artifact) =>
        type === "artifact" && artifact.id === id
          ? { ...artifact, title: nextTitle, filePath: destination, updatedAt: nowIso() }
          : artifact,
      ),
      assets: snapshot.assets.map((asset) =>
        type === "asset" && asset.id === id
          ? workspaceAssetFromEntry(
              {
                name: nextFileName,
                relative_path: destination,
                absolute_path: "",
                kind: "file",
                size: asset.size,
                modified_ms: Date.now(),
              },
              asset,
            )
          : asset,
      ),
      documents: snapshot.documents.map((document) =>
        document.id === id ? { ...document, title: nextTitle, path: destination, updatedAt: nowIso() } : document,
      ),
      tree: snapshot.tree.map((treeItem) =>
        treeItem.type === type && treeItem.id === id ? { ...treeItem, filePath: destination } : treeItem,
      ),
      updatedAt: nowIso(),
    };
    set((state) => ({
      snapshot: next,
      tabs: state.tabs.map((tab) => (tab.type === type && tab.id === id ? { ...tab, title: nextTitle } : tab)),
      sourceDrafts: state.sourceDrafts[nodeKey(type, id)]
        ? {
            ...state.sourceDrafts,
            [nodeKey(type, id)]: {
              ...state.sourceDrafts[nodeKey(type, id)]!,
              title: nextTitle,
              filePath: destination,
            },
          }
        : state.sourceDrafts,
    }));
    await queueWorkspaceSave(next);
    await checkpointWorkspacePaths(
      next.settings.workspacePath,
      [item.filePath, destination],
      `Rename ${currentName} to ${nextFileName}`,
      { actorName: "Local user", transactionId: crypto.randomUUID() },
    );
  },

  async moveNode(type, id, folderId) {
    const snapshot = get().snapshot;
    const folder = folderId ? snapshot?.folders.find((item) => item.id === folderId) : undefined;
    const item = type === "page"
      ? snapshot?.pages.find((page) => page.id === id)
      : type === "artifact"
        ? snapshot?.artifacts.find((artifact) => artifact.id === id)
        : snapshot?.assets.find((asset) => asset.id === id);
    if (!snapshot || (folderId && !folder?.path) || !item?.filePath) return;
    const destination = joinWorkspacePath(folder?.path, workspaceFileName(item.filePath));
    if (destination === item.filePath) return;
    await queueWorkspaceSave(snapshot);
    await moveWorkspacePath(snapshot, item.filePath, destination);
    const next: WorkspaceSnapshot = {
      ...snapshot,
      pages: snapshot.pages.map((page) =>
        type === "page" && page.id === id ? { ...page, filePath: destination, updatedAt: nowIso() } : page,
      ),
      artifacts: snapshot.artifacts.map((artifact) =>
        type === "artifact" && artifact.id === id
          ? { ...artifact, filePath: destination, updatedAt: nowIso() }
          : artifact,
      ),
      assets: snapshot.assets.map((asset) =>
        type === "asset" && asset.id === id
          ? { ...asset, filePath: destination, updatedAt: nowIso() }
          : asset,
      ),
      documents: snapshot.documents.map((document) =>
        document.id === id ? { ...document, path: destination, updatedAt: nowIso() } : document,
      ),
      tree: snapshot.tree.map((treeItem) =>
        treeItem.type === type && treeItem.id === id
          ? { ...treeItem, parentId: folder?.id ?? null, filePath: destination }
          : treeItem,
      ),
      updatedAt: nowIso(),
    };
    set((state) => ({
      snapshot: next,
      selectedFolderId: folder?.id ?? "",
      sourceDrafts: state.sourceDrafts[nodeKey(type, id)]
        ? {
            ...state.sourceDrafts,
            [nodeKey(type, id)]: { ...state.sourceDrafts[nodeKey(type, id)]!, filePath: destination },
          }
        : state.sourceDrafts,
    }));
    await queueWorkspaceSave(next);
    await checkpointWorkspacePaths(
      next.settings.workspacePath,
      [item.filePath, destination],
      `Move ${workspaceFileName(item.filePath)}`,
      { actorName: "Local user", transactionId: crypto.randomUUID() },
    );
  },

  updatePage(pageId, patch) {
    set((state) => {
      const snapshot = withUpdatedPage(state.snapshot, pageId, (page) => ({
        ...page,
        ...patch,
        id: page.id,
        source: page.source,
        updatedAt: nowIso(),
      }));
      persist(snapshot);
      if (snapshot) {
        scheduleDocumentCheckpoint(
          snapshot,
          pageId,
          `Edit ${patch.title ?? titleFor(snapshot, "page", pageId)}`,
        );
      }
      return {
        snapshot,
        tabs: state.tabs.map((tab) =>
          tab.type === "page" && tab.id === pageId
            ? { ...tab, title: patch.title ?? tab.title, dirty: false }
            : tab,
        ),
      };
    });
  },

  async renameTag(currentTag, nextTag) {
    const snapshot = get().snapshot;
    if (!snapshot) return;
    const normalized = normalizeTagName(nextTag);
    if (!normalized) throw new Error("Enter a tag name.");
    const mutation = mutateWorkspaceTag(snapshot, currentTag, normalized);
    if (!mutation.changed) return;
    set({ snapshot: mutation.snapshot });
    persist(mutation.snapshot);
    try {
      await queueWorkspaceSave(mutation.snapshot);
      await checkpointWorkspacePaths(
        mutation.snapshot.settings.workspacePath,
        [...mutation.changedPaths, ".atria/workspace.json"],
        `Rename tag ${normalizeTagName(currentTag)} to ${normalized}`,
        { actorName: "Local user", transactionId: crypto.randomUUID() },
      );
    } catch (error) {
      set({ saveStatus: "error", saveError: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },

  async deleteTag(tag) {
    const snapshot = get().snapshot;
    if (!snapshot) return;
    const normalized = normalizeTagName(tag);
    const mutation = mutateWorkspaceTag(snapshot, normalized);
    if (!mutation.changed) return;
    set({ snapshot: mutation.snapshot });
    persist(mutation.snapshot);
    try {
      await queueWorkspaceSave(mutation.snapshot);
      await checkpointWorkspacePaths(
        mutation.snapshot.settings.workspacePath,
        [...mutation.changedPaths, ".atria/workspace.json"],
        `Delete tag ${normalized}`,
        { actorName: "Local user", transactionId: crypto.randomUUID() },
      );
    } catch (error) {
      set({ saveStatus: "error", saveError: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },

  async deleteNode(type, id) {
    const snapshot = get().snapshot;
    if (!snapshot) return;
    const item = type === "page"
      ? snapshot.pages.find((page) => page.id === id)
      : type === "artifact"
        ? snapshot.artifacts.find((artifact) => artifact.id === id)
        : snapshot.assets.find((asset) => asset.id === id);
    if (!item?.filePath) return;
    await deleteWorkspacePath(snapshot, item.filePath);
    const next = {
      ...snapshot,
      pages: snapshot.pages.filter((page) => !(type === "page" && page.id === id)),
      artifacts: snapshot.artifacts.filter((artifact) => !(type === "artifact" && artifact.id === id)),
      assets: snapshot.assets.filter((asset) => !(type === "asset" && asset.id === id)),
      documents: snapshot.documents.filter((document) => document.id !== id),
      tree: snapshot.tree.filter((treeItem) => !(treeItem.type === type && treeItem.id === id)),
      settings: {
        ...snapshot.settings,
        recentFiles: snapshot.settings.recentFiles.filter((recent) => !(recent.type === type && recent.id === id)),
      },
      timeline: snapshot.timeline.map((item) => ({
        ...item,
        pageIds: type === "page" ? item.pageIds.filter((pageId) => pageId !== id) : item.pageIds,
        pageId: type === "page" && item.pageId === id ? undefined : item.pageId,
      })),
      updatedAt: nowIso(),
    };
    const tabs = get().tabs.filter((tab) => !(tab.type === type && tab.id === id));
    set({
      snapshot: next,
      tabs,
      sourceDrafts: retainDraftsForTabs(get().sourceDrafts, tabs),
      activeTabKey: tabs.some((tab) => tab.key === get().activeTabKey)
        ? get().activeTabKey
        : (tabs[0]?.key ?? ""),
      activeBlockId: undefined,
      activeBlockPageId: undefined,
    });
    persist(next);
    await queueWorkspaceSave(next);
    await checkpointWorkspacePaths(next.settings.workspacePath, [item.filePath], `Delete ${item.title}`, {
      actorName: "Local user",
      transactionId: crypto.randomUUID(),
    });
  },

  addBlock(type, options = {}) {
    const state = get();
    const pageId = activePageId(state);
    if (!pageId) return;
    const afterBlockId =
      options.afterBlockId ??
      (state.activeBlockPageId === pageId ? state.activeBlockId : undefined);
    const block = createBlock(type);
    set((current) => {
      const snapshot = withUpdatedPage(current.snapshot, pageId, (page) => ({
        ...page,
        body: page.body ?? "",
        blocks: insertBlock(page.blocks, block, { ...options, afterBlockId }),
      }));
      persist(snapshot);
      return { snapshot, activeBlockPageId: pageId, activeBlockId: block.id };
    });
  },

  async addImageFromDataUrl(dataUrl, pageId, afterBlockId) {
    const snapshot = get().snapshot;
    const targetPageId = pageId ?? activePageId(get());
    if (!snapshot || !targetPageId) return;
    const src = await importImageDataUrl(snapshot, dataUrl);
    const block = createBlock("image", { src });
    set((state) => {
      const next = withUpdatedPage(state.snapshot, targetPageId, (page) => ({
        ...page,
        blocks: insertBlock(page.blocks, block, {
          afterBlockId:
            afterBlockId ??
            (state.activeBlockPageId === targetPageId ? state.activeBlockId : undefined),
        }),
      }));
      persist(next);
      return { snapshot: next, activeBlockPageId: targetPageId, activeBlockId: block.id };
    });
  },

  updateBlock(pageId, blockId, patch) {
    set((state) => {
      const snapshot = withUpdatedPage(state.snapshot, pageId, (page) => ({
        ...page,
        blocks: page.blocks.map((block) =>
          block.id === blockId ? ({ ...block, ...patch, id: block.id, updatedAt: nowIso() } as AtriaBlock) : block,
        ),
      }));
      persist(snapshot);
      return { snapshot };
    });
  },

  deleteBlock(pageId, blockId) {
    set((state) => {
      let nextActiveBlockId = state.activeBlockId;
      const snapshot = withUpdatedPage(state.snapshot, pageId, (page) => {
        const index = page.blocks.findIndex((block) => block.id === blockId);
        const blocks = page.blocks.filter((block) => block.id !== blockId);
        if (state.activeBlockId === blockId) {
          nextActiveBlockId = blocks[index - 1]?.id ?? blocks[index]?.id;
        }
        return { ...page, blocks: blocks.length ? blocks : [createBlock("text", { richText: "<p></p>" })] };
      });
      persist(snapshot);
      return {
        snapshot,
        activeBlockPageId: nextActiveBlockId ? pageId : undefined,
        activeBlockId: nextActiveBlockId,
      };
    });
  },

  moveBlock(pageId, blockId, direction) {
    set((state) => {
      const snapshot = withUpdatedPage(state.snapshot, pageId, (page) => {
        const blocks = [...page.blocks];
        const index = blocks.findIndex((block) => block.id === blockId);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= blocks.length) return page;
        const [block] = blocks.splice(index, 1);
        blocks.splice(nextIndex, 0, block!);
        return { ...page, blocks };
      });
      persist(snapshot);
      return { snapshot, activeBlockPageId: pageId, activeBlockId: blockId };
    });
  },

  retrySave() {
    persist(get().snapshot);
  },
}));

export function getActiveTab(state: Pick<AtriaState, "activeTabKey" | "tabs">): WorkspaceTab | undefined {
  return state.tabs.find((tab) => tab.key === state.activeTabKey);
}

export function duplicateSafeSlug(title: string): string {
  return slugify(title, "page");
}
