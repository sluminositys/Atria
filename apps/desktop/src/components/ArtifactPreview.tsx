import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Code2,
  ExternalLink,
  Eye,
  FileCode2,
  FileQuestion,
  LoaderCircle,
  Maximize2,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import type { Artifact, WorkspaceSnapshot } from "@atria/schema";
import {
  checkpointWorkspacePaths,
  openWorkspaceFile,
  readWorkspaceTextFile,
  toWorkspaceFileAssetUrl,
  writeWorkspaceTextFile,
} from "../app/workspaceClient";
import { buildArtifactPreviewDocument } from "./artifactPreviewDocument";
import styles from "../app/App.module.css";

const HtmlSourceEditor = lazy(() =>
  import("./editor/HtmlSourceEditor").then((module) => ({ default: module.HtmlSourceEditor })),
);

interface ArtifactPreviewProps {
  artifact: Artifact;
  snapshot?: WorkspaceSnapshot;
}

type ArtifactMode = "preview" | "source";
type ArtifactStatus = "loading" | "ready" | "saving" | "saved" | "error" | "conflict";

export function ArtifactPreview({ artifact, snapshot }: ArtifactPreviewProps) {
  const rootPath = snapshot?.settings.workspacePath ?? "";
  const relativePath = artifact.filePath ?? "";
  const [mode, setMode] = useState<ArtifactMode>("preview");
  const [source, setSource] = useState("");
  const [baselineSource, setBaselineSource] = useState("");
  const [status, setStatus] = useState<ArtifactStatus>("loading");
  const [message, setMessage] = useState("");
  const [fileAvailable, setFileAvailable] = useState(false);
  const [previewDocument, setPreviewDocument] = useState("");
  const [resourceWarning, setResourceWarning] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [fullScreen, setFullScreen] = useState(false);
  const [fullScreenLoading, setFullScreenLoading] = useState(true);
  const loadSequenceRef = useRef(0);
  const fullScreenButtonRef = useRef<HTMLButtonElement | null>(null);
  const fullScreenCloseRef = useRef<HTMLButtonElement | null>(null);
  const fullScreenTitleId = useId();
  const dirty = source !== baselineSource;
  const previewAvailable = fileAvailable && Boolean(previewDocument) && status !== "loading";

  const loadSource = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    if (!rootPath || !relativePath) {
      setFileAvailable(false);
      setStatus("error");
      setMessage("This HTML Artifact is not attached to a local Workspace file.");
      return false;
    }
    setStatus("loading");
    setMessage("");
    setResourceWarning("");
    setFileAvailable(false);
    setPreviewLoading(true);
    setFullScreenLoading(true);
    try {
      const next = await readWorkspaceTextFile(rootPath, relativePath);
      const prepared = await buildArtifactPreviewDocument(next, relativePath, {
        readText: (path) => readWorkspaceTextFile(rootPath, path),
        toUrl: (path) => toWorkspaceFileAssetUrl(snapshot, path),
      });
      if (sequence !== loadSequenceRef.current) return false;
      setSource(next);
      setBaselineSource(next);
      setPreviewDocument(prepared.html);
      setResourceWarning(prepared.warnings.join(" "));
      setFileAvailable(true);
      setStatus("ready");
      return true;
    } catch (reason) {
      if (sequence !== loadSequenceRef.current) return false;
      setFileAvailable(false);
      setStatus("error");
      setMessage(messageFor(reason));
      return false;
    }
  }, [relativePath, rootPath, snapshot]);

  useEffect(() => {
    setMode("preview");
    setReloadKey(0);
    setPreviewLoading(true);
    setFullScreen(false);
    void loadSource();
    return () => {
      loadSequenceRef.current += 1;
    };
  }, [artifact.id, loadSource]);

  useEffect(() => {
    if (!fullScreen) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => fullScreenCloseRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setFullScreen(false);
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("keydown", closeOnEscape, true);
      document.body.style.overflow = previousOverflow;
      (fullScreenButtonRef.current ?? previousFocus)?.focus();
    };
  }, [fullScreen]);

  function changeSource(nextSource: string) {
    setSource(nextSource);
    if (status === "saved" || status === "conflict" || status === "error") setStatus("ready");
    if (message) setMessage("");
  }

  async function saveSource(): Promise<boolean> {
    if (!dirty || status === "saving") return !dirty;
    setStatus("saving");
    setMessage("");
    try {
      let currentDiskSource: string | undefined;
      try {
        currentDiskSource = await readWorkspaceTextFile(rootPath, relativePath);
      } catch (reason) {
        if (!isMissingFile(reason)) throw reason;
      }
      if (currentDiskSource !== undefined && currentDiskSource !== baselineSource) {
        setStatus("conflict");
        setMessage("The file changed outside Atria. Reload it before applying your edits.");
        return false;
      }
      await writeWorkspaceTextFile(rootPath, relativePath, source);
      await checkpointWorkspacePaths(rootPath, [relativePath], `Edit ${artifact.title}`, {
        actorName: "Local user",
        transactionId: crypto.randomUUID(),
      });
      const prepared = await buildArtifactPreviewDocument(source, relativePath, {
        readText: (path) => readWorkspaceTextFile(rootPath, path),
        toUrl: (path) => toWorkspaceFileAssetUrl(snapshot, path),
      });
      setBaselineSource(source);
      setPreviewDocument(prepared.html);
      setResourceWarning(prepared.warnings.join(" "));
      setFileAvailable(true);
      setStatus("saved");
      setReloadKey((value) => value + 1);
      setPreviewLoading(true);
      setFullScreenLoading(true);
      window.setTimeout(() => setStatus((current) => current === "saved" ? "ready" : current), 1200);
      return true;
    } catch (reason) {
      setStatus("error");
      setMessage(messageFor(reason));
      return false;
    }
  }

  async function restoreMissingFile() {
    if (!rootPath || !relativePath || !source || status === "saving") return;
    setStatus("saving");
    setMessage("");
    try {
      await writeWorkspaceTextFile(rootPath, relativePath, source);
      await checkpointWorkspacePaths(rootPath, [relativePath], `Restore ${artifact.title}`, {
        actorName: "Local user",
        transactionId: crypto.randomUUID(),
      });
      const prepared = await buildArtifactPreviewDocument(source, relativePath, {
        readText: (path) => readWorkspaceTextFile(rootPath, path),
        toUrl: (path) => toWorkspaceFileAssetUrl(snapshot, path),
      });
      setBaselineSource(source);
      setPreviewDocument(prepared.html);
      setResourceWarning(prepared.warnings.join(" "));
      setFileAvailable(true);
      setStatus("saved");
      setReloadKey((value) => value + 1);
      setPreviewLoading(true);
      setFullScreenLoading(true);
      window.setTimeout(() => setStatus((current) => current === "saved" ? "ready" : current), 1200);
    } catch (reason) {
      setStatus("error");
      setMessage(messageFor(reason));
    }
  }

  async function selectMode(nextMode: ArtifactMode) {
    if (nextMode === mode) return;
    if (nextMode === "preview" && dirty && !(await saveSource())) return;
    setMode(nextMode);
  }

  async function reloadSource(force = false) {
    if ((!force && dirty) || status === "saving") return;
    const loaded = await loadSource();
    if (!loaded) return;
    setReloadKey((value) => value + 1);
  }

  async function openArtifact() {
    if (!rootPath || !relativePath || !fileAvailable) return;
    setMessage("");
    try {
      await openWorkspaceFile(rootPath, relativePath);
    } catch (reason) {
      setMessage(messageFor(reason));
    }
  }

  function openFullScreen() {
    if (!previewAvailable || previewLoading) return;
    setFullScreenLoading(true);
    setFullScreen(true);
  }

  const metadata = `${artifact.tags.slice(0, 2).join(" / ") || "HTML Artifact"} / ${new Date(artifact.updatedAt).toLocaleDateString()}`;

  return (
    <article className={styles.artifactWorkspace}>
      <header className={styles.artifactToolbar}>
        <div className={styles.artifactIdentity}>
          <FileCode2 size={17} />
          <span>
            <strong>{artifact.title}</strong>
            <small>{metadata}{dirty ? " / Unsaved changes" : ""}</small>
          </span>
        </div>
        <div className={styles.artifactControls}>
          <div className={styles.segmentedControl} aria-label="HTML Artifact view">
            <button
              type="button"
              className={mode === "preview" ? styles.segmentedControlActive : undefined}
              aria-pressed={mode === "preview"}
              onClick={() => void selectMode("preview")}
            >
              <Eye size={14} />
              <span>Preview</span>
            </button>
            <button
              type="button"
              className={mode === "source" ? styles.segmentedControlActive : undefined}
              aria-pressed={mode === "source"}
              disabled={status === "loading" && !source}
              onClick={() => void selectMode("source")}
            >
              <Code2 size={14} />
              <span>Source</span>
            </button>
          </div>
          {mode === "source" && (
            <button
              type="button"
              className={styles.artifactActionButton}
              disabled={!dirty || status === "saving" || status === "loading"}
              onClick={() => void saveSource()}
            >
              {status === "saving" ? <LoaderCircle className={styles.spin} size={14} /> : status === "saved" ? <Check size={14} /> : <Save size={14} />}
              <span>{status === "saving" ? "Saving" : status === "saved" ? "Saved" : "Save"}</span>
            </button>
          )}
          <button
            type="button"
            className={styles.artifactIconButton}
            title="Reload from disk"
            aria-label="Reload from disk"
            disabled={dirty || status === "saving" || status === "loading"}
            onClick={() => void reloadSource()}
          >
            <RefreshCw size={15} />
          </button>
          <button
            type="button"
            className={styles.artifactIconButton}
            title="Open in default application"
            aria-label="Open in default application"
            disabled={!fileAvailable || status === "loading"}
            onClick={() => void openArtifact()}
          >
            <ExternalLink size={15} />
          </button>
          <button
            ref={fullScreenButtonRef}
            type="button"
            className={styles.artifactIconButton}
            title="Open full screen preview"
            aria-label="Open full screen preview"
            disabled={mode !== "preview" || !previewAvailable || previewLoading}
            onClick={openFullScreen}
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </header>

      <div className={styles.artifactContent}>
        {message && !(mode === "preview" && !fileAvailable) && (
          <div className={status === "conflict" ? styles.artifactConflict : styles.artifactError} role="alert">
            <span>{message}</span>
            <button type="button" onClick={() => void reloadSource(true)}>Reload</button>
          </div>
        )}
        {resourceWarning && <div className={styles.artifactWarning} role="status">{resourceWarning}</div>}

        <div className={styles.artifactBody}>
          {status === "loading" ? (
            <div className={styles.artifactLoading} role="status">
              <LoaderCircle className={styles.spin} size={18} />
              <span>Loading local HTML...</span>
            </div>
          ) : mode === "preview" && !fileAvailable ? (
            <ArtifactUnavailable
              message={message}
              canRestore={Boolean(source)}
              saving={status === "saving"}
              onRetry={() => void reloadSource(true)}
              onRestore={() => void restoreMissingFile()}
            />
          ) : mode === "preview" ? (
            <div className={styles.artifactPreviewFrame} data-loading={previewLoading ? "true" : "false"}>
              {previewLoading && <LoaderCircle className={styles.artifactPreviewSpinner} size={20} />}
              {!fullScreen && (
                <iframe
                  key={reloadKey}
                  srcDoc={previewDocument}
                  title={artifact.title}
                  referrerPolicy="no-referrer"
                  sandbox="allow-scripts allow-forms allow-downloads"
                  onLoad={() => setPreviewLoading(false)}
                />
              )}
            </div>
          ) : (
            <div className={styles.artifactSourceEditor}>
              <Suspense fallback={<div className={styles.artifactLoading}><LoaderCircle className={styles.spin} size={18} /></div>}>
                <HtmlSourceEditor
                  value={source}
                  ariaLabel={`${artifact.title} HTML source`}
                  autoFocus
                  onChange={changeSource}
                  onSave={() => void saveSource()}
                />
              </Suspense>
            </div>
          )}
        </div>
      </div>

      {fullScreen && createPortal(
        <div className={styles.htmlEditorBackdrop}>
          <section className={styles.artifactFullScreenDialog} role="dialog" aria-modal="true" aria-labelledby={fullScreenTitleId}>
            <header className={styles.artifactFullScreenHeader}>
              <span>
                <FileCode2 size={16} />
                <strong id={fullScreenTitleId}>{artifact.title}</strong>
                <small>{metadata}</small>
              </span>
              <div>
                <button type="button" aria-label="Reload full screen preview" title="Reload" disabled={status === "loading"} onClick={() => void reloadSource(true)}>
                  <RefreshCw size={16} />
                </button>
                <button type="button" aria-label="Open in default application" title="Open" disabled={!fileAvailable} onClick={() => void openArtifact()}>
                  <ExternalLink size={16} />
                </button>
                <button ref={fullScreenCloseRef} type="button" aria-label="Close full screen preview" title="Close" onClick={() => setFullScreen(false)}>
                  <X size={17} />
                </button>
              </div>
            </header>
            <div className={styles.artifactFullScreenBody} data-loading={fullScreenLoading ? "true" : "false"}>
              {status === "loading" ? (
                <div className={styles.artifactLoading}><LoaderCircle className={styles.spin} size={20} /></div>
              ) : !fileAvailable ? (
                <ArtifactUnavailable
                  message={message}
                  canRestore={Boolean(source)}
                  saving={status === "saving"}
                  onRetry={() => void reloadSource(true)}
                  onRestore={() => void restoreMissingFile()}
                />
              ) : (
                <>
                  {fullScreenLoading && <LoaderCircle className={styles.artifactPreviewSpinner} size={20} />}
                  <iframe
                    key={`full-${reloadKey}`}
                    srcDoc={previewDocument}
                    title={`${artifact.title} full screen preview`}
                    referrerPolicy="no-referrer"
                    sandbox="allow-scripts allow-forms allow-downloads"
                    onLoad={() => setFullScreenLoading(false)}
                  />
                </>
              )}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </article>
  );
}

interface ArtifactUnavailableProps {
  message: string;
  canRestore: boolean;
  saving: boolean;
  onRetry(): void;
  onRestore(): void;
}

function ArtifactUnavailable({ message, canRestore, saving, onRetry, onRestore }: ArtifactUnavailableProps) {
  return (
    <div className={styles.artifactUnavailable} role="alert">
      <FileQuestion size={24} />
      <strong>HTML preview unavailable</strong>
      <span>{message || "The local HTML file is not available."}</span>
      <div>
        <button type="button" disabled={saving} onClick={onRetry}><RefreshCw size={14} />Retry</button>
        {canRestore && <button type="button" disabled={saving} onClick={onRestore}><Save size={14} />Restore file</button>}
      </div>
    </div>
  );
}

function isMissingFile(reason: unknown): boolean {
  const message = reason instanceof Error ? reason.message : String(reason);
  return /os error 2|not found|cannot find|找不到指定的文件/i.test(message);
}

function messageFor(reason: unknown): string {
  if (isMissingFile(reason)) return "The local HTML file is not available. It may have been moved or deleted.";
  return reason instanceof Error ? reason.message : String(reason);
}
