import { describe, expect, it } from "vitest";
import { horizontalResize, verticalResize } from "./nodeLayout";

describe("anchored node resizing", () => {
  it("keeps the opposite horizontal edge fixed for every alignment", () => {
    expect(horizontalResize(400, 0, -40, "w", "left", 100, 800)).toEqual({ size: 440, offset: -40 });
    expect(horizontalResize(400, 0, 40, "e", "center", 100, 800)).toEqual({ size: 440, offset: 20 });
    expect(horizontalResize(400, 0, -40, "w", "right", 100, 800)).toEqual({ size: 440, offset: 0 });
  });

  it("moves only the dragged vertical edge", () => {
    expect(verticalResize(300, 0, -30, "n", 100, 700)).toEqual({ size: 330, offset: -30 });
    expect(verticalResize(300, 0, 30, "s", 100, 700)).toEqual({ size: 330, offset: 0 });
  });

  it("uses the clamped size when calculating its anchor compensation", () => {
    expect(horizontalResize(400, 10, -500, "w", "left", 100, 500)).toEqual({ size: 500, offset: -90 });
    expect(verticalResize(300, 10, -500, "n", 100, 360)).toEqual({ size: 360, offset: -50 });
  });
});
