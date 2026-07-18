import { describe, expect, it } from "vitest";
import { formatLatexError, formatMermaidError } from "./renderNodeErrors";

describe("Mermaid render errors", () => {
  it("keeps line-aware parser messages concise", () => {
    expect(formatMermaidError(new Error("Parse error on line 4:\nUnexpected token\nlong parser context"))).toBe(
      "Parse error on line 4:",
    );
  });

  it("normalizes unknown failures", () => {
    expect(formatMermaidError("render unavailable")).toBe("render unavailable");
  });
});

describe("LaTeX render errors", () => {
  it("removes the KaTeX implementation prefix", () => {
    expect(formatLatexError(new Error("KaTeX parse error: Expected 'EOF' at position 4"))).toBe(
      "Expected 'EOF' at position 4",
    );
  });

  it("collapses multiline parser context", () => {
    expect(formatLatexError("Unexpected token\nnear \\frac{")).toBe("Unexpected token near \\frac{");
  });
});
