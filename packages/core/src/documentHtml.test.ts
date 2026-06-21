import { describe, expect, it } from "vitest";
import {
  isSemanticDocument,
  normalizeHtmlText,
  parseSemanticDocument,
  serializeSemanticDocument,
} from "./documentHtml";

describe("semantic document HTML", () => {
  it("serializes a stable ordinary HTML document", () => {
    const html = serializeSemanticDocument({
      id: "doc-1",
      title: "Research & Results",
      body: "\r\n<h1 data-atria-id=\"heading-1\">Results</h1>  \r\n<p>Stable body</p>\r\n",
      language: "zh-CN",
    });

    expect(html).toContain('<meta name="atria:document-id" content="doc-1">');
    expect(html).toContain("<title>Research &amp; Results</title>");
    expect(html).toContain('<html lang="zh-cn">');
    expect(html).not.toContain("\r");
    expect(html).toContain('<h1 data-atria-id="heading-1">Results</h1>\n<p>Stable body</p>');
    expect(isSemanticDocument(html)).toBe(true);
  });

  it("round-trips owned metadata and body content", () => {
    const source = serializeSemanticDocument({
      id: "doc-special",
      title: 'A < B "notes"',
      body: '<p data-atria-id="p1">E = mc<sup>2</sup></p>',
      createdBy: {
        id: "codex",
        label: "Codex",
        kind: "agent",
        tool: "codex",
        model: "gpt-5",
        runId: "run-1",
      },
      tags: ["experiment", "result"],
    });

    expect(parseSemanticDocument(source)).toEqual({
      id: "doc-special",
      title: 'A < B "notes"',
      body: '<p data-atria-id="p1">E = mc<sup>2</sup></p>',
      language: "en",
      createdBy: {
        id: "codex",
        label: "Codex",
        kind: "agent",
        tool: "codex",
        model: "gpt-5",
        runId: "run-1",
      },
      tags: ["experiment", "result"],
    });
  });

  it("accepts an HTML fragment during migration", () => {
    expect(parseSemanticDocument("\uFEFF\r\n<p>Legacy</p>  ")).toMatchObject({
      body: "<p>Legacy</p>",
      tags: [],
    });
    expect(normalizeHtmlText("a  \r\nb\t\r\n")).toBe("a\nb");
  });
});
