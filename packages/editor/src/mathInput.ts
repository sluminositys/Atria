export interface MathEditResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

const mathSnippets: Record<string, string> = {
  sr: "^{2}|",
  cb: "^{3}|",
  sqrt: "\\sqrt{|}",
  frac: "\\frac{|}{}",
  sum: "\\sum_{i=1}^{|}",
  prod: "\\prod_{i=1}^{|}",
  int: "\\int_{|}^{}",
  lim: "\\lim_{x \\to |}",
  vec: "\\vec{|}",
  hat: "\\hat{|}",
  bar: "\\overline{|}",
  alpha: "\\alpha|",
  beta: "\\beta|",
  gamma: "\\gamma|",
  theta: "\\theta|",
  lambda: "\\lambda|",
  mu: "\\mu|",
  pi: "\\pi|",
  sigma: "\\sigma|",
  omega: "\\omega|",
  neq: "\\neq|",
  leq: "\\leq|",
  geq: "\\geq|",
  to: "\\to|",
  infty: "\\infty|",
};

const delimiterPairs: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
};

export function expandMathSnippet(value: string, selectionStart: number, selectionEnd: number): MathEditResult | null {
  if (selectionStart !== selectionEnd) return null;
  const before = value.slice(0, selectionStart);
  const match = before.match(/[A-Za-z]+$/);
  if (!match) return null;
  const template = mathSnippets[match[0]];
  if (!template) return null;

  const insertion = materializeTemplate(template);
  const replaceFrom = selectionStart - match[0].length;
  return {
    value: value.slice(0, replaceFrom) + insertion.value + value.slice(selectionEnd),
    selectionStart: replaceFrom + insertion.cursor,
    selectionEnd: replaceFrom + insertion.cursor,
  };
}

export function advanceMathPlaceholder(value: string, caret: number): MathEditResult | null {
  const emptyGroup = value.indexOf("{}", caret);
  if (emptyGroup < 0) return null;
  return {
    value,
    selectionStart: emptyGroup + 1,
    selectionEnd: emptyGroup + 1,
  };
}

export function insertMathDelimiter(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  opener: string,
): MathEditResult | null {
  const closer = delimiterPairs[opener];
  if (!closer) return null;
  const selected = value.slice(selectionStart, selectionEnd);
  return {
    value: value.slice(0, selectionStart) + opener + selected + closer + value.slice(selectionEnd),
    selectionStart: selectionStart + 1,
    selectionEnd: selectionEnd + 1,
  };
}

export function skipMathDelimiter(value: string, caret: number, closer: string): MathEditResult | null {
  if (value[caret] !== closer) return null;
  return { value, selectionStart: caret + 1, selectionEnd: caret + 1 };
}

export function removeMathDelimiterPair(value: string, caret: number): MathEditResult | null {
  if (caret <= 0) return null;
  const opener = value[caret - 1];
  const closer = value[caret];
  if (!opener || delimiterPairs[opener] !== closer) return null;
  return {
    value: value.slice(0, caret - 1) + value.slice(caret + 1),
    selectionStart: caret - 1,
    selectionEnd: caret - 1,
  };
}

function materializeTemplate(template: string): { value: string; cursor: number } {
  const cursor = template.indexOf("|");
  return {
    value: template.replace("|", ""),
    cursor: cursor < 0 ? template.length : cursor,
  };
}
