import { describe, expect, it } from "vitest";
import { WorkspaceSnapshotSchema } from "@atria/schema";
import { buildWorkspaceTagIndex, mutateWorkspaceTag, normalizeTagName } from "./tagMutations";

const now = "2026-08-01T00:00:00.000Z";
const localUser = { id: "local-user", label: "Local user", kind: "human" as const };
const importedAgent = { id: "imported-agent", label: "Imported agent", kind: "agent" as const };

function workspace() {
  return WorkspaceSnapshotSchema.parse({
    updatedAt: now,
    pages: [
      {
        id: "note",
        title: "Research note",
        filePath: "Notes/research.html",
        tags: ["Research", "shared"],
        createdAt: now,
        updatedAt: now,
      },
    ],
    artifacts: [
      {
        id: "report",
        title: "Result report",
        filePath: "Reports/result.html",
        tags: ["research", "HTML"],
        createdAt: now,
        updatedAt: now,
      },
    ],
    documents: [
      { id: "note", path: "Notes/research.html", title: "Research note", kind: "rich-document", tags: ["Research", "shared"], createdBy: localUser, createdAt: now, updatedAt: now },
      { id: "report", path: "Reports/result.html", title: "Result report", kind: "html-artifact", tags: ["research", "HTML"], createdBy: importedAgent, createdAt: now, updatedAt: now },
    ],
  });
}

describe("workspace tags", () => {
  it("indexes real page and artifact relationships case-insensitively", () => {
    expect(buildWorkspaceTagIndex(workspace())).toEqual([
      {
        name: "Research",
        items: [
          { id: "note", type: "page", title: "Research note", updatedAt: now },
          { id: "report", type: "artifact", title: "Result report", updatedAt: now },
        ],
      },
      { name: "HTML", items: [{ id: "report", type: "artifact", title: "Result report", updatedAt: now }] },
      { name: "shared", items: [{ id: "note", type: "page", title: "Research note", updatedAt: now }] },
    ]);
  });

  it("renames and merges tags across pages, artifacts, and document records", () => {
    const changedAt = "2026-08-01T01:00:00.000Z";
    const result = mutateWorkspaceTag(workspace(), "# research ", "shared", changedAt);

    expect(result.changed).toBe(true);
    expect(result.changedPaths).toEqual(["Notes/research.html", "Reports/result.html"]);
    expect(result.snapshot.pages[0]?.tags).toEqual(["shared"]);
    expect(result.snapshot.artifacts[0]?.tags).toEqual(["shared", "HTML"]);
    expect(result.snapshot.documents.map((document) => document.tags)).toEqual([["shared"], ["shared", "HTML"]]);
  });

  it("deletes a tag without touching unrelated metadata", () => {
    const snapshot = workspace();
    const result = mutateWorkspaceTag(snapshot, "html", undefined, "2026-08-01T02:00:00.000Z");

    expect(result.changedPaths).toEqual(["Reports/result.html"]);
    expect(result.snapshot.pages[0]).toBe(snapshot.pages[0]);
    expect(result.snapshot.artifacts[0]?.tags).toEqual(["research"]);
  });

  it("normalizes tag input and rejects empty changes", () => {
    const snapshot = workspace();
    expect(normalizeTagName(" ##  model   review ")).toBe("model review");
    expect(mutateWorkspaceTag(snapshot, "missing", "next").changed).toBe(false);
    expect(mutateWorkspaceTag(snapshot, "Research", " # ").changed).toBe(false);
  });
});
