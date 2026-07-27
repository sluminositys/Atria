import { useEffect, useMemo, useState } from "react";
import { Bot, Check, Copy, FolderOpen, GitBranch, LoaderCircle } from "lucide-react";
import { WorkspaceSnapshot } from "@atria/schema";
import {
  AgentBridgeInfo,
  getAgentBridgeInfo,
  getWorkspaceHistoryStatus,
  loadWorkspace,
  pickWorkspaceDirectory,
} from "../app/workspaceClient";
import styles from "../app/App.module.css";

const RECENT_WORKSPACES_KEY = "atria:recent-workspaces";

interface WorkspaceSettingsViewProps {
  snapshot: WorkspaceSnapshot;
  onWorkspaceChangeRequested(snapshot: WorkspaceSnapshot): void;
}

export function WorkspaceSettingsView({ snapshot, onWorkspaceChangeRequested }: WorkspaceSettingsViewProps) {
  const currentPath = snapshot.settings.workspacePath;
  const [recentPaths, setRecentPaths] = useState(() => readRecentWorkspaces(currentPath));
  const [bridge, setBridge] = useState<AgentBridgeInfo>();
  const [gitStatus, setGitStatus] = useState<{ branch?: string; head?: string; initialized: boolean }>();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setRecentPaths(rememberWorkspace(currentPath));
  }, [currentPath]);

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
      setRecentPaths(rememberWorkspace(next.settings.workspacePath));
      onWorkspaceChangeRequested(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function browseWorkspace() {
    const selected = await pickWorkspaceDirectory(currentPath);
    if (selected) await openWorkspace(selected);
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
                <span>{workspaceName(currentPath)}</span>
              </div>
              <button
                type="button"
                className={styles.settingsPrimaryButton}
                disabled={busy}
                onClick={() => void browseWorkspace()}
              >
                {busy ? <LoaderCircle className={styles.spin} size={15} /> : "Change"}
              </button>
            </div>
            {error && <div className={styles.settingsError}>{error}</div>}

            <div className={styles.recentWorkspaceList}>
              <span>Recent workspaces</span>
              {recentPaths.map((recentPath) => (
                <button
                  type="button"
                  key={recentPath}
                  className={samePath(recentPath, currentPath) ? styles.recentWorkspaceActive : undefined}
                  onClick={() => void openWorkspace(recentPath)}
                >
                  <FolderOpen size={14} />
                  <span>{workspaceName(recentPath)}</span>
                  {samePath(recentPath, currentPath) && <Check size={14} />}
                </button>
              ))}
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
    </div>
  );
}

function readRecentWorkspaces(currentPath: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_WORKSPACES_KEY) ?? "[]") as unknown;
    const stored = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    return uniquePaths([currentPath, ...stored]).slice(0, 8);
  } catch {
    return currentPath ? [currentPath] : [];
  }
}

function rememberWorkspace(path: string): string[] {
  const recent = uniquePaths([path, ...readRecentWorkspaces(path)]).slice(0, 8);
  localStorage.setItem(RECENT_WORKSPACES_KEY, JSON.stringify(recent));
  return recent;
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  return paths.filter((path) => {
    const key = path.trim().replace(/[\\/]+$/, "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function samePath(left: string, right: string): boolean {
  return left.replace(/[\\/]+$/, "").toLowerCase() === right.replace(/[\\/]+$/, "").toLowerCase();
}

function workspaceName(path: string): string {
  const normalized = path.trim().replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]/).pop() || "Local workspace";
}
