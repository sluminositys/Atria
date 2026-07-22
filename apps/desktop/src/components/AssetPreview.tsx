import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ExternalLink,
  File,
  FileImage,
  FileText,
  FileWarning,
  LoaderCircle,
  Maximize2,
  RefreshCw,
  Save,
  Scan,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { WorkspaceAsset, WorkspaceSnapshot } from "@atria/schema";
import {
  checkpointWorkspacePaths,
  getWorkspaceFileMetadata,
  openWorkspaceFile,
  readWorkspaceTextFile,
  toWorkspaceFileAssetUrl,
  writeWorkspaceTextFile,
} from "../app/workspaceClient";
import type { LocalWorkspaceEntry } from "../app/workspaceFiles";
import styles from "../app/App.module.css";

const SourceEditor = lazy(() =>
  import("./editor/HtmlSourceEditor").then((module) => ({ default: module.HtmlSourceEditor })),
);

type AssetStatus = "loading" | "ready" | "saving" | "saved" | "error" | "conflict";
type FullScreenKind = "image" | "pdf";

export function AssetPreview({ asset, snapshot }: { asset: WorkspaceAsset; snapshot: WorkspaceSnapshot }) {
  const rootPath = snapshot.settings.workspacePath;
  const [source, setSource] = useState("");
  const [baselineSource, setBaselineSource] = useState("");
  const [status, setStatus] = useState<AssetStatus>("loading");
  const [message, setMessage] = useState("");
  const [fileAvailable, setFileAvailable] = useState(false);
  const [fileMetadata, setFileMetadata] = useState<LocalWorkspaceEntry | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [inlineLoading, setInlineLoading] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [fullScreenLoading, setFullScreenLoading] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [fitImage, setFitImage] = useState(true);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const loadSequenceRef = useRef(0);
  const fullScreenButtonRef = useRef<HTMLButtonElement | null>(null);
  const fullScreenDialogRef = useRef<HTMLElement | null>(null);
  const fullScreenCloseRef = useRef<HTMLButtonElement | null>(null);
  const fullScreenTitleId = useId();
  const dirty = asset.kind === "text" && source !== baselineSource;
  const fullScreenKind: FullScreenKind | null = asset.kind === "image" || asset.kind === "pdf" ? asset.kind : null;
  const assetUrl = withReloadKey(toWorkspaceFileAssetUrl(snapshot, asset.filePath), reloadKey);

  const loadAsset = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    setStatus("loading");
    setMessage("");
    setFileAvailable(false);
    setInlineLoading(asset.kind === "image" || asset.kind === "pdf");
    setFullScreenLoading(asset.kind === "image" || asset.kind === "pdf");
    try {
      if (asset.kind === "text") {
        const [nextSource, metadata] = await Promise.all([
          readWorkspaceTextFile(rootPath, asset.filePath),
          getWorkspaceFileMetadata(rootPath, asset.filePath),
        ]);
        if (sequence !== loadSequenceRef.current) return false;
        setSource(nextSource);
        setBaselineSource(nextSource);
        setFileMetadata(metadata);
        setFileAvailable(true);
        setStatus("ready");
        return true;
      }

      const metadata = await getWorkspaceFileMetadata(rootPath, asset.filePath);
      if (sequence !== loadSequenceRef.current) return false;
      setFileMetadata(metadata);
      setFileAvailable(true);
      setReloadKey((value) => value + 1);
      setStatus("ready");
      return true;
    } catch (reason) {
      if (sequence !== loadSequenceRef.current) return false;
      setStatus("error");
      setFileAvailable(false);
      setInlineLoading(false);
      setFullScreenLoading(false);
      setMessage(readErrorMessage(reason));
      return false;
    }
  }, [asset.filePath, asset.kind, rootPath]);

  useEffect(() => {
    setSource("");
    setBaselineSource("");
    setFileMetadata(null);
    setReloadKey(0);
    setZoom(100);
    setFitImage(true);
    setNaturalSize({ width: 0, height: 0 });
    setFullScreen(false);
    void loadAsset();
    return () => {
      loadSequenceRef.current += 1;
    };
  }, [asset.id, loadAsset]);

  useEffect(() => {
    if (!fullScreen) return;
    const dialog = fullScreenDialogRef.current;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => fullScreenCloseRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setFullScreen(false);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>("button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])"),
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
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      (fullScreenButtonRef.current ?? previousFocus)?.focus();
    };
  }, [fullScreen]);

  function changeSource(nextSource: string) {
    setSource(nextSource);
    if (status === "saved" || status === "error" || status === "conflict") setStatus("ready");
    if (message) setMessage("");
  }

  async function saveSource(): Promise<boolean> {
    if (!dirty || status === "saving") return !dirty;
    setStatus("saving");
    setMessage("");
    try {
      let diskSource: string;
      try {
        diskSource = await readWorkspaceTextFile(rootPath, asset.filePath);
      } catch (reason) {
        if (!isMissingFile(reason)) throw reason;
        setFileAvailable(false);
        setStatus("error");
        setMessage("This file was removed outside Atria. Restore it to keep your edits.");
        return false;
      }
      if (diskSource !== baselineSource) {
        setStatus("conflict");
        setMessage("This file changed outside Atria. Load the disk version before applying your edits.");
        return false;
      }
      await writeWorkspaceTextFile(rootPath, asset.filePath, source);
      await checkpointWorkspacePaths(rootPath, [asset.filePath], `Edit ${asset.title}`, {
        actorName: "Local user",
        transactionId: crypto.randomUUID(),
      });
      const metadata = await getWorkspaceFileMetadata(rootPath, asset.filePath);
      setBaselineSource(source);
      setFileMetadata(metadata);
      setFileAvailable(true);
      setStatus("saved");
      window.setTimeout(() => setStatus((current) => current === "saved" ? "ready" : current), 1200);
      return true;
    } catch (reason) {
      setStatus("error");
      setMessage(operationErrorMessage("save", reason));
      return false;
    }
  }

  async function restoreTextFile() {
    if (asset.kind !== "text" || !source || status === "saving") return;
    setStatus("saving");
    setMessage("");
    try {
      await writeWorkspaceTextFile(rootPath, asset.filePath, source);
      await checkpointWorkspacePaths(rootPath, [asset.filePath], `Restore ${asset.title}`, {
        actorName: "Local user",
        transactionId: crypto.randomUUID(),
      });
      const metadata = await getWorkspaceFileMetadata(rootPath, asset.filePath);
      setBaselineSource(source);
      setFileMetadata(metadata);
      setFileAvailable(true);
      setStatus("saved");
      window.setTimeout(() => setStatus((current) => current === "saved" ? "ready" : current), 1200);
    } catch (reason) {
      setStatus("error");
      setMessage(operationErrorMessage("restore", reason));
    }
  }

  async function openExternally() {
    if (!fileAvailable || status === "loading") return;
    setMessage("");
    try {
      await openWorkspaceFile(rootPath, asset.filePath);
    } catch (reason) {
      setFileAvailable(false);
      setStatus("error");
      setMessage(operationErrorMessage("open", reason));
    }
  }

  async function reloadAsset(force = false) {
    if ((!force && dirty) || status === "saving") return;
    setNaturalSize({ width: 0, height: 0 });
    await loadAsset();
  }

  function openFullScreen() {
    if (!fullScreenKind || !fileAvailable || inlineLoading) return;
    setFullScreenLoading(true);
    setFullScreen(true);
  }

  function handleMediaError() {
    setFileAvailable(false);
    setInlineLoading(false);
    setFullScreenLoading(false);
    setStatus("error");
    setMessage(asset.kind === "image"
      ? "Atria could not decode this image. The file may be damaged or use an unsupported format."
      : "Atria could not display this PDF. Open it in the default application to inspect the file.");
  }

  const IdentityIcon = asset.kind === "image" ? FileImage : asset.kind === "text" ? FileText : File;
  const metadata = assetMetadata(asset, fileMetadata, naturalSize, dirty);
  const showUnavailable = status !== "loading" && !fileAvailable;

  return (
    <article className={styles.artifactWorkspace}>
      <header className={styles.artifactToolbar}>
        <div className={styles.artifactIdentity}>
          <IdentityIcon size={17} />
          <span>
            <strong>{asset.title}</strong>
            <small>{metadata}</small>
          </span>
        </div>
        <div className={styles.artifactControls}>
          {asset.kind === "text" && (
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
          {asset.kind === "image" && (
            <ImageZoomControls zoom={zoom} fit={fitImage} disabled={!fileAvailable} onZoom={setZoom} onFit={setFitImage} />
          )}
          <button
            type="button"
            className={styles.artifactIconButton}
            title="Reload from disk"
            aria-label="Reload from disk"
            disabled={dirty || status === "saving" || status === "loading"}
            onClick={() => void reloadAsset()}
          >
            <RefreshCw className={status === "loading" ? styles.spin : undefined} size={15} />
          </button>
          <button
            type="button"
            className={styles.artifactIconButton}
            title="Open in default application"
            aria-label="Open in default application"
            disabled={!fileAvailable || status === "loading"}
            onClick={() => void openExternally()}
          >
            <ExternalLink size={15} />
          </button>
          {fullScreenKind && (
            <button
              ref={fullScreenButtonRef}
              type="button"
              className={styles.artifactIconButton}
              title="Open full screen preview"
              aria-label="Open full screen preview"
              disabled={!fileAvailable || inlineLoading || status === "loading"}
              onClick={openFullScreen}
            >
              <Maximize2 size={15} />
            </button>
          )}
        </div>
      </header>

      <div className={styles.artifactContent}>
        {message && !showUnavailable && (
          <div className={status === "conflict" ? styles.artifactConflict : styles.artifactError} role="alert">
            <span>{message}</span>
            {asset.kind === "text" && (
              <button type="button" onClick={() => void reloadAsset(true)}>Load disk version</button>
            )}
          </div>
        )}
        <div className={styles.assetPreviewBody}>
          {status === "loading" && !fileAvailable ? (
            <AssetLoading label={asset.kind === "text" ? "Loading local text..." : "Checking local file..."} />
          ) : showUnavailable ? (
            <AssetUnavailable
              message={message}
              canRestore={asset.kind === "text" && Boolean(source)}
              saving={status === "saving"}
              onRetry={() => void reloadAsset(true)}
              onRestore={() => void restoreTextFile()}
            />
          ) : asset.kind === "text" ? (
            <div className={styles.artifactSourceEditor}>
              <Suspense fallback={<AssetLoading label="Loading editor..." />}>
                <SourceEditor
                  value={source}
                  language="text"
                  ariaLabel={`${asset.title} source`}
                  autoFocus
                  onChange={changeSource}
                  onSave={() => void saveSource()}
                />
              </Suspense>
            </div>
          ) : asset.kind === "image" ? (
            <div className={styles.assetImageStage} data-loading={inlineLoading ? "true" : "false"}>
              {inlineLoading && <LoaderCircle className={styles.assetMediaSpinner} size={20} />}
              {!fullScreen && (
                <img
                  key={reloadKey}
                  src={assetUrl}
                  alt={asset.title}
                  className={fitImage ? styles.assetImageFit : styles.assetImageActual}
                  style={!fitImage && naturalSize.width ? { width: naturalSize.width * zoom / 100 } : undefined}
                  onLoad={(event) => {
                    setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
                    setInlineLoading(false);
                  }}
                  onError={handleMediaError}
                />
              )}
            </div>
          ) : asset.kind === "pdf" ? (
            <div className={styles.assetPdfStage} data-loading={inlineLoading ? "true" : "false"}>
              {inlineLoading && <LoaderCircle className={styles.assetMediaSpinner} size={20} />}
              {!fullScreen && (
                <iframe
                  key={reloadKey}
                  className={styles.assetPdfFrame}
                  src={assetUrl}
                  title={asset.title}
                  referrerPolicy="no-referrer"
                  onLoad={() => setInlineLoading(false)}
                />
              )}
            </div>
          ) : (
            <div className={styles.assetUnsupported}>
              <FileWarning size={34} />
              <strong>Preview not available</strong>
              <span>Atria does not render this file type inside the editor.</span>
              <div className={styles.assetFileMetadata}>{metadata}</div>
              <button type="button" className={styles.artifactActionButton} onClick={() => void openExternally()}>
                <ExternalLink size={14} />
                <span>Open with default app</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {fullScreen && fullScreenKind && createPortal(
        <div className={styles.htmlEditorBackdrop}>
          <section
            ref={fullScreenDialogRef}
            className={styles.artifactFullScreenDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby={fullScreenTitleId}
          >
            <header className={styles.artifactFullScreenHeader}>
              <span>
                <IdentityIcon size={16} />
                <strong id={fullScreenTitleId}>{asset.title}</strong>
                <small>{metadata}</small>
              </span>
              <div>
                {fullScreenKind === "image" && (
                  <ImageZoomControls zoom={zoom} fit={fitImage} disabled={!fileAvailable} onZoom={setZoom} onFit={setFitImage} compact />
                )}
                <button type="button" aria-label="Reload full screen preview" title="Reload" disabled={status === "loading"} onClick={() => void reloadAsset(true)}>
                  <RefreshCw className={status === "loading" ? styles.spin : undefined} size={16} />
                </button>
                <button type="button" aria-label="Open in default application" title="Open" disabled={!fileAvailable} onClick={() => void openExternally()}>
                  <ExternalLink size={16} />
                </button>
                <button ref={fullScreenCloseRef} type="button" aria-label="Close full screen preview" title="Close" onClick={() => setFullScreen(false)}>
                  <X size={17} />
                </button>
              </div>
            </header>
            <div className={styles.artifactFullScreenBody} data-loading={fullScreenLoading ? "true" : "false"}>
              {!fileAvailable ? (
                <AssetUnavailable
                  message={message}
                  canRestore={false}
                  saving={false}
                  onRetry={() => void reloadAsset(true)}
                  onRestore={() => undefined}
                />
              ) : fullScreenKind === "image" ? (
                <div className={styles.assetFullScreenStage} data-loading={fullScreenLoading ? "true" : "false"}>
                  {fullScreenLoading && <LoaderCircle className={styles.assetMediaSpinner} size={20} />}
                  <img
                    key={`full-${reloadKey}`}
                    src={assetUrl}
                    alt={asset.title}
                    className={fitImage ? styles.assetImageFit : styles.assetImageActual}
                    style={!fitImage && naturalSize.width ? { width: naturalSize.width * zoom / 100 } : undefined}
                    onLoad={(event) => {
                      setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
                      setFullScreenLoading(false);
                    }}
                    onError={handleMediaError}
                  />
                </div>
              ) : (
                <div className={styles.assetFullScreenStage} data-loading={fullScreenLoading ? "true" : "false"}>
                  {fullScreenLoading && <LoaderCircle className={styles.assetMediaSpinner} size={20} />}
                  <iframe
                    key={`full-${reloadKey}`}
                    className={styles.assetPdfFrame}
                    src={assetUrl}
                    title={`${asset.title} full screen preview`}
                    referrerPolicy="no-referrer"
                    onLoad={() => setFullScreenLoading(false)}
                  />
                </div>
              )}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </article>
  );
}

interface ImageZoomControlsProps {
  zoom: number;
  fit: boolean;
  disabled: boolean;
  compact?: boolean;
  onZoom(value: number): void;
  onFit(value: boolean): void;
}

function ImageZoomControls({ zoom, fit, disabled, compact = false, onZoom, onFit }: ImageZoomControlsProps) {
  return (
    <div className={`${styles.assetZoomControls} ${compact ? styles.assetZoomControlsCompact : ""}`} aria-label="Image zoom">
      <button
        type="button"
        title="Zoom out"
        aria-label="Zoom out"
        disabled={disabled}
        onClick={() => {
          onFit(false);
          onZoom(Math.max(25, zoom - 25));
        }}
      >
        <ZoomOut size={14} />
      </button>
      <span>{fit ? "Fit" : `${zoom}%`}</span>
      <button
        type="button"
        title="Zoom in"
        aria-label="Zoom in"
        disabled={disabled}
        onClick={() => {
          onFit(false);
          onZoom(Math.min(400, zoom + 25));
        }}
      >
        <ZoomIn size={14} />
      </button>
      <button
        type="button"
        className={fit ? styles.assetZoomActive : undefined}
        title="Fit image"
        aria-label="Fit image"
        aria-pressed={fit}
        disabled={disabled}
        onClick={() => onFit(true)}
      >
        <Scan size={14} />
      </button>
    </div>
  );
}

function AssetLoading({ label }: { label: string }) {
  return (
    <div className={styles.artifactLoading} role="status">
      <LoaderCircle className={styles.spin} size={18} />
      <span>{label}</span>
    </div>
  );
}

interface AssetUnavailableProps {
  message: string;
  canRestore: boolean;
  saving: boolean;
  onRetry(): void;
  onRestore(): void;
}

function AssetUnavailable({ message, canRestore, saving, onRetry, onRestore }: AssetUnavailableProps) {
  return (
    <div className={styles.artifactUnavailable} role="alert">
      <FileWarning size={30} />
      <strong>Local file unavailable</strong>
      <span>{message || "Atria could not find this file in the current Workspace."}</span>
      <div>
        <button type="button" disabled={saving} onClick={onRetry}>
          <RefreshCw className={saving ? styles.spin : undefined} size={14} />
          Retry
        </button>
        {canRestore && (
          <button type="button" disabled={saving} onClick={onRestore}>
            <Save size={14} />
            Restore file
          </button>
        )}
      </div>
    </div>
  );
}

function assetMetadata(
  asset: WorkspaceAsset,
  metadata: LocalWorkspaceEntry | null,
  naturalSize: { width: number; height: number },
  dirty: boolean,
): string {
  const kind = asset.extension ? asset.extension.toUpperCase() : labelForKind(asset.kind);
  const size = formatBytes(metadata?.size ?? asset.size);
  const modified = metadata?.modified_ms
    ? formatDate(metadata.modified_ms)
    : asset.updatedAt
      ? formatDate(new Date(asset.updatedAt).getTime())
      : "";
  const dimensions = asset.kind === "image" && naturalSize.width
    ? `${naturalSize.width} x ${naturalSize.height}`
    : "";
  return [kind, dimensions, size, modified, dirty ? "Unsaved changes" : ""].filter(Boolean).join(" / ");
}

function labelForKind(kind: WorkspaceAsset["kind"]): string {
  if (kind === "image") return "Image";
  if (kind === "pdf") return "PDF";
  if (kind === "text") return "Text";
  if (kind === "document") return "Document";
  return "File";
}

function formatDate(value: number): string {
  if (!Number.isFinite(value)) return "";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(value);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function withReloadKey(url: string, key: number): string {
  if (!url) return "";
  return `${url}${url.includes("?") ? "&" : "?"}atriaReload=${key}`;
}

function readErrorMessage(reason: unknown): string {
  if (isMissingFile(reason)) return "This file is no longer available in the current Workspace.";
  return `Atria could not read this local file. ${messageFor(reason)}`;
}

function operationErrorMessage(operation: "save" | "restore" | "open", reason: unknown): string {
  const action = operation === "save" ? "save" : operation === "restore" ? "restore" : "open";
  return `Atria could not ${action} this file. ${messageFor(reason)}`;
}

function isMissingFile(reason: unknown): boolean {
  const message = messageFor(reason).toLowerCase();
  return message.includes("os error 2") || message.includes("not found") || message.includes("does not exist");
}

function messageFor(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
