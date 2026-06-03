import { Artifact } from "@atria/schema";

export function getArtifactPreviewUrl(artifact: Artifact): string {
  return artifact.entryUrl || artifact.entryFile;
}

export function isPreviewSandboxRequired(artifact: Artifact): boolean {
  return artifact.kind === "html";
}

