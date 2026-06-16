import { describe, expect, it } from "vitest";
import {
  advanceMathPlaceholder,
  expandMathSnippet,
  insertMathDelimiter,
  removeMathDelimiterPair,
  skipMathDelimiter,
} from "./mathInput";

describe("math input helpers", () => {
  it("expands a snippet and places the caret in its first argument", () => {
    expect(expandMathSnippet("x + frac", 8, 8)).toEqual({
      value: "x + \\frac{}{}",
      selectionStart: 10,
      selectionEnd: 10,
    });
  });

  it("moves to the next empty group", () => {
    expect(advanceMathPlaceholder("\\frac{x}{}", 8)).toEqual({
      value: "\\frac{x}{}",
      selectionStart: 9,
      selectionEnd: 9,
    });
  });

  it("wraps a selected expression with paired delimiters", () => {
    expect(insertMathDelimiter("a+b", 0, 3, "(")).toEqual({
      value: "(a+b)",
      selectionStart: 1,
      selectionEnd: 4,
    });
  });

  it("skips and removes an existing delimiter pair", () => {
    expect(skipMathDelimiter("{}", 1, "}")?.selectionStart).toBe(2);
    expect(removeMathDelimiterPair("{}", 1)).toEqual({ value: "", selectionStart: 0, selectionEnd: 0 });
  });
});
