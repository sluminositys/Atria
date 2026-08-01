import { describe, expect, it } from "vitest";
import { renderLatex } from "./latexRenderer";

describe("LaTeX renderer", () => {
  it("produces accessible HTML and MathML for display formulas", () => {
    const html = renderLatex("E = mc^2", true);

    expect(html).toContain("katex-display");
    expect(html).toContain("<math");
  });

  it("supports inline layout without the display wrapper", () => {
    const html = renderLatex("x^2", false);

    expect(html).toContain('class="katex"');
    expect(html).not.toContain("katex-display");
  });

  it("throws syntax errors instead of rendering raw source", () => {
    expect(() => renderLatex("\\frac{", true)).toThrow(/KaTeX parse error/i);
  });
});
