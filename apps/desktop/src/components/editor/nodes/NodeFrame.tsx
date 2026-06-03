import { ReactNode } from "react";
import { AlignCenter, AlignLeft, AlignRight, Copy, Maximize2, Minimize2, MoveHorizontal, Trash2 } from "lucide-react";
import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import styles from "../../../app/App.module.css";

type Layout = "normal" | "wide" | "full";
type Align = "left" | "center" | "right";

interface NodeFrameProps {
  editor: Editor;
  node: ProseMirrorNode;
  getPos: (() => number) | boolean;
  selected: boolean;
  children: ReactNode;
  className?: string;
  updateAttributes(attrs: Record<string, unknown>): void;
  deleteNode(): void;
}

export function NodeFrame({
  editor,
  node,
  getPos,
  selected,
  children,
  className,
  updateAttributes,
  deleteNode,
}: NodeFrameProps) {
  const attrs = node.attrs as { layout?: Layout; align?: Align };
  const layout = attrs.layout ?? "normal";
  const align = attrs.align ?? "left";

  function duplicateNode() {
    if (typeof getPos !== "function") return;
    const pos = getPos();
    editor.chain().focus().insertContentAt(pos + node.nodeSize, node.toJSON()).run();
  }

  return (
    <div
      className={[
        styles.nodeFrame,
        styles[`nodeFrameLayout_${layout}`],
        styles[`nodeFrameAlign_${align}`],
        selected ? styles.nodeFrameSelected : "",
        className ?? "",
      ].join(" ")}
    >
      <div className={styles.nodeFrameToolbar} contentEditable={false}>
        <div className={styles.nodeFrameGroup}>
          {(["normal", "wide", "full"] as Layout[]).map((item) => (
            <button
              key={item}
              className={layout === item ? styles.nodeToolActive : styles.nodeTool}
              title={item === "normal" ? "Normal width" : item === "wide" ? "Wide" : "Full width"}
              onClick={() => updateAttributes({ layout: item })}
            >
              {item === "normal" ? <Minimize2 size={13} /> : item === "wide" ? <MoveHorizontal size={13} /> : <Maximize2 size={13} />}
            </button>
          ))}
        </div>
        <div className={styles.nodeFrameGroup}>
          {(["left", "center", "right"] as Align[]).map((item) => (
            <button
              key={item}
              className={align === item ? styles.nodeToolActive : styles.nodeTool}
              title={`Align ${item}`}
              onClick={() => updateAttributes({ align: item })}
            >
              {item === "left" ? <AlignLeft size={13} /> : item === "center" ? <AlignCenter size={13} /> : <AlignRight size={13} />}
            </button>
          ))}
        </div>
        <div className={styles.nodeFrameGroup}>
          <button className={styles.nodeTool} title="Duplicate" onClick={duplicateNode}>
            <Copy size={13} />
          </button>
          <button className={styles.nodeTool} title="Delete" onClick={deleteNode}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
