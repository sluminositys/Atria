import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, LoaderCircle, X } from "lucide-react";
import styles from "../app/App.module.css";

interface TreeOperationDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  initialValue?: string;
  inputLabel?: string;
  destructive?: boolean;
  busy: boolean;
  error: string;
  onCancel(): void;
  onConfirm(value: string): void;
}

export function TreeOperationDialog({
  title,
  description,
  confirmLabel,
  initialValue,
  inputLabel,
  destructive = false,
  busy,
  error,
  onCancel,
  onConfirm,
}: TreeOperationDialogProps) {
  const [value, setValue] = useState(initialValue ?? "");
  const titleId = useId();
  const descriptionId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    setValue(initialValue ?? "");
    window.requestAnimationFrame(() => {
      if (inputRef.current) inputRef.current.select();
      else dialogRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    });
  }, [initialValue, title]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [busy, onCancel]);

  const requiresValue = Boolean(inputLabel);
  const valid = !requiresValue || Boolean(value.trim());

  return (
    <div
      className={styles.treeDialogBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <form
        ref={dialogRef}
        className={styles.treeDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={trapDialogFocus}
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && !busy) onConfirm(value.trim());
        }}
      >
        <header>
          <div>
            <strong id={titleId}>{title}</strong>
            <p id={descriptionId}>{description}</p>
          </div>
          <button type="button" title="Close" disabled={busy} onClick={onCancel}>
            <X size={15} />
          </button>
        </header>

        {inputLabel && (
          <label className={styles.treeDialogField}>
            <span>{inputLabel}</span>
            <input
              ref={inputRef}
              value={value}
              disabled={busy}
              autoFocus
              spellCheck={false}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
        )}

        {error && (
          <div className={styles.treeDialogError} role="alert">
            <AlertTriangle size={14} />
            <span>{error}</span>
          </div>
        )}

        <footer>
          <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
          <button
            type="submit"
            className={destructive ? styles.treeDialogDanger : styles.treeDialogPrimary}
            disabled={!valid || busy}
          >
            {busy && <LoaderCircle className={styles.spin} size={14} />}
            <span>{busy ? "Working" : confirmLabel}</span>
          </button>
        </footer>
      </form>
    </div>
  );
}

function trapDialogFocus(event: React.KeyboardEvent<HTMLFormElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'),
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
