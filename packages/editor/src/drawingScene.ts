export interface DrawingPoint {
  x: number;
  y: number;
}

interface DrawingElementBase {
  id: string;
  color: string;
  strokeWidth: number;
}

export interface DrawingPenElement extends DrawingElementBase {
  type: "pen";
  points: DrawingPoint[];
}

export interface DrawingRectElement extends DrawingElementBase {
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DrawingArrowElement extends DrawingElementBase {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DrawingTextElement extends DrawingElementBase {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export type DrawingElement = DrawingPenElement | DrawingRectElement | DrawingArrowElement | DrawingTextElement;
export type DrawingTool = "select" | "pen" | "rectangle" | "arrow" | "text";

export function createDrawingElement(
  tool: Exclude<DrawingTool, "select">,
  id: string,
  point: DrawingPoint,
  color: string,
  strokeWidth: number,
): DrawingElement {
  const base = { id, color, strokeWidth };
  if (tool === "pen") return { ...base, type: "pen", points: [point] };
  if (tool === "rectangle") return { ...base, type: "rectangle", x: point.x, y: point.y, width: 0, height: 0 };
  if (tool === "arrow") return { ...base, type: "arrow", x1: point.x, y1: point.y, x2: point.x, y2: point.y };
  return { ...base, type: "text", x: point.x, y: point.y, text: "Text", fontSize: 20 };
}

export function updateDrawingElement(element: DrawingElement, point: DrawingPoint): DrawingElement {
  if (element.type === "pen") return { ...element, points: [...element.points, point] };
  if (element.type === "rectangle") {
    return { ...element, width: point.x - element.x, height: point.y - element.y };
  }
  if (element.type === "arrow") return { ...element, x2: point.x, y2: point.y };
  return element;
}

export function moveDrawingElement(element: DrawingElement, dx: number, dy: number): DrawingElement {
  if (element.type === "pen") {
    return { ...element, points: element.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
  }
  if (element.type === "rectangle" || element.type === "text") {
    return { ...element, x: element.x + dx, y: element.y + dy };
  }
  return { ...element, x1: element.x1 + dx, y1: element.y1 + dy, x2: element.x2 + dx, y2: element.y2 + dy };
}

export function drawingElementBounds(element: DrawingElement): { x: number; y: number; width: number; height: number } {
  if (element.type === "pen") {
    const xs = element.points.map((point) => point.x);
    const ys = element.points.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }
  if (element.type === "rectangle") {
    return {
      x: Math.min(element.x, element.x + element.width),
      y: Math.min(element.y, element.y + element.height),
      width: Math.abs(element.width),
      height: Math.abs(element.height),
    };
  }
  if (element.type === "arrow") {
    return {
      x: Math.min(element.x1, element.x2),
      y: Math.min(element.y1, element.y2),
      width: Math.abs(element.x2 - element.x1),
      height: Math.abs(element.y2 - element.y1),
    };
  }
  return { x: element.x, y: element.y - element.fontSize, width: Math.max(24, element.text.length * element.fontSize * 0.58), height: element.fontSize * 1.3 };
}
