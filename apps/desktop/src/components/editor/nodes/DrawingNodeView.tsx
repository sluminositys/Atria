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
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (props.selected) return;
    setEditing(false);
  }, [props.selected]);

  useEffect(() => () => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
  }, []);

  function selectNode() {
    if (typeof props.getPos !== "function") return;
    props.editor.chain().setNodeSelection(props.getPos()).run();
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
          className={`${styles.drawingNode} ${editing ? styles.drawingNodeEditing : ""}`}
          contentEditable={false}
          onDoubleClick={() => {
            selectNode();
            setEditing(true);
          }}
        >
          <div
            className={styles.drawingCanvasHost}
            onPointerDown={() => {
              if (!editing) selectNode();
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
          {props.selected && (
            <button
              type="button"
              className={styles.drawingModeButton}
              title={editing ? "Finish editing drawing" : "Edit drawing"}
              aria-label={editing ? "Finish editing drawing" : "Edit drawing"}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setEditing((value) => !value);
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
