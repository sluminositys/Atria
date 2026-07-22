import { describe, expect, it } from "vitest";
import { resolveWorkspaceReference, rewriteCssResourceUrls } from "./artifactPreviewDocument";

describe("Artifact preview resource resolution", () => {
  it("resolves sibling and parent resources inside the Workspace", () => {
    expect(resolveWorkspaceReference("Reports/run/report.html", "./style.css?rev=2")).toEqual({
      path: "Reports/run/style.css",
      suffix: "?rev=2",
    });
    expect(resolveWorkspaceReference("Reports/run/report.html", "../Assets/chart.png#plot")).toEqual({
      path: "Reports/Assets/chart.png",
      suffix: "#plot",
    });
  });

  it("keeps remote, embedded, and in-page references unchanged", () => {
    expect(resolveWorkspaceReference("Reports/report.html", "https://example.com/app.js")).toBeUndefined();
    expect(resolveWorkspaceReference("Reports/report.html", "data:image/png;base64,AA==")).toBeUndefined();
    expect(resolveWorkspaceReference("Reports/report.html", "#results")).toBeUndefined();
  });

  it("does not allow relative references to escape the Workspace root", () => {
    expect(resolveWorkspaceReference("report.html", "../outside.css")).toBeUndefined();
  });

  it("rewrites CSS resources relative to their owning stylesheet", () => {
    const result = rewriteCssResourceUrls(
      ".hero{background:url('../Assets/hero.png?v=1')} .remote{background:url(https://example.com/x.png)}",
      "Reports/styles/theme.css",
      (path) => `asset:${path}`,
    );

    expect(result).toContain("url('asset:Reports/Assets/hero.png?v=1')");
    expect(result).toContain("url(https://example.com/x.png)");
  });
});
