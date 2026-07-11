import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Check, Pencil } from "lucide-react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { DirectManipulationLayer } from "../interaction/DirectManipulationLayer";
import styles from "../../../app/App.module.css";

export interface StoredExcalidrawScene {
  version: 1;
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

const ExcalidrawCanvas = lazy(() => import("./ExcalidrawCanvas"));

export function DrawingNodeView(props: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const drawingRef = useRef<HTMLElement | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editing) return;
    const finishOnOutsidePointer = (event: PointerEvent) => {
      if (!drawingRef.current?.contains(event.target as Node)) setEditing(false);
    };
    const finishOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEditing(false);
    };
    window.addEventListener("pointerdown", finishOnOutsidePointer);
    window.addEventListener("keydown", finishOnEscape);
    return () => {
      window.removeEventListener("pointerdown", finishOnOutsidePointer);
      window.removeEventListener("keydown", finishOnEscape);
    };
  }, [editing]);

  useEffect(() => () => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
  }, []);

  function selectNode() {
    if (typeof props.getPos !== "function") return;
    props.editor.chain().setNodeSelection(props.getPos()).run();
  }

  function beginEditing() {
    selectNode();
    setEditing(true);
    requestAnimationFrame(() => {
      drawingRef.current?.querySelector<HTMLElement>(".excalidraw")?.focus({ preventScroll: true });
    });
  }

  function persistScene(scene: StoredExcalidrawScene) {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      props.updateAttributes({ scene });
      persistTimer.current = null;
    }, 280);
  }

  return (
    <NodeViewWrapper>
      <DirectManipulationLayer
        {...props}
        className={styles.nodeBlockObject}
        resizeMode="both"
        resizeBounds={{ minWidth: 360, minHeight: 300, maxWidth: 1280, maxHeight: 960 }}
      >
        <section
          ref={drawingRef}
          className={`${styles.drawingNode} ${editing ? styles.drawingNodeEditing : ""}`}
          contentEditable={false}
          onDoubleClick={beginEditing}
        >
          <div
            className={styles.drawingCanvasHost}
            onPointerDown={(event) => {
              if (editing) {
                event.stopPropagation();
                return;
              }
              selectNode();
            }}
            onMouseDown={(event) => {
              if (editing) event.stopPropagation();
            }}
            onKeyDown={(event) => {
              if (editing) event.stopPropagation();
            }}
          >
            <Suspense fallback={<div className={styles.drawingLoading}>Loading drawing...</div>}>
              <ExcalidrawCanvas
                scene={props.node.attrs.scene}
                editing={editing}
                onSceneChange={persistScene}
              />
            </Suspense>
          </div>
          {(props.selected || editing) && (
            <button
              type="button"
              className={styles.drawingModeButton}
              title={editing ? "Finish editing drawing" : "Edit drawing"}
              aria-label={editing ? "Finish editing drawing" : "Edit drawing"}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                if (editing) setEditing(false);
                else beginEditing();
              }}
            >
              {editing ? <Check size={16} /> : <Pencil size={15} />}
            </button>
          )}
        </section>
      </DirectManipulationLayer>
    </NodeViewWrapper>
  );
}
