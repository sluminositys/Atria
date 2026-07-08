import { useMemo } from "react";
import { Excalidraw, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import type { StoredExcalidrawScene } from "./DrawingNodeView";

interface ExcalidrawCanvasProps {
  scene: unknown;
  editing: boolean;
  onSceneChange(scene: StoredExcalidrawScene): void;
}

export default function ExcalidrawCanvas({ scene, editing, onSceneChange }: ExcalidrawCanvasProps) {
  const initialData = useMemo(() => readInitialData(scene), []);

  function handleChange(
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) {
    if (!editing) return;
    onSceneChange({
      version: 1,
      elements: [...elements],
      appState: persistentAppState(appState),
      files: { ...files },
    });
  }

  return (
    <Excalidraw
      initialData={initialData}
      viewModeEnabled={!editing}
      autoFocus={editing}
      handleKeyboardGlobally={false}
      detectScroll
      gridModeEnabled={Boolean(initialData.appState?.gridModeEnabled)}
      UIOptions={{
        canvasActions: {
          loadScene: false,
          saveToActiveFile: false,
          changeViewBackgroundColor: true,
          clearCanvas: true,
          export: { saveFileToDisk: true },
          saveAsImage: true,
          toggleTheme: false,
        },
        tools: { image: true },
      }}
      onChange={handleChange}
    />
  );
}

function readInitialData(scene: unknown): ExcalidrawInitialDataState {
  if (isStoredScene(scene)) {
    return {
      elements: scene.elements as OrderedExcalidrawElement[],
      appState: scene.appState,
      files: scene.files as BinaryFiles,
      scrollToContent: true,
    };
  }

  if (Array.isArray(scene)) {
    return {
      elements: convertLegacyScene(scene),
      appState: { viewBackgroundColor: "#fcfcfb" },
      files: {},
      scrollToContent: true,
    };
  }

  return {
    elements: [],
    appState: { viewBackgroundColor: "#fcfcfb" },
    files: {},
  };
}

function isStoredScene(value: unknown): value is StoredExcalidrawScene {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredExcalidrawScene>;
  return Array.isArray(candidate.elements) && Boolean(candidate.appState) && Boolean(candidate.files);
}

function persistentAppState(appState: AppState): Record<string, unknown> {
  return {
    viewBackgroundColor: appState.viewBackgroundColor,
    gridSize: appState.gridSize,
    gridStep: appState.gridStep,
    gridModeEnabled: appState.gridModeEnabled,
    objectsSnapModeEnabled: appState.objectsSnapModeEnabled,
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    zoom: appState.zoom,
    theme: appState.theme,
  };
}

function convertLegacyScene(scene: unknown[]): OrderedExcalidrawElement[] {
  const skeletons: Array<Record<string, unknown>> = [];
  for (const value of scene) {
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    const common = {
      id: String(item.id ?? crypto.randomUUID()),
      strokeColor: String(item.color ?? "#263238"),
      strokeWidth: Number(item.strokeWidth ?? 2),
    };

    if (item.type === "rectangle") {
      const x = Number(item.x ?? 0);
      const y = Number(item.y ?? 0);
      skeletons.push({
        ...common,
        type: "rectangle" as const,
        x,
        y,
        width: Math.max(1, Number(item.width ?? 1)),
        height: Math.max(1, Number(item.height ?? 1)),
      });
      continue;
    }
    if (item.type === "arrow") {
      const x = Number(item.x1 ?? 0);
      const y = Number(item.y1 ?? 0);
      skeletons.push({
        ...common,
        type: "arrow" as const,
        x,
        y,
        points: [[0, 0], [Number(item.x2 ?? x) - x, Number(item.y2 ?? y) - y]],
      });
      continue;
    }
    if (item.type === "text") {
      skeletons.push({
        ...common,
        type: "text" as const,
        x: Number(item.x ?? 0),
        y: Number(item.y ?? 0),
        text: String(item.text ?? ""),
        fontSize: Number(item.fontSize ?? 20),
      });
      continue;
    }
    if (item.type === "pen" && Array.isArray(item.points) && item.points.length > 1) {
      const points = item.points as Array<{ x?: number; y?: number }>;
      const originX = Number(points[0]?.x ?? 0);
      const originY = Number(points[0]?.y ?? 0);
      skeletons.push({
        ...common,
        type: "line" as const,
        x: originX,
        y: originY,
        points: points.map((point) => [Number(point.x ?? 0) - originX, Number(point.y ?? 0) - originY]),
      });
    }
  }

  return convertToExcalidrawElements(
    skeletons as Parameters<typeof convertToExcalidrawElements>[0],
    { regenerateIds: false },
  );
}
