export function formatMermaidError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason || "Mermaid render failed.");
  const normalized = message.replace(/^Error:\s*/i, "").trim();
  const line = normalized.match(/(?:on\s+)?line\s+(\d+)/i)?.[1];
  const summary = normalized.split(/\r?\n/).find((part) => part.trim())?.trim() || "Mermaid render failed.";
  if (line && !summary.toLowerCase().includes(`line ${line}`)) return `Line ${line}: ${summary}`;
  return summary.length > 220 ? `${summary.slice(0, 217)}...` : summary;
}

export function formatLatexError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason || "LaTeX render failed.");
  const normalized = message.replace(/^KaTeX parse error:\s*/i, "").replace(/\s+/g, " ").trim();
  const summary = normalized || "LaTeX render failed.";
  return summary.length > 220 ? `${summary.slice(0, 217)}...` : summary;
}
