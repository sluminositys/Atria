import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import {
  Artifact,
  ArtifactSchema,
  AtriaBlock,
  AtriaDocumentContent,
  Page,
  PageSchema,
  WorkspaceFolder,
  WorkspaceSnapshot,
  WorkspaceSnapshotSchema,
  WorkspaceTreeItem,
} from "@atria/schema";
import { createDefaultWorkspace, createEmptyDocument, nowIso, slugify } from "@atria/core";

interface WorkspaceEntry {
  name: string;
  relative_path: string;
  absolute_path: string;
  kind: "folder" | "file";
}

interface WorkspaceReadResult {
  root_path: string;
  snapshot?: WorkspaceSnapshot;
  entries: WorkspaceEntry[];
}

const PAGE_EXTENSION = ".atria.json";
const DEFAULT_WORKSPACE_TITLE = "My Workspace";

export async function getDefaultWorkspacePath(): Promise<string> {
  return invoke<string>("atria_default_workspace_path");
}

export async function loadWorkspace(rootPath?: string): Promise<WorkspaceSnapshot> {
  const firstRead = await invoke<WorkspaceReadResult>("atria_read_workspace", { rootPath });
  if (!firstRead.snapshot) {
    const seed = prepareSeedWorkspace(firstRead.root_path);
    await materializeSeedWorkspace(firstRead.root_path, seed);
    const secondRead = await invoke<WorkspaceReadResult>("atria_read_workspace", {
      rootPath: firstRead.root_path,
    });
    return hydrateWorkspace(secondRead.snapshot ?? seed, secondRead.entries, secondRead.root_path);
  }

  return hydrateWorkspace(firstRead.snapshot, firstRead.entries, firstRead.root_path);
}

export async function saveWorkspace(snapshot: WorkspaceSnapshot): Promise<void> {
  const next = WorkspaceSnapshotSchema.parse({
    ...snapshot,
    updatedAt: nowIso(),
  });

  await Promise.all(
    next.pages
      .filter((page) => page.filePath)
      .map((page) =>
        invoke("atria_write_text_file", {
          rootPath: next.settings.workspacePath,
          relativePath: page.filePath,
          content: JSON.stringify(PageSchema.parse(page), null, 2),
        }),
      ),
  );

  await invoke("atria_write_workspace_snapshot", {
    rootPath: next.settings.workspacePath,
    snapshot: next,
  });
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
  const name = `${slugify(title || "untitled", "note")}${PAGE_EXTENSION}`;
  return joinRelative(folder?.path ?? "Notes", name);
}

export function toFileAssetUrl(path: string | undefined): string {
  if (!path) return "";
  if (/^(https?:|data:|asset:|file:|\/)/.test(path)) return path;
  try {
    return convertFileSrc(path);
  } catch {
    return path;
  }
}

export function toWorkspaceFileAssetUrl(snapshot: WorkspaceSnapshot | undefined, path: string | undefined): string {
  if (!path) return "";
  if (/^(https?:|data:|asset:|file:|\/)/.test(path)) return path;
  const isWindowsAbsolute = /^[a-zA-Z]:[\\/]/.test(path);
  const absolutePath = isWindowsAbsolute
    ? path
    : joinNative(snapshot?.settings.workspacePath ?? "", path);
  return toFileAssetUrl(absolutePath);
}

function prepareSeedWorkspace(rootPath: string): WorkspaceSnapshot {
  const seed = createDefaultWorkspace();
  const folderPaths: Record<string, string> = {
    projects: "Projects",
    "project-archaicseeker": "Projects/ArchaicSeeker",
    research: "Projects/ArchaicSeeker/01_Research",
    analysis: "Projects/ArchaicSeeker/02_Analysis",
    results: "Projects/ArchaicSeeker/03_Results",
    timeline: "Timeline",
    daily: "Timeline/Daily",
    weekly: "Timeline/Weekly",
    monthly: "Timeline/Monthly",
    notes: "Notes",
    "html-results": "HTML Results",
    templates: "Templates",
  };
  const pagePaths: Record<string, string> = {
    "experiment-review-2026-05-28":
      "Projects/ArchaicSeeker/03_Results/experiment-review-2026-05-28.atria.json",
    "result-summary-2026-05-28": "Timeline/Daily/result-summary-2026-05-28.atria.json",
  };
  const artifactPath = "HTML Results/modern-reference-report.html";

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
        filePath: pagePaths[page.id] ?? `Notes/${slugify(page.title, "note")}${PAGE_EXTENSION}`,
      }),
    ),
    artifacts: seed.artifacts.map((artifact) =>
      ArtifactSchema.parse({
        ...artifact,
        filePath: artifactPath,
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

  const artifact = seed.artifacts[0];
  if (artifact?.filePath) {
    let html = "";
    try {
      html = await fetch("/sample-artifacts/modern-reference-report.html").then((response) => response.text());
    } catch {
      html = "<!doctype html><html><body><h1>Atria HTML Result</h1></body></html>";
    }
    await invoke("atria_write_text_file", {
      rootPath,
      relativePath: artifact.filePath,
      content: html,
    });
  }

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

  const pageEntries = fileEntries.filter((entry) => entry.relative_path.endsWith(PAGE_EXTENSION));
  const pages = await Promise.all(
    pageEntries.map(async (entry) => {
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
  const artifacts = htmlEntries.map((entry) => {
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
  ];

  return WorkspaceSnapshotSchema.parse({
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
    updatedAt: nowIso(),
  });
}

function normalizePageContent(page: Page): Page {
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
