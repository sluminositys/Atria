export function resolveWorkspaceReference(reference: string, documentFilePath?: string): string {
  const value = reference.trim();
  if (!value || isAbsoluteReference(value)) return value;

  const normalized = decodeLocalReference(value)
    .replace(/\\/g, "/")
    .replace(/[?#].*$/, "");
  if (normalized.startsWith("/")) return normalizeSegments(normalized.slice(1));
  if (!documentFilePath) return normalizeSegments(normalized);

  const documentParts = documentFilePath.replace(/\\/g, "/").split("/").filter(Boolean);
  documentParts.pop();
  return normalizeSegments([...documentParts, ...normalized.split("/")]);
}

function isAbsoluteReference(reference: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/|#|[a-z]:[\\/])/i.test(reference);
}

function decodeLocalReference(reference: string): string {
  try {
    return decodeURIComponent(reference);
  } catch {
    return reference;
  }
}

function normalizeSegments(value: string | string[]): string {
  const result: string[] = [];
  for (const segment of Array.isArray(value) ? value : value.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (result.length) result.pop();
      else result.push(segment);
      continue;
    }
    result.push(segment);
  }
  return result.join("/");
}
