import type { PointerEvent } from "react";
import { handlesForMode, type ResizeHandle, type ResizeMode } from "./nodeLayout";
import styles from "../../../app/App.module.css";

interface ResizeHandlesProps {
  mode: ResizeMode;
  onResizeStart(handle: ResizeHandle, event: PointerEvent<HTMLButtonElement>): void;
}

export function ResizeHandles({ mode, onResizeStart }: ResizeHandlesProps) {
  const handles = handlesForMode(mode);
  if (!handles.length) return null;

  return (
    <div className={styles.nodeResizeHandles} contentEditable={false}>
      {handles.map((handle) => (
        <button
          key={handle}
          aria-label={`Resize ${handle}`}
          className={[styles.nodeResizeHandle, styles[`nodeResizeHandle_${handle}`]].join(" ")}
          onPointerDown={(event) => onResizeStart(handle, event)}
        />
      ))}
    </div>
  );
}
