import { measureTextBox, type TextMeasureInput, type TextMeasureResult } from "./measureText";

export interface ResizePreviewInput extends TextMeasureInput {
  nodeWidth: number;
}

export async function estimateResizePreview(input: ResizePreviewInput): Promise<TextMeasureResult> {
  return measureTextBox({ ...input, width: input.nodeWidth });
}
