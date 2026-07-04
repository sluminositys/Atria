import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlignCenter, AlignLeft, AlignRight, Copy, Maximize2, Minimize2, MoreHorizontal, MoveHorizontal, Trash2 } from "lucide-react";
import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { DragHandle } from "./DragHandle";
import { ResizeHandles } from "./ResizeHandles";
import { nodeSizeStyle, type NodeAlign, type NodeLayout, type ResizeMode, type SizeBounds } from "./nodeLayout";
import { useNodeResize } from "./useNodeResize";
import styles from "../../../app/App.module.css";

export interface DirectManipulationLayerProps {
  editor: Editor;
  node: ProseMirrorNode;
  getPos: (() => number) | boolean;
  selected: boolean;
  children: ReactNode;
  className?: string;
  updateAttributes(attrs: Record<string, unknown>): void;
  deleteNode(): void;
  resizeMode?: ResizeMode;
  resizeBounds?: Partial<SizeBounds>;
  lockAspectRatioOnCorner?: boolean;
  draggable?: boolean;
}

export function DirectManipulationLayer({
  editor,
  node,
  getPos,
  selected,
  children,
  className,
  updateAttributes,
  deleteNode,
  resizeMode = "width",
  resizeBounds,
  lockAspectRatioOnCorner,
  draggable = true,
}: DirectManipulationLayerProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const attrs = node.attrs as {
    layout?: NodeLayout;
    align?: NodeAlign;
    width?: number | string;
    height?: number | string;
    offsetX?: number | string;
    offsetY?: number | string;
  };
  const layout = attrs.layout ?? "normal";
  const align = attrs.align ?? "left";
  const style = useMemo(() => nodeSizeStyle(attrs, resizeMode), [attrs, resizeMode]);
  const startResize = useNodeResize({
    elementRef: layerRef,
    mode: resizeMode,
    updateAttributes,
    bounds: resizeBounds,
    lockAspectRatioOnCorner,
    align,
    offsetX: attrs.offsetX,
    offsetY: attrs.offsetY,
  });

  useEffect(() => {
    if (!selected) setMenuOpen(false);
  }, [selected]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = () => setMenuOpen(false);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  function duplicateNode() {
    if (typeof getPos !== "function") return;
    const pos = getPos();
    editor.chain().focus().insertContentAt(pos + node.nodeSize, node.toJSON()).run();
    setMenuOpen(false);
  }

  function setLayout(value: NodeLayout) {
    updateAttributes({ layout: value });
    setMenuOpen(false);
  }

  function setAlign(value: NodeAlign) {
    updateAttributes({ align: value });
    setMenuOpen(false);
  }

  return (
    <div
      ref={layerRef}
      className={[
        styles.nodeInteractionLayer,
        styles[`nodeFrameLayout_${layout}`],
        styles[`nodeFrameAlign_${align}`],
        selected ? styles.nodeInteractionSelected : "",
        className ?? "",
      ].join(" ")}
      style={style}
    >
      {children}
      <div className={styles.nodeChrome} contentEditable={false}>
        {draggable && <DragHandle />}
        <button
          className={styles.nodeMoreButton}
          title="Node actions"
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setMenuOpen((value) => !value);
          }}
        >
          <MoreHorizontal size={15} />
        </button>
      </div>
      {menuOpen && (
        <div
          className={styles.nodeMoreMenu}
          contentEditable={false}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.preventDefault()}
        >
          <label>Layout</label>
          <div>
            {(["normal", "wide", "full"] as NodeLayout[]).map((item) => (
              <button key={item} className={layout === item ? styles.nodeToolActive : styles.nodeTool} onClick={() => setLayout(item)}>
                {item === "normal" ? <Minimize2 size={13} /> : item === "wide" ? <MoveHorizontal size={13} /> : <Maximize2 size={13} />}
                <span>{item}</span>
              </button>
            ))}
          </div>
          <label>Align</label>
          <div>
            {(["left", "center", "right"] as NodeAlign[]).map((item) => (
              <button key={item} className={align === item ? styles.nodeToolActive : styles.nodeTool} onClick={() => setAlign(item)}>
                {item === "left" ? <AlignLeft size={13} /> : item === "center" ? <AlignCenter size={13} /> : <AlignRight size={13} />}
                <span>{item}</span>
              </button>
            ))}
          </div>
          <label>Actions</label>
          <button className={styles.nodeTool} onClick={duplicateNode}>
            <Copy size={13} />
            <span>Duplicate</span>
          </button>
          <button
            className={styles.nodeTool}
            onClick={() => {
              setMenuOpen(false);
              deleteNode();
            }}
          >
            <Trash2 size={13} />
            <span>Delete</span>
          </button>
        </div>
      )}
      <ResizeHandles mode={resizeMode} onResizeStart={startResize} />
    </div>
  );
}
