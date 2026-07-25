import { describe, expect, it } from "vitest";
import { formatDocumentDiff } from "./documentDiff";

describe("formatDocumentDiff", () => {
  it("assigns old and new line numbers to a unified patch", () => {
    const lines = formatDocumentDiff([
      "diff --git a/note.html b/note.html",
      "--- a/note.html",
      "+++ b/note.html",
      "@@ -4,3 +4,4 @@",
      " unchanged",
      "-old result",
      "+new result",
      "+new detail",
      " ending",
    ].join("\n"));

    expect(lines.slice(3)).toEqual([
      { text: "@@ -4,3 +4,4 @@", kind: "hunk" },
      { text: " unchanged", kind: "context", oldLine: 4, newLine: 4 },
      { text: "-old result", kind: "deleted", oldLine: 5 },
      { text: "+new result", kind: "added", newLine: 5 },
      { text: "+new detail", kind: "added", newLine: 6 },
      { text: " ending", kind: "context", oldLine: 6, newLine: 7 },
    ]);
  });

  it("resets counters for each hunk and keeps metadata unnumbered", () => {
    const lines = formatDocumentDiff("@@ -1 +1 @@\n-a\n+b\n@@ -20 +25 @@\n c\n\\ No newline at end of file");
    expect(lines).toEqual([
      { text: "@@ -1 +1 @@", kind: "hunk" },
      { text: "-a", kind: "deleted", oldLine: 1 },
      { text: "+b", kind: "added", newLine: 1 },
      { text: "@@ -20 +25 @@", kind: "hunk" },
      { text: " c", kind: "context", oldLine: 20, newLine: 25 },
      { text: "\\ No newline at end of file", kind: "meta" },
    ]);
  });

  it("returns no rows for an empty comparison", () => {
    expect(formatDocumentDiff("\n")).toEqual([]);
  });
});
