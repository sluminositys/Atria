import { describe, expect, it } from "vitest";
import { WorkspaceSnapshotSchema } from "@atria/schema";
import { buildDocumentGraph } from "./documentGraph";

describe("buildDocumentGraph", () => {
  it("connects semantic links and artifact embeds to real workspace documents", () => {
    const now = "2026-07-31T00:00:00.000Z";
    const snapshot = WorkspaceSnapshotSchema.parse({
      updatedAt: now,
      pages: [
        {
          id: "notes",
          title: "Review",
          source: "human",
          filePath: "Notes/review.html",
          createdAt: now,
          updatedAt: now,
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Report",
                    marks: [{ type: "link", attrs: { href: "../Reports/result.html" } }],
                  },
                ],
              },
              { type: "atriaArtifact", attrs: { artifactId: "result" } },
            ],
          },
          blocks: [{ id: "legacy", type: "artifact", source: "human", artifactId: "result" }],
        },
      ],
      artifacts: [
        {
          id: "result",
          title: "Result",
          filePath: "Reports/result.html",
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    const graph = buildDocumentGraph(snapshot);

    expect(graph.nodes.map((node) => node.id)).toEqual(["notes", "result"]);
    expect(graph.edges).toEqual([
      { sourceId: "notes", targetId: "result", kind: "link" },
      { sourceId: "notes", targetId: "result", kind: "embed" },
    ]);
  });

  it("ignores external and self links", () => {
    const now = "2026-07-31T00:00:00.000Z";
    const snapshot = WorkspaceSnapshotSchema.parse({
      updatedAt: now,
      pages: [
        {
          id: "notes",
          title: "Review",
          filePath: "Notes/review.html",
          createdAt: now,
          updatedAt: now,
          content: {
            type: "doc",
            attrs: { href: "https://example.com" },
            content: [{ type: "paragraph", attrs: { href: "Notes/review.html" } }],
          },
        },
      ],
    });

    expect(buildDocumentGraph(snapshot).edges).toEqual([]);
  });

  it("indexes HTML references, rich-text images, legacy images, and artifact assets", () => {
    const now = "2026-07-31T00:00:00.000Z";
    const snapshot = WorkspaceSnapshotSchema.parse({
      updatedAt: now,
      pages: [
        {
          id: "notes",
          title: "Review",
          filePath: "Notes/review.atria.html",
          html: '<p><a href="../Reports/result.html?view=compact">Report</a></p><img src="../Assets/chart.png">',
          createdAt: now,
          updatedAt: now,
          content: {
            type: "doc",
            content: [{ type: "image", attrs: { src: "atria://asset/chart" } }],
          },
          blocks: [
            { id: "image", type: "image", src: "Assets/chart.png", caption: "", width: 640 },
            {
              id: "html",
              type: "custom-html",
              html: "<a href='References/source.pdf'>Source</a>",
              sandbox: true,
            },
          ],
        },
      ],
      artifacts: [
        {
          id: "result",
          title: "Result",
          filePath: "Reports/result.html",
          assets: ["Assets/chart.png"],
          createdAt: now,
          updatedAt: now,
        },
      ],
      assets: [
        {
          id: "chart",
          title: "chart.png",
          filePath: "Assets/chart.png",
          kind: "image",
          extension: ".png",
        },
        {
          id: "source",
          title: "source.pdf",
          filePath: "References/source.pdf",
          kind: "pdf",
          extension: ".pdf",
        },
      ],
    });

    const graph = buildDocumentGraph(snapshot);

    expect(graph.nodes.map((node) => [node.id, node.type])).toEqual([
      ["notes", "page"],
      ["result", "artifact"],
      ["chart", "asset"],
      ["source", "asset"],
    ]);
    expect(graph.edges).toEqual([
      { sourceId: "notes", targetId: "chart", kind: "embed" },
      { sourceId: "notes", targetId: "result", kind: "link" },
      { sourceId: "notes", targetId: "source", kind: "link" },
      { sourceId: "result", targetId: "chart", kind: "embed" },
    ]);
  });

  it("decodes HTML attributes and ignores malformed, external, and duplicate references", () => {
    const now = "2026-07-31T00:00:00.000Z";
    const snapshot = WorkspaceSnapshotSchema.parse({
      updatedAt: now,
      pages: [
        {
          id: "notes",
          title: "Review",
          filePath: "Notes/review.atria.html",
          html: [
            '<a href="References/research&amp;notes.pdf">Source</a>',
            '<a href="References/research&amp;notes.pdf">Duplicate</a>',
            '<a href="https://example.com/report.html">External</a>',
            '<img src="data:image/png;base64,abc">',
            '<a href=>Broken</a>',
          ].join(""),
          createdAt: now,
          updatedAt: now,
        },
      ],
      assets: [
        {
          id: "source",
          title: "research&notes.pdf",
          filePath: "References/research&notes.pdf",
          kind: "pdf",
          extension: ".pdf",
        },
      ],
    });

    expect(buildDocumentGraph(snapshot).edges).toEqual([
      { sourceId: "notes", targetId: "source", kind: "link" },
    ]);
  });
});
