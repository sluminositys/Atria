import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, FilePenLine, LoaderCircle, Save, Trash2, X } from "lucide-react";
import type { WorkspaceTab } from "../app/store";
import styles from "../app/App.module.css";

interface UnsavedWorkspaceDialogProps {
  tabs: WorkspaceTab[];
  intent: "switch" | "close";
  busy: boolean;
  error: string;
  onCancel(): void;
  onDiscardAll(): void;
  onSaveAll(): void;
}

export function UnsavedWorkspaceDialog({
  tabs,
  intent,
  busy,
  error,
  onCancel,
  onDiscardAll,
  onSaveAll,
}: UnsavedWorkspaceDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const saveRef = useRef<HTMLButtonElement | null>(null);
  const busyRef = useRef(busy);
  const cancelRef = useRef(onCancel);
  const actionLabel = intent === "switch" ? "switching workspaces" : "closing Atria";

  useEffect(() => {
    busyRef.current = busy;
    cancelRef.current = onCancel;
  }, [busy, onCancel]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => saveRef.current?.focus());
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busyRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      cancelRef.current();
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => {
      window.removeEventListener("keydown", handleEscape, true);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return createPortal(
    <div
      className={styles.treeDialogBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        className={`${styles.treeDialog} ${styles.unsavedWorkspaceDialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={trapDialogFocus}
      >
        <header>
          <div>
            <strong id={titleId}>Save all changes?</strong>
            <p id={descriptionId}>Review {tabs.length} unsaved {tabs.length === 1 ? "file" : "files"} before {actionLabel}.</p>
          </div>
          <button type="button" aria-label="Cancel" title="Cancel" disabled={busy} onClick={onCancel}>
            <X size={15} />
          </button>
        </header>

        <div className={styles.unsavedWorkspaceList} aria-label="Unsaved files">
          {tabs.map((tab) => (
            <div key={tab.key}>
              <FilePenLine size={17} />
              <span>
                <strong>{tab.title}</strong>
                <small>{tab.type === "artifact" ? "HTML source" : "Document source"}</small>
              </span>
            </div>
          ))}
        </div>

        {error && (
          <div className={styles.treeDialogError} role="alert">
            <AlertTriangle size={14} />
            <span>{error}</span>
          </div>
        )}

        <footer>
          <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="button" className={styles.treeDialogDanger} disabled={busy} onClick={onDiscardAll}>
            <Trash2 size={14} />
            <span>Discard all</span>
          </button>
          <button ref={saveRef} type="button" className={styles.treeDialogPrimary} disabled={busy} onClick={onSaveAll}>
            {busy ? <LoaderCircle className={styles.spin} size={14} /> : <Save size={14} />}
            <span>{busy ? "Saving" : "Save all"}</span>
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function trapDialogFocus(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'),
  );
  const first = focusable.at(0);
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
