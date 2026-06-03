import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Blocks,
  FileText,
  GitBranch,
  Hash,
  Search,
  Settings,
  Tag,
} from "lucide-react";
import { AtriaBlockType } from "@atria/schema";
import { workspaceService } from "./workspaceClient";
import { ActiveTool, getActiveTab, useAtriaStore } from "./store";
import { FileTree } from "../components/FileTree";
import { PageEditor } from "../components/PageEditor";
import { ArtifactPreview } from "../components/ArtifactPreview";
import styles from "./App.module.css";

const railItems: Array<{ tool: ActiveTool; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { tool: "files", label: "Files", icon: FileText },
  { tool: "search", label: "Search", icon: Search },
  { tool: "graph", label: "Graph", icon: GitBranch },
  { tool: "tags", label: "Tags", icon: Tag },
];

const blockPalette: Array<{ type: AtriaBlockType; label: string; icon: string }> = [
  { type: "heading", label: "Heading", icon: "H" },
  { type: "text", label: "Text", icon: "¶" },
  { type: "callout", label: "Callout", icon: "i" },
  { type: "todo", label: "Todo", icon: "☑" },
  { type: "card", label: "Card", icon: "▤" },
  { type: "code", label: "Code", icon: "</>" },
  { type: "image", label: "Image", icon: "▧" },
  { type: "artifact", label: "Artifact", icon: "□" },
  { type: "divider", label: "Divider", icon: "—" },
  { type: "quote", label: "Quote", icon: "❝" },
  { type: "table", label: "Table", icon: "▦" },
  { type: "chart", label: "Chart", icon: "↗" },
  { type: "canvas", label: "Canvas", icon: "◇" },
  { type: "mermaid", label: "Mermaid", icon: "M" },
  { type: "latex", label: "LaTeX", icon: "Σ" },
  { type: "custom-html", label: "HTML", icon: "{}" },
  { type: "timeline", label: "Timeline", icon: "T" },
  { type: "metric-card", label: "Metric", icon: "№" },
  { type: "gallery", label: "Gallery", icon: "▥" },
];

export function App() {
  const query = useQuery({
    queryKey: ["workspace"],
    queryFn: () => workspaceService.getSnapshot(),
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
    createPage,
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

      <aside className={styles.sidePane}>{renderSidePane()}</aside>

      <main className={styles.mainPane}>
        <div className={styles.tabs}>
          {tabs.map((tab) => (
            <div key={tab.key} className={tab.key === activeTabKey ? styles.tabActive : styles.tab}>
              <button className={styles.tabLabel} onClick={() => openNode(tab.type, tab.id)}>
                <span>{tab.title}</span>
                <small>{tab.source}</small>
              </button>
              <button className={styles.tabClose} onClick={() => closeTab(tab.key)} title="Close">
                ×
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
          {blockPalette.map((block) => (
            <button
              key={block.type}
              className={styles.blockButton}
              disabled={activeTab?.type !== "page"}
              title={block.label}
              onClick={() => addBlock(block.type)}
            >
              <span>{block.icon}</span>
              <strong>{block.label}</strong>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );

  function renderSidePane() {
    if (!snapshot || query.isLoading) {
      return (
        <div className={styles.sideTitle}>
          <strong>Atria</strong>
          <span>Loading</span>
        </div>
      );
    }

    if (activeTool === "files") {
      return (
        <>
          <div className={styles.sideTitle}>
            <strong>{snapshot.title}</strong>
            <span>
              {snapshot.pages.length} notes · {snapshot.artifacts.length} html
            </span>
          </div>
          <FileTree snapshot={snapshot} />
        </>
      );
    }

    if (activeTool === "search") {
      return <SearchPane />;
    }

    if (activeTool === "graph") {
      return (
        <>
          <div className={styles.sideTitle}>
            <strong>Graph</strong>
            <span>Project links</span>
          </div>
          <div className={styles.graphPane}>
            <GitBranch size={20} />
            <span>ArchaicSeeker</span>
            <small>2 pages · 1 artifact</small>
          </div>
        </>
      );
    }

    if (activeTool === "tags") {
      const tags = Array.from(
        new Set([...snapshot.pages.flatMap((page) => page.tags), ...snapshot.artifacts.flatMap((artifact) => artifact.tags)]),
      ).sort();
      return (
        <>
          <div className={styles.sideTitle}>
            <strong>Tags</strong>
            <span>{tags.length} tags</span>
          </div>
          <div className={styles.tagList}>
            {tags.map((tag) => (
              <button key={tag} onClick={() => useAtriaStore.getState().setFilter(tag)}>
                <Hash size={13} />
                <span>{tag}</span>
              </button>
            ))}
          </div>
        </>
      );
    }

    return (
      <>
        <div className={styles.sideTitle}>
          <strong>Settings</strong>
          <span>Local</span>
        </div>
        <div className={styles.settingsPane}>
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
          <label>
            <span>Default Behavior</span>
            <select defaultValue={snapshot.settings.ai.defaultBehavior}>
              <option value="summarize">Summarize</option>
              <option value="extract-conclusions">Extract conclusions</option>
              <option value="draft-page">Draft page</option>
            </select>
          </label>
        </div>
      </>
    );
  }
}

function SearchPane() {
  const { snapshot, filter, setFilter, openNode } = useAtriaStore();
  const pages = snapshot?.pages ?? [];
  const artifacts = snapshot?.artifacts ?? [];
  const query = filter.trim().toLowerCase();
  const results = [
    ...pages.map((item) => ({ type: "page" as const, item })),
    ...artifacts.map((item) => ({ type: "artifact" as const, item })),
  ].filter(({ item }) => {
    if (!query) return true;
    return [item.title, item.id, ...(item.tags ?? [])].join(" ").toLowerCase().includes(query);
  });

  return (
    <>
      <div className={styles.sideTitle}>
        <strong>Search</strong>
        <span>{results.length} results</span>
      </div>
      <div className={styles.searchPane}>
        <input value={filter} placeholder="Search" onChange={(event) => setFilter(event.target.value)} />
        <div className={styles.searchResults}>
          {results.map(({ type, item }) => (
            <button key={`${type}:${item.id}`} onClick={() => openNode(type, item.id)}>
              <span>{type === "artifact" ? "◎" : "□"}</span>
              <strong>{item.title}</strong>
              <small>{type === "artifact" ? "AI HTML" : "Human note"}</small>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function countCharacters(page: { blocks: Array<Record<string, unknown>> }): number {
  return page.blocks
    .flatMap((block) => Object.values(block))
    .map((value) => (typeof value === "string" ? value : ""))
    .join("")
    .length;
}

