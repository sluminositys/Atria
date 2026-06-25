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
  WorkspaceTreeItem,
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
    title: "5月28日结果整理",
    kind: "note",
    projectId: "archaicseeker",
    tags: ["review", "benchmark", "artifact"],
    body: "",
    createdAt,
    updatedAt: createdAt,
    blocks: [
      createBlock("heading", { level: 1, text: "5月28日结果整理" }),
      createBlock("text", {
        richText:
          "<p>今天主要整理 ArchaicSeeker modern reference benchmark 的关键结果，并把 AI 生成的 HTML 报告嵌入到人工复盘页面中。</p>",
      }),
      createBlock("callout", {
        title: "AI 报告提示",
        text: "AI 生成报告显示 modern reference 在多数指标上收益明显，但部分样本存在边界情况，需要人工复查。",
      }),
      createBlock("card", {
        title: "核心判断 / Modern Reference 边际收益递减",
        text: "Recall@10 与 NDCG@10 继续提升，但 EM 改善有限。下一轮应重点检查检索命中后答案抽取失败的样本。",
      }),
      createBlock("todo", { text: "检查异常样本并标注失败原因", checked: true }),
      createBlock("todo", { text: "补充 reranker / prompt 参数对照实验", checked: false }),
      createBlock("code", {
        language: "bash",
        code: "python scripts/evaluate.py --dataset modern-reference --top-k 10 --report html",
      }),
      createBlock("artifact", {
        artifactId: artifact.id,
        note: "AI-generated HTML report，作为本轮结果的可视化原始依据。",
        height: 420,
      }),
      createBlock("text", {
        richText:
          "<p>人工总结：先保留 modern reference 方案作为默认候选，同时把边界样本整理成下一轮实验清单。</p>",
      }),
    ],
  });

  const summaryPage: Page = PageSchema.parse({
    id: "result-summary-2026-05-28",
    title: "2026-05-28 实验复盘与结论",
    kind: "timeline",
    timelineRef: "2026-05-28",
    projectId: "archaicseeker",
    tags: ["daily", "summary", "html"],
    body: "",
    createdAt,
    updatedAt: createdAt,
    blocks: [
      createBlock("heading", { level: 1, text: "2026-05-28 实验复盘与结论" }),
      createBlock("text", {
        richText:
          "<p>对本轮实验结果进行复盘，重点分析指标变化、误差来源与下一步改进方向。</p>",
      }),
      createBlock("artifact", {
        artifactId: artifact.id,
        note: "嵌入 HTML 结果，用于对照指标和趋势。",
        height: 360,
      }),
      createBlock("callout", {
        title: "关键发现",
        text: "NDCG@10 提升明显，主要受益于重排策略；EM 的提升仍然有限。",
      }),
      createBlock("text", {
        richText:
          "<p>下一步：把失败样本拆成检索失败、证据不足、生成偏差三类，再分别设计修正实验。</p>",
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
