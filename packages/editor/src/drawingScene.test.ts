import { describe, expect, it } from "vitest";
import { createDrawingElement, drawingElementBounds, moveDrawingElement, updateDrawingElement } from "./drawingScene";

describe("drawing scene", () => {
  it("creates and grows a rectangle in either drag direction", () => {
    const start = createDrawingElement("rectangle", "rect", { x: 30, y: 40 }, "#111111", 2);
    const rectangle = updateDrawingElement(start, { x: 10, y: 15 });
    expect(drawingElementBounds(rectangle)).toEqual({ x: 10, y: 15, width: 20, height: 25 });
  });

  it("moves every point in a freehand stroke", () => {
    const start = createDrawingElement("pen", "pen", { x: 1, y: 2 }, "#111111", 2);
    const stroke = updateDrawingElement(start, { x: 3, y: 4 });
    expect(moveDrawingElement(stroke, 5, -1)).toMatchObject({
      points: [{ x: 6, y: 1 }, { x: 8, y: 3 }],
    });
  });
});
