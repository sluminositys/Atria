import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { FileCode2, Search, X } from "lucide-react";
import type { Artifact } from "@atria/schema";
import styles from "../../app/App.module.css";

interface ArtifactPickerProps {
  artifacts: Artifact[];
  open: boolean;
  title?: string;
  onClose(): void;
  onSelect(artifact: Artifact): void;
}

export function ArtifactPicker({ artifacts, open, title = "Insert Artifact", onClose, onSelect }: ArtifactPickerProps) {
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();
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

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [],
    );
    if (!controls.length) return;
    const first = controls[0]!;
    const last = controls.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  return createPortal(
    <div className={styles.dialogBackdrop} onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={styles.artifactPicker}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <strong id={titleId}>{title}</strong>
            <span>{artifacts.length} {artifacts.length === 1 ? "HTML result" : "HTML results"}</span>
          </div>
          <button type="button" aria-label="Close Artifact picker" title="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <label className={styles.pickerSearch}>
          <Search size={15} />
          <input
            ref={searchRef}
            value={query}
            aria-label="Search HTML results"
            placeholder="Search HTML results"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className={styles.pickerList}>
          {results.length ? (
            results.map((artifact) => (
              <button
                type="button"
                key={artifact.id}
                onClick={() => {
                  onSelect(artifact);
                  onClose();
                }}
              >
                <FileCode2 size={16} />
                <span>
                  <strong>{artifact.title}</strong>
                  <small>{artifact.description || artifact.tags.join(" / ") || "HTML result"}</small>
                </span>
                <time>{new Date(artifact.updatedAt).toLocaleDateString()}</time>
              </button>
            ))
          ) : (
            <div className={styles.dialogEmpty}>No matching HTML results</div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
