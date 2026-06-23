import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Bot,
  CheckSquare,
  Code2,
  FileCode2,
  FileText,
  GitBranch,
  Hash,
  History as HistoryIcon,
  Image,
  Info,
  PanelTop,
  PenTool,
  Quote,
  Search,
  Settings,
  Sigma,
  Table2,
  Tags,
  FolderOpen,
} from "lucide-react";
import { AtriaBlockType, WorkspaceSnapshot } from "@atria/schema";
import { loadWorkspace, searchWorkspace } from "./workspaceClient";
import { ActiveTool, getActiveTab, useAtriaStore } from "./store";
import { FileTree } from "../components/FileTree";
import { WorkspaceSettingsView } from "../components/WorkspaceSettingsView";
import type { HistoryTarget } from "../components/DocumentHistoryView";
import styles from "./App.module.css";

const PageEditor = lazy(() => import("../components/PageEditor").then((module) => ({ default: module.PageEditor })));
const ArtifactPreview = lazy(() => import("../components/ArtifactPreview").then((module) => ({ default: module.ArtifactPreview })));
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
  { type: "timeline", label: "Timeline", icon: Hash },
  { type: "metric-card", label: "Metric", icon: Hash },
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
  } = useAtriaStore();

  useEffect(() => {
    if (query.data) setSnapshot(query.data);
  }, [query.data, setSnapshot]);

  const activeTab = getActiveTab({ activeTabKey, tabs });
  const activePage =
    activeTab?.type === "page" ? snapshot?.pages.find((page) => page.id === activeTab.id) : undefined;
  const activeArtifact =
    activeTab?.type === "artifact"
      ? snapshot?.artifacts.find((artifact) => artifact.id === activeTab.id)
      : undefined;
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
            <div key={tab.key} className={tab.key === activeTabKey ? styles.tabActive : styles.tab}>
              <button className={styles.tabLabel} onClick={() => openNode(tab.type, tab.id)}>
                <span>{tab.title}</span>
                <small>{tab.source === "ai" ? "AI" : "Human"}</small>
              </button>
              <button className={styles.tabClose} onClick={() => closeTab(tab.key)} title="Close">
                x
              </button>
            </div>
          ))}
        </div>

        <section className={styles.documentSurface}>
          <Suspense fallback={<div className={styles.viewLoading} aria-busy="true" />}>
            {activeTool === "settings" && snapshot ? (
              <WorkspaceSettingsView snapshot={snapshot} onLoaded={setSnapshot} />
            ) : activeTool === "history" && historyTarget && snapshot ? (
              <DocumentHistoryView
                snapshot={snapshot}
                target={historyTarget}
                onRestored={async () => setSnapshot(await loadWorkspace(snapshot.settings.workspacePath))}
              />
            ) : activePage ? (
              <PageEditor page={activePage} artifacts={snapshot?.artifacts ?? []} snapshot={snapshot} />
            ) : activeArtifact ? (
              <ArtifactPreview artifact={activeArtifact} snapshot={snapshot} />
            ) : (
              <div className={styles.emptyState}>No file selected</div>
            )}
          </Suspense>
        </section>

        <footer className={styles.statusBar}>
          <span>{activeTool === "settings" ? "Settings" : activeTool === "history" ? "History" : activeTab?.type === "artifact" ? "HTML" : activeTab?.type === "timeline" ? "Timeline" : "Document"}</span>
          <span>{activePage ? `${countCharacters(activePage)} characters` : activeArtifact?.updatedAt}</span>
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
    </div>
  );

  function renderSidePane(current: WorkspaceSnapshot) {
    if (activeTool === "files") {
      return (
        <>
          <div className={styles.sideTitle}>
            <strong>{current.title}</strong>
            <span>{current.settings.workspacePath}</span>
          </div>
          <FileTree snapshot={current} />
        </>
      );
    }

    if (activeTool === "search") {
      return <SearchPane />;
    }

    if (activeTool === "graph") {
      return <GraphPane snapshot={current} />;
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
            <small>{target.path}</small>
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
  const recent = snapshot?.settings.recentFiles ?? [];
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
  ];
  const contentMatches = new Map(
    (contentQuery.data ?? []).map((match) => [normalizeWorkspacePath(match.relativePath), match.snippet]),
  );
  const results = query
    ? allItems
        .map(({ type, item }) => {
          const filePath = item.filePath ?? "";
          const metadataMatches = [item.title, item.id, filePath, ...(item.tags ?? [])]
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
        <input value={filter} placeholder="Search" onChange={(event) => setFilter(event.target.value)} />
        {!query && recent.length > 0 && (
          <div className={styles.searchGroup}>
            {recent.map((item) => (
              <button key={`${item.type}:${item.id}`} onClick={() => openNode(item.type, item.id)}>
                <FileText size={14} />
                <strong>{item.title}</strong>
                <small>{item.type === "artifact" ? "HTML" : item.type}</small>
              </button>
            ))}
          </div>
        )}
        {query && <div className={styles.searchResults}>
          {results.map(({ type, item, snippet }) => (
            <button key={`${type}:${item.id}`} title={item.filePath} onClick={() => openNode(type, item.id)}>
              {type === "artifact" ? <FileCode2 size={14} /> : <FileText size={14} />}
              <strong>{item.title}</strong>
              <small>{snippet}</small>
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

function GraphPane({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const folders = snapshot.folders
    .map((folder) => {
      const prefix = folder.path ? `${folder.path}/` : "";
      const pages = snapshot.pages.filter((page) => page.filePath?.startsWith(prefix));
      const artifacts = snapshot.artifacts.filter((artifact) => artifact.filePath?.startsWith(prefix));
      return { folder, pages, artifacts };
    })
    .filter((item) => item.pages.length || item.artifacts.length)
    .slice(0, 30);

  return (
    <>
      <div className={styles.sideTitle}>
        <strong>Graph</strong>
        <span>{folders.length} linked folders</span>
      </div>
      <div className={styles.graphList}>
        {folders.map(({ folder, pages, artifacts }) => (
          <section key={folder.id}>
            <strong>{folder.path}</strong>
            {pages.map((page) => (
              <button key={page.id} onClick={() => useAtriaStore.getState().openNode("page", page.id)}>
                <FileText size={13} />
                <span>{page.title}</span>
              </button>
            ))}
            {artifacts.map((artifact) => (
              <button key={artifact.id} onClick={() => useAtriaStore.getState().openNode("artifact", artifact.id)}>
                <FileCode2 size={13} />
                <span>{artifact.title}</span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}

function TagsPane({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const tags = Array.from(
    [...snapshot.pages, ...snapshot.artifacts].reduce((map, item) => {
      for (const tag of item.tags ?? []) map.set(tag, (map.get(tag) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  ).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <>
      <div className={styles.sideTitle}>
        <strong>Tags</strong>
        <span>{tags.length} tags</span>
      </div>
      <div className={styles.tagList}>
        {tags.map(([tag, count]) => (
          <button
            key={tag}
            onClick={() => {
              useAtriaStore.getState().setFilter(tag);
              useAtriaStore.getState().setActiveTool("search");
            }}
          >
            <Hash size={13} />
            <span>{tag}</span>
            <small>{count}</small>
          </button>
        ))}
      </div>
    </>
  );
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
