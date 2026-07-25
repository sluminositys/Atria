import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  FileCode2,
  FileText,
  Hash,
  LoaderCircle,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { WorkspaceSnapshot } from "@atria/schema";
import { buildWorkspaceTagIndex, normalizeTagName, type WorkspaceTagSummary } from "../app/tagMutations";
import { relativeTimeLabel } from "../app/workspaceNavigation";
import { useAtriaStore } from "../app/store";
import styles from "../app/App.module.css";

type TagDialogState = { mode: "rename" | "delete"; tag: WorkspaceTagSummary };

export function TagsPane({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const { openNode, renameTag, deleteTag } = useAtriaStore();
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [dialog, setDialog] = useState<TagDialogState>();
  const summaries = useMemo(() => buildWorkspaceTagIndex(snapshot), [snapshot]);
  const normalizedQuery = query.trim().replace(/^#/, "").toLocaleLowerCase();
  const visibleTags = normalizedQuery
    ? summaries.filter((summary) => summary.name.toLocaleLowerCase().includes(normalizedQuery))
    : summaries;
  const selected = visibleTags.find((summary) => tagKey(summary.name) === selectedKey)
    ?? visibleTags[0]
    ?? summaries.find((summary) => tagKey(summary.name) === selectedKey);

  useEffect(() => {
    if (selected && selectedKey !== tagKey(selected.name)) setSelectedKey(tagKey(selected.name));
  }, [selected, selectedKey]);

  return (
    <>
      <div className={styles.sideTitle}>
        <strong>Tags</strong>
        <span>{summaries.length} {summaries.length === 1 ? "tag" : "tags"}</span>
      </div>
      <div className={styles.tagsPane}>
        <label className={styles.tagsSearch}>
          <Search size={14} />
          <input
            value={query}
            aria-label="Search tags"
            placeholder="Search tags"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button type="button" title="Clear tag search" aria-label="Clear tag search" onClick={() => setQuery("")}>
              <X size={13} />
            </button>
          )}
        </label>

        <div className={styles.tagsBrowser} aria-label="Workspace tags">
          {visibleTags.map((summary) => (
            <button
              type="button"
              key={tagKey(summary.name)}
              className={tagKey(summary.name) === tagKey(selected?.name ?? "") ? styles.tagRowActive : styles.tagRow}
              onClick={() => setSelectedKey(tagKey(summary.name))}
            >
              <Hash size={13} />
              <span>{summary.name}</span>
              <small>{summary.items.length}</small>
            </button>
          ))}
          {!visibleTags.length && (
            <div className={styles.tagsEmpty}>{summaries.length ? "No matching tags" : "No tags in this Workspace"}</div>
          )}
        </div>

        {selected && (
          <section className={styles.tagDetails} aria-label={`Files tagged ${selected.name}`}>
            <header>
              <span>
                <strong>#{selected.name}</strong>
                <small>{selected.items.length} {selected.items.length === 1 ? "file" : "files"}</small>
              </span>
              <div>
                <button type="button" title="Rename tag" aria-label={`Rename ${selected.name}`} onClick={() => setDialog({ mode: "rename", tag: selected })}>
                  <Pencil size={13} />
                </button>
                <button type="button" title="Delete tag" aria-label={`Delete ${selected.name}`} onClick={() => setDialog({ mode: "delete", tag: selected })}>
                  <Trash2 size={13} />
                </button>
              </div>
            </header>
            <div className={styles.tagFiles}>
              {selected.items.map((item) => (
                <button type="button" key={`${item.type}:${item.id}`} onClick={() => openNode(item.type, item.id)}>
                  {item.type === "artifact" ? <FileCode2 size={14} /> : <FileText size={14} />}
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.type === "artifact" ? "HTML result" : "Document"}</small>
                  </span>
                  <time>{relativeTimeLabel(item.updatedAt)}</time>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      {dialog && (
        <TagActionDialog
          state={dialog}
          tags={summaries}
          onClose={() => setDialog(undefined)}
          onRename={async (nextTag) => {
            await renameTag(dialog.tag.name, nextTag);
            setSelectedKey(tagKey(normalizeTagName(nextTag)));
          }}
          onDelete={async () => {
            await deleteTag(dialog.tag.name);
            setSelectedKey("");
          }}
        />
      )}
    </>
  );
}

function TagActionDialog({
  state,
  tags,
  onClose,
  onRename,
  onDelete,
}: {
  state: TagDialogState;
  tags: WorkspaceTagSummary[];
  onClose(): void;
  onRename(nextTag: string): Promise<void>;
  onDelete(): Promise<void>;
}) {
  const [draft, setDraft] = useState(state.tag.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const busyRef = useRef(busy);
  const closeRef = useRef(onClose);
  const cleanDraft = normalizeTagName(draft);
  const mergeTarget = state.mode === "rename"
    ? tags.find((tag) => tagKey(tag.name) === tagKey(cleanDraft) && tagKey(tag.name) !== tagKey(state.tag.name))
    : undefined;

  useEffect(() => {
    busyRef.current = busy;
    closeRef.current = onClose;
  }, [busy, onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => state.mode === "rename" ? inputRef.current?.select() : primaryRef.current?.focus());
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || busyRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
    };
    window.addEventListener("keydown", onEscape, true);
    return () => {
      window.removeEventListener("keydown", onEscape, true);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  async function submit() {
    if (busy) return;
    if (state.mode === "rename" && !cleanDraft) {
      setError("Enter a tag name.");
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (state.mode === "rename") await onRename(cleanDraft);
      else await onDelete();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  }

  return createPortal(
    <div className={styles.treeDialogBackdrop} onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section
        ref={dialogRef}
        className={`${styles.treeDialog} ${styles.tagDialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={trapFocus}
      >
        <header>
          <div>
            <strong id={titleId}>{state.mode === "rename" ? "Rename tag" : "Delete tag?"}</strong>
            <p id={descriptionId}>
              {state.mode === "rename"
                ? `Update #${state.tag.name} across ${state.tag.items.length} ${state.tag.items.length === 1 ? "file" : "files"}.`
                : `Remove #${state.tag.name} from ${state.tag.items.length} ${state.tag.items.length === 1 ? "file" : "files"}. Files will not be deleted.`}
            </p>
          </div>
          <button type="button" title="Close" aria-label="Close tag dialog" disabled={busy} onClick={onClose}>
            <X size={15} />
          </button>
        </header>

        {state.mode === "rename" && (
          <label className={styles.treeDialogField}>
            Tag name
            <input
              ref={inputRef}
              value={draft}
              aria-label="Tag name"
              onChange={(event) => {
                setDraft(event.target.value);
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
          </label>
        )}

        {mergeTarget && (
          <div className={styles.tagDialogNotice}>
            <Hash size={14} />
            <span>Files will be merged into the existing <strong>#{mergeTarget.name}</strong> tag.</span>
          </div>
        )}
        {error && (
          <div className={styles.treeDialogError} role="alert">
            <AlertTriangle size={14} />
            <span>{error}</span>
          </div>
        )}

        <footer>
          <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
          <button
            ref={primaryRef}
            type="button"
            className={state.mode === "delete" ? styles.treeDialogDanger : styles.treeDialogPrimary}
            disabled={busy || state.mode === "rename" && (!cleanDraft || cleanDraft === state.tag.name)}
            onClick={() => void submit()}
          >
            {busy ? <LoaderCircle className={styles.spin} size={14} /> : state.mode === "delete" ? <Trash2 size={14} /> : <Pencil size={14} />}
            <span>{busy ? "Saving" : state.mode === "delete" ? "Delete tag" : "Rename"}</span>
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function trapFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'),
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

function tagKey(tag: string): string {
  return normalizeTagName(tag).toLocaleLowerCase();
}
