export function formatMermaidError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason || "Mermaid render failed.");
  const normalized = message.replace(/^Error:\s*/i, "").trim();
  const line = normalized.match(/(?:on\s+)?line\s+(\d+)/i)?.[1];
  const summary = normalized.split(/\r?\n/).find((part) => part.trim())?.trim() || "Mermaid render failed.";
  if (line && !summary.toLowerCase().includes(`line ${line}`)) return `Line ${line}: ${summary}`;
  return summary.length > 220 ? `${summary.slice(0, 217)}...` : summary;
}
