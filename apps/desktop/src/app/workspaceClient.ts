import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import {
  Artifact,
  ArtifactSchema,
  DocumentRecord,
  AtriaBlock,
  AtriaDocumentContent,
  Page,
  PageSchema,
  WorkspaceFolder,
  WorkspaceAsset,
  WorkspaceSnapshot,
  WorkspaceSnapshotSchema,
  WorkspaceTreeItem,
} from "@atria/schema";
import { createDefaultWorkspace, createEmptyDocument, nowIso, slugify } from "@atria/core";
import {
  isSemanticDocument,
  parseSemanticDocument,
  serializeSemanticDocument,
} from "@atria/core/document-html";
import { LocalWorkspaceEntry, workspaceAssetFromEntry } from "./workspaceFiles";

type WorkspaceEntry = LocalWorkspaceEntry;

interface WorkspaceReadResult {
  root_path: string;
  snapshot?: WorkspaceSnapshot;
  entries: WorkspaceEntry[];
}

export interface GitWorkspaceStatus {
  initialized: boolean;
  head?: string;
  branch?: string;
  dirty: boolean;
}

export interface GitRevision {
  id: string;
  shortId: string;
  summary: string;
  actor: string;
  email: string;
  timestamp: number;
  transactionId?: string;
}

export interface GitCheckpointResult {
  revision: GitRevision;
  changed: boolean;
}

export interface GitDocumentDiff {
  fromRevision?: string;
  toRevision?: string;
  patch: string;
  filesChanged: number;
  additions: number;
  deletions: number;
}

export interface AgentBridgeInfo {
  executablePath: string;
  available: boolean;
  version: string;
  toolCount: number;
}

export interface WorkspaceDirectoryStatus {
  exists: boolean;
  directory: boolean;
}

export interface WorkspaceContentMatch {
  relativePath: string;
  snippet: string;
}

const LEGACY_PAGE_EXTENSION = ".atria.json";
const DOCUMENT_EXTENSION = ".html";
const DEFAULT_WORKSPACE_TITLE = "My Workspace";
let queuedSnapshot: WorkspaceSnapshot | undefined;
let saveDrain: Promise<void> | undefined;
const checkpointTimers = new Map<string, ReturnType<typeof setTimeout>>();

export async function getDefaultWorkspacePath(): Promise<string> {
  return invoke<string>("atria_default_workspace_path");
}

export async function pickWorkspaceDirectory(currentPath?: string, purpose?: "open" | "create"): Promise<string | null> {
  return invoke<string | null>("atria_pick_workspace_directory", { currentPath, purpose });
}

export async function getWorkspaceDirectoryStatus(path: string): Promise<WorkspaceDirectoryStatus> {
  return invoke<WorkspaceDirectoryStatus>("atria_workspace_directory_status", { path });
}

export async function createWorkspaceDirectory(parentPath: string, name: string): Promise<string> {
  return invoke<string>("atria_create_workspace_directory", { parentPath, name });
}

export async function getAgentBridgeInfo(): Promise<AgentBridgeInfo> {
  return invoke<AgentBridgeInfo>("atria_agent_bridge_info");
}

export async function quitApplication(): Promise<void> {
  await invoke("atria_quit_app");
}

export async function searchWorkspace(
  rootPath: string,
  query: string,
  limit = 100,
): Promise<WorkspaceContentMatch[]> {
  return invoke<WorkspaceContentMatch[]>("atria_search_workspace", { rootPath, query, limit });
}

export async function readWorkspaceTextFile(rootPath: string, relativePath: string): Promise<string> {
  return invoke<string>("atria_read_text_file", { rootPath, relativePath });
}

export async function getWorkspaceFileMetadata(
  rootPath: string,
  relativePath: string,
): Promise<LocalWorkspaceEntry> {
  return invoke<LocalWorkspaceEntry>("atria_workspace_file_metadata", { rootPath, relativePath });
}

export async function writeWorkspaceTextFile(
  rootPath: string,
  relativePath: string,
  content: string,
): Promise<void> {
  await invoke("atria_write_text_file", { rootPath, relativePath, content });
}

export async function openWorkspaceFile(rootPath: string, relativePath: string): Promise<void> {
  await invoke("atria_open_workspace_file", { rootPath, relativePath });
}

export async function loadWorkspace(rootPath?: string): Promise<WorkspaceSnapshot> {
  const firstRead = await invoke<WorkspaceReadResult>("atria_read_workspace", { rootPath });
  let snapshot: WorkspaceSnapshot;
  if (!firstRead.snapshot) {
    const seed = prepareSeedWorkspace(firstRead.root_path);
    await materializeSeedWorkspace(firstRead.root_path, seed);
    const secondRead = await invoke<WorkspaceReadResult>("atria_read_workspace", {
      rootPath: firstRead.root_path,
    });
    snapshot = await hydrateWorkspace(secondRead.snapshot ?? seed, secondRead.entries, secondRead.root_path);
  } else {
    snapshot = await hydrateWorkspace(firstRead.snapshot, firstRead.entries, firstRead.root_path);
  }
  await initializeWorkspaceHistory(snapshot.settings.workspacePath);
  return snapshot;
}

export async function initializeWorkspaceHistory(rootPath: string): Promise<GitWorkspaceStatus> {
  return invoke<GitWorkspaceStatus>("atria_git_initialize", { rootPath });
}

export async function getWorkspaceHistoryStatus(rootPath: string): Promise<GitWorkspaceStatus> {
  return invoke<GitWorkspaceStatus>("atria_git_status", { rootPath });
}

export async function checkpointWorkspacePaths(
  rootPath: string,
  relativePaths: string[],
  intent: string,
  options: { actorName?: string; actorEmail?: string; transactionId?: string } = {},
): Promise<GitCheckpointResult> {
  return invoke<GitCheckpointResult>("atria_git_checkpoint", {
    rootPath,
    relativePaths,
    actorName: options.actorName ?? "Local user",
    actorEmail: options.actorEmail,
    intent,
    transactionId: options.transactionId,
  });
}

export async function getDocumentHistory(
  rootPath: string,
  relativePath: string,
  limit = 100,
): Promise<GitRevision[]> {
  return invoke<GitRevision[]>("atria_git_document_history", { rootPath, relativePath, limit });
}

export async function getDocumentDiff(
  rootPath: string,
  relativePath: string,
  fromRevision?: string,
  toRevision?: string,
): Promise<GitDocumentDiff> {
  return invoke<GitDocumentDiff>("atria_git_document_diff", {
    rootPath,
    relativePath,
    fromRevision,
    toRevision,
  });
}

export async function readDocumentRevision(
  rootPath: string,
  relativePath: string,
  revision?: string,
): Promise<string> {
  return invoke<string>("atria_git_read_document_revision", { rootPath, relativePath, revision });
}

export async function restoreDocumentRevision(
  rootPath: string,
  relativePath: string,
  revision: string,
  intent: string,
): Promise<GitCheckpointResult> {
  return invoke<GitCheckpointResult>("atria_git_restore_document", {
    rootPath,
    relativePath,
    revision,
    actorName: "Local user",
    intent,
    transactionId: crypto.randomUUID(),
  });
}

export async function saveWorkspace(snapshot: WorkspaceSnapshot): Promise<void> {
  const next = withDocumentRecords(WorkspaceSnapshotSchema.parse({
    ...snapshot,
    updatedAt: nowIso(),
  }));

  await Promise.all(
    next.pages
      .filter((page) => page.filePath)
      .map((page) => {
        const isHtmlDocument = page.filePath?.toLowerCase().endsWith(DOCUMENT_EXTENSION);
        const content = isHtmlDocument
          ? serializeSemanticDocument({
              id: page.id,
              title: page.title,
              body: page.html ?? "<p></p>",
              language: "zh-cn",
              createdBy: next.documents.find((document) => document.id === page.id)?.createdBy,
              tags: page.tags,
            })
          : JSON.stringify(PageSchema.parse(page), null, 2);
        return invoke("atria_write_text_file", {
          rootPath: next.settings.workspacePath,
          relativePath: page.filePath,
          content,
        });
      }),
  );

  await invoke("atria_write_workspace_snapshot", {
    rootPath: next.settings.workspacePath,
    snapshot: toPersistedSnapshot(next),
  });
}

export function queueWorkspaceSave(snapshot: WorkspaceSnapshot): Promise<void> {
  queuedSnapshot = snapshot;
  if (!saveDrain) {
    saveDrain = drainWorkspaceSaves().finally(() => {
      saveDrain = undefined;
      if (queuedSnapshot) void queueWorkspaceSave(queuedSnapshot);
    });
  }
  return saveDrain;
}

export function scheduleDocumentCheckpoint(
  snapshot: WorkspaceSnapshot,
  pageId: string,
  intent: string,
  delayMs = 1800,
): void {
  const page = snapshot.pages.find((item) => item.id === pageId);
  const rootPath = snapshot.settings.workspacePath;
  if (!page?.filePath || !rootPath) return;
  const key = `${rootPath}\n${page.filePath}`;
  const existing = checkpointTimers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    checkpointTimers.delete(key);
    void queueWorkspaceSave(snapshot)
      .then(() =>
        checkpointWorkspacePaths(rootPath, [page.filePath!], intent, {
          actorName: "Local user",
          transactionId: crypto.randomUUID(),
        }),
      )
      .catch((error) => console.error("Failed to checkpoint Atria document", error));
  }, delayMs);
  checkpointTimers.set(key, timer);
}

async function drainWorkspaceSaves(): Promise<void> {
  while (queuedSnapshot) {
    const snapshot = queuedSnapshot;
    queuedSnapshot = undefined;
    await saveWorkspace(snapshot);
  }
}

export async function createDirectory(snapshot: WorkspaceSnapshot, parentFolderId: string | null, name: string) {
  const cleanName = cleanPathSegment(name || "New Folder");
  const parent = parentFolderId ? snapshot.folders.find((folder) => folder.id === parentFolderId) : undefined;
  const relativePath = joinRelative(parent?.path ?? "", cleanName);
  await invoke("atria_create_directory", {
    rootPath: snapshot.settings.workspacePath,
    relativePath,
  });
  return relativePath;
}

export async function deleteWorkspacePath(snapshot: WorkspaceSnapshot, relativePath: string): Promise<void> {
  await invoke("atria_delete_path", {
    rootPath: snapshot.settings.workspacePath,
    relativePath,
  });
}

export async function moveWorkspacePath(
  snapshot: WorkspaceSnapshot,
  fromRelativePath: string,
  toRelativePath: string,
): Promise<void> {
  await invoke("atria_move_path", {
    rootPath: snapshot.settings.workspacePath,
    fromRelativePath,
    toRelativePath,
  });
}

export async function importImageDataUrl(snapshot: WorkspaceSnapshot, dataUrl: string): Promise<string> {
  const extension = extensionFromDataUrl(dataUrl);
  const relativePath = `Assets/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${extension}`;
  await invoke<string>("atria_write_data_url", {
    rootPath: snapshot.settings.workspacePath,
    relativePath,
    dataUrl,
  });
  return relativePath;
}

export function createPageFilePath(snapshot: WorkspaceSnapshot, folderId: string, title: string): string {
  const folder = snapshot.folders.find((item) => item.id === folderId);
  const name = `${slugify(title || "untitled", "document")}${DOCUMENT_EXTENSION}`;
  return joinRelative(folder?.path ?? "Notes", name);
}

export function toFileAssetUrl(path: string | undefined): string {
  if (!path) return "";
  if (/^(https?:|data:|asset:)/.test(path)) return path;
  const nativePath = path.startsWith("file:") ? fileUrlToNativePath(path) : path;
  try {
    return convertFileSrc(nativePath);
  } catch {
    return nativePath;
  }
}

export function toWorkspaceFileAssetUrl(snapshot: WorkspaceSnapshot | undefined, path: string | undefined): string {
  if (!path) return "";
  if (/^(https?:|data:|asset:)/.test(path)) return path;
  if (path.startsWith("file:")) return toFileAssetUrl(path);
  const isWindowsAbsolute = /^[a-zA-Z]:[\\/]/.test(path);
  const isUnixAbsolute = path.startsWith("/");
  const absolutePath = isWindowsAbsolute
    ? path
    : isUnixAbsolute
      ? path
    : joinNative(snapshot?.settings.workspacePath ?? "", path);
  return toFileAssetUrl(absolutePath);
}

function fileUrlToNativePath(value: string): string {
  try {
    const url = new URL(value);
    const pathname = decodeURIComponent(url.pathname);
    if (/^\/[a-zA-Z]:\//.test(pathname)) return pathname.slice(1).replace(/\//g, "\\");
    return pathname;
  } catch {
    return value;
  }
}

function prepareSeedWorkspace(rootPath: string): WorkspaceSnapshot {
  const seed = createDefaultWorkspace();
  const folderPaths: Record<string, string> = {
    notes: "Notes",
    reports: "Reports",
    assets: "Assets",
    templates: "Templates",
  };

  return WorkspaceSnapshotSchema.parse({
    ...seed,
    title: DEFAULT_WORKSPACE_TITLE,
    settings: {
      ...seed.settings,
      workspacePath: rootPath,
      recentFiles: [],
    },
    folders: seed.folders.map((folder) => ({
      ...folder,
      path: folderPaths[folder.id],
    })),
    pages: seed.pages.map((page) =>
      normalizePageContent({
        ...page,
        filePath: `Notes/${slugify(page.title, "note")}${DOCUMENT_EXTENSION}`,
      }),
    ),
    tree: [],
  });
}

async function materializeSeedWorkspace(rootPath: string, seed: WorkspaceSnapshot): Promise<void> {
  await Promise.all(
    seed.folders
      .filter((folder) => folder.path)
      .map((folder) =>
        invoke("atria_create_directory", {
          rootPath,
          relativePath: folder.path,
        }),
      ),
  );

  await Promise.all(
    seed.pages.map((page) =>
      invoke("atria_write_text_file", {
        rootPath,
        relativePath: page.filePath,
        content: JSON.stringify(page, null, 2),
      }),
    ),
  );

  await saveWorkspace(seed);
}

async function hydrateWorkspace(
  rawSnapshot: WorkspaceSnapshot | unknown,
  entries: WorkspaceEntry[],
  rootPath: string,
): Promise<WorkspaceSnapshot> {
  const stored = WorkspaceSnapshotSchema.parse(rawSnapshot);
  const folderEntries = entries.filter((entry) => entry.kind === "folder");
  const fileEntries = entries.filter((entry) => entry.kind === "file");

  const folders = folderEntries.map((entry, index): WorkspaceFolder => {
    const storedFolder = stored.folders.find((folder) => folder.path === entry.relative_path);
    return {
      id: folderIdFromPath(entry.relative_path),
      name: entry.name,
      path: entry.relative_path,
      parentId: parentFolderId(entry.relative_path),
      order: storedFolder?.order ?? index * 10,
      expanded: storedFolder?.expanded ?? true,
    };
  });

  const legacyPageEntries = fileEntries.filter((entry) => entry.relative_path.endsWith(LEGACY_PAGE_EXTENSION));
  const legacyPages = await Promise.all(
    legacyPageEntries.map(async (entry) => {
      const content = await invoke<string>("atria_read_text_file", {
        rootPath,
        relativePath: entry.relative_path,
      });
      const parsed = PageSchema.parse(JSON.parse(content));
      return normalizePageContent({
        ...parsed,
        source: "human",
        filePath: entry.relative_path,
      });
    }),
  );

  const htmlEntries = fileEntries.filter((entry) => entry.relative_path.toLowerCase().endsWith(".html"));
  const knownDocumentPaths = new Set([
    ...stored.documents.filter((document) => document.kind === "rich-document").map((document) => document.path),
    ...stored.pages.map((page) => page.filePath).filter((path): path is string => Boolean(path?.endsWith(DOCUMENT_EXTENSION))),
  ]);
  const semanticDocumentEntries = await Promise.all(
    htmlEntries.map(async (entry) => {
      if (knownDocumentPaths.has(entry.relative_path)) return entry;
      const prefix = await invoke<string>("atria_read_text_prefix", {
        rootPath,
        relativePath: entry.relative_path,
        maxBytes: 8192,
      });
      return isSemanticDocument(prefix) ? entry : undefined;
    }),
  ).then((items) => items.filter((item): item is WorkspaceEntry => Boolean(item)));
  const semanticPaths = new Set(semanticDocumentEntries.map((entry) => entry.relative_path));
  const documentPages = await Promise.all(
    semanticDocumentEntries.map(async (entry) => {
      const content = await invoke<string>("atria_read_text_file", {
        rootPath,
        relativePath: entry.relative_path,
      });
      const parsed = parseSemanticDocument(content);
      const record = stored.documents.find((document) => document.path === entry.relative_path);
      const previous = stored.pages.find((page) => page.id === record?.id || page.filePath === entry.relative_path);
      const timestamp = previous?.updatedAt ?? record?.updatedAt ?? nowIso();
      return PageSchema.parse({
        id: record?.id ?? parsed.id ?? `document-${slugify(entry.relative_path, "html")}`,
        title: previous?.title ?? record?.title ?? parsed.title,
        source: (record?.createdBy.kind ?? parsed.createdBy?.kind) === "agent" ? "ai" : (previous?.source ?? "human"),
        kind: previous?.kind ?? "note",
        html: parsed.body,
        body: "",
        filePath: entry.relative_path,
        projectId: previous?.projectId,
        timelineRef: previous?.timelineRef,
        tags: record?.tags ?? parsed.tags ?? previous?.tags ?? [],
        blocks: [],
        createdAt: previous?.createdAt ?? record?.createdAt ?? timestamp,
        updatedAt: timestamp,
      });
    }),
  );
  const pages = [...legacyPages, ...documentPages];

  const artifacts = htmlEntries.filter((entry) => !semanticPaths.has(entry.relative_path)).map((entry) => {
    const previous = stored.artifacts.find(
      (artifact) => artifact.filePath === entry.relative_path || artifact.title === entry.name,
    );
    return ArtifactSchema.parse({
      id: previous?.id ?? `artifact-${slugify(entry.relative_path, "html")}`,
      title: previous?.title ?? entry.name,
      description: previous?.description ?? "",
      source: "ai",
      kind: "html",
      entryFile: entry.name,
      entryUrl: toFileAssetUrl(entry.absolute_path),
      filePath: entry.relative_path,
      projectId: previous?.projectId,
      taskId: previous?.taskId,
      timelineRefs: previous?.timelineRefs ?? [],
      tags: previous?.tags ?? ["html"],
      metrics: previous?.metrics ?? {},
      assets: previous?.assets ?? [],
      status: previous?.status ?? "active",
      createdAt: previous?.createdAt ?? nowIso(),
      updatedAt: previous?.updatedAt ?? nowIso(),
    });
  });

  const representedPaths = new Set([
    ...legacyPageEntries.map((entry) => entry.relative_path),
    ...htmlEntries.map((entry) => entry.relative_path),
  ]);
  const assets = fileEntries
    .filter((entry) => !representedPaths.has(entry.relative_path))
    .map((entry): WorkspaceAsset =>
      workspaceAssetFromEntry(
        entry,
        stored.assets.find((asset) => asset.filePath === entry.relative_path),
      ),
    );

  const tree: WorkspaceTreeItem[] = [
    ...pages.map((page, index) => ({
      id: page.id,
      type: "page" as const,
      parentId: parentFolderId(page.filePath ?? ""),
      filePath: page.filePath,
      order: index * 10,
    })),
    ...artifacts.map((artifact, index) => ({
      id: artifact.id,
      type: "artifact" as const,
      parentId: parentFolderId(artifact.filePath ?? ""),
      filePath: artifact.filePath,
      order: 10000 + index * 10,
    })),
    ...assets.map((asset, index) => ({
      id: asset.id,
      type: "asset" as const,
      parentId: parentFolderId(asset.filePath),
      filePath: asset.filePath,
      order: 20000 + index * 10,
    })),
  ];

  return withDocumentRecords(WorkspaceSnapshotSchema.parse({
    ...stored,
    title: stored.title || DEFAULT_WORKSPACE_TITLE,
    settings: {
      ...stored.settings,
      workspacePath: rootPath,
      recentFiles: stored.settings.recentFiles ?? [],
    },
    folders,
    tree,
    pages,
    artifacts,
    assets,
    updatedAt: nowIso(),
  }));
}

function normalizePageContent(page: Page): Page {
  if (page.html !== undefined) {
    return PageSchema.parse({ ...page, body: page.body ?? "", blocks: page.blocks ?? [] });
  }
  if (page.content?.type === "doc") {
    return PageSchema.parse({
      ...page,
      body: page.body ?? "",
      blocks: page.blocks ?? [],
    });
  }

  const nodes = [
    ...richTextToDocumentNodes(page.body ?? ""),
    ...(page.blocks ?? []).flatMap((block) => blockToDocumentNodes(block)),
  ];

  return PageSchema.parse({
    ...page,
    content: {
      type: "doc",
      content: nodes.length ? nodes : createEmptyDocument().content,
    },
    body: page.body ?? "",
    blocks: page.blocks ?? [],
  });
}

function withDocumentRecords(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  const previous = new Map(snapshot.documents.map((document) => [document.id, document]));
  const pageDocuments = snapshot.pages
    .filter((page) => page.filePath?.toLowerCase().endsWith(DOCUMENT_EXTENSION))
    .map((page): DocumentRecord => {
      const existing = previous.get(page.id);
      return {
        id: page.id,
        path: page.filePath!,
        title: page.title,
        kind: "rich-document",
        tags: page.tags,
        createdBy: existing?.createdBy ?? {
          id: page.source === "ai" ? "legacy-agent" : "local-user",
          label: page.source === "ai" ? "Imported agent" : "Local user",
          kind: page.source === "ai" ? "agent" : "human",
        },
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
        currentRevision: existing?.currentRevision,
      };
    });
  const artifactDocuments = snapshot.artifacts
    .filter((artifact) => artifact.filePath)
    .map((artifact): DocumentRecord => {
      const existing = previous.get(artifact.id);
      return {
        id: artifact.id,
        path: artifact.filePath!,
        title: artifact.title,
        kind: "html-artifact",
        tags: artifact.tags,
        createdBy: existing?.createdBy ?? {
          id: "imported-agent",
          label: "Imported agent",
          kind: "agent",
        },
        createdAt: artifact.createdAt,
        updatedAt: artifact.updatedAt,
        currentRevision: existing?.currentRevision,
      };
    });
  const activeIds = new Set([...pageDocuments, ...artifactDocuments].map((document) => document.id));
  return WorkspaceSnapshotSchema.parse({
    ...snapshot,
    documents: [
      ...pageDocuments,
      ...artifactDocuments,
      ...snapshot.documents.filter((document) => !activeIds.has(document.id)),
    ],
  });
}

function toPersistedSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  return WorkspaceSnapshotSchema.parse({
    ...snapshot,
    pages: snapshot.pages.map((page) => ({
      ...page,
      content: undefined,
      html: undefined,
      body: "",
      blocks: [],
    })),
  });
}

function blockToDocumentNodes(block: AtriaBlock): AtriaDocumentContent[] {
  switch (block.type) {
    case "heading":
      return [
        {
          type: "heading",
          attrs: { level: block.level },
          content: textContent(block.text),
        },
      ];
    case "text":
      return richTextToDocumentNodes(block.richText);
    case "todo":
      return [
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: block.checked },
              content: [{ type: "paragraph", content: textContent(block.text) }],
            },
          ],
        },
      ];
    case "callout":
      return [
        {
          type: "atriaCallout",
          attrs: { tone: block.tone, title: block.title, layout: "normal", align: "left" },
          content: [{ type: "paragraph", content: textContent(block.text) }],
        },
      ];
    case "card":
      return [
        {
          type: "atriaCard",
          attrs: { title: block.title, layout: "normal", align: "left" },
          content: [{ type: "paragraph", content: textContent(block.text) }],
        },
      ];
    case "code":
      return [
        {
          type: "codeBlock",
          attrs: { language: block.language || "text" },
          content: textContent(block.code),
        },
      ];
    case "image":
      return [
        {
          type: "atriaImage",
          attrs: {
            src: block.src,
            caption: block.caption,
            width: block.width,
            layout: "normal",
            align: "center",
            alt: block.caption,
          },
        },
      ];
    case "artifact":
      return [
        {
          type: "atriaArtifact",
          attrs: {
            artifactId: block.artifactId,
            note: block.note,
            height: block.height,
            collapsed: block.collapsed,
            layout: "wide",
            align: "center",
          },
        },
      ];
    case "divider":
      return [{ type: "horizontalRule" }];
    case "quote":
      return [
        {
          type: "blockquote",
          content: [{ type: "paragraph", content: textContent(block.text) }],
        },
      ];
    case "table":
      return [tableBlockToDocumentNode(block)];
    case "mermaid":
      return [{ type: "atriaMermaid", attrs: { code: block.code, layout: "wide", align: "center" } }];
    case "latex":
      return [
        {
          type: "atriaLatex",
          attrs: { formula: block.formula, display: block.display, layout: "normal", align: "center" },
        },
      ];
    case "custom-html":
      return [{ type: "atriaHtml", attrs: { html: block.html, layout: "wide", align: "center", height: 320 } }];
    case "timeline":
      return [{ type: "atriaTimeline", attrs: { items: block.items, layout: "wide", align: "left" } }];
    case "metric-card":
      return [
        {
          type: "atriaMetric",
          attrs: { label: block.label, value: block.value, delta: block.delta, layout: "normal", align: "left" },
        },
      ];
    case "chart":
    case "canvas":
    case "gallery":
    case "interactive":
      return [
        {
          type: "atriaLegacy",
          attrs: { legacyType: block.type, data: block, layout: "normal", align: "left" },
        },
      ];
  }
}

function richTextToDocumentNodes(value: string): AtriaDocumentContent[] {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "<p></p>") return [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(trimmed, "text/html");
  const nodes = Array.from(doc.body.childNodes)
    .map((node) => domNodeToDocumentNode(node))
    .filter(Boolean) as AtriaDocumentContent[];
  if (nodes.length) return nodes;
  return [{ type: "paragraph", content: textContent(stripHtml(trimmed)) }];
}

function domNodeToDocumentNode(node: ChildNode): AtriaDocumentContent | undefined {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim();
    return text ? { type: "paragraph", content: textContent(text) } : undefined;
  }
  if (!(node instanceof HTMLElement)) return undefined;
  const text = node.textContent?.trim() ?? "";
  if (!text && node.tagName.toLowerCase() !== "hr") return undefined;
  const tag = node.tagName.toLowerCase();
  if (/^h[1-4]$/.test(tag)) {
    return {
      type: "heading",
      attrs: { level: Number(tag.slice(1)) },
      content: textContent(text),
    };
  }
  if (tag === "blockquote") {
    return {
      type: "blockquote",
      content: [{ type: "paragraph", content: textContent(text) }],
    };
  }
  if (tag === "hr") return { type: "horizontalRule" };
  return {
    type: "paragraph",
    content: textContent(text),
  };
}

function tableBlockToDocumentNode(block: Extract<AtriaBlock, { type: "table" }>): AtriaDocumentContent {
  const columns = block.columns.length ? block.columns : ["Column 1", "Column 2"];
  const rows = block.rows.length ? block.rows : [columns.map(() => "")];
  return {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: columns.map((column) => ({
          type: "tableHeader",
          content: [{ type: "paragraph", content: textContent(column) }],
        })),
      },
      ...rows.map((row) => ({
        type: "tableRow",
        content: columns.map((_, index) => ({
          type: "tableCell",
          content: [{ type: "paragraph", content: textContent(row[index] ?? "") }],
        })),
      })),
    ],
  };
}

function textContent(text: string): AtriaDocumentContent[] | undefined {
  return text ? [{ type: "text", text }] : undefined;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function cleanPathSegment(input: string): string {
  return input.replace(/[<>:"\\|?*]+/g, "-").trim() || "Untitled";
}

function joinRelative(...parts: Array<string | undefined>): string {
  return parts
    .filter(Boolean)
    .join("/")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "");
}

function joinNative(root: string, relativePath: string): string {
  if (!root) return relativePath;
  return `${root.replace(/[\\/]+$/g, "")}\\${relativePath.replace(/\//g, "\\")}`;
}

function folderIdFromPath(path: string): string {
  return `folder:${path}`;
}

function parentFolderId(path: string): string | null {
  const clean = path.replace(/\\/g, "/").replace(/\/$/g, "");
  const index = clean.lastIndexOf("/");
  if (index < 0) return null;
  return folderIdFromPath(clean.slice(0, index));
}

function extensionFromDataUrl(dataUrl: string): string {
  const mime = dataUrl.match(/^data:([^;]+);/)?.[1] ?? "";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  return ".png";
}
