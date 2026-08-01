import type { AtriaDocumentContent, WorkspaceSnapshot } from "@atria/schema";

export interface DocumentGraphNode {
  id: string;
  type: "page" | "artifact" | "asset";
  title: string;
  filePath: string;
}

export interface DocumentGraphEdge {
  sourceId: string;
  targetId: string;
  kind: "link" | "embed";
}

export interface DocumentGraph {
  nodes: DocumentGraphNode[];
  edges: DocumentGraphEdge[];
}

export function buildDocumentGraph(snapshot: WorkspaceSnapshot): DocumentGraph {
  const nodes: DocumentGraphNode[] = [
    ...snapshot.pages.map((page) => ({
      id: page.id,
      type: "page" as const,
      title: page.title,
      filePath: page.filePath ?? "",
    })),
    ...snapshot.artifacts
      .filter((artifact) => artifact.status === "active")
      .map((artifact) => ({
        id: artifact.id,
        type: "artifact" as const,
        title: artifact.title,
        filePath: artifact.filePath ?? "",
      })),
    ...snapshot.assets.map((asset) => ({
      id: asset.id,
      type: "asset" as const,
      title: asset.title,
      filePath: asset.filePath,
    })),
  ];
  const aliases = createAliasIndex(nodes);
  const edges: DocumentGraphEdge[] = [];
  const edgeKeys = new Set<string>();

  const addEdge = (sourceId: string, targetId: string | undefined, kind: DocumentGraphEdge["kind"]) => {
    if (!targetId || sourceId === targetId) return;
    const key = `${sourceId}\n${targetId}\n${kind}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ sourceId, targetId, kind });
  };

  for (const page of snapshot.pages) {
    visitDocument(page.content, (reference, kind) => {
      addEdge(page.id, resolveReference(reference, aliases), kind);
    });
    visitHtml(page.html, (reference, kind) => {
      addEdge(page.id, resolveReference(reference, aliases), kind);
    });
    for (const block of page.blocks) {
      if (block.type === "artifact") addEdge(page.id, block.artifactId, "embed");
      if (block.type === "image") addEdge(page.id, resolveReference(block.src, aliases), "embed");
      if (block.type === "gallery") {
        for (const image of block.images) {
          addEdge(page.id, resolveReference(image.src, aliases), "embed");
        }
      }
      if (block.type === "custom-html") {
        visitHtml(block.html, (reference, kind) => {
          addEdge(page.id, resolveReference(reference, aliases), kind);
        });
      }
    }
  }

  for (const artifact of snapshot.artifacts) {
    if (artifact.status !== "active") continue;
    for (const reference of artifact.assets) {
      addEdge(artifact.id, resolveReference(reference, aliases), "embed");
    }
  }

  return { nodes, edges };
}

function visitDocument(
  node: AtriaDocumentContent | undefined,
  visit: (reference: string, kind: DocumentGraphEdge["kind"]) => void,
): void {
  if (!node) return;
  const artifactId = stringAttribute(node.attrs, "artifactId");
  if (artifactId) visit(artifactId, "embed");

  const href = stringAttribute(node.attrs, "href");
  if (href) visit(href, "link");
  const src = stringAttribute(node.attrs, "src");
  if (src) visit(src, "embed");
  for (const mark of node.marks ?? []) {
    if (mark.type !== "link") continue;
    const markHref = stringAttribute(mark.attrs, "href");
    if (markHref) visit(markHref, "link");
  }
  for (const child of node.content ?? []) visitDocument(child, visit);
}

function visitHtml(
  html: string | undefined,
  visit: (reference: string, kind: DocumentGraphEdge["kind"]) => void,
): void {
  if (!html) return;
  const attributePattern = /\b(href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
  for (const match of html.matchAll(attributePattern)) {
    const name = match[1]?.toLowerCase();
    const value = decodeHtmlAttribute(match[2] ?? match[3] ?? match[4] ?? "");
    if (value) visit(value, name === "src" ? "embed" : "link");
  }
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function stringAttribute(attributes: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = attributes?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function createAliasIndex(nodes: DocumentGraphNode[]): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const node of nodes) {
    for (const alias of [node.id, node.title, node.filePath, fileName(node.filePath)]) {
      const normalized = normalizeReference(alias);
      if (normalized && !aliases.has(normalized)) aliases.set(normalized, node.id);
    }
  }
  return aliases;
}

function resolveReference(reference: string, aliases: Map<string, string>): string | undefined {
  const normalized = normalizeReference(reference);
  if (!normalized || /^(https?:|mailto:|data:)/.test(normalized)) return undefined;
  const direct = aliases.get(normalized);
  if (direct) return direct;
  for (const [alias, id] of aliases) {
    if (alias && normalized.endsWith(`/${alias}`)) return id;
  }
  return undefined;
}

function normalizeReference(reference: string): string {
  let value = reference.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    // Keep malformed references searchable by their literal value.
  }
  return value
    .replace(/^atria:\/\/(document|artifact|asset)\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .toLowerCase();
}

function fileName(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? "";
}
