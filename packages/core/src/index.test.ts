import { describe, expect, it } from "vitest";
import {
  MemoryWorkspaceRepository,
  WorkspaceService,
  createBlock,
  createDefaultWorkspace,
} from "./index";

describe("WorkspaceService", () => {
  it("creates a clean local-first workspace without demo content", async () => {
    const service = new WorkspaceService(new MemoryWorkspaceRepository(createDefaultWorkspace()));
    const snapshot = await service.getSnapshot();

    expect(snapshot.folders.map((folder) => folder.id)).toEqual(["notes", "reports", "assets", "templates"]);
    expect(snapshot.artifacts).toEqual([]);
    expect(snapshot.pages).toEqual([]);
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
    expect((await service.getSnapshot()).tree.at(-1)?.parentId).toBe("reports");
    expect((await service.search("new-result", 10))[0]?.item.id).toBe(artifact.id);
  });
});
