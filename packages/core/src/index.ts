import {
  Artifact,
  ArtifactCreateInput,
  ArtifactSchema,
  AtriaBlock,
  Page,
  PageCreateInput,
  PageSchema,
  TimelineKind,
  TimelineSummary,
  WorkspaceFolder,
  WorkspaceSnapshot,
  WorkspaceSnapshotSchema,
  WorkspaceTreeItem,
} from "@atria/schema";

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

export function createBlock(type: AtriaBlock["type"], patch: Partial<AtriaBlock> = {}): AtriaBlock {
  const id = crypto.randomUUID();
  const base = { id, source: "human" as const, createdAt: nowIso(), updatedAt: nowIso() };
  const defaults: Record<AtriaBlock["type"], AtriaBlock> = {
    heading: { ...base, type: "heading", level: 2, text: "New heading" },
    text: { ...base, type: "text", richText: "" },
    callout: { ...base, type: "callout", tone: "info", title: "Note", text: "" },
    todo: { ...base, type: "todo", checked: false, text: "Todo" },
    card: { ...base, type: "card", title: "Card", text: "" },
    code: { ...base, type: "code", language: "typescript", code: "" },
    image: { ...base, type: "image", src: "", caption: "" },
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
    { id: "projects", name: "Projects", parentId: null, order: 10, expanded: true },
    { id: "project-archaicseeker", name: "ArchaicSeeker", parentId: "projects", order: 10, expanded: true },
    { id: "research", name: "01_Research", parentId: "project-archaicseeker", order: 10, expanded: false },
    { id: "analysis", name: "02_Analysis", parentId: "project-archaicseeker", order: 20, expanded: false },
    { id: "results", name: "03_Results", parentId: "project-archaicseeker", order: 30, expanded: true },
    { id: "timeline", name: "Timeline", parentId: null, order: 20, expanded: true },
    { id: "daily", name: "Daily", parentId: "timeline", order: 10, expanded: true },
    { id: "weekly", name: "Weekly", parentId: "timeline", order: 20, expanded: false },
    { id: "monthly", name: "Monthly", parentId: "timeline", order: 30, expanded: false },
    { id: "notes", name: "Notes", parentId: null, order: 30, expanded: true },
    { id: "html-results", name: "HTML Results", parentId: null, order: 40, expanded: true },
    { id: "templates", name: "Templates", parentId: null, order: 50, expanded: false },
  ];

  const artifact: Artifact = ArtifactSchema.parse({
    id: "modern-reference-report",
    title: "modern-reference-report.html",
    description: "ArchaicSeeker experiment HTML report",
    entryFile: "index.html",
    entryUrl: "/sample-artifacts/modern-reference-report.html",
    projectId: "archaicseeker",
    tags: ["benchmark", "html", "ai"],
    metrics: {
      "Recall@10": 0.782,
      "MRR@10": 0.634,
      "NDCG@10": 0.719,
      "F1 Score": 0.701,
      EM: 0.512,
    },
    createdAt,
    updatedAt: createdAt,
  });

  const reviewPage: Page = PageSchema.parse({
    id: "experiment-review-2026-05-28",
    title: "实验设计与评估思路",
    kind: "note",
    projectId: "archaicseeker",
    tags: ["review", "benchmark"],
    createdAt,
    updatedAt: createdAt,
    blocks: [
      createBlock("heading", { text: "实验设计与评估思路" }),
      createBlock("text", {
        richText:
          "本页整理本轮实验的目标、数据、评估指标与对比方案，确保结果可复现、可解释、可追溯。",
      }),
      createBlock("callout", {
        title: "要点",
        text: "优先保证数据划分一致性与评估脚本可复用性，避免一次性脚本导致结果不可比较。",
      }),
      createBlock("todo", { text: "确定数据划分策略（即时倒排分）", checked: true }),
      createBlock("todo", { text: "确定评估指标与输出（MRR@10、NDCG@10、F1）", checked: false }),
      createBlock("code", {
        language: "python",
        code: "def ndcg_at_k(relevance, k):\n    dcg = sum(rel / math.log2(i + 2) for i, rel in enumerate(relevance[:k]))\n    return dcg",
      }),
      createBlock("metric-card", { label: "MRR@10", value: "0.634", delta: "+9.4%" }),
    ],
  });

  const summaryPage: Page = PageSchema.parse({
    id: "result-summary-2026-05-28",
    title: "2026-05-28 实验复盘与结论",
    kind: "timeline",
    timelineRef: "2026-05-28",
    tags: ["daily", "summary"],
    createdAt,
    updatedAt: createdAt,
    blocks: [
      createBlock("heading", { text: "2026-05-28 实验复盘与结论" }),
      createBlock("text", {
        richText:
          "对本轮实验结果进行复盘，重点分析指标变化、误差来源与下一步改进方向。",
      }),
      createBlock("artifact", {
        artifactId: "modern-reference-report",
        note: "嵌入的 HTML 结果用于对照指标与趋势。",
        height: 360,
      }),
      createBlock("callout", {
        title: "关键发现",
        text: "NDCG@10 提升明显，主要受益于重排策略的改进；EM 的提升仍然有限。",
      }),
    ],
  });

  const timeline: TimelineSummary = {
    id: "daily-2026-05-28",
    kind: "daily",
    title: "2026-05-28 Daily Summary",
    dateRef: "2026-05-28",
    pageId: summaryPage.id,
    artifactIds: [artifact.id],
    pageIds: [reviewPage.id, summaryPage.id],
    blocks: summaryPage.blocks,
    createdAt,
    updatedAt: createdAt,
  };

  const tree: WorkspaceTreeItem[] = [
    { id: reviewPage.id, type: "page", parentId: "results", order: 10 },
    { id: artifact.id, type: "artifact", parentId: "results", order: 20 },
    { id: summaryPage.id, type: "page", parentId: "daily", order: 10 },
    { id: artifact.id, type: "artifact", parentId: "html-results", order: 10 },
  ];

  return WorkspaceSnapshotSchema.parse({
    id: "local",
    title: "My Workspace",
    folders,
    tree,
    pages: [reviewPage, summaryPage],
    artifacts: [artifact],
    timeline: [timeline],
    projects: [
      {
        id: "archaicseeker",
        name: "ArchaicSeeker",
        description: "Search and reference benchmark project",
        status: "active",
        pageIds: [reviewPage.id, summaryPage.id],
        artifactIds: [artifact.id],
        createdAt,
        updatedAt: createdAt,
      },
    ],
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
      projectId: input.projectId,
      timelineRef: input.timelineRef,
      tags: input.tags ?? [],
      blocks: input.blocks ?? [createBlock("text")],
      createdAt,
      updatedAt: createdAt,
    });

    snapshot.pages = [...snapshot.pages.filter((item) => item.id !== page.id), page];
    snapshot.tree = [
      ...snapshot.tree.filter((item) => !(item.type === "page" && item.id === page.id)),
      { id: page.id, type: "page", parentId: page.kind === "timeline" ? "daily" : "notes", order: Date.now() },
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
    snapshot.artifacts = [
      ...snapshot.artifacts.filter((item) => item.id !== artifact.id),
      artifact,
    ];
    snapshot.tree = [
      ...snapshot.tree.filter((item) => !(item.type === "artifact" && item.id === artifact.id)),
      { id: artifact.id, type: "artifact", parentId: "html-results", order: Date.now() },
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
        createBlock("text", { richText: "" }),
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

