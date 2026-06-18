import mermaid from "mermaid";

let initialized = false;

export async function renderMermaid(id: string, code: string): Promise<string> {
  if (!initialized) {
    mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict" });
    initialized = true;
  }
  const result = await mermaid.render(id, code || "graph TD\n  A[Atria] --> B[Artifact]");
  return result.svg;
}
