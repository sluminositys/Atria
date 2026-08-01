import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Maximize2, Pencil, X } from "lucide-react";
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
  const [expanded, setExpanded] = useState(false);
  const drawingRef = useRef<HTMLElement | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingScene = useRef<StoredExcalidrawScene | null>(null);
  const expandButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogTitleId = useId();

  useEffect(() => {
    if (!editing || expanded) return;
    const finishOnOutsidePointer = (event: PointerEvent) => {
      if (!drawingRef.current?.contains(event.target as Node)) finishEditing();
    };
    const finishOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") finishEditing();
    };
    window.addEventListener("pointerdown", finishOnOutsidePointer);
    window.addEventListener("keydown", finishOnEscape);
    return () => {
      window.removeEventListener("pointerdown", finishOnOutsidePointer);
      window.removeEventListener("keydown", finishOnEscape);
    };
  }, [editing, expanded]);

  useEffect(() => () => flushScene(), []);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeExpandedEditor();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);

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

  function finishEditing() {
    flushScene();
    setExpanded(false);
    setEditing(false);
  }

  function openExpandedEditor() {
    selectNode();
    flushScene();
    setEditing(true);
    setExpanded(true);
  }

  function closeExpandedEditor() {
    flushScene();
    setExpanded(false);
    requestAnimationFrame(() => expandButtonRef.current?.focus());
  }

  function flushScene() {
    if (persistTimer.current) {
      clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
    if (!pendingScene.current) return;
    const scene = pendingScene.current;
    pendingScene.current = null;
    props.updateAttributes({ scene });
  }

  function persistScene(scene: StoredExcalidrawScene) {
    pendingScene.current = scene;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      flushScene();
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
            {expanded ? (
              <div className={styles.drawingExpandedPlaceholder}>
                <Maximize2 size={18} />
                <span>Editing in full screen</span>
              </div>
            ) : (
              <Suspense fallback={<div className={styles.drawingLoading}>Loading drawing...</div>}>
                <ExcalidrawCanvas
                  scene={props.node.attrs.scene}
                  editing={editing}
                  onSceneChange={persistScene}
                />
              </Suspense>
            )}
          </div>
          {(props.selected || editing) && (
            <div className={styles.drawingModeControls}>
              <button
                ref={expandButtonRef}
                type="button"
                title="Open full screen drawing editor"
                aria-label="Open full screen drawing editor"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  openExpandedEditor();
                }}
              >
                <Maximize2 size={15} />
              </button>
              <button
                type="button"
                title={editing ? "Finish editing drawing" : "Edit drawing"}
                aria-label={editing ? "Finish editing drawing" : "Edit drawing"}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  if (editing) finishEditing();
                  else beginEditing();
                }}
              >
                {editing ? <Check size={16} /> : <Pencil size={15} />}
              </button>
            </div>
          )}
        </section>
      </DirectManipulationLayer>
      {expanded && createPortal(
        <div className={styles.drawingEditorBackdrop} contentEditable={false}>
          <div className={styles.drawingEditorDialog} role="dialog" aria-modal="true" aria-labelledby={dialogTitleId}>
            <header className={styles.drawingEditorHeader}>
              <span>
                <Pencil size={16} />
                <strong id={dialogTitleId}>Drawing</strong>
              </span>
              <div>
                <button type="button" onClick={finishEditing}>
                  <Check size={15} />
                  <span>Done</span>
                </button>
                <button type="button" aria-label="Exit full screen drawing editor" title="Exit full screen" onClick={closeExpandedEditor}>
                  <X size={17} />
                </button>
              </div>
            </header>
            <div className={styles.drawingEditorCanvas}>
              <Suspense fallback={<div className={styles.drawingLoading}>Loading drawing...</div>}>
                <ExcalidrawCanvas scene={props.node.attrs.scene} editing onSceneChange={persistScene} />
              </Suspense>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </NodeViewWrapper>
  );
}
