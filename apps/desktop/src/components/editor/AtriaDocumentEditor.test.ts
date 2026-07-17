import { describe, expect, it } from "vitest";
import { validateDocumentBodySource } from "./documentSource";

describe("document body source validation", () => {
  it("accepts semantic body markup and structured nodes", () => {
    expect(validateDocumentBodySource("<h1>Result</h1><p>Ready</p>")).toBeNull();
    expect(validateDocumentBodySource('<section data-atria-node="card"><p>Body</p></section>')).toBeNull();
  });

  it("keeps the managed document wrapper out of body source", () => {
    expect(validateDocumentBodySource("<!doctype html><html><body><p>Body</p></body></html>"))
      .toContain("body only");
  });

  it("routes executable content to an isolated HTML block", () => {
    expect(validateDocumentBodySource("<script>alert(1)</script>"))
      .toBe("Use an HTML block for <script> content.");
    expect(validateDocumentBodySource('<iframe src="report.html"></iframe>'))
      .toBe("Use an HTML block for <iframe> content.");
  });
});
