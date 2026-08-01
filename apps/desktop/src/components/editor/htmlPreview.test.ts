import { describe, expect, it } from "vitest";
import { buildHtmlPreviewDocument, defaultHtmlSource } from "./htmlPreview";

describe("HTML node preview document", () => {
  it("wraps fragments in an offline sandbox document", () => {
    const result = buildHtmlPreviewDocument("<h1>Result</h1>");

    expect(result).toContain("Content-Security-Policy");
    expect(result).toContain("connect-src 'none'");
    expect(result).toContain("<body><h1>Result</h1></body>");
  });

  it("injects preview policy into complete documents", () => {
    const result = buildHtmlPreviewDocument("<!doctype html><html><head><title>A</title></head><body>B</body></html>");

    expect(result.match(/<html/gi)).toHaveLength(1);
    expect(result).toContain("<head><meta charset");
    expect(result).toContain("<title>A</title>");
  });

  it("uses a visible starter document for empty source", () => {
    expect(buildHtmlPreviewDocument(" ")).toContain(defaultHtmlSource);
  });
});
