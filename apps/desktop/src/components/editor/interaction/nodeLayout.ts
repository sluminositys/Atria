import type { CSSProperties } from "react";

export type NodeLayout = "normal" | "wide" | "full";
export type NodeAlign = "left" | "center" | "right";
export type ResizeHandle = "n" | "s" | "e" | "w" | "se" | "sw";
export type ResizeMode = "none" | "width" | "height" | "both" | "image";

export interface NodeSizeAttrs {
  width?: number | string | null;
  height?: number | string | null;
  offsetX?: number | string | null;
  offsetY?: number | string | null;
  layout?: NodeLayout;
  align?: NodeAlign;
}

export interface SizeBounds {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}

export const DEFAULT_SIZE_BOUNDS: SizeBounds = {
  minWidth: 180,
  maxWidth: 1120,
  minHeight: 96,
  maxHeight: 1200,
};

export function dimensionToNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function cssDimension(value: unknown): string | undefined {
  const numeric = dimensionToNumber(value);
  if (numeric !== null) return `${Math.round(numeric)}px`;
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function nodeSizeStyle(attrs: NodeSizeAttrs, mode: ResizeMode): CSSProperties {
  const style: CSSProperties = {};
  const width = cssDimension(attrs.width);
  const height = mode !== "width" && mode !== "image" ? cssDimension(attrs.height) : undefined;
  const offsetX = dimensionToNumber(attrs.offsetX) ?? 0;
  const offsetY = dimensionToNumber(attrs.offsetY) ?? 0;

  if (width) {
    style.width = width;
    style.maxWidth = "100%";
  }
  if (height) {
    style.height = height;
  }
  if (offsetX || offsetY) {
    style.translate = `${Math.round(offsetX)}px ${Math.round(offsetY)}px`;
  }
  if (offsetY) {
    style.marginBottom = `calc(14px + ${Math.round(offsetY)}px)`;
  }
  return style;
}

export function horizontalResize(
  startWidth: number,
  startOffset: number,
  deltaX: number,
  edge: "w" | "e",
  align: NodeAlign,
  minWidth: number,
  maxWidth: number,
): { size: number; offset: number } {
  const rawWidth = edge === "w" ? startWidth - deltaX : startWidth + deltaX;
  const size = Math.round(clamp(rawWidth, minWidth, maxWidth));
  const sizeDelta = size - startWidth;
  const alignmentFactor = align === "center" ? 0.5 : align === "right" ? 1 : 0;
  const visualShift = edge === "w" ? -sizeDelta : 0;
  const baseLayoutShift = -sizeDelta * alignmentFactor;
  return { size, offset: Math.round(startOffset + visualShift - baseLayoutShift) };
}

export function verticalResize(
  startHeight: number,
  startOffset: number,
  deltaY: number,
  edge: "n" | "s",
  minHeight: number,
  maxHeight: number,
): { size: number; offset: number } {
  const rawHeight = edge === "n" ? startHeight - deltaY : startHeight + deltaY;
  const size = Math.round(clamp(rawHeight, minHeight, maxHeight));
  const sizeDelta = size - startHeight;
  return { size, offset: Math.round(startOffset + (edge === "n" ? -sizeDelta : 0)) };
}

export function supportsWidth(mode: ResizeMode): boolean {
  return mode === "width" || mode === "both" || mode === "image";
}

export function supportsHeight(mode: ResizeMode): boolean {
  return mode === "height" || mode === "both";
}

export function handlesForMode(mode: ResizeMode): ResizeHandle[] {
  if (mode === "image") return ["w", "e", "se", "sw"];
  if (mode === "width") return ["w", "e"];
  if (mode === "height") return ["n", "s"];
  if (mode === "both") return ["n", "s", "w", "e", "se", "sw"];
  return [];
}
