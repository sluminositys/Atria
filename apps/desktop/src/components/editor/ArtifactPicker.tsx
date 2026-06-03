import { useMemo, useState } from "react";
import { FileCode2, Search, X } from "lucide-react";
import type { Artifact } from "@atria/schema";
import styles from "../../app/App.module.css";

interface ArtifactPickerProps {
  artifacts: Artifact[];
  open: boolean;
  onClose(): void;
  onSelect(artifact: Artifact): void;
}

export function ArtifactPicker({ artifacts, open, onClose, onSelect }: ArtifactPickerProps) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return artifacts
      .filter((artifact) => {
        if (!needle) return true;
        return [artifact.title, artifact.description, artifact.filePath, ...(artifact.tags ?? [])]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 24);
  }, [artifacts, query]);

  if (!open) return null;

  return (
    <div className={styles.dialogBackdrop} onMouseDown={onClose}>
      <section className={styles.artifactPicker} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <strong>Insert Artifact</strong>
            <span>{artifacts.length ? "Choose an HTML result from this workspace" : "Current workspace has no artifact"}</span>
          </div>
          <button title="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <label className={styles.pickerSearch}>
          <Search size={15} />
          <input value={query} placeholder="Search artifact" onChange={(event) => setQuery(event.target.value)} autoFocus />
        </label>
        <div className={styles.pickerList}>
          {results.length ? (
            results.map((artifact) => (
              <button
                key={artifact.id}
                onClick={() => {
                  onSelect(artifact);
                  onClose();
                }}
              >
                <FileCode2 size={16} />
                <span>
                  <strong>{artifact.title}</strong>
                  <small>{artifact.filePath ?? artifact.description ?? artifact.updatedAt}</small>
                </span>
                <time>{new Date(artifact.updatedAt).toLocaleDateString()}</time>
              </button>
            ))
          ) : (
            <div className={styles.dialogEmpty}>当前 workspace 没有 artifact</div>
          )}
        </div>
      </section>
    </div>
  );
}
