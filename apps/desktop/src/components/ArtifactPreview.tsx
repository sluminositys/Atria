import { Artifact, WorkspaceSnapshot } from "@atria/schema";
import { toWorkspaceFileAssetUrl } from "../app/workspaceClient";
import styles from "../app/App.module.css";

interface ArtifactPreviewProps {
  artifact: Artifact;
  snapshot?: WorkspaceSnapshot;
}

export function ArtifactPreview({ artifact, snapshot }: ArtifactPreviewProps) {
  const src = toWorkspaceFileAssetUrl(snapshot, artifact.entryUrl || artifact.filePath);
  return (
    <article className={styles.artifactPreview}>
      <iframe
        src={src}
        title={artifact.title}
        sandbox="allow-scripts allow-forms allow-popups"
      />
    </article>
  );
}
