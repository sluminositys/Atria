import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Blocks,
  Box,
  CheckSquare,
  Code2,
  FileCode2,
  FileText,
  GitBranch,
  Hash,
  Heading1,
  Image,
  Info,
  Minus,
  PanelTop,
  Pilcrow,
  Quote,
  Search,
  Settings,
  Sigma,
  Square,
  Table2,
  Tags,
} from "lucide-react";
import { AtriaBlockType, WorkspaceSnapshot } from "@atria/schema";
import { loadWorkspace } from "./workspaceClient";
import { ActiveTool, getActiveTab, useAtriaStore } from "./store";
import { FileTree } from "../components/FileTree";
import { PageEditor } from "../components/PageEditor";
import { ArtifactPreview } from "../components/ArtifactPreview";
import styles from "./App.module.css";

const railItems: Array<{ tool: ActiveTool; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { tool: "files", label: "Files", icon: FileText },
  { tool: "search", label: "Search", icon: Search },
  { tool: "graph", label: "Graph", icon: GitBranch },
  { tool: "tags", label: "Tags", icon: Tags },
];

const blockPalette: Array<{
  type: AtriaBlockType;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { type: "heading", label: "Heading", icon: Heading1 },
  { type: "text", label: "Text", icon: Pilcrow },
  { type: "callout", label: "Callout", icon: Info },
  { type: "todo", label: "Todo", icon: CheckSquare },
  { type: "card", label: "Card", icon: PanelTop },
  { type: "code", label: "Code", icon: Code2 },
  { type: "image", label: "Image", icon: Image },
  { type: "artifact", label: "Artifact", icon: Box },
  { type: "divider", label: "Divider", icon: Minus },
  { type: "quote", label: "Quote", icon: Quote },
  { type: "table", label: "Table", icon: Table2 },
  { type: "chart", label: "Chart", icon: GitBranch },
  { type: "canvas", label: "Canvas", icon: Square },
  { type: "mermaid", label: "Mermaid", icon: GitBranch },
  { type: "latex", label: "LaTeX", icon: Sigma },
  { type: "custom-html", label: "HTML", icon: Code2 },
  { type: "timeline", label: "Timeline", icon: Hash },
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
    addBlock,
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
                <small>{tab.source}</small>
              </button>
              <button className={styles.tabClose} onClick={() => closeTab(tab.key)} title="Close">
                x
              </button>
            </div>
          ))}
        </div>

        <section className={styles.documentSurface}>
          {activePage ? (
            <PageEditor page={activePage} artifacts={snapshot?.artifacts ?? []} />
          ) : activeArtifact ? (
            <ArtifactPreview artifact={activeArtifact} />
          ) : (
            <div className={styles.emptyState}>No file selected</div>
          )}
        </section>

        <footer className={styles.statusBar}>
          <span>{activeTab?.source === "ai" ? "AI HTML" : "Human note"}</span>
          <span>{activePage ? `${countCharacters(activePage)} characters` : activeArtifact?.updatedAt}</span>
        </footer>
      </main>

      <aside className={styles.blockBar}>
        <div className={styles.blockBarTitle}>
          <Blocks size={15} />
          <span>Blocks</span>
        </div>
        <div className={styles.blockList}>
          {blockPalette.map((block) => {
            const Icon = block.icon;
            return (
              <button
                key={block.type}
                className={styles.blockButton}
                disabled={activeTab?.type !== "page"}
                title={block.label}
                onClick={() => addBlock(block.type)}
              >
                <span>
                  <Icon size={15} />
                </span>
                <strong>{block.label}</strong>
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

    return <SettingsPane snapshot={current} onLoaded={setSnapshot} />;
  }
}

function SearchPane() {
  const { snapshot, filter, setFilter, openNode } = useAtriaStore();
  const pages = snapshot?.pages ?? [];
  const artifacts = snapshot?.artifacts ?? [];
  const recent = snapshot?.settings.recentFiles ?? [];
  const query = filter.trim().toLowerCase();
  const allItems = [
    ...pages.map((item) => ({ type: "page" as const, item })),
    ...artifacts.map((item) => ({ type: "artifact" as const, item })),
  ];
  const results = allItems.filter(({ item }) => {
    if (!query) return true;
    return [item.title, item.id, "filePath" in item ? item.filePath : "", ...(item.tags ?? [])]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  return (
    <>
      <div className={styles.sideTitle}>
        <strong>Search</strong>
        <span>{query ? `${results.length} results` : `${recent.length} recent`}</span>
      </div>
      <div className={styles.searchPane}>
        <input value={filter} placeholder="Search" onChange={(event) => setFilter(event.target.value)} />
        {!query && recent.length > 0 && (
          <div className={styles.searchGroup}>
            {recent.map((item) => (
              <button key={`${item.type}:${item.id}`} onClick={() => openNode(item.type, item.id)}>
                <FileText size={14} />
                <strong>{item.title}</strong>
                <small>{item.source}</small>
              </button>
            ))}
          </div>
        )}
        <div className={styles.searchResults}>
          {results.map(({ type, item }) => (
            <button key={`${type}:${item.id}`} onClick={() => openNode(type, item.id)}>
              {type === "artifact" ? <FileCode2 size={14} /> : <FileText size={14} />}
              <strong>{item.title}</strong>
              <small>{"filePath" in item ? item.filePath : type}</small>
            </button>
          ))}
        </div>
      </div>
    </>
  );
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

function SettingsPane({
  snapshot,
  onLoaded,
}: {
  snapshot: WorkspaceSnapshot;
  onLoaded(snapshot: WorkspaceSnapshot): void;
}) {
  const [path, setPath] = useState(snapshot.settings.workspacePath);
  return (
    <>
      <div className={styles.sideTitle}>
        <strong>Settings</strong>
        <span>Local</span>
      </div>
      <div className={styles.settingsPane}>
        <label>
          <span>Workspace</span>
          <input value={path} onChange={(event) => setPath(event.target.value)} />
        </label>
        <button
          className={styles.settingsButton}
          onClick={async () => {
            const next = await loadWorkspace(path);
            onLoaded(next);
          }}
        >
          Switch
        </button>
        <label>
          <span>AI Provider</span>
          <select defaultValue={snapshot.settings.ai.provider}>
            <option value="ollama">Ollama</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label>
          <span>Model</span>
          <input defaultValue={snapshot.settings.ai.model} />
        </label>
        <label>
          <span>Endpoint</span>
          <input defaultValue={snapshot.settings.ai.endpoint} />
        </label>
      </div>
    </>
  );
}

function countCharacters(page: { title: string; body?: string; blocks: Array<Record<string, unknown>> }): number {
  const blockText = page.blocks
    .flatMap((block) => Object.values(block))
    .map((value) => (typeof value === "string" ? value : ""))
    .join("");
  return `${page.title}${page.body ?? ""}${blockText}`.replace(/<[^>]*>/g, "").length;
}
