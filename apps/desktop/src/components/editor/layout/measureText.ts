import { loadPretext } from "./pretextAdapter";

export interface TextMeasureInput {
  text: string;
  width: number;
  font: string;
  lineHeight: number;
}

export interface TextMeasureResult {
  width: number;
  height: number;
  source: "pretext" | "canvas";
}

export async function measureTextBox(input: TextMeasureInput): Promise<TextMeasureResult> {
  const pretext = await loadPretext();
  if (pretext && typeof pretext.measureText === "function") {
    const result = pretext.measureText(input) as Partial<TextMeasureResult> | undefined;
    if (result?.height && result.width) {
      return { width: result.width, height: result.height, source: "pretext" };
    }
  }
  return measureWithCanvas(input);
}

function measureWithCanvas({ text, width, font, lineHeight }: TextMeasureInput): TextMeasureResult {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return { width, height: lineHeight, source: "canvas" };
  context.font = font;
  const words = text.split(/\s+/);
  let lines = 1;
  let current = 0;
  for (const word of words) {
    const measured = context.measureText(`${word} `).width;
    if (current + measured > width && current > 0) {
      lines += 1;
      current = measured;
    } else {
      current += measured;
    }
  }
  return { width, height: Math.max(lineHeight, lines * lineHeight), source: "canvas" };
}
