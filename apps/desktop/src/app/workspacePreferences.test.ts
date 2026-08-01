import { describe, expect, it } from "vitest";
import {
  forgetRecentWorkspacePath,
  readActiveWorkspacePath,
  readRecentWorkspacePaths,
  rememberWorkspacePath,
  setActiveWorkspacePath,
  workspaceDisplayLabels,
} from "./workspacePreferences";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("workspace preferences", () => {
  it("deduplicates recent paths without exposing them as labels", () => {
    const store = storage();
    rememberWorkspacePath("D:\\Research\\Atria", store);
    rememberWorkspacePath("d:\\research\\atria\\", store);
    rememberWorkspacePath("E:\\Archive\\Atria", store);

    const recent = readRecentWorkspacePaths("", store);
    expect(recent).toEqual(["E:\\Archive\\Atria", "d:\\research\\atria\\"]);
    expect([...workspaceDisplayLabels(recent).values()]).toEqual(["Atria (1)", "atria (2)"]);
  });

  it("keeps the current workspace when removing a recent location", () => {
    const store = storage();
    rememberWorkspacePath("D:\\Current", store);
    rememberWorkspacePath("E:\\Old", store);
    expect(forgetRecentWorkspacePath("E:\\Old", "D:\\Current", store)).toEqual(["D:\\Current"]);
  });

  it("persists the active workspace separately from recents", () => {
    const store = storage();
    setActiveWorkspacePath("E:\\Atria Research", store);
    expect(readActiveWorkspacePath(store)).toBe("E:\\Atria Research");
    expect(readRecentWorkspacePaths("", store)).toEqual([]);
  });
});
