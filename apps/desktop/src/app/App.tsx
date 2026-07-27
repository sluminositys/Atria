import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import {
  Box,
  AlertCircle,
  Bot,
  Check,
  CheckSquare,
  Clock3,
  Code2,
  FileCode2,
  FileText,
  GitBranch,
  History as HistoryIcon,
  Image,
  Info,
  LoaderCircle,
  PanelTop,
  PenTool,
  Quote,
  Search,
  Settings,
  Sigma,
  Table2,
  Tags,
  FolderOpen,
  Gauge,
  X,
} from "lucide-react";
import { AtriaBlockType, WorkspaceSnapshot } from "@atria/schema";
import { loadWorkspace, quitApplication, searchWorkspace } from "./workspaceClient";
import { ActiveTool, getActiveTab, useAtriaStore } from "./store";
import { existingRecentFiles, relativeTimeLabel } from "./workspaceNavigation";
import { FileTree } from "../components/FileTree";
import { DocumentGraphPane } from "../components/DocumentGraphPane";
import { TagsPane } from "../components/TagsPane";
import { WorkspaceSettingsView } from "../components/WorkspaceSettingsView";
import type { HistoryTarget } from "../components/DocumentHistoryView";
import { UnsavedChangesDialog } from "../components/UnsavedChangesDialog";
import { UnsavedWorkspaceDialog } from "../components/UnsavedWorkspaceDialog";
import styles from "./App.module.css";

type PendingWorkspaceAction =
  | { intent: "switch"; snapshot: WorkspaceSnapshot }
  | { intent: "close" | "quit" };

const PageEditor = lazy(() => import("../components/PageEditor").then((module) => ({ default: module.PageEditor })));
const ArtifactPreview = lazy(() => import("../components/ArtifactPreview").then((module) => ({ default: module.ArtifactPreview })));
const AssetPreview = lazy(() => import("../components/AssetPreview").then((module) => ({ default: module.AssetPreview })));
const DocumentHistoryView = lazy(() => import("../components/DocumentHistoryView").then((module) => ({ default: module.DocumentHistoryView })));

const railItems: Array<{ tool: ActiveTool; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { tool: "files", label: "Files", icon: FileText },
  { tool: "search", label: "Search", icon: Search },
  { tool: "graph", label: "Graph", icon: GitBranch },
  { tool: "tags", label: "Tags", icon: Tags },
  { tool: "history", label: "History", icon: HistoryIcon },
];

const blockPalette: Array<{
  type: AtriaBlockType | "drawing";
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { type: "callout", label: "Callout", icon: Info },
  { type: "card", label: "Card", icon: PanelTop },
  { type: "todo", label: "Todo list", icon: CheckSquare },
  { type: "code", label: "Code", icon: Code2 },
  { type: "image", label: "Image", icon: Image },
  { type: "artifact", label: "Artifact", icon: Box },
  { type: "quote", label: "Quote", icon: Quote },
  { type: "table", label: "Table", icon: Table2 },
  { type: "mermaid", label: "Mermaid", icon: GitBranch },
  { type: "latex", label: "LaTeX", icon: Sigma },
  { type: "custom-html", label: "HTML", icon: Code2 },
  { type: "drawing", label: "Drawing", icon: PenTool },
  { type: "metric-card", label: "Metric", icon: Gauge },
  { type: "timeline", label: "Timeline", icon: Clock3 },
];

export function App() {
  const query = useQuery({
    queryKey: ["workspace"],
    queryFn: () => loadWorkspace(),
  });
  const {
    activeTool,
    activeTabKey,
    tabs,
    snapshot,
    setSnapshot,
    setActiveTool,
    closeTab,
    openNode,
    saveStatus,
    saveError,
    retrySave,
    saveSourceDraft,
    clearSourceDraft,
  } = useAtriaStore();
  const [pendingCloseKey, setPendingCloseKey] = useState("");
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeError, setCloseError] = useState("");
  const [pendingWorkspaceAction, setPendingWorkspaceAction] = useState<PendingWorkspaceAction>();
  const [workspaceActionBusy, setWorkspaceActionBusy] = useState(false);
  const [workspaceActionError, setWorkspaceActionError] = useState("");
  const allowNativeCloseRef = useRef(false);

  const requestCloseTab = useCallback((key: string) => {
    const tab = useAtriaStore.getState().tabs.find((item) => item.key === key);
    if (!tab) return;
    if (!tab.dirty) {
      closeTab(key);
      return;
    }
    setCloseError("");
    setCloseBusy(false);
    setPendingCloseKey(key);
  }, [closeTab]);

  useEffect(() => {
    if (query.data) setSnapshot(query.data);
  }, [query.data, setSnapshot]);

  const requestWorkspaceChange = useCallback((nextSnapshot: WorkspaceSnapshot) => {
    const state = useAtriaStore.getState();
    if (sameWorkspacePath(state.snapshot?.settings.workspacePath, nextSnapshot.settings.workspacePath)) {
      setSnapshot(nextSnapshot);
      return;
    }
    if (!state.tabs.some((tab) => tab.dirty)) {
      setSnapshot(nextSnapshot);
      return;
    }
    setPendingCloseKey("");
    setCloseError("");
    setWorkspaceActionBusy(false);
    setWorkspaceActionError("");
    setPendingWorkspaceAction({ intent: "switch", snapshot: nextSnapshot });
  }, [setSnapshot]);

  const requestTrayQuit = useCallback(() => {
    const dirtyTabs = useAtriaStore.getState().tabs.filter((tab) => tab.dirty);
    if (!dirtyTabs.length) {
      void quitApplication();
      return;
    }
    setPendingCloseKey("");
    setCloseError("");
    setWorkspaceActionBusy(false);
    setWorkspaceActionError("");
    setPendingWorkspaceAction({ intent: "quit" });
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void listen("atria://quit-requested", requestTrayQuit).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [requestTrayQuit]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void getCurrentWindow().onCloseRequested((event) => {
      if (allowNativeCloseRef.current) return;
      const dirtyTabs = useAtriaStore.getState().tabs.filter((tab) => tab.dirty);
      if (!dirtyTabs.length) return;
      event.preventDefault();
      setPendingCloseKey("");
      setCloseError("");
      setWorkspaceActionBusy(false);
      setWorkspaceActionError("");
      setPendingWorkspaceAction({ intent: "close" });
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    function handleTabShortcuts(event: KeyboardEvent) {
      if (!event.ctrlKey || event.altKey || !tabs.length) return;
      if (event.key.toLowerCase() === "w") {
        event.preventDefault();
        if (activeTabKey) requestCloseTab(activeTabKey);
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        const index = Math.max(0, tabs.findIndex((tab) => tab.key === activeTabKey));
        const offset = event.shiftKey ? -1 : 1;
        const next = tabs[(index + offset + tabs.length) % tabs.length];
        if (next) openNode(next.type, next.id);
        return;
      }
      const numeric = Number(event.key);
      if (numeric >= 1 && numeric <= 9) {
        const next = tabs[Math.min(numeric - 1, tabs.length - 1)];
        if (next) {
          event.preventDefault();
          openNode(next.type, next.id);
        }
      }
    }
    window.addEventListener("keydown", handleTabShortcuts);
    return () => window.removeEventListener("keydown", handleTabShortcuts);
  }, [activeTabKey, openNode, requestCloseTab, tabs]);

  const activeTab = getActiveTab({ activeTabKey, tabs });
  const activePage =
    activeTab?.type === "page" ? snapshot?.pages.find((page) => page.id === activeTab.id) : undefined;
  const activeArtifact =
    activeTab?.type === "artifact"
      ? snapshot?.artifacts.find((artifact) => artifact.id === activeTab.id)
      : undefined;
  const activeAsset =
    activeTab?.type === "asset" ? snapshot?.assets.find((asset) => asset.id === activeTab.id) : undefined;
  const pendingCloseTab = tabs.find((tab) => tab.key === pendingCloseKey);
  const historyTarget: HistoryTarget | undefined = activePage?.filePath
    ? {
        id: activePage.id,
        title: activePage.title,
        path: activePage.filePath,
        kind: "rich-document",
      }
    : activeArtifact?.filePath
      ? {
          id: activeArtifact.id,
          title: activeArtifact.title,
          path: activeArtifact.filePath,
          kind: "html-artifact",
        }
      : undefined;

  return (
    <div className={styles.shell}>
      <aside className={styles.rail}>
        <div className={styles.railTop}>
          {railItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.tool}
                className={activeTool === item.tool ? styles.railButtonActive : styles.railButton}
                title={item.label}
                onClick={() => setActiveTool(item.tool)}
              >
                <Icon size={18} />
              </button>
            );
          })}
        </div>
        <div className={styles.railBottom}>
          <button
            className={activeTool === "settings" ? styles.railButtonActive : styles.railButton}
            title="Settings"
            onClick={() => setActiveTool("settings")}
          >
            <Settings size={18} />
          </button>
        </div>
      </aside>

      <aside className={styles.sidePane}>
        {snapshot ? renderSidePane(snapshot) : (
          <div className={styles.sideTitle}>
            <strong>Atria</strong>
            <span>{query.isLoading ? "Loading" : "No workspace"}</span>
          </div>
        )}
      </aside>

      <main className={styles.mainPane}>
        <div className={styles.tabs}>
          {tabs.map((tab) => (
            <div
              key={tab.key}
              className={tab.key === activeTabKey ? styles.tabActive : styles.tab}
              onAuxClick={(event) => {
                if (event.button === 1) requestCloseTab(tab.key);
              }}
            >
              <button className={styles.tabLabel} onClick={() => openNode(tab.type, tab.id)}>
                <span>{tab.title}</span>
                {tab.dirty && (
                  <i
                    className={styles.tabDirtyIndicator}
                    data-dirty="true"
                    aria-label="Unsaved changes"
                    title="Unsaved changes"
                  />
                )}
              </button>
              <button className={styles.tabClose} onClick={() => requestCloseTab(tab.key)} aria-label={`Close ${tab.title}`} title="Close">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        <section className={styles.documentSurface}>
          <Suspense fallback={<div className={styles.viewLoading} aria-busy="true" />}>
            {activeTool === "settings" && snapshot ? (
              <WorkspaceSettingsView snapshot={snapshot} onWorkspaceChangeRequested={requestWorkspaceChange} />
            ) : activeTool === "history" && historyTarget && snapshot ? (
              <DocumentHistoryView
                snapshot={snapshot}
                target={historyTarget}
                onRestored={async () => setSnapshot(await loadWorkspace(snapshot.settings.workspacePath))}
              />
            ) : activePage ? (
              <PageEditor key={activePage.id} page={activePage} artifacts={snapshot?.artifacts ?? []} snapshot={snapshot} />
            ) : activeArtifact ? (
              <ArtifactPreview artifact={activeArtifact} snapshot={snapshot} />
            ) : activeAsset && snapshot ? (
              <AssetPreview asset={activeAsset} snapshot={snapshot} />
            ) : (
              <div className={styles.emptyState}>No file selected</div>
            )}
          </Suspense>
        </section>

        <footer className={styles.statusBar}>
          {saveStatus === "error" ? (
            <button
              type="button"
              className={styles.saveStatusError}
              title={`${saveError || "Workspace save failed"}. Click to retry.`}
              onClick={retrySave}
            >
              <AlertCircle size={12} />
              <span>Save failed</span>
            </button>
          ) : (
            <div className={styles.saveStatus} role="status" aria-live="polite">
              {saveStatus === "saving" ? <LoaderCircle className={styles.spin} size={12} /> : <Check size={12} />}
              <span>{saveStatus === "saving" ? "Saving" : "Saved"}</span>
            </div>
          )}
          <span>{activeTool === "settings" ? "Settings" : activeTool === "history" ? "History" : activeTab?.type === "artifact" ? "HTML" : activeTab?.type === "asset" && activeAsset ? assetKindLabel(activeAsset.kind) : activeTab?.type === "timeline" ? "Timeline" : "Document"}</span>
          <span>{activePage ? `${countCharacters(activePage)} characters` : formatTimestamp(activeArtifact?.updatedAt ?? activeAsset?.updatedAt)}</span>
          <span>{snapshot?.title}</span>
        </footer>
      </main>

      <aside className={styles.blockBar}>
        <div className={styles.blockList} aria-label="Insert content">
          {activeTab?.type === "page" && activeTool !== "history" && activeTool !== "settings" && blockPalette.map((block) => {
            const Icon = block.icon;
            return (
              <button
                key={block.type}
                className={styles.blockButton}
                title={block.label}
                onClick={() => dispatchInsert(block.type)}
              >
                <Icon size={17} />
              </button>
            );
          })}
        </div>
      </aside>

      {pendingCloseTab && (
        <UnsavedChangesDialog
          tab={pendingCloseTab}
          busy={closeBusy}
          error={closeError}
          onCancel={() => {
            if (closeBusy) return;
            setPendingCloseKey("");
            setCloseError("");
          }}
          onDiscard={() => {
            if (closeBusy) return;
            const key = pendingCloseTab.key;
            setPendingCloseKey("");
            setCloseError("");
            closeTab(key);
          }}
          onSave={() => void saveAndClose(pendingCloseTab.key)}
        />
      )}
      {pendingWorkspaceAction && (
        <UnsavedWorkspaceDialog
          tabs={tabs.filter((tab) => tab.dirty)}
          intent={pendingWorkspaceAction.intent}
          busy={workspaceActionBusy}
          error={workspaceActionError}
          onCancel={() => {
            if (workspaceActionBusy) return;
            setPendingWorkspaceAction(undefined);
            setWorkspaceActionError("");
          }}
          onDiscardAll={() => void discardAllAndContinue()}
          onSaveAll={() => void saveAllAndContinue()}
        />
      )}
    </div>
  );

  async function saveAndClose(key: string) {
    if (closeBusy) return;
    setCloseBusy(true);
    setCloseError("");
    const result = await saveSourceDraft(key);
    if (result.status === "saved" && !useAtriaStore.getState().tabs.find((tab) => tab.key === key)?.dirty) {
      setPendingCloseKey("");
      setCloseBusy(false);
      closeTab(key);
      return;
    }
    setCloseBusy(false);
    setCloseError(result.status === "saved" ? "The draft changed while it was being saved. Save it again to close." : result.message);
  }

  async function saveAllAndContinue() {
    if (workspaceActionBusy || !pendingWorkspaceAction) return;
    setWorkspaceActionBusy(true);
    setWorkspaceActionError("");
    const dirtyTabs = useAtriaStore.getState().tabs.filter((tab) => tab.dirty);
    for (const tab of dirtyTabs) {
      const result = await saveSourceDraft(tab.key);
      if (result.status !== "saved") {
        setWorkspaceActionBusy(false);
        setWorkspaceActionError(`Could not save ${tab.title}. ${result.message}`);
        return;
      }
    }
    const remaining = useAtriaStore.getState().tabs.filter((tab) => tab.dirty);
    if (remaining.length) {
      setWorkspaceActionBusy(false);
      setWorkspaceActionError("Some files changed while they were being saved. Save all again to continue.");
      return;
    }
    await continueWorkspaceAction();
  }

  async function discardAllAndContinue() {
    if (workspaceActionBusy || !pendingWorkspaceAction) return;
    setWorkspaceActionBusy(true);
    setWorkspaceActionError("");
    useAtriaStore.getState().tabs.filter((tab) => tab.dirty).forEach((tab) => clearSourceDraft(tab.key));
    await continueWorkspaceAction();
  }

  async function continueWorkspaceAction() {
    const action = pendingWorkspaceAction;
    if (!action) return;
    if (action.intent === "switch") {
      setSnapshot(action.snapshot);
      setPendingWorkspaceAction(undefined);
      setWorkspaceActionBusy(false);
      return;
    }
    if (action.intent === "quit") {
      await quitApplication();
      return;
    }
    allowNativeCloseRef.current = true;
    await getCurrentWindow().close();
  }

  function renderSidePane(current: WorkspaceSnapshot) {
    if (activeTool === "files") {
      return (
        <>
          <div className={styles.sideTitle}>
            <strong>{current.title}</strong>
            <span>
              {current.pages.length + current.artifacts.length + current.assets.length}{" "}
              {current.pages.length + current.artifacts.length + current.assets.length === 1 ? "file" : "files"}
            </span>
          </div>
          <FileTree snapshot={current} />
        </>
      );
    }

    if (activeTool === "search") {
      return <SearchPane />;
    }

    if (activeTool === "graph") {
      return <DocumentGraphPane snapshot={current} />;
    }

    if (activeTool === "tags") {
      return <TagsPane snapshot={current} />;
    }

    if (activeTool === "history") {
      return <HistoryPane target={historyTarget} />;
    }

    return <SettingsPane snapshot={current} />;
  }
}

function HistoryPane({ target }: { target?: HistoryTarget }) {
  return (
    <>
      <div className={styles.sideTitle}>
        <strong>History</strong>
        <span>{target ? target.title : "No document selected"}</span>
      </div>
      {target && (
        <div className={styles.historySideSummary}>
          <HistoryIcon size={16} />
          <span>
            <strong>{target.title}</strong>
            <small>{target.kind === "html-artifact" ? "HTML result history" : "Document history"}</small>
          </span>
        </div>
      )}
    </>
  );
}

function SearchPane() {
  const { snapshot, filter, setFilter, openNode } = useAtriaStore();
  const [settledQuery, setSettledQuery] = useState("");
  const pages = snapshot?.pages ?? [];
  const artifacts = snapshot?.artifacts ?? [];
  const assets = snapshot?.assets ?? [];
  const recent = snapshot ? existingRecentFiles(snapshot) : [];
  const query = filter.trim().toLowerCase();

  useEffect(() => {
    const timer = window.setTimeout(() => setSettledQuery(query), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  const contentQuery = useQuery({
    queryKey: ["workspace-search", snapshot?.settings.workspacePath, settledQuery],
    queryFn: () => searchWorkspace(snapshot!.settings.workspacePath, settledQuery),
    enabled: Boolean(snapshot?.settings.workspacePath && settledQuery),
  });
  const allItems = [
    ...pages.map((item) => ({ type: "page" as const, item })),
    ...artifacts.map((item) => ({ type: "artifact" as const, item })),
    ...assets.map((item) => ({ type: "asset" as const, item })),
  ];
  const contentMatches = new Map(
    (contentQuery.data ?? []).map((match) => [normalizeWorkspacePath(match.relativePath), match.snippet]),
  );
  const results = query
    ? allItems
        .map(({ type, item }) => {
          const filePath = item.filePath ?? "";
          const metadataMatches = [item.title, item.id, filePath, ...("tags" in item ? item.tags ?? [] : [])]
            .join(" ")
            .toLowerCase()
            .includes(query);
          const snippet = contentMatches.get(normalizeWorkspacePath(filePath));
          return metadataMatches || snippet ? { type, item, snippet: snippet ?? filePath } : null;
        })
        .filter((result): result is NonNullable<typeof result> => Boolean(result))
    : [];

  return (
    <>
      <div className={styles.sideTitle}>
        <strong>Search</strong>
        <span>{query ? (contentQuery.isFetching ? "Searching" : `${results.length} results`) : `${recent.length} recent`}</span>
      </div>
      <div className={styles.searchPane}>
        <label className={styles.searchInput}>
          <Search size={15} />
          <input
            value={filter}
            aria-label="Search workspace"
            placeholder="Search workspace"
            onChange={(event) => setFilter(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && results[0]) openNode(results[0].type, results[0].item.id);
            }}
          />
          {filter && (
            <button type="button" title="Clear search" onClick={() => setFilter("")}>
              <X size={14} />
            </button>
          )}
        </label>
        {!query && recent.length > 0 && (
          <div className={styles.searchGroup}>
            <div className={styles.searchGroupLabel}>Recent</div>
            {recent.map((item) => {
              const asset = item.type === "asset" ? assets.find((entry) => entry.id === item.id) : undefined;
              return (
                <button key={`${item.type}:${item.id}`} onClick={() => openNode(item.type, item.id)}>
                  {item.type === "artifact" ? <FileCode2 size={14} /> : asset?.kind === "image" ? <Image size={14} /> : <FileText size={14} />}
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.type === "artifact" ? "HTML Artifact" : asset ? assetKindLabel(asset.kind) : "Document"}</small>
                  </span>
                  <time>{relativeTimeLabel(item.openedAt)}</time>
                </button>
              );
            })}
          </div>
        )}
        {query && <div className={styles.searchResults}>
          <div className={styles.searchGroupLabel}>
            <span>Results</span>
            {contentQuery.isFetching && <LoaderCircle className={styles.spin} size={13} />}
          </div>
          {results.map(({ type, item, snippet }) => (
            <button key={`${type}:${item.id}`} title={item.filePath} onClick={() => openNode(type, item.id)}>
              {type === "artifact" ? <FileCode2 size={14} /> : type === "asset" && item.kind === "image" ? <Image size={14} /> : <FileText size={14} />}
              <span>
                <strong>{item.title}</strong>
                <small>{item.filePath}</small>
                <p>{snippet}</p>
              </span>
            </button>
          ))}
          {!contentQuery.isFetching && results.length === 0 && <div className={styles.searchEmpty}>No matches</div>}
        </div>}
      </div>
    </>
  );
}

function normalizeWorkspacePath(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

function sameWorkspacePath(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return left === right;
  return left.trim().replace(/[\\/]+$/, "").toLowerCase() === right.trim().replace(/[\\/]+$/, "").toLowerCase();
}

function SettingsPane({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  return (
    <>
      <div className={styles.sideTitle}>
        <strong>Settings</strong>
        <span>Local</span>
      </div>
      <div className={styles.settingsNav}>
        <div>
          <FolderOpen size={15} />
          <span><strong>Workspace</strong><small>{snapshot.title}</small></span>
        </div>
        <div>
          <GitBranch size={15} />
          <span><strong>History</strong><small>Embedded Git</small></span>
        </div>
        <div>
          <Bot size={15} />
          <span><strong>Agent bridge</strong><small>Native MCP</small></span>
        </div>
      </div>
    </>
  );
}

function dispatchInsert(type: AtriaBlockType | "drawing"): void {
  window.dispatchEvent(new CustomEvent("atria:insert-node", { detail: { type } }));
}

function countCharacters(page: { title: string; body?: string; content?: unknown; blocks: Array<Record<string, unknown>> }): number {
  return `${page.title}${extractDocumentText(page.content)}${page.body ?? ""}`.replace(/<[^>]*>/g, "").length;
}

function extractDocumentText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const record = node as { text?: unknown; content?: unknown };
  const text = typeof record.text === "string" ? record.text : "";
  const children = Array.isArray(record.content) ? record.content.map(extractDocumentText).join("") : "";
  return text + children;
}

function assetKindLabel(kind: "image" | "pdf" | "text" | "document" | "other"): string {
  if (kind === "pdf") return "PDF";
  return `${kind[0]?.toUpperCase() ?? ""}${kind.slice(1)} file`;
}

function formatTimestamp(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
