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
  createPageFilePath,
  deleteWorkspacePath,
  importImageDataUrl,
  queueWorkspaceSave,
  scheduleDocumentCheckpoint,
} from "./workspaceClient";

export type ActiveTool = "files" | "search" | "graph" | "tags" | "history" | "settings";
export type TabType = "page" | "artifact" | "timeline";

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
  createFolder(parentFolderId?: string | null, name?: string): Promise<void>;
  deleteFolder(folderId: string): Promise<void>;
  createPage(folderId?: string, title?: string): Promise<void>;
  updatePage(pageId: string, patch: Partial<Page>): void;
  deletePage(pageId: string): Promise<void>;
  addBlock(type: AtriaBlockType, options?: AddBlockOptions): void;
  addImageFromDataUrl(dataUrl: string, pageId?: string, afterBlockId?: string): Promise<void>;
  updateBlock(pageId: string, blockId: string, patch: Partial<AtriaBlock>): void;
  deleteBlock(pageId: string, blockId: string): void;
  moveBlock(pageId: string, blockId: string, direction: -1 | 1): void;
}

function nodeKey(type: TabType, id: string): string {
  return `${type}:${id}`;
}

function titleFor(snapshot: WorkspaceSnapshot, type: TabType, id: string): string {
  if (type === "artifact") return snapshot.artifacts.find((item) => item.id === id)?.title ?? id;
  if (type === "timeline") return snapshot.timeline.find((item) => item.id === id)?.title ?? id;
  return snapshot.pages.find((item) => item.id === id)?.title ?? id;
}

function sourceFor(type: TabType): "human" | "ai" {
  return type === "artifact" ? "ai" : "human";
}

function persist(snapshot: WorkspaceSnapshot | undefined): void {
  if (!snapshot) return;
  void queueWorkspaceSave(snapshot).catch((error) => {
    console.error("Failed to persist Atria workspace", error);
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
  const used = new Set(snapshot.pages.map((page) => page.filePath).filter(Boolean));
  if (!used.has(base)) return base;
  const suffix = crypto.randomUUID().slice(0, 6);
  return base.replace(/\.html$/i, `-${suffix}.html`);
}

function folderContains(folder: WorkspaceFolder, path: string | undefined): boolean {
  if (!folder.path || !path) return false;
  return path === folder.path || path.startsWith(`${folder.path}/`);
}

export const useAtriaStore = create<AtriaState>((set, get) => ({
  activeTool: "files",
  activeTabKey: "",
  activeBlockId: undefined,
  activeBlockPageId: undefined,
  filter: "",
  selectedFolderId: "",
  tabs: [],

  setSnapshot(snapshot) {
    set((state) => {
      const tabs = state.tabs
        .map((tab) => {
          const exists =
            tab.type === "artifact"
              ? snapshot.artifacts.some((item) => item.id === tab.id)
              : snapshot.pages.some((item) => item.id === tab.id);
          return exists
            ? { ...tab, title: titleFor(snapshot, tab.type, tab.id), source: sourceFor(tab.type) }
            : null;
        })
        .filter(Boolean) as WorkspaceTab[];

      if (!tabs.length) {
        const firstPage = snapshot.pages[0];
        const firstArtifact = snapshot.artifacts[0];
        const first = firstPage
          ? {
              key: nodeKey("page", firstPage.id),
              type: "page" as const,
              id: firstPage.id,
              title: firstPage.title,
              source: "human" as const,
            }
          : firstArtifact
            ? {
                key: nodeKey("artifact", firstArtifact.id),
                type: "artifact" as const,
                id: firstArtifact.id,
                title: firstArtifact.title,
                source: "ai" as const,
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
        selectedFolderId: state.selectedFolderId || snapshot.folders[0]?.id || "",
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
    const source = sourceFor(type);
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
      return { tabs, activeTabKey: nextActive };
    });
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

  async deleteFolder(folderId) {
    const snapshot = get().snapshot;
    const folder = snapshot?.folders.find((item) => item.id === folderId);
    if (!snapshot || !folder?.path) return;
    await deleteWorkspacePath(snapshot, folder.path);
    const next = {
      ...snapshot,
      folders: snapshot.folders.filter((item) => !folderContains(folder, item.path)),
      pages: snapshot.pages.filter((page) => !folderContains(folder, page.filePath)),
      artifacts: snapshot.artifacts.filter((artifact) => !folderContains(folder, artifact.filePath)),
      documents: snapshot.documents.filter((document) => !folderContains(folder, document.path)),
      tree: snapshot.tree.filter((item) => !folderContains(folder, item.filePath)),
      updatedAt: nowIso(),
    };
    const tabs = get().tabs.filter((tab) => {
      if (tab.type === "page") return next.pages.some((page) => page.id === tab.id);
      if (tab.type === "artifact") return next.artifacts.some((artifact) => artifact.id === tab.id);
      return true;
    });
    set({
      snapshot: next,
      tabs,
      activeTabKey: tabs[0]?.key ?? "",
      activeBlockId: undefined,
      activeBlockPageId: undefined,
      selectedFolderId: next.folders[0]?.id ?? "",
    });
    persist(next);
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
    get().openNode("page", page.id);
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

  async deletePage(pageId) {
    const snapshot = get().snapshot;
    if (!snapshot) return;
    const page = snapshot.pages.find((item) => item.id === pageId);
    if (page?.filePath) await deleteWorkspacePath(snapshot, page.filePath);
    const next = {
      ...snapshot,
      pages: snapshot.pages.filter((item) => item.id !== pageId),
      documents: snapshot.documents.filter((item) => item.id !== pageId),
      tree: snapshot.tree.filter((item) => !(item.type === "page" && item.id === pageId)),
      timeline: snapshot.timeline.map((item) => ({
        ...item,
        pageIds: item.pageIds.filter((id) => id !== pageId),
        pageId: item.pageId === pageId ? undefined : item.pageId,
      })),
      updatedAt: nowIso(),
    };
    const tabs = get().tabs.filter((tab) => !(tab.type === "page" && tab.id === pageId));
    set({
      snapshot: next,
      tabs,
      activeTabKey: tabs.some((tab) => tab.key === get().activeTabKey)
        ? get().activeTabKey
        : (tabs[0]?.key ?? ""),
      activeBlockId: undefined,
      activeBlockPageId: undefined,
    });
    persist(next);
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
}));

export function getActiveTab(state: Pick<AtriaState, "activeTabKey" | "tabs">): WorkspaceTab | undefined {
  return state.tabs.find((tab) => tab.key === state.activeTabKey);
}

export function duplicateSafeSlug(title: string): string {
  return slugify(title, "page");
}
