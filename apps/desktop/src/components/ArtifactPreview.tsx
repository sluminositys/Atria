import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Check, Code2, Eye, FileCode2, LoaderCircle, RefreshCw, Save } from "lucide-react";
import type { Artifact, WorkspaceSnapshot } from "@atria/schema";
import {
  checkpointWorkspacePaths,
  readWorkspaceTextFile,
  toWorkspaceFileAssetUrl,
  writeWorkspaceTextFile,
} from "../app/workspaceClient";
import styles from "../app/App.module.css";

const HtmlSourceEditor = lazy(() =>
  import("./editor/HtmlSourceEditor").then((module) => ({ default: module.HtmlSourceEditor })),
);

interface ArtifactPreviewProps {
  artifact: Artifact;
  snapshot?: WorkspaceSnapshot;
}

type ArtifactMode = "preview" | "source";
type ArtifactStatus = "loading" | "ready" | "dirty" | "saving" | "saved" | "error" | "conflict";

export function ArtifactPreview({ artifact, snapshot }: ArtifactPreviewProps) {
  const rootPath = snapshot?.settings.workspacePath ?? "";
  const relativePath = artifact.filePath ?? "";
  const src = toWorkspaceFileAssetUrl(snapshot, artifact.entryUrl || artifact.filePath);
  const [mode, setMode] = useState<ArtifactMode>("preview");
  const [source, setSource] = useState("");
  const [baselineSource, setBaselineSource] = useState("");
  const [status, setStatus] = useState<ArtifactStatus>("loading");
  const [message, setMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(true);
  const dirty = source !== baselineSource;

  const loadSource = useCallback(async () => {
    if (!rootPath || !relativePath) {
      setStatus("error");
      setMessage("This HTML Artifact is not attached to a Workspace file.");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const next = await readWorkspaceTextFile(rootPath, relativePath);
      setSource(next);
      setBaselineSource(next);
      setStatus("ready");
    } catch (reason) {
      setStatus("error");
      setMessage(messageFor(reason));
    }
  }, [relativePath, rootPath]);

  useEffect(() => {
    setMode("preview");
    setReloadKey(0);
    setPreviewLoading(true);
    void loadSource();
  }, [artifact.id, loadSource]);

  useEffect(() => {
    if (status === "ready" || status === "dirty") {
      setStatus(dirty ? "dirty" : "ready");
    }
  }, [dirty, status]);

  async function saveSource(): Promise<boolean> {
    if (!dirty || status === "saving") return !dirty;
    setStatus("saving");
    setMessage("");
    try {
      const currentDiskSource = await readWorkspaceTextFile(rootPath, relativePath);
      if (currentDiskSource !== baselineSource) {
        setStatus("conflict");
        setMessage("The file changed outside Atria. Reload it before applying your edits.");
        return false;
      }
      await writeWorkspaceTextFile(rootPath, relativePath, source);
      await checkpointWorkspacePaths(rootPath, [relativePath], `Edit ${artifact.title}`, {
        actorName: "Local user",
        transactionId: crypto.randomUUID(),
      });
      setBaselineSource(source);
      setStatus("saved");
      setReloadKey((value) => value + 1);
      setPreviewLoading(true);
      window.setTimeout(() => setStatus("ready"), 1200);
      return true;
    } catch (reason) {
      setStatus("error");
      setMessage(messageFor(reason));
      return false;
    }
  }

  async function selectMode(nextMode: ArtifactMode) {
    if (nextMode === mode) return;
    if (nextMode === "preview" && dirty && !(await saveSource())) return;
    setMode(nextMode);
  }

  async function reloadSource(force = false) {
    if ((!force && dirty) || status === "saving") return;
    await loadSource();
    setReloadKey((value) => value + 1);
    setPreviewLoading(true);
  }

  return (
    <article className={styles.artifactWorkspace}>
      <header className={styles.artifactToolbar}>
        <div className={styles.artifactIdentity}>
          <FileCode2 size={17} />
          <span>
            <strong>{artifact.title}</strong>
            <small>{relativePath}</small>
          </span>
        </div>
        <div className={styles.artifactControls}>
          <div className={styles.segmentedControl} aria-label="HTML Artifact view">
            <button
              className={mode === "preview" ? styles.segmentedControlActive : undefined}
              aria-pressed={mode === "preview"}
              onClick={() => void selectMode("preview")}
            >
              <Eye size={14} />
              <span>Preview</span>
            </button>
            <button
              className={mode === "source" ? styles.segmentedControlActive : undefined}
              aria-pressed={mode === "source"}
              onClick={() => void selectMode("source")}
            >
              <Code2 size={14} />
              <span>Source</span>
            </button>
          </div>
          {mode === "source" && (
            <button
              className={styles.artifactActionButton}
              disabled={!dirty || status === "saving" || status === "loading"}
              onClick={() => void saveSource()}
            >
              {status === "saving" ? <LoaderCircle className={styles.spin} size={14} /> : status === "saved" ? <Check size={14} /> : <Save size={14} />}
              <span>{status === "saving" ? "Saving" : status === "saved" ? "Saved" : "Save"}</span>
            </button>
          )}
          <button
            className={styles.artifactIconButton}
            title="Reload from disk"
            aria-label="Reload from disk"
            disabled={dirty || status === "saving"}
            onClick={() => void reloadSource()}
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      <div className={styles.artifactContent}>
        {message && (
          <div className={status === "conflict" ? styles.artifactConflict : styles.artifactError} role="alert">
            <span>{message}</span>
            <button onClick={() => void reloadSource(true)}>Reload</button>
          </div>
        )}

        <div className={styles.artifactBody}>
          {mode === "preview" ? (
            <div className={styles.artifactPreviewFrame} data-loading={previewLoading ? "true" : "false"}>
              {previewLoading && <LoaderCircle className={styles.artifactPreviewSpinner} size={20} />}
              <iframe
                key={reloadKey}
                src={src}
                title={artifact.title}
                sandbox="allow-scripts allow-forms allow-popups allow-downloads"
                onLoad={() => setPreviewLoading(false)}
              />
            </div>
          ) : status === "loading" ? (
            <div className={styles.artifactLoading}><LoaderCircle className={styles.spin} size={18} /></div>
          ) : (
            <div className={styles.artifactSourceEditor}>
              <Suspense fallback={<div className={styles.artifactLoading}><LoaderCircle className={styles.spin} size={18} /></div>}>
                <HtmlSourceEditor
                  value={source}
                  ariaLabel={`${artifact.title} HTML source`}
                  autoFocus
                  onChange={setSource}
                  onSave={() => void saveSource()}
                />
              </Suspense>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function messageFor(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
