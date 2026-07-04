import { useCallback, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import {
  clamp,
  DEFAULT_SIZE_BOUNDS,
  dimensionToNumber,
  horizontalResize,
  supportsHeight,
  supportsWidth,
  verticalResize,
  type NodeAlign,
  type ResizeHandle,
  type ResizeMode,
  type SizeBounds,
} from "./nodeLayout";

interface UseNodeResizeOptions {
  elementRef: RefObject<HTMLElement | null>;
  mode: ResizeMode;
  updateAttributes(attrs: Record<string, unknown>): void;
  bounds?: Partial<SizeBounds>;
  lockAspectRatioOnCorner?: boolean;
  align?: NodeAlign;
  offsetX?: number | string | null;
  offsetY?: number | string | null;
}

export function useNodeResize({
  elementRef,
  mode,
  updateAttributes,
  bounds,
  lockAspectRatioOnCorner = false,
  align = "left",
  offsetX,
  offsetY,
}: UseNodeResizeOptions) {
  return useCallback(
    (handle: ResizeHandle, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (mode === "none") return;
      const element = elementRef.current;
      if (!element) return;

      event.preventDefault();
      event.stopPropagation();

      const rect = element.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = rect.width;
      const startHeight = rect.height;
      const startOffsetX = dimensionToNumber(offsetX) ?? 0;
      const startOffsetY = dimensionToNumber(offsetY) ?? 0;
      const aspectRatio = startHeight > 0 ? startWidth / startHeight : 1;
      const limits = { ...DEFAULT_SIZE_BOUNDS, ...bounds };

      document.body.classList.add("atria-resizing");

      function onMove(moveEvent: PointerEvent) {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        const next: Record<string, unknown> = {};

        if (supportsWidth(mode) && (handle.includes("e") || handle.includes("w"))) {
          const resized = horizontalResize(
            startWidth,
            startOffsetX,
            dx,
            handle.includes("w") ? "w" : "e",
            align,
            limits.minWidth,
            limits.maxWidth,
          );
          next.width = resized.size;
          next.offsetX = resized.offset;
        }

        if (supportsHeight(mode) && (handle.includes("s") || handle.includes("n"))) {
          const resized = verticalResize(
            startHeight,
            startOffsetY,
            dy,
            handle.includes("n") ? "n" : "s",
            limits.minHeight,
            limits.maxHeight,
          );
          next.height = resized.size;
          next.offsetY = resized.offset;
        }

        if (mode === "image" && lockAspectRatioOnCorner && (handle === "se" || handle === "sw") && !moveEvent.shiftKey) {
          const rawWidth = handle === "sw" ? startWidth - dx : startWidth + dx;
          next.width = Math.round(clamp(rawWidth, limits.minWidth, limits.maxWidth));
        }

        if (mode === "both" && lockAspectRatioOnCorner && (handle === "se" || handle === "sw") && !moveEvent.shiftKey) {
          const rawWidth = Number(next.width ?? startWidth);
          next.height = Math.round(clamp(rawWidth / aspectRatio, limits.minHeight, limits.maxHeight));
        }

        if (Object.keys(next).length) updateAttributes(next);
      }

      function onEnd() {
        document.body.classList.remove("atria-resizing");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onEnd);
        window.removeEventListener("pointercancel", onEnd);
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onEnd, { once: true });
      window.addEventListener("pointercancel", onEnd, { once: true });
    },
    [align, bounds, elementRef, lockAspectRatioOnCorner, mode, offsetX, offsetY, updateAttributes],
  );
}
