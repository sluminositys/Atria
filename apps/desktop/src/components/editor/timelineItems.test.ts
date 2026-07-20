import { describe, expect, it } from "vitest";
import { createTimelineItem, moveTimelineItem, parseTimelineItems } from "./timelineItems";

describe("timeline items", () => {
  it("normalizes agent-authored items with stable ids", () => {
    const items = parseTimelineItems([{ at: 2026, title: "Release", detail: null }]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ at: "2026", title: "Release", detail: "" });
    expect(items[0]?.id).toBeTruthy();
  });

  it("rejects malformed serialized data", () => {
    expect(parseTimelineItems("[broken")).toEqual([]);
    expect(parseTimelineItems({})).toEqual([]);
  });

  it("moves items without mutating the source", () => {
    const first = createTimelineItem({ id: "first", title: "First" });
    const second = createTimelineItem({ id: "second", title: "Second" });
    const source = [first, second];

    expect(moveTimelineItem(source, 1, -1).map((item) => item.id)).toEqual(["second", "first"]);
    expect(source.map((item) => item.id)).toEqual(["first", "second"]);
    expect(moveTimelineItem(source, 0, -1)).toBe(source);
  });
});
