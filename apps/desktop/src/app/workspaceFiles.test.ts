import { describe, expect, it } from "vitest";
import { classifyWorkspaceAsset, workspaceAssetFromEntry } from "./workspaceFiles";

describe("workspace file classification", () => {
  it.each([
    ["png", "image"],
    ["PDF", "pdf"],
    ["md", "text"],
    ["tsx", "text"],
    ["docx", "document"],
    ["bin", "other"],
  ] as const)("classifies %s as %s", (extension, expected) => {
    expect(classifyWorkspaceAsset(extension)).toBe(expected);
  });

  it("creates a stable asset record without storing an absolute path", () => {
    const first = workspaceAssetFromEntry({
      name: "figure.png",
      relative_path: "Assets/figure.png",
      absolute_path: "D:/private/Atria/Assets/figure.png",
      kind: "file",
      size: 2048,
      modified_ms: Date.parse("2026-08-01T01:00:00.000Z"),
    });
    const second = workspaceAssetFromEntry({
      name: "figure.png",
      relative_path: "Assets/figure.png",
      absolute_path: "E:/moved/Atria/Assets/figure.png",
      kind: "file",
      size: 2048,
      modified_ms: Date.parse("2026-08-01T01:00:00.000Z"),
    });

    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({
      filePath: "Assets/figure.png",
      kind: "image",
      mimeType: "image/png",
      size: 2048,
    });
    expect(second).not.toHaveProperty("absolutePath");
  });

  it("preserves a known asset identity after metadata refresh", () => {
    const asset = workspaceAssetFromEntry(
      {
        name: "renamed.md",
        relative_path: "Notes/renamed.md",
        absolute_path: "D:/Atria/Notes/renamed.md",
        kind: "file",
        size: 12,
      },
      {
        id: "asset-persistent",
        title: "renamed.md",
        filePath: "Notes/renamed.md",
        kind: "text",
        extension: "md",
        size: 10,
      },
    );
    expect(asset.id).toBe("asset-persistent");
    expect(asset.size).toBe(12);
  });
});
