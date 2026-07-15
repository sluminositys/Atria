import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  Check,
  ExternalLink,
  File,
  FileImage,
  FileText,
  LoaderCircle,
  Maximize2,
  RefreshCw,
  Save,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { WorkspaceAsset, WorkspaceSnapshot } from "@atria/schema";
import {
  checkpointWorkspacePaths,
  openWorkspaceFile,
  readWorkspaceTextFile,
  toWorkspaceFileAssetUrl,
  writeWorkspaceTextFile,
} from "../app/workspaceClient";
import styles from "../app/App.module.css";

const SourceEditor = lazy(() =>
  import("./editor/HtmlSourceEditor").then((module) => ({ default: module.HtmlSourceEditor })),
);

type AssetStatus = "loading" | "ready" | "saving" | "saved" | "error" | "conflict";

export function AssetPreview({ asset, snapshot }: { asset: WorkspaceAsset; snapshot: WorkspaceSnapshot }) {
  const rootPath = snapshot.settings.workspacePath;
  const [source, setSource] = useState("");
  const [baselineSource, setBaselineSource] = useState("");
  const [status, setStatus] = useState<AssetStatus>(asset.kind === "text" ? "loading" : "ready");
  const [message, setMessage] = useState("");
  const [zoom, setZoom] = useState(100);
  const [fitImage, setFitImage] = useState(true);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const dirty = asset.kind === "text" && source !== baselineSource;
  const assetUrl = toWorkspaceFileAssetUrl(snapshot, asset.filePath);

  const loadSource = useCallback(async () => {
    if (asset.kind !== "text") return;
    setStatus("loading");
    setMessage("");
    try {
      const nextSource = await readWorkspaceTextFile(rootPath, asset.filePath);
      setSource(nextSource);
      setBaselineSource(nextSource);
      setStatus("ready");
    } catch (reason) {
      setStatus("error");
      setMessage(messageFor(reason));
    }
  }, [asset.filePath, asset.kind, rootPath]);

  useEffect(() => {
    setZoom(100);
    setFitImage(true);
    setNaturalSize({ width: 0, height: 0 });
    setMessage("");
    if (asset.kind === "text") void loadSource();
    else setStatus("ready");
  }, [asset.id, asset.kind, loadSource]);

  async function saveSource() {
    if (!dirty || status === "saving") return;
    setStatus("saving");
    setMessage("");
    try {
      const diskSource = await readWorkspaceTextFile(rootPath, asset.filePath);
      if (diskSource !== baselineSource) {
        setStatus("conflict");
        setMessage("This file changed outside Atria. Reload it before applying your edits.");
        return;
      }
      await writeWorkspaceTextFile(rootPath, asset.filePath, source);
      await checkpointWorkspacePaths(rootPath, [asset.filePath], `Edit ${asset.title}`, {
        actorName: "Local user",
        transactionId: crypto.randomUUID(),
      });
      setBaselineSource(source);
      setStatus("saved");
      window.setTimeout(() => setStatus("ready"), 1200);
    } catch (reason) {
      setStatus("error");
      setMessage(messageFor(reason));
    }
  }

  async function openExternally() {
    setMessage("");
    try {
      await openWorkspaceFile(rootPath, asset.filePath);
    } catch (reason) {
      setStatus("error");
      setMessage(messageFor(reason));
    }
  }

  const IdentityIcon = asset.kind === "image" ? FileImage : asset.kind === "text" ? FileText : File;

  return (
    <article className={styles.artifactWorkspace}>
      <header className={styles.artifactToolbar}>
        <div className={styles.artifactIdentity}>
          <IdentityIcon size={17} />
          <span>
            <strong>{asset.title}</strong>
            <small>{asset.filePath}</small>
          </span>
        </div>
        <div className={styles.artifactControls}>
          {asset.kind === "text" && (
            <button
              className={styles.artifactActionButton}
              disabled={!dirty || status === "saving" || status === "loading"}
              onClick={() => void saveSource()}
            >
              {status === "saving" ? <LoaderCircle className={styles.spin} size={14} /> : status === "saved" ? <Check size={14} /> : <Save size={14} />}
              <span>{status === "saving" ? "Saving" : status === "saved" ? "Saved" : "Save"}</span>
            </button>
          )}
          {asset.kind === "image" && (
            <div className={styles.assetZoomControls} aria-label="Image zoom">
              <button title="Zoom out" onClick={() => { setFitImage(false); setZoom((value) => Math.max(25, value - 25)); }}>
                <ZoomOut size={14} />
              </button>
              <span>{fitImage ? "Fit" : `${zoom}%`}</span>
              <button title="Zoom in" onClick={() => { setFitImage(false); setZoom((value) => Math.min(400, value + 25)); }}>
                <ZoomIn size={14} />
              </button>
              <button className={fitImage ? styles.assetZoomActive : undefined} title="Fit image" onClick={() => setFitImage(true)}>
                <Maximize2 size={14} />
              </button>
            </div>
          )}
          {asset.kind === "text" && (
            <button
              className={styles.artifactIconButton}
              title="Reload from disk"
              disabled={dirty || status === "saving"}
              onClick={() => void loadSource()}
            >
              <RefreshCw size={15} />
            </button>
          )}
          <button className={styles.artifactActionButton} onClick={() => void openExternally()}>
            <ExternalLink size={14} />
            <span>Open</span>
          </button>
        </div>
      </header>

      <div className={styles.artifactContent}>
        {message && (
          <div className={status === "conflict" ? styles.artifactConflict : styles.artifactError} role="alert">
            <span>{message}</span>
            {asset.kind === "text" && <button onClick={() => void loadSource()}>Reload</button>}
          </div>
        )}
        <div className={styles.assetPreviewBody}>
          {asset.kind === "text" ? (
            status === "loading" ? (
              <div className={styles.artifactLoading}><LoaderCircle className={styles.spin} size={18} /></div>
            ) : (
              <div className={styles.artifactSourceEditor}>
                <Suspense fallback={<div className={styles.artifactLoading}><LoaderCircle className={styles.spin} size={18} /></div>}>
                  <SourceEditor
                    value={source}
                    language="text"
                    ariaLabel={`${asset.title} source`}
                    autoFocus
                    onChange={setSource}
                    onSave={() => void saveSource()}
                  />
                </Suspense>
              </div>
            )
          ) : asset.kind === "image" ? (
            <div className={styles.assetImageStage}>
              <img
                src={assetUrl}
                alt={asset.title}
                className={fitImage ? styles.assetImageFit : styles.assetImageActual}
                style={!fitImage && naturalSize.width ? { width: naturalSize.width * zoom / 100 } : undefined}
                onLoad={(event) => setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                onError={() => { setStatus("error"); setMessage("Atria could not load this image from the Workspace."); }}
              />
            </div>
          ) : asset.kind === "pdf" ? (
            <iframe className={styles.assetPdfFrame} src={assetUrl} title={asset.title} />
          ) : (
            <div className={styles.assetUnsupported}>
              <IdentityIcon size={34} />
              <strong>{asset.title}</strong>
              <span>{asset.extension ? asset.extension.toUpperCase() : "File"} · {formatBytes(asset.size)}</span>
              <button className={styles.artifactActionButton} onClick={() => void openExternally()}>
                <ExternalLink size={14} />
                <span>Open with the default app</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function messageFor(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
