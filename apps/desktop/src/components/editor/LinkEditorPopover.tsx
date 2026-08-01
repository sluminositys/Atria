import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { ExternalLink, Link2Off, X } from "lucide-react";
import styles from "../../app/App.module.css";

export interface LinkEditorState {
  from: number;
  to: number;
  x: number;
  y: number;
  href: string;
}

export function LinkEditorPopover({
  editor,
  state,
  onClose,
}: {
  editor: Editor;
  state: LinkEditorState | null;
  onClose(): void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (!state) return;
    setValue(state.href);
    setError("");
    window.requestAnimationFrame(() => inputRef.current?.select());

    function closeOnPointer(event: PointerEvent) {
      if (!popoverRef.current?.contains(event.target as Node)) onClose();
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("pointerdown", closeOnPointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, state]);

  if (!state) return null;

  function restoreSelection() {
    const size = editor.state.doc.content.size;
    const from = Math.max(1, Math.min(state!.from, size));
    const to = Math.max(from, Math.min(state!.to, size));
    return editor.chain().focus().setTextSelection({ from, to });
  }

  function applyLink() {
    const result = normalizeLinkUrl(value);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const chain = restoreSelection().extendMarkRange("link");
    if (result.url) chain.setLink({ href: result.url }).run();
    else chain.unsetLink().run();
    onClose();
  }

  function removeLink() {
    restoreSelection().extendMarkRange("link").unsetLink().run();
    onClose();
  }

  const normalized = normalizeLinkUrl(value);
  const canOpen = normalized.ok && Boolean(normalized.url);

  return (
    <form
      ref={popoverRef}
      className={styles.linkEditorPopover}
      style={{ left: state.x, top: state.y }}
      role="dialog"
      aria-label="Edit link"
      onSubmit={(event) => {
        event.preventDefault();
        applyLink();
      }}
    >
      <label>
        <span>URL</span>
        <input
          ref={inputRef}
          value={value}
          aria-invalid={Boolean(error)}
          placeholder="https://example.com"
          spellCheck={false}
          onChange={(event) => {
            setValue(event.target.value);
            setError("");
          }}
        />
      </label>
      {error && <div className={styles.linkEditorError} role="alert">{error}</div>}
      <div className={styles.linkEditorActions}>
        {state.href && (
          <button type="button" title="Remove link" onClick={removeLink}>
            <Link2Off size={14} />
          </button>
        )}
        <button
          type="button"
          title="Open link"
          disabled={!canOpen}
          onClick={() => {
            if (normalized.ok && normalized.url) window.open(normalized.url, "_blank", "noopener,noreferrer");
          }}
        >
          <ExternalLink size={14} />
        </button>
        <span />
        <button type="button" title="Cancel" onClick={onClose}><X size={14} /></button>
        <button type="submit" className={styles.linkEditorApply}>Apply</button>
      </div>
    </form>
  );
}

export type NormalizedLink = { ok: true; url: string | null } | { ok: false; error: string };

export function normalizeLinkUrl(value: string): NormalizedLink {
  const input = value.trim();
  if (!input) return { ok: true, url: null };
  if (/^(javascript|data|vbscript|file):/i.test(input)) {
    return { ok: false, error: "This URL scheme is not allowed." };
  }
  if (/^(#|\/|\.\/|\.\.\/)/.test(input)) return { ok: true, url: input };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) return { ok: true, url: `mailto:${input}` };
  const scheme = input.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme) {
    if (!["http", "https", "mailto", "tel"].includes(scheme)) {
      return { ok: false, error: "Use an HTTP, HTTPS, email, phone, or Workspace link." };
    }
    try {
      if (scheme === "http" || scheme === "https") new URL(input);
      return { ok: true, url: input };
    } catch {
      return { ok: false, error: "Enter a valid URL." };
    }
  }
  if (/\s/.test(input)) return { ok: false, error: "URLs cannot contain spaces." };
  try {
    return { ok: true, url: new URL(`https://${input}`).toString() };
  } catch {
    return { ok: false, error: "Enter a valid URL." };
  }
}
