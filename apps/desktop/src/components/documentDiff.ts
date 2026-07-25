export type DocumentDiffLineKind = "meta" | "hunk" | "context" | "added" | "deleted";

export interface DocumentDiffLine {
  text: string;
  kind: DocumentDiffLineKind;
  oldLine?: number;
  newLine?: number;
}

export function formatDocumentDiff(patch: string): DocumentDiffLine[] {
  if (!patch.trim()) return [];
  const lines: DocumentDiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const text of patch.replace(/\r\n?/g, "\n").split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      lines.push({ text, kind: "hunk" });
      continue;
    }
    if (text.startsWith("---") || text.startsWith("+++") || text.startsWith("diff ") || text.startsWith("index ") || text.startsWith("\\")) {
      lines.push({ text, kind: "meta" });
      continue;
    }
    if (text.startsWith("-")) {
      lines.push({ text, kind: "deleted", oldLine });
      oldLine += 1;
      continue;
    }
    if (text.startsWith("+")) {
      lines.push({ text, kind: "added", newLine });
      newLine += 1;
      continue;
    }
    if (text.startsWith(" ")) {
      lines.push({ text, kind: "context", oldLine, newLine });
      oldLine += 1;
      newLine += 1;
      continue;
    }
    lines.push({ text, kind: "meta" });
  }
  return lines;
}
