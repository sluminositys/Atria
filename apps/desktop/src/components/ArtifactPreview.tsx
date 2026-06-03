import { Artifact } from "@atria/schema";
import styles from "../app/App.module.css";

interface ArtifactPreviewProps {
  artifact: Artifact;
}

export function ArtifactPreview({ artifact }: ArtifactPreviewProps) {
  return (
    <article className={styles.artifactPreview}>
      <iframe
        src={artifact.entryUrl}
        title={artifact.title}
        sandbox="allow-scripts allow-forms allow-popups"
      />
    </article>
  );
}

