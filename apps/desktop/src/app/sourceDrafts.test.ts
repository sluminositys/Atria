import { describe, expect, it, vi } from "vitest";
import { isSourceDraftDirty, persistSourceDraft, type SourceDraft } from "./sourceDrafts";

const draft: SourceDraft = {
  key: "asset:note",
  type: "asset",
  id: "note",
  title: "note.txt",
  filePath: "Notes/note.txt",
  source: "local edit",
  baselineSource: "original",
};

describe("source draft persistence", () => {
  it("recognizes exact dirty state", () => {
    expect(isSourceDraftDirty(draft)).toBe(true);
    expect(isSourceDraftDirty({ ...draft, source: "original" })).toBe(false);
  });

  it("writes and checkpoints when the disk baseline is unchanged", async () => {
    const write = vi.fn(async () => undefined);
    const checkpoint = vi.fn(async () => undefined);
    const result = await persistSourceDraft(draft, {
      read: async () => "original",
      write,
      checkpoint,
    });

    expect(result).toEqual({ status: "saved", savedSource: "local edit" });
    expect(write).toHaveBeenCalledWith("local edit");
    expect(checkpoint).toHaveBeenCalledOnce();
  });

  it("does not write over an external modification", async () => {
    const write = vi.fn(async () => undefined);
    const checkpoint = vi.fn(async () => undefined);
    const result = await persistSourceDraft(draft, {
      read: async () => "external edit",
      write,
      checkpoint,
    });

    expect(result.status).toBe("conflict");
    expect(write).not.toHaveBeenCalled();
    expect(checkpoint).not.toHaveBeenCalled();
  });

  it("reports a missing file without recreating it", async () => {
    const write = vi.fn(async () => undefined);
    const result = await persistSourceDraft(draft, {
      read: async () => { throw new Error("The system cannot find the file specified. (os error 2)"); },
      write,
      checkpoint: async () => undefined,
    });

    expect(result.status).toBe("missing");
    expect(write).not.toHaveBeenCalled();
  });
});
