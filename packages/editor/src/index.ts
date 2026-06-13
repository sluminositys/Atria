export type MarkdownDirection = "import" | "export";

export interface MarkdownConversionRequest {
  direction: MarkdownDirection;
  value: string;
}

export function normalizeMarkdownInput(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

export * from "./mathInput";
