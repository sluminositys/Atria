import { describe, expect, it } from "vitest";
import { formatMermaidError } from "./renderNodeErrors";

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
