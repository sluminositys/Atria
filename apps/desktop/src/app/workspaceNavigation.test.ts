import { describe, expect, it } from "vitest";
import type { WorkspaceSnapshot } from "@atria/schema";
import { createDefaultWorkspace } from "@atria/core";
import { existingRecentFiles, relativeTimeLabel } from "./workspaceNavigation";

function snapshotWithRecents(): WorkspaceSnapshot {
  const snapshot = createDefaultWorkspace();
  return {
    ...snapshot,
    pages: [
      {
        id: "doc-1",
        title: "Document",
        source: "human",
        kind: "note",
        body: "",
        tags: [],
        blocks: [],
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    ],
    settings: {
      ...snapshot.settings,
      recentFiles: [
        { type: "page", id: "missing", title: "Missing", source: "human", openedAt: "2026-08-01T03:00:00.000Z" },
        { type: "page", id: "doc-1", title: "Old", source: "human", openedAt: "2026-08-01T01:00:00.000Z" },
        { type: "page", id: "doc-1", title: "Current", source: "human", openedAt: "2026-08-01T02:00:00.000Z" },
      ],
    },
  };
}

describe("workspace navigation indexes", () => {
  it("removes missing and duplicate recent files", () => {
    const result = existingRecentFiles(snapshotWithRecents());
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "doc-1", title: "Current" });
  });

  it("formats recent timestamps without leaking paths", () => {
    expect(relativeTimeLabel("2026-08-01T01:59:30.000Z", new Date("2026-08-01T02:00:00.000Z").getTime())).toBe("Just now");
    expect(relativeTimeLabel("2026-08-01T00:00:00.000Z", new Date("2026-08-01T02:00:00.000Z").getTime())).toBe("2h ago");
  });
});
