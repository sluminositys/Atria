import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, GitCompareArrows, History, RefreshCw, RotateCcw } from "lucide-react";
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

export function DocumentHistoryView({ snapshot, target, onRestored }: DocumentHistoryViewProps) {
  const [revisions, setRevisions] = useState<GitRevision[]>([]);
  const [fromRevision, setFromRevision] = useState("");
  const [toRevision, setToRevision] = useState("");
  const [diff, setDiff] = useState<GitDocumentDiff>();
  const [fromContent, setFromContent] = useState("");
  const [toContent, setToContent] = useState("");
  const [mode, setMode] = useState<HistoryMode>("source");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const rootPath = snapshot.settings.workspacePath;

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const history = await getDocumentHistory(rootPath, target.path, 100);
      setRevisions(history);
      setToRevision((current) => (history.some((item) => item.id === current) ? current : (history[0]?.id ?? "")));
      setFromRevision((current) =>
        history.some((item) => item.id === current) ? current : (history[1]?.id ?? ""),
      );
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setLoading(false);
    }
  }, [rootPath, target.path]);

  useEffect(() => {
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
    setLoading(true);
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
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromRevision, rootPath, target.path, toRevision]);

  const revisionById = useMemo(
    () => new Map(revisions.map((revision) => [revision.id, revision])),
    [revisions],
  );
  const fromLabel = revisionLabel(revisionById.get(fromRevision));
  const toLabel = revisionLabel(revisionById.get(toRevision));

  async function checkpointNow() {
    setWorking(true);
    setError("");
    try {
      await checkpointWorkspacePaths(rootPath, [target.path], `Checkpoint ${target.title}`, {
        actorName: "Local user",
        transactionId: crypto.randomUUID(),
      });
      await loadHistory();
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setWorking(false);
    }
  }

  async function restoreSelected() {
    if (!toRevision || !window.confirm(`Restore ${target.title} to ${toLabel}?`)) return;
    setWorking(true);
    setError("");
    try {
      await restoreDocumentRevision(
        rootPath,
        target.path,
        toRevision,
        `Restore ${target.title} to ${toLabel}`,
      );
      await onRestored();
      await loadHistory();
    } catch (reason) {
      setError(messageFor(reason));
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
            <small>{target.path}</small>
          </span>
        </div>
        <div className={styles.historyActions}>
          <button title="Refresh history" onClick={() => void loadHistory()} disabled={loading || working}>
            <RefreshCw size={15} />
          </button>
          <button title="Create checkpoint" onClick={() => void checkpointNow()} disabled={working}>
            <Check size={15} />
            <span>Checkpoint</span>
          </button>
          <button title="Restore selected revision" onClick={() => void restoreSelected()} disabled={!toRevision || working}>
            <RotateCcw size={15} />
            <span>Restore</span>
          </button>
        </div>
      </header>

      <div className={styles.historyControls}>
        <label>
          <span>From</span>
          <select value={fromRevision} onChange={(event) => setFromRevision(event.target.value)}>
            <option value="">Empty document</option>
            {revisions.map((revision) => (
              <option key={revision.id} value={revision.id}>{revisionLabel(revision)}</option>
            ))}
          </select>
        </label>
        <GitCompareArrows size={16} />
        <label>
          <span>To</span>
          <select value={toRevision} onChange={(event) => setToRevision(event.target.value)}>
            {revisions.map((revision) => (
              <option key={revision.id} value={revision.id}>{revisionLabel(revision)}</option>
            ))}
          </select>
        </label>
        <div className={styles.historyMode} aria-label="Comparison mode">
          <button className={mode === "source" ? styles.historyModeActive : undefined} onClick={() => setMode("source")}>Source</button>
          <button className={mode === "rendered" ? styles.historyModeActive : undefined} onClick={() => setMode("rendered")}>Rendered</button>
        </div>
        <div className={styles.historyStats}>
          <span className={styles.diffAdded}>+{diff?.additions ?? 0}</span>
          <span className={styles.diffDeleted}>-{diff?.deletions ?? 0}</span>
        </div>
      </div>

      {error ? (
        <div className={styles.historyError}>{error}</div>
      ) : !revisions.length && !loading ? (
        <div className={styles.emptyState}>No revisions for this document</div>
      ) : mode === "source" ? (
        <SourceDiff patch={diff?.patch ?? ""} loading={loading} />
      ) : (
        <RenderedDiff
          fromContent={fromContent}
          toContent={toContent}
          fromLabel={fromLabel}
          toLabel={toLabel}
          loading={loading}
        />
      )}
    </section>
  );
}

function SourceDiff({ patch, loading }: { patch: string; loading: boolean }) {
  if (loading) return <div className={styles.historyLoading}>Loading comparison</div>;
  return (
    <pre className={styles.sourceDiff}>
      {patch.split("\n").map((line, index) => (
        <span key={`${index}:${line}`} className={diffLineClass(line)}>{line || " "}</span>
      ))}
    </pre>
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
  if (loading) return <div className={styles.historyLoading}>Loading comparison</div>;
  return (
    <div className={styles.renderedDiff}>
      <figure>
        <figcaption>{fromLabel}</figcaption>
        <iframe title={`Previous revision ${fromLabel}`} sandbox="allow-scripts" srcDoc={fromContent || blankDocument()} />
      </figure>
      <figure>
        <figcaption>{toLabel}</figcaption>
        <iframe title={`Selected revision ${toLabel}`} sandbox="allow-scripts" srcDoc={toContent || blankDocument()} />
      </figure>
    </div>
  );
}

function revisionLabel(revision: GitRevision | undefined): string {
  if (!revision) return "Empty document";
  const date = new Date(revision.timestamp * 1000);
  return `${revision.shortId} - ${revision.summary} - ${date.toLocaleString()}`;
}

function diffLineClass(line: string): string | undefined {
  if (line.startsWith("+") && !line.startsWith("+++")) return styles.diffLineAdded;
  if (line.startsWith("-") && !line.startsWith("---")) return styles.diffLineDeleted;
  if (line.startsWith("@@")) return styles.diffLineHunk;
  return undefined;
}

function blankDocument(): string {
  return "<!doctype html><html><body></body></html>";
}

function messageFor(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
