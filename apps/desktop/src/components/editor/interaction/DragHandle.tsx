import { GripVertical } from "lucide-react";
import styles from "../../../app/App.module.css";

export function DragHandle() {
  return (
    <button className={styles.nodeDragHandle} title="Drag to move" contentEditable={false} data-drag-handle draggable>
      <GripVertical size={15} />
    </button>
  );
}
