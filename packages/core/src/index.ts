import {
  Artifact,
  ArtifactCreateInput,
  ArtifactSchema,
  AtriaDocumentContent,
  AtriaBlock,
  Page,
  PageCreateInput,
  PageSchema,
  TimelineKind,
  TimelineSummary,
  WorkspaceFolder,
  WorkspaceSnapshot,
  WorkspaceSnapshotSchema,
} from "@atria/schema";

export { buildDocumentGraph } from "./documentGraph";
export type { DocumentGraph, DocumentGraphEdge, DocumentGraphNode } from "./documentGraph";

export interface WorkspaceRepository {
  read(): Promise<WorkspaceSnapshot>;
  write(snapshot: WorkspaceSnapshot): Promise<void>;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function slugify(input: string, fallback = "item"): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/(^[.-]+|[.-]+$)/g, "")
    .slice(0, 80);
  return slug || `${fallback}-${crypto.randomUUID().slice(0, 8)}`;
}

export function createEmptyDocument(): AtriaDocumentContent {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

export function createBlock(type: AtriaBlock["type"], patch: Partial<AtriaBlock> = {}): AtriaBlock {
  const id = crypto.randomUUID();
  const base = { id, source: "human" as const, createdAt: nowIso(), updatedAt: nowIso() };
  const defaults: Record<AtriaBlock["type"], AtriaBlock> = {
    heading: { ...base, type: "heading", level: 2, text: "New heading" },
    text: { ...base, type: "text", richText: "<p></p>" },
    callout: { ...base, type: "callout", tone: "info", title: "Note", text: "" },
    todo: { ...base, type: "todo", checked: false, text: "Todo" },
    card: { ...base, type: "card", title: "", text: "" },
    code: { ...base, type: "code", language: "text", code: "" },
    image: { ...base, type: "image", src: "", caption: "", width: 640 },
    artifact: { ...base, type: "artifact", artifactId: "", note: "", height: 420, collapsed: false },
    divider: { ...base, type: "divider" },
    quote: { ...base, type: "quote", text: "" },
    table: { ...base, type: "table", columns: ["Name", "Value"], rows: [["", ""]] },
    chart: { ...base, type: "chart", chartType: "line", series: [] },
    canvas: { ...base, type: "canvas", elements: [] },
    mermaid: { ...base, type: "mermaid", code: "graph TD\n  A[Atria] --> B[Artifact]\n" },
    latex: { ...base, type: "latex", formula: "E = mc^2", display: true },
    interactive: { ...base, type: "interactive", runtime: "html", props: {} },
    "custom-html": { ...base, type: "custom-html", html: "<div>Custom HTML</div>", sandbox: true },
    timeline: { ...base, type: "timeline", items: [] },
    "metric-card": { ...base, type: "metric-card", label: "Metric", value: "", delta: "" },
    gallery: { ...base, type: "gallery", images: [] },
  };
  return { ...defaults[type], ...patch } as AtriaBlock;
}

export function createDefaultWorkspace(): WorkspaceSnapshot {
  const createdAt = nowIso();
  const folders: WorkspaceFolder[] = [
    { id: "notes", name: "Notes", parentId: null, order: 10, expanded: true },
    { id: "reports", name: "Reports", parentId: null, order: 20, expanded: true },
    { id: "assets", name: "Assets", parentId: null, order: 30, expanded: true },
    { id: "templates", name: "Templates", parentId: null, order: 40, expanded: false },
  ];

  return WorkspaceSnapshotSchema.parse({
    id: "local",
    title: "My Workspace",
    folders,
    tree: [],
    pages: [],
    artifacts: [],
    documents: [],
    timeline: [],
    projects: [],
    settings: {
      workspacePath: "",
      recentFiles: [],
    },
    updatedAt: createdAt,
  });
}

export class MemoryWorkspaceRepository implements WorkspaceRepository {
  private snapshot: WorkspaceSnapshot;

  constructor(seed: WorkspaceSnapshot = createDefaultWorkspace()) {
    this.snapshot = seed;
  }

  async read(): Promise<WorkspaceSnapshot> {
    return structuredClone(this.snapshot);
  }

  async write(snapshot: WorkspaceSnapshot): Promise<void> {
    this.snapshot = WorkspaceSnapshotSchema.parse(structuredClone(snapshot));
  }
}

export class WorkspaceService {
  constructor(private readonly repository: WorkspaceRepository) {}

  async getSnapshot(): Promise<WorkspaceSnapshot> {
    return this.repository.read();
  }

  async search(query: string, limit = 20) {
    const snapshot = await this.repository.read();
    const needle = query.trim().toLowerCase();
    const items = [
      ...snapshot.pages.map((item) => ({ type: "page" as const, item })),
      ...snapshot.artifacts.map((item) => ({ type: "artifact" as const, item })),
    ];

    if (!needle) return items.slice(0, limit);

    return items
      .filter(({ item }) =>
        [item.id, item.title, "description" in item ? item.description : "", ...(item.tags ?? [])]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      )
      .slice(0, limit);
  }

  async createPage(input: PageCreateInput): Promise<Page> {
    const snapshot = await this.repository.read();
    const createdAt = nowIso();
    const page = PageSchema.parse({
      id: input.id ?? slugify(input.title, "page"),
      title: input.title,
      source: "human",
      kind: input.kind ?? "note",
      content: input.content ?? createEmptyDocument(),
      body: input.body ?? "",
      filePath: input.filePath,
      projectId: input.projectId,
      timelineRef: input.timelineRef,
      tags: input.tags ?? [],
      blocks: input.blocks ?? [],
      createdAt,
      updatedAt: createdAt,
    });

    snapshot.pages = [...snapshot.pages.filter((item) => item.id !== page.id), page];
    snapshot.tree = [
      ...snapshot.tree.filter((item) => !(item.type === "page" && item.id === page.id)),
      { id: page.id, type: "page", parentId: existingFolderId(snapshot, "notes"), order: Date.now() },
    ];
    snapshot.updatedAt = nowIso();
    await this.repository.write(snapshot);
    return page;
  }

  async updatePage(page: Page): Promise<Page> {
    const snapshot = await this.repository.read();
    const next = PageSchema.parse({ ...page, updatedAt: nowIso() });
    snapshot.pages = snapshot.pages.map((item) => (item.id === next.id ? next : item));
    snapshot.updatedAt = nowIso();
    await this.repository.write(snapshot);
    return next;
  }

  async appendBlock(pageId: string, block: AtriaBlock): Promise<Page> {
    const snapshot = await this.repository.read();
    const page = snapshot.pages.find((item) => item.id === pageId);
    if (!page) throw new Error(`Page not found: ${pageId}`);
    return this.updatePage({ ...page, blocks: [...page.blocks, block] });
  }

  async replaceBlocks(pageId: string, blocks: AtriaBlock[]): Promise<Page> {
    const snapshot = await this.repository.read();
    const page = snapshot.pages.find((item) => item.id === pageId);
    if (!page) throw new Error(`Page not found: ${pageId}`);
    return this.updatePage({ ...page, blocks });
  }

  async deletePage(pageId: string): Promise<void> {
    const snapshot = await this.repository.read();
    snapshot.pages = snapshot.pages.filter((item) => item.id !== pageId);
    snapshot.tree = snapshot.tree.filter((item) => !(item.type === "page" && item.id === pageId));
    snapshot.timeline = snapshot.timeline.map((item) => ({
      ...item,
      pageIds: item.pageIds.filter((id) => id !== pageId),
      pageId: item.pageId === pageId ? undefined : item.pageId,
    }));
    snapshot.updatedAt = nowIso();
    await this.repository.write(snapshot);
  }

  async registerArtifact(input: ArtifactCreateInput): Promise<Artifact> {
    const snapshot = await this.repository.read();
    const createdAt = nowIso();
    const artifact = ArtifactSchema.parse({
      id: input.id ?? slugify(input.title, "artifact"),
      title: input.title,
      description: input.description ?? "",
      source: "ai",
      kind: input.kind ?? "html",
      entryFile: input.entryFile ?? "index.html",
      entryUrl: input.entryUrl,
      filePath: input.filePath,
      projectId: input.projectId,
      taskId: input.taskId,
      timelineRefs: input.timelineRefs ?? [],
      tags: input.tags ?? [],
      metrics: input.metrics ?? {},
      assets: input.assets ?? [],
      status: "active",
      createdAt,
      updatedAt: createdAt,
    });
    snapshot.artifacts = [...snapshot.artifacts.filter((item) => item.id !== artifact.id), artifact];
    snapshot.tree = [
      ...snapshot.tree.filter((item) => !(item.type === "artifact" && item.id === artifact.id)),
      { id: artifact.id, type: "artifact", parentId: existingFolderId(snapshot, "reports"), order: Date.now() },
    ];
    snapshot.updatedAt = nowIso();
    await this.repository.write(snapshot);
    return artifact;
  }

  async updateArtifact(artifact: Artifact): Promise<Artifact> {
    const snapshot = await this.repository.read();
    const next = ArtifactSchema.parse({ ...artifact, updatedAt: nowIso() });
    snapshot.artifacts = snapshot.artifacts.map((item) => (item.id === next.id ? next : item));
    snapshot.updatedAt = nowIso();
    await this.repository.write(snapshot);
    return next;
  }

  async deleteArtifact(artifactId: string): Promise<void> {
    const snapshot = await this.repository.read();
    snapshot.artifacts = snapshot.artifacts.map((item) =>
      item.id === artifactId ? { ...item, status: "deleted", updatedAt: nowIso() } : item,
    );
    snapshot.updatedAt = nowIso();
    await this.repository.write(snapshot);
  }

  async createTimelineSummary(kind: TimelineKind, dateRef: string, title?: string): Promise<TimelineSummary> {
    const page = await this.createPage({
      title: title ?? `${dateRef} ${kind} summary`,
      kind: "timeline",
      timelineRef: dateRef,
      tags: [kind, "summary"],
      blocks: [
        createBlock("heading", { text: title ?? `${dateRef} Summary` }),
        createBlock("text", { richText: "<p></p>" }),
      ],
    });
    const snapshot = await this.repository.read();
    const summary: TimelineSummary = {
      id: `${kind}-${dateRef}`,
      kind,
      title: page.title,
      dateRef,
      pageId: page.id,
      pageIds: [page.id],
      artifactIds: [],
      blocks: page.blocks,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    snapshot.timeline = [...snapshot.timeline.filter((item) => item.id !== summary.id), summary];
    snapshot.updatedAt = nowIso();
    await this.repository.write(snapshot);
    return summary;
  }
}

function existingFolderId(snapshot: WorkspaceSnapshot, preferredId: string): string | null {
  return snapshot.folders.some((folder) => folder.id === preferredId)
    ? preferredId
    : snapshot.folders[0]?.id ?? null;
}
