import { describe, expect, it } from "vitest";
import { resolveWorkspaceReference } from "./workspaceReferences";

describe("resolveWorkspaceReference", () => {
  it("resolves document-relative references inside the Workspace", () => {
    expect(resolveWorkspaceReference("../Assets/chart.png", "Notes/review.html")).toBe("Assets/chart.png");
    expect(resolveWorkspaceReference("./figures/chart.png", "Notes/review.html")).toBe("Notes/figures/chart.png");
    expect(resolveWorkspaceReference("chart.png", "review.html")).toBe("chart.png");
  });

  it("normalizes root-relative, encoded, query, and Windows-style references", () => {
    expect(resolveWorkspaceReference("/Assets/chart%20one.png?v=2#result", "Notes/review.html")).toBe("Assets/chart one.png");
    expect(resolveWorkspaceReference("..\\Assets\\chart.png", "Notes/review.html")).toBe("Assets/chart.png");
  });

  it("preserves URL, data, anchor, protocol-relative, and absolute file references", () => {
    const references = [
      "https://example.com/chart.png",
      "data:image/png;base64,abc",
      "asset://localhost/chart.png",
      "atria://asset/chart",
      "#figure-1",
      "//cdn.example.com/chart.png",
      "D:\\charts\\chart.png",
    ];
    for (const reference of references) {
      expect(resolveWorkspaceReference(reference, "Notes/review.html")).toBe(reference);
    }
  });
});
