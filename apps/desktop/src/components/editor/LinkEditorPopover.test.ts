import { describe, expect, it } from "vitest";
import { normalizeLinkUrl } from "./LinkEditorPopover";

describe("link URL normalization", () => {
  it("normalizes domains and email addresses", () => {
    expect(normalizeLinkUrl("example.com")).toEqual({ ok: true, url: "https://example.com/" });
    expect(normalizeLinkUrl("user@example.com")).toEqual({ ok: true, url: "mailto:user@example.com" });
  });

  it("keeps supported external and workspace links", () => {
    expect(normalizeLinkUrl("https://example.com/a")).toEqual({ ok: true, url: "https://example.com/a" });
    expect(normalizeLinkUrl("#results")).toEqual({ ok: true, url: "#results" });
    expect(normalizeLinkUrl("../Reports/result.html")).toEqual({ ok: true, url: "../Reports/result.html" });
  });

  it("rejects executable and malformed URLs", () => {
    expect(normalizeLinkUrl("javascript:alert(1)")).toMatchObject({ ok: false });
    expect(normalizeLinkUrl("other protocol")).toMatchObject({ ok: false });
  });

  it("treats an empty value as unlink", () => {
    expect(normalizeLinkUrl(" ")).toEqual({ ok: true, url: null });
  });
});
