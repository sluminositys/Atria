import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  Clock3,
  FileClock,
  GitCommitHorizontal,
  GitCompareArrows,
  History,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type { WorkspaceSnapshot } from "@atria/schema";
import {
  checkpointWorkspacePaths,
  getDocumentDiff,
  getDocumentHistory,
  readDocumentRevision,
  restoreDocumentRevision,
  type GitDocumentDiff,
  type GitRevision,
} from "../app/workspaceClient";
import { useAtriaStore } from "../app/store";
import { formatDocumentDiff, type DocumentDiffLineKind } from "./documentDiff";
import styles from "../app/App.module.css";

export interface HistoryTarget {
  id: string;
  title: string;
  path: string;
  kind: "rich-document" | "html-artifact";
}

interface DocumentHistoryViewProps {
  snapshot: WorkspaceSnapshot;
  target: HistoryTarget;
  onRestored(): Promise<void> | void;
}

type HistoryMode = "source" | "rendered";
type RestoreStrategy = "restore" | "save" | "discard";

export function DocumentHistoryView({ snapshot, target, onRestored }: DocumentHistoryViewProps) {
  const [revisions, setRevisions] = useState<GitRevision[]>([]);
  const [fromRevision, setFromRevision] = useState("");
  const [toRevision, setToRevision] = useState("");
  const [diff, setDiff] = useState<GitDocumentDiff>();
  const [fromContent, setFromContent] = useState("");
  const [toContent, setToContent] = useState("");
  const [mode, setMode] = useState<HistoryMode>("source");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const rootPath = snapshot.settings.workspacePath;
  const tabKey = `${target.kind === "html-artifact" ? "artifact" : "page"}:${target.id}`;
  const tabDirty = useAtriaStore((state) => Boolean(state.tabs.find((tab) => tab.key === tabKey)?.dirty));
  const saveSourceDraft = useAtriaStore((state) => state.saveSourceDraft);
  const clearSourceDraft = useAtriaStore((state) => state.clearSourceDraft);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setError("");
    try {
      const history = await getDocumentHistory(rootPath, target.path, 100);
      setRevisions(history);
      setToRevision((current) => history.some((item) => item.id === current) ? current : (history[0]?.id ?? ""));
      setFromRevision((current) => history.some((item) => item.id === current) ? current : (history[1]?.id ?? ""));
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setHistoryLoading(false);
    }
  }, [rootPath, target.path]);

  useEffect(() => {
    setNotice("");
    setRestoreOpen(false);
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!toRevision) {
      setDiff(undefined);
      setFromContent("");
      setToContent("");
      return;
    }
    let cancelled = false;
    setComparisonLoading(true);
    setError("");
    Promise.all([
      getDocumentDiff(rootPath, target.path, fromRevision || undefined, toRevision),
      fromRevision ? readDocumentRevision(rootPath, target.path, fromRevision) : Promise.resolve(""),
      readDocumentRevision(rootPath, target.path, toRevision),
    ])
      .then(([nextDiff, previous, current]) => {
        if (cancelled) return;
        setDiff(nextDiff);
        setFromContent(previous);
        setToContent(current);
      })
      .catch((reason) => {
        if (!cancelled) setError(messageFor(reason));
      })
      .finally(() => {
        if (!cancelled) setComparisonLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromRevision, rootPath, target.path, toRevision]);

  const revisionById = useMemo(() => new Map(revisions.map((revision) => [revision.id, revision])), [revisions]);
  const fromLabel = revisionLabel(revisionById.get(fromRevision));
  const toLabel = revisionLabel(revisionById.get(toRevision));
  const selectedRevision = revisionById.get(toRevision);

  async function checkpointNow() {
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const result = await checkpointWorkspacePaths(rootPath, [target.path], `Checkpoint ${target.title}`, {
        actorName: "Local user",
        transactionId: crypto.randomUUID(),
      });
      setNotice(result.changed ? "Checkpoint created" : "Document is already checkpointed");
      await loadHistory();
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setWorking(false);
    }
  }

  async function restoreSelected(strategy: RestoreStrategy) {
    if (!toRevision || working) return;
    setWorking(true);
    setRestoreError("");
    setError("");
    setNotice("");
    try {
      if (tabDirty && strategy === "save") {
        const saveResult = await saveSourceDraft(tabKey);
        if (saveResult.status !== "saved") throw new Error(saveResult.message);
        if (useAtriaStore.getState().tabs.find((tab) => tab.key === tabKey)?.dirty) {
          throw new Error("The source changed while it was being saved. Save it again before restoring.");
        }
      } else if (tabDirty && strategy === "discard") {
        clearSourceDraft(tabKey);
      }

      const result = await restoreDocumentRevision(
        rootPath,
        target.path,
        toRevision,
        `Restore ${target.title} to ${selectedRevision?.shortId ?? "selected revision"}`,
      );
      clearSourceDraft(tabKey);
      await onRestored();
      await loadHistory();
      setRestoreOpen(false);
      setNotice(result.changed ? `Restored ${selectedRevision?.shortId ?? "selected revision"}` : "Document already matches this revision");
    } catch (reason) {
      setRestoreError(messageFor(reason));
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className={styles.historyView}>
      <header className={styles.historyHeader}>
        <div>
          <History size={18} />
          <span>
            <strong>{target.title}</strong>
            <small>{historySubtitle(target.kind, revisions.length)}</small>
          </span>
        </div>
        <div className={styles.historyActions}>
          <button title="Refresh history" aria-label="Refresh history" onClick={() => void loadHistory()} disabled={historyLoading || working}>
            <RefreshCw className={historyLoading ? styles.spin : undefined} size={15} />
          </button>
          <button
            title={tabDirty ? "Save or discard source changes before creating a checkpoint" : "Create checkpoint"}
            aria-label="Create checkpoint"
            onClick={() => void checkpointNow()}
            disabled={working || tabDirty}
          >
            <Check size={15} />
            <span>Checkpoint</span>
          </button>
          <button
            title="Restore selected revision"
            aria-label="Restore revision"
            onClick={() => {
              setRestoreError("");
              setRestoreOpen(true);
            }}
            disabled={!toRevision || working}
          >
            <RotateCcw size={15} />
            <span>Restore</span>
          </button>
        </div>
      </header>

      <div className={styles.historyControls}>
        <label>
          <span>From</span>
          <select
            aria-label="Compare from revision"
            value={fromRevision}
            disabled={historyLoading || working}
            onChange={(event) => setFromRevision(event.target.value)}
          >
            <option value="">Empty document</option>
            {revisions.map((revision) => (
              <option key={revision.id} value={revision.id}>{revisionLabel(revision)}</option>
            ))}
          </select>
        </label>
        <GitCompareArrows size={16} />
        <label>
          <span>To</span>
          <select
            aria-label="Compare to revision"
            value={toRevision}
            disabled={historyLoading || working}
            onChange={(event) => setToRevision(event.target.value)}
          >
            {revisions.map((revision) => (
              <option key={revision.id} value={revision.id}>{revisionLabel(revision)}</option>
            ))}
          </select>
        </label>
        <div className={styles.historyMode} aria-label="Comparison mode">
          <button className={mode === "source" ? styles.historyModeActive : undefined} aria-pressed={mode === "source"} onClick={() => setMode("source")}>Source</button>
          <button className={mode === "rendered" ? styles.historyModeActive : undefined} aria-pressed={mode === "rendered"} onClick={() => setMode("rendered")}>Rendered</button>
        </div>
        <div className={styles.historyStats} aria-label="Diff statistics">
          <span className={styles.diffAdded}>+{diff?.additions ?? 0}</span>
          <span className={styles.diffDeleted}>-{diff?.deletions ?? 0}</span>
        </div>
      </div>

      <div className={styles.historyRevisionMeta} aria-label="Selected revision details">
        {selectedRevision ? (
          <>
            <RevisionFact icon={UserRound} label="Actor" value={selectedRevision.actor || "Unknown actor"} />
            <RevisionFact icon={MessageSquareText} label="Intent" value={selectedRevision.summary} />
            <RevisionFact icon={Clock3} label="Time" value={formatRevisionTime(selectedRevision.timestamp)} />
            <RevisionFact icon={GitCommitHorizontal} label="Revision" value={selectedRevision.shortId} mono />
          </>
        ) : (
          <div className={styles.historyRevisionMetaEmpty}>
            <GitCommitHorizontal size={14} />
            <span>{historyLoading ? "Loading revision details" : "No revision selected"}</span>
          </div>
        )}
      </div>

      {notice && <div className={styles.historyNotice} role="status"><Check size={14} /><span>{notice}</span></div>}
      {error ? (
        <div className={styles.historyError} role="alert">
          <AlertTriangle size={17} />
          <span>{error}</span>
          <button type="button" onClick={() => void loadHistory()}>Retry</button>
        </div>
      ) : !revisions.length && !historyLoading ? (
        <div className={styles.historyEmpty}>
          <FileClock size={24} />
          <strong>No revisions yet</strong>
          <span>Create a checkpoint to start this document's history.</span>
        </div>
      ) : mode === "source" ? (
        <SourceDiff patch={diff?.patch ?? ""} loading={historyLoading || comparisonLoading} />
      ) : (
        <RenderedDiff
          fromContent={fromContent}
          toContent={toContent}
          fromLabel={fromLabel}
          toLabel={toLabel}
          loading={historyLoading || comparisonLoading}
        />
      )}

      {restoreOpen && selectedRevision && (
        <RestoreRevisionDialog
          target={target}
          revision={selectedRevision}
          dirty={tabDirty}
          busy={working}
          error={restoreError}
          onClose={() => {
            if (!working) setRestoreOpen(false);
          }}
          onRestore={(strategy) => void restoreSelected(strategy)}
        />
      )}
    </section>
  );
}

function RevisionFact({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className={styles.historyRevisionFact} title={`${label}: ${value}`}>
      <Icon size={14} />
      <span>
        <small>{label}</small>
        {mono ? <code>{value}</code> : <strong>{value}</strong>}
      </span>
    </div>
  );
}

function SourceDiff({ patch, loading }: { patch: string; loading: boolean }) {
  if (loading) return <HistoryLoading />;
  const lines = formatDocumentDiff(patch);
  if (!lines.length) {
    return <div className={styles.diffEmpty}><Check size={20} /><strong>No source changes</strong><span>The selected revisions contain the same document source.</span></div>;
  }
  return (
    <div className={styles.sourceDiff} role="table" aria-label="Unified document diff">
      {lines.map((line, index) => (
        <div key={`${index}:${line.text}`} className={`${styles.sourceDiffLine} ${diffLineClass(line.kind)}`} role="row">
          <span className={styles.diffLineNumber} aria-label={line.oldLine ? `Old line ${line.oldLine}` : undefined}>{line.oldLine ?? ""}</span>
          <span className={styles.diffLineNumber} aria-label={line.newLine ? `New line ${line.newLine}` : undefined}>{line.newLine ?? ""}</span>
          <code>{line.text || " "}</code>
        </div>
      ))}
    </div>
  );
}

function RenderedDiff({
  fromContent,
  toContent,
  fromLabel,
  toLabel,
  loading,
}: {
  fromContent: string;
  toContent: string;
  fromLabel: string;
  toLabel: string;
  loading: boolean;
}) {
  if (loading) return <HistoryLoading />;
  return (
    <div className={styles.renderedDiff}>
      <figure>
        <figcaption>{fromLabel}</figcaption>
        <iframe title={`Previous revision ${fromLabel}`} sandbox="" referrerPolicy="no-referrer" srcDoc={fromContent || blankDocument()} />
      </figure>
      <figure>
        <figcaption>{toLabel}</figcaption>
        <iframe title={`Selected revision ${toLabel}`} sandbox="" referrerPolicy="no-referrer" srcDoc={toContent || blankDocument()} />
      </figure>
    </div>
  );
}

function HistoryLoading() {
  return <div className={styles.historyLoading} role="status"><LoaderCircle className={styles.spin} size={18} /><span>Loading comparison</span></div>;
}

function RestoreRevisionDialog({
  target,
  revision,
  dirty,
  busy,
  error,
  onClose,
  onRestore,
}: {
  target: HistoryTarget;
  revision: GitRevision;
  dirty: boolean;
  busy: boolean;
  error: string;
  onClose(): void;
  onRestore(strategy: RestoreStrategy): void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const busyRef = useRef(busy);
  const closeRef = useRef(onClose);

  useEffect(() => {
    busyRef.current = busy;
    closeRef.current = onClose;
  }, [busy, onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => primaryRef.current?.focus());
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

  return createPortal(
    <div className={styles.treeDialogBackdrop} onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section
        className={`${styles.treeDialog} ${styles.restoreDialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={trapFocus}
      >
        <header>
          <div>
            <strong id={titleId}>Restore this revision?</strong>
            <p id={descriptionId}>Atria will restore {target.title} to {revision.shortId} and create a new checkpoint. Existing history is preserved.</p>
          </div>
          <button type="button" title="Close" aria-label="Close restore dialog" disabled={busy} onClick={onClose}>
            <X size={15} />
          </button>
        </header>

        <div className={styles.restoreRevisionSummary}>
          <History size={18} />
          <span>
            <strong>{revision.summary}</strong>
            <small>{revision.shortId} / {new Date(revision.timestamp * 1000).toLocaleString()}</small>
          </span>
        </div>

        {dirty && (
          <div className={styles.restoreDraftWarning}>
            <AlertTriangle size={15} />
            <span><strong>Unsaved source changes</strong>Choose whether to save the draft as a checkpoint or discard it before restoring.</span>
          </div>
        )}
        {error && <div className={styles.treeDialogError} role="alert"><AlertTriangle size={14} /><span>{error}</span></div>}

        <footer>
          <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
          {dirty && (
            <button type="button" className={styles.treeDialogDanger} disabled={busy} onClick={() => onRestore("discard")}>
              <Trash2 size={14} />
              <span>Discard and restore</span>
            </button>
          )}
          <button
            ref={primaryRef}
            type="button"
            className={styles.treeDialogPrimary}
            disabled={busy}
            onClick={() => onRestore(dirty ? "save" : "restore")}
          >
            {busy ? <LoaderCircle className={styles.spin} size={14} /> : dirty ? <Save size={14} /> : <RotateCcw size={14} />}
            <span>{busy ? "Restoring" : dirty ? "Save and restore" : "Restore revision"}</span>
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
    event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'),
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

function revisionLabel(revision: GitRevision | undefined): string {
  if (!revision) return "Empty document";
  const date = new Date(revision.timestamp * 1000);
  return `${revision.shortId} - ${revision.summary} - ${date.toLocaleString()}`;
}

function formatRevisionTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function historySubtitle(kind: HistoryTarget["kind"], count: number): string {
  const type = kind === "html-artifact" ? "HTML result" : "Document";
  return `${type} / ${count} ${count === 1 ? "revision" : "revisions"}`;
}

function diffLineClass(kind: DocumentDiffLineKind): string {
  if (kind === "added") return styles.diffLineAdded ?? "";
  if (kind === "deleted") return styles.diffLineDeleted ?? "";
  if (kind === "hunk") return styles.diffLineHunk ?? "";
  if (kind === "meta") return styles.diffLineMeta ?? "";
  return "";
}

function blankDocument(): string {
  return "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>";
}

function messageFor(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
