import { describe, expect, it } from "vitest";
import {
  MemoryWorkspaceRepository,
  WorkspaceService,
  createBlock,
  createDefaultWorkspace,
} from "./index";

describe("WorkspaceService", () => {
  it("creates the default HTML-first workspace shape", async () => {
    const service = new WorkspaceService(new MemoryWorkspaceRepository(createDefaultWorkspace()));
    const snapshot = await service.getSnapshot();

    expect(snapshot.folders.map((folder) => folder.id)).toContain("html-results");
    expect(snapshot.folders.map((folder) => folder.id)).toContain("timeline");
    expect(snapshot.artifacts[0]?.source).toBe("ai");
    expect(snapshot.pages[0]?.source).toBe("human");
  });

  it("creates a page and appends a block", async () => {
    const service = new WorkspaceService(new MemoryWorkspaceRepository(createDefaultWorkspace()));
    const page = await service.createPage({ title: "Human Review" });
    const updated = await service.appendBlock(page.id, createBlock("callout", { title: "Finding" }));

    expect(updated.title).toBe("Human Review");
    expect(updated.blocks.some((block) => block.type === "callout")).toBe(true);
  });

  it("registers AI-created HTML artifacts", async () => {
    const service = new WorkspaceService(new MemoryWorkspaceRepository(createDefaultWorkspace()));
    const artifact = await service.registerArtifact({
      title: "new-result.html",
      entryFile: "index.html",
      tags: ["benchmark"],
    });

    expect(artifact.source).toBe("ai");
    expect(artifact.kind).toBe("html");
    expect((await service.search("new-result", 10))[0]?.item.id).toBe(artifact.id);
  });
});

