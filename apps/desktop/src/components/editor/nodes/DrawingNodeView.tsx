import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  ArrowUpRight,
  Eye,
  MousePointer2,
  Pencil,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import {
  createDrawingElement,
  drawingElementBounds,
  moveDrawingElement,
  updateDrawingElement,
  type DrawingElement,
  type DrawingPoint,
  type DrawingTool,
} from "@atria/editor";
import { DirectManipulationLayer } from "../interaction/DirectManipulationLayer";
import styles from "../../../app/App.module.css";

interface PointerOperation {
  kind: "draw" | "move";
  before: DrawingElement[];
  start: DrawingPoint;
  elementId: string;
}

const drawingTools: Array<{ tool: DrawingTool; label: string; icon: typeof MousePointer2 }> = [
  { tool: "select", label: "Select", icon: MousePointer2 },
  { tool: "pen", label: "Freehand", icon: Pencil },
  { tool: "rectangle", label: "Rectangle", icon: Square },
  { tool: "arrow", label: "Arrow", icon: ArrowUpRight },
  { tool: "text", label: "Text", icon: Type },
];

export function DrawingNodeView(props: NodeViewProps) {
  const storedScene = useMemo(() => readScene(props.node.attrs.scene), [props.node.attrs.scene]);
  const [scene, setScene] = useState<DrawingElement[]>(storedScene);
  const sceneRef = useRef(scene);
  const operationRef = useRef<PointerOperation | null>(null);
  const historyRef = useRef<DrawingElement[][]>([]);
  const futureRef = useRef<DrawingElement[][]>([]);
  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState<DrawingTool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [color, setColor] = useState("#263238");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const markerId = `atria-arrow-${String(props.node.attrs.atriaId ?? "drawing").replace(/[^a-z0-9]/gi, "")}`;
  const selected = scene.find((element) => element.id === selectedId);

  useEffect(() => {
    if (operationRef.current) return;
    sceneRef.current = storedScene;
    setScene(storedScene);
  }, [storedScene]);

  useEffect(() => {
    if (props.selected) return;
    setEditing(false);
    setSelectedId(null);
  }, [props.selected]);

  function setLiveScene(next: DrawingElement[]) {
    sceneRef.current = next;
    setScene(next);
  }

  function persistScene(next: DrawingElement[], before?: DrawingElement[]) {
    if (before) {
      historyRef.current.push(before);
      futureRef.current = [];
    }
    setLiveScene(next);
    props.updateAttributes({ scene: next });
  }

  function undo() {
    const previous = historyRef.current.pop();
    if (!previous) return;
    futureRef.current.push(sceneRef.current);
    persistScene(previous);
    setSelectedId(null);
  }

  function redo() {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(sceneRef.current);
    persistScene(next);
    setSelectedId(null);
  }

  function updateSelected(patch: Partial<DrawingElement>, record = false) {
    if (!selectedId) return;
    const before = sceneRef.current;
    const next = before.map((element) => element.id === selectedId ? ({ ...element, ...patch } as DrawingElement) : element);
    persistScene(next, record ? before : undefined);
  }

  function deleteSelected() {
    if (!selectedId) return;
    const before = sceneRef.current;
    persistScene(before.filter((element) => element.id !== selectedId), before);
    setSelectedId(null);
  }

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (!editing || event.button !== 0) return;
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = drawingPoint(event);

    if (tool === "select") {
      const target = (event.target as SVGElement).closest<SVGElement>("[data-drawing-id]");
      const elementId = target?.dataset.drawingId ?? null;
      setSelectedId(elementId);
      if (elementId) {
        const element = sceneRef.current.find((item) => item.id === elementId);
        if (element) {
          setColor(element.color);
          setStrokeWidth(element.strokeWidth);
          operationRef.current = { kind: "move", before: sceneRef.current, start: point, elementId };
        }
      }
      return;
    }

    const id = createElementId();
    const element = createDrawingElement(tool, id, point, color, strokeWidth);
    const before = sceneRef.current;
    setLiveScene([...before, element]);
    setSelectedId(id);
    if (tool === "text") {
      persistScene([...before, element], before);
      setTool("select");
    } else {
      operationRef.current = { kind: "draw", before, start: point, elementId: id };
    }
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const operation = operationRef.current;
    if (!operation || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const point = drawingPoint(event);
    if (operation.kind === "draw") {
      const element = sceneRef.current.find((item) => item.id === operation.elementId);
      if (!element) return;
      setLiveScene([...operation.before, updateDrawingElement(element, point)]);
      return;
    }

    const dx = point.x - operation.start.x;
    const dy = point.y - operation.start.y;
    setLiveScene(operation.before.map((element) => (
      element.id === operation.elementId ? moveDrawingElement(element, dx, dy) : element
    )));
  }

  function onPointerUp(event: PointerEvent<SVGSVGElement>) {
    const operation = operationRef.current;
    if (!operation) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    operationRef.current = null;
    persistScene(sceneRef.current, operation.before);
  }

  return (
    <NodeViewWrapper>
      <DirectManipulationLayer
        {...props}
        className={styles.nodeBlockObject}
        resizeMode="both"
        resizeBounds={{ minWidth: 320, minHeight: 240, maxWidth: 1280, maxHeight: 960 }}
      >
        <section className={styles.drawingNode} contentEditable={false} onDoubleClick={() => setEditing(true)}>
          {props.selected && (
            <div className={styles.drawingToolbar}>
              <button
                className={editing ? styles.drawingToolActive : styles.drawingTool}
                title={editing ? "Preview drawing" : "Edit drawing"}
                onClick={() => setEditing((value) => !value)}
              >
                {editing ? <Eye size={15} /> : <Pencil size={15} />}
              </button>
              {editing && (
                <>
                  <span />
                  {drawingTools.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.tool}
                        className={tool === item.tool ? styles.drawingToolActive : styles.drawingTool}
                        title={item.label}
                        onClick={() => setTool(item.tool)}
                      >
                        <Icon size={15} />
                      </button>
                    );
                  })}
                  <span />
                  <input
                    type="color"
                    value={color}
                    title="Stroke color"
                    onChange={(event) => {
                      setColor(event.target.value);
                      updateSelected({ color: event.target.value });
                    }}
                  />
                  <input
                    type="range"
                    min="1"
                    max="8"
                    step="1"
                    value={strokeWidth}
                    title="Stroke width"
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setStrokeWidth(value);
                      updateSelected({ strokeWidth: value });
                    }}
                  />
                  {selected?.type === "text" && (
                    <input
                      className={styles.drawingTextInput}
                      value={selected.text}
                      aria-label="Drawing text"
                      onChange={(event) => updateSelected({ text: event.target.value })}
                    />
                  )}
                  <span />
                  <button className={styles.drawingTool} title="Undo" disabled={!historyRef.current.length} onClick={undo}>
                    <Undo2 size={15} />
                  </button>
                  <button className={styles.drawingTool} title="Redo" disabled={!futureRef.current.length} onClick={redo}>
                    <Redo2 size={15} />
                  </button>
                  <button className={styles.drawingTool} title="Delete selected" disabled={!selectedId} onClick={deleteSelected}>
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          )}
          <svg
            className={editing ? styles.drawingSurfaceEditing : styles.drawingSurface}
            viewBox="0 0 900 520"
            preserveAspectRatio="xMidYMid meet"
            tabIndex={editing ? 0 : -1}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
                event.preventDefault();
                if (event.shiftKey) redo(); else undo();
              } else if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                deleteSelected();
              }
            }}
          >
            <defs>
              <marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L8,4 L0,8 Z" fill="context-stroke" />
              </marker>
            </defs>
            {scene.map((element) => (
              <DrawingElementView key={element.id} element={element} markerId={markerId} />
            ))}
            {editing && selected && <SelectionOutline element={selected} />}
          </svg>
        </section>
      </DirectManipulationLayer>
    </NodeViewWrapper>
  );
}

function DrawingElementView({ element, markerId }: { element: DrawingElement; markerId: string }) {
  const common = {
    "data-drawing-id": element.id,
    stroke: element.color,
    strokeWidth: element.strokeWidth,
    vectorEffect: "non-scaling-stroke" as const,
  };
  if (element.type === "pen") {
    return <polyline {...common} points={element.points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
  }
  if (element.type === "rectangle") {
    const bounds = drawingElementBounds(element);
    return <rect {...common} {...bounds} fill="transparent" rx="2" />;
  }
  if (element.type === "arrow") {
    return <line {...common} x1={element.x1} y1={element.y1} x2={element.x2} y2={element.y2} markerEnd={`url(#${markerId})`} strokeLinecap="round" />;
  }
  return (
    <text {...common} x={element.x} y={element.y} fill={element.color} stroke="none" fontSize={element.fontSize} fontFamily="system-ui, sans-serif">
      {element.text}
    </text>
  );
}

function SelectionOutline({ element }: { element: DrawingElement }) {
  const bounds = drawingElementBounds(element);
  return (
    <rect
      className={styles.drawingSelection}
      x={bounds.x - 5}
      y={bounds.y - 5}
      width={Math.max(10, bounds.width + 10)}
      height={Math.max(10, bounds.height + 10)}
    />
  );
}

function drawingPoint(event: PointerEvent<SVGSVGElement>): DrawingPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 900,
    y: ((event.clientY - rect.top) / rect.height) * 520,
  };
}

function readScene(value: unknown): DrawingElement[] {
  return Array.isArray(value) ? value as DrawingElement[] : [];
}

function createElementId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `element-${Date.now().toString(36)}`;
}
