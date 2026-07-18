import katex from "katex";
import "katex/dist/katex.min.css";

export function renderLatex(formula: string, displayMode: boolean): string {
  return katex.renderToString(formula || "\\,", {
    displayMode,
    output: "htmlAndMathml",
    strict: "ignore",
    throwOnError: true,
    trust: false,
  });
}
