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
});
