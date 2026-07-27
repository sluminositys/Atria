import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  Copy,
  FolderOpen,
  FolderPlus,
  GitBranch,
  LoaderCircle,
  Trash2,
} from "lucide-react";
import { WorkspaceSnapshot } from "@atria/schema";
import {
  AgentBridgeInfo,
  createWorkspaceDirectory,
  getAgentBridgeInfo,
  getWorkspaceDirectoryStatus,
  getWorkspaceHistoryStatus,
  loadWorkspace,
  pickWorkspaceDirectory,
} from "../app/workspaceClient";
import { TreeOperationDialog } from "./TreeOperationDialog";
import {
  forgetRecentWorkspacePath,
  readRecentWorkspacePaths,
  rememberWorkspacePath,
  sameWorkspacePath,
  workspaceDisplayLabels,
  workspaceName,
} from "../app/workspacePreferences";
import styles from "../app/App.module.css";

interface WorkspaceSettingsViewProps {
  snapshot: WorkspaceSnapshot;
  onWorkspaceChangeRequested(snapshot: WorkspaceSnapshot): void;
}

export function WorkspaceSettingsView({ snapshot, onWorkspaceChangeRequested }: WorkspaceSettingsViewProps) {
  const currentPath = snapshot.settings.workspacePath;
  const [recentPaths, setRecentPaths] = useState(() => readRecentWorkspacePaths(currentPath));
  const [bridge, setBridge] = useState<AgentBridgeInfo>();
  const [gitStatus, setGitStatus] = useState<{ branch?: string; head?: string; initialized: boolean }>();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [recentStatus, setRecentStatus] = useState<Record<string, { exists: boolean; directory: boolean }>>({});
  const [newWorkspaceParent, setNewWorkspaceParent] = useState("");
  const [newWorkspaceBusy, setNewWorkspaceBusy] = useState(false);
  const [newWorkspaceError, setNewWorkspaceError] = useState("");
  const workspaceLabels = useMemo(() => workspaceDisplayLabels(recentPaths), [recentPaths]);

  useEffect(() => {
    setRecentPaths(rememberWorkspacePath(currentPath));
  }, [currentPath]);

  useEffect(() => {
    let active = true;
    void Promise.all(
      recentPaths.map(async (path) => {
        try {
          return [path, await getWorkspaceDirectoryStatus(path)] as const;
        } catch {
          return [path, { exists: false, directory: false }] as const;
        }
      }),
    ).then((entries) => {
      if (active) setRecentStatus(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [recentPaths]);

  useEffect(() => {
    let active = true;
    void getAgentBridgeInfo().then((value) => active && setBridge(value));
    void getWorkspaceHistoryStatus(currentPath).then((value) => active && setGitStatus(value));
    return () => {
      active = false;
    };
  }, [currentPath]);

  const mcpConfiguration = useMemo(
    () =>
      bridge
        ? JSON.stringify(
            {
              mcpServers: {
                atria: {
                  command: bridge.executablePath,
                  args: ["--workspace", currentPath],
                },
              },
            },
            null,
            2,
          )
        : "",
    [bridge, currentPath],
  );

  async function openWorkspace(nextPath: string) {
    const target = nextPath.trim();
    if (!target || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await loadWorkspace(target);
      setRecentPaths(rememberWorkspacePath(next.settings.workspacePath));
      onWorkspaceChangeRequested(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function browseWorkspace() {
    const selected = await pickWorkspaceDirectory(currentPath, "open");
    if (selected) await openWorkspace(selected);
  }

  async function beginCreateWorkspace() {
    if (busy || newWorkspaceBusy) return;
    setError("");
    const selected = await pickWorkspaceDirectory(currentPath, "create");
    if (!selected) return;
    setNewWorkspaceError("");
    setNewWorkspaceParent(selected);
  }

  async function createNewWorkspace(name: string) {
    if (!newWorkspaceParent || newWorkspaceBusy) return;
    setNewWorkspaceBusy(true);
    setNewWorkspaceError("");
    try {
      const path = await createWorkspaceDirectory(newWorkspaceParent, name);
      const next = await loadWorkspace(path);
      setRecentPaths(rememberWorkspacePath(next.settings.workspacePath));
      setNewWorkspaceParent("");
      onWorkspaceChangeRequested(next);
    } catch (cause) {
      setNewWorkspaceError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setNewWorkspaceBusy(false);
    }
  }

  function removeRecentWorkspace(path: string) {
    if (sameWorkspacePath(path, currentPath)) return;
    setRecentPaths(forgetRecentWorkspacePath(path, currentPath));
  }

  async function copyAgentConfiguration() {
    if (!mcpConfiguration) return;
    await navigator.clipboard.writeText(mcpConfiguration);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className={styles.settingsView}>
      <header className={styles.settingsHeader}>
        <div>
          <strong>Settings</strong>
          <span>Local workspace</span>
        </div>
      </header>

      <div className={styles.settingsBody}>
        <section className={styles.settingsSection}>
          <div className={styles.settingsSectionTitle}>
            <FolderOpen size={17} />
            <span>
              <strong>Workspace</strong>
              <small>{snapshot.title}</small>
            </span>
          </div>
          <div className={styles.settingsSectionContent}>
            <div className={styles.workspacePathControl}>
              <div className={styles.workspaceLocationLabel}>
                <FolderOpen size={16} />
                <span>
                  <strong>{workspaceName(currentPath)}</strong>
                  <small>Current workspace</small>
                </span>
              </div>
              <button
                type="button"
                disabled={busy || newWorkspaceBusy}
                onClick={() => void browseWorkspace()}
              >
                {busy ? <LoaderCircle className={styles.spin} size={15} /> : <FolderOpen size={15} />}
                <span>Open</span>
              </button>
              <button
                type="button"
                className={styles.settingsPrimaryButton}
                disabled={busy || newWorkspaceBusy}
                onClick={() => void beginCreateWorkspace()}
              >
                <FolderPlus size={15} />
                <span>New</span>
              </button>
            </div>
            {error && <div className={styles.settingsError}>{error}</div>}

            <div className={styles.recentWorkspaceList}>
              <span>Recent workspaces</span>
              {recentPaths.map((recentPath) => {
                const current = sameWorkspacePath(recentPath, currentPath);
                const status = recentStatus[recentPath];
                const unavailable = Boolean(status && (!status.exists || !status.directory));
                return (
                  <div
                    key={recentPath}
                    className={`${styles.recentWorkspaceRow} ${current ? styles.recentWorkspaceActive : ""}`}
                  >
                    <button
                      type="button"
                      className={styles.recentWorkspaceOpen}
                      disabled={current || busy || !status || unavailable}
                      onClick={() => void openWorkspace(recentPath)}
                    >
                      <FolderOpen size={14} />
                      <span>
                        <strong>{workspaceLabels.get(recentPath) ?? workspaceName(recentPath)}</strong>
                        <small>{current ? "Current" : unavailable ? "Unavailable" : status ? "Local workspace" : "Checking"}</small>
                      </span>
                      {current ? <Check size={14} /> : unavailable ? <AlertTriangle size={14} /> : status ? <ArrowRight size={14} /> : <LoaderCircle className={styles.spin} size={14} />}
                    </button>
                    {!current && (
                      <button
                        type="button"
                        className={styles.recentWorkspaceRemove}
                        aria-label={`Remove ${workspaceLabels.get(recentPath) ?? workspaceName(recentPath)} from recent workspaces`}
                        title="Remove from recent workspaces"
                        disabled={busy}
                        onClick={() => removeRecentWorkspace(recentPath)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className={styles.settingsSection}>
          <div className={styles.settingsSectionTitle}>
            <GitBranch size={17} />
            <span>
              <strong>Document history</strong>
              <small>{gitStatus?.initialized ? gitStatus.branch ?? "main" : "Unavailable"}</small>
            </span>
          </div>
          <div className={styles.settingsStatusRows}>
            <div>
              <span>Repository</span>
              <strong>{gitStatus?.initialized ? "Ready" : "Checking"}</strong>
            </div>
            <div>
              <span>Revision</span>
              <code>{gitStatus?.head?.slice(0, 10) ?? "No revisions"}</code>
            </div>
          </div>
        </section>

        <section className={styles.settingsSection}>
          <div className={styles.settingsSectionTitle}>
            <Bot size={17} />
            <span>
              <strong>Agent bridge</strong>
              <small>Native MCP</small>
            </span>
          </div>
          <div className={styles.agentBridgeSettings}>
            <div className={styles.agentBridgeStatus}>
              <span className={bridge?.available ? styles.statusDotReady : styles.statusDotIdle} />
              <strong>{bridge ? (bridge.available ? "Ready" : "Missing") : "Checking"}</strong>
            </div>
            <div className={styles.agentBridgePath}>
              <span>{bridge ? (bridge.available ? "Bundled with Atria" : "Not available") : "Checking"}</span>
              <button
                type="button"
                disabled={!bridge?.available}
                title="Copy MCP configuration"
                onClick={() => void copyAgentConfiguration()}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                <span>{copied ? "Copied" : "Copy config"}</span>
              </button>
            </div>
          </div>
        </section>
      </div>

      {newWorkspaceParent && (
        <TreeOperationDialog
          title="Create workspace"
          description={`Create a local Atria workspace inside ${workspaceName(newWorkspaceParent)}.`}
          confirmLabel="Create"
          initialValue="New Workspace"
          inputLabel="Workspace name"
          busy={newWorkspaceBusy}
          error={newWorkspaceError}
          onCancel={() => {
            if (newWorkspaceBusy) return;
            setNewWorkspaceParent("");
            setNewWorkspaceError("");
          }}
          onConfirm={(value) => void createNewWorkspace(value)}
        />
      )}
    </div>
  );
}
