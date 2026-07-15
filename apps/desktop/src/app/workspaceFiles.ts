import type { WorkspaceAsset, WorkspaceAssetKind } from "@atria/schema";

export interface LocalWorkspaceEntry {
  name: string;
  relative_path: string;
  absolute_path: string;
  kind: "folder" | "file";
  size: number;
  modified_ms?: number;
}

const imageExtensions = new Set(["bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"]);
const textExtensions = new Set([
  "c", "cpp", "css", "csv", "go", "h", "htm", "java", "js", "json", "jsx", "log", "md", "mermaid",
  "mjs", "py", "rs", "scss", "sh", "sql", "tex", "toml", "ts", "tsx", "tsv", "txt", "xml", "yaml", "yml",
]);
const documentExtensions = new Set(["doc", "docx", "odp", "ods", "odt", "ppt", "pptx", "xls", "xlsx"]);

export function classifyWorkspaceAsset(extension: string): WorkspaceAssetKind {
  const normalized = extension.replace(/^\./, "").toLowerCase();
  if (imageExtensions.has(normalized)) return "image";
  if (normalized === "pdf") return "pdf";
  if (textExtensions.has(normalized)) return "text";
  if (documentExtensions.has(normalized)) return "document";
  return "other";
}

export function workspaceAssetFromEntry(
  entry: LocalWorkspaceEntry,
  previous?: WorkspaceAsset,
): WorkspaceAsset {
  const extension = fileExtension(entry.name);
  const kind = classifyWorkspaceAsset(extension);
  return {
    id: previous?.id ?? `asset-${stablePathHash(entry.relative_path)}`,
    title: entry.name,
    filePath: entry.relative_path,
    kind,
    extension,
    mimeType: mimeTypeFor(extension, kind),
    size: Math.max(0, entry.size || 0),
    updatedAt: Number.isFinite(entry.modified_ms) ? new Date(entry.modified_ms!).toISOString() : previous?.updatedAt,
  };
}

function fileExtension(name: string): string {
  const index = name.lastIndexOf(".");
  return index > 0 && index < name.length - 1 ? name.slice(index + 1).toLowerCase() : "";
}

function mimeTypeFor(extension: string, kind: WorkspaceAssetKind): string | undefined {
  const known: Record<string, string> = {
    bmp: "image/bmp",
    csv: "text/csv",
    gif: "image/gif",
    htm: "text/html",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    json: "application/json",
    md: "text/markdown",
    pdf: "application/pdf",
    png: "image/png",
    svg: "image/svg+xml",
    tex: "text/x-tex",
    tsv: "text/tab-separated-values",
    txt: "text/plain",
    webp: "image/webp",
    xml: "application/xml",
    yaml: "application/yaml",
    yml: "application/yaml",
  };
  return known[extension] ?? (kind === "text" ? "text/plain" : undefined);
}

function stablePathHash(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value.replace(/\\/g, "/").toLowerCase()) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
