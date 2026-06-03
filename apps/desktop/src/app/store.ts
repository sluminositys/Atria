import { create } from "zustand";
import { AtriaBlock, AtriaBlockType, Page, WorkspaceSnapshot } from "@atria/schema";
import { createBlock, nowIso, slugify } from "@atria/core";

export type ActiveTool = "files" | "search" | "graph" | "tags" | "settings";
export type TabType = "page" | "artifact" | "timeline";

export interface WorkspaceTab {
  key: string;
  type: TabType;
  id: string;
  title: string;
  source: "human" | "ai";
  dirty?: boolean;
}

interface AtriaState {
  activeTool: ActiveTool;
  activeTabKey: string;
  filter: string;
  selectedFolderId: string;
  snapshot?: WorkspaceSnapshot;
  tabs: WorkspaceTab[];
  setSnapshot(snapshot: WorkspaceSnapshot): void;
  setActiveTool(tool: ActiveTool): void;
  setFilter(filter: string): void;
  setSelectedFolder(folderId: string): void;
  openNode(type: TabType, id: string): void;
  closeTab(key: string): void;
  createPage(folderId?: string): void;
  updatePage(pageId: string, patch: Partial<Page>): void;
  deletePage(pageId: string): void;
  addBlock(type: AtriaBlockType): void;
  updateBlock(pageId: string, blockId: string, patch: Partial<AtriaBlock>): void;
  deleteBlock(pageId: string, blockId: string): void;
  moveBlock(pageId: string, blockId: string, direction: -1 | 1): void;
}

function nodeKey(type: TabType, id: string): string {
  return `${type}:${id}`;
}

function titleFor(snapshot: WorkspaceSnapshot, type: TabType, id: string): string {
  if (type === "artifact") return snapshot.artifacts.find((item) => item.id === id)?.title ?? id;
  if (type === "timeline") return snapshot.timeline.find((item) => item.id === id)?.title ?? id;
  return snapshot.pages.find((item) => item.id === id)?.title ?? id;
}

function sourceFor(type: TabType): "human" | "ai" {
  return type === "artifact" ? "ai" : "human";
}

function withUpdatedPage(
  snapshot: WorkspaceSnapshot | undefined,
  pageId: string,
  updater: (page: Page) => Page,
): WorkspaceSnapshot | undefined {
  if (!snapshot) return snapshot;
  return {
    ...snapshot,
    pages: snapshot.pages.map((page) => (page.id === pageId ? updater(page) : page)),
    updatedAt: nowIso(),
  };
}

export const useAtriaStore = create<AtriaState>((set, get) => ({
  activeTool: "files",
  activeTabKey: "",
  filter: "",
  selectedFolderId: "notes",
  tabs: [],

  setSnapshot(snapshot) {
    set((state) => {
      const tabs = state.tabs
        .map((tab) => {
          const exists =
            tab.type === "artifact"
              ? snapshot.artifacts.some((item) => item.id === tab.id)
              : snapshot.pages.some((item) => item.id === tab.id);
          return exists
            ? { ...tab, title: titleFor(snapshot, tab.type, tab.id), source: sourceFor(tab.type) }
            : null;
        })
        .filter(Boolean) as WorkspaceTab[];

      if (!tabs.length) {
        const firstPage = snapshot.pages[0];
        const firstArtifact = snapshot.artifacts[0];
        const first = firstPage
          ? {
              key: nodeKey("page", firstPage.id),
              type: "page" as const,
              id: firstPage.id,
              title: firstPage.title,
              source: "human" as const,
            }
          : firstArtifact
            ? {
                key: nodeKey("artifact", firstArtifact.id),
                type: "artifact" as const,
                id: firstArtifact.id,
                title: firstArtifact.title,
                source: "ai" as const,
              }
            : undefined;
        if (first) tabs.push(first);
      }

      return {
        snapshot,
        tabs,
        activeTabKey: tabs.some((tab) => tab.key === state.activeTabKey)
          ? state.activeTabKey
          : (tabs[0]?.key ?? ""),
      };
    });
  },

  setActiveTool(tool) {
    set({ activeTool: tool });
  },

  setFilter(filter) {
    set({ filter });
  },

  setSelectedFolder(folderId) {
    set({ selectedFolderId: folderId });
  },

  openNode(type, id) {
    const snapshot = get().snapshot;
    if (!snapshot) return;
    const key = nodeKey(type, id);
    set((state) => {
      const exists = state.tabs.some((tab) => tab.key === key);
      return {
        activeTabKey: key,
        tabs: exists
          ? state.tabs
          : [
              ...state.tabs,
              {
                key,
                type,
                id,
                title: titleFor(snapshot, type, id),
                source: sourceFor(type),
              },
            ],
      };
    });
  },

  closeTab(key) {
    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.key === key);
      if (index < 0) return state;
      const tabs = state.tabs.filter((tab) => tab.key !== key);
      const nextActive =
        state.activeTabKey === key
          ? (tabs[index]?.key ?? tabs[index - 1]?.key ?? tabs[0]?.key ?? "")
          : state.activeTabKey;
      return { tabs, activeTabKey: nextActive };
    });
  },

  createPage(folderId = get().selectedFolderId || "notes") {
    const snapshot = get().snapshot;
    if (!snapshot) return;
    const createdAt = nowIso();
    const id = `${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}-note`;
    const page: Page = {
      id,
      title: "Untitled",
      source: "human",
      kind: "note",
      tags: [],
      blocks: [createBlock("text")],
      createdAt,
      updatedAt: createdAt,
    };

    set({
      snapshot: {
        ...snapshot,
        pages: [...snapshot.pages, page],
        tree: [
          ...snapshot.tree,
          { id: page.id, type: "page", parentId: folderId, order: Date.now() },
        ],
        updatedAt: nowIso(),
      },
      selectedFolderId: folderId,
    });
    get().openNode("page", page.id);
  },

  updatePage(pageId, patch) {
    set((state) => {
      const snapshot = withUpdatedPage(state.snapshot, pageId, (page) => ({
        ...page,
        ...patch,
        id: page.id,
        updatedAt: nowIso(),
      }));
      return {
        snapshot,
        tabs: state.tabs.map((tab) =>
          tab.type === "page" && tab.id === pageId
            ? { ...tab, title: patch.title ?? tab.title, dirty: false }
            : tab,
        ),
      };
    });
  },

  deletePage(pageId) {
    set((state) => {
      if (!state.snapshot) return state;
      const snapshot = {
        ...state.snapshot,
        pages: state.snapshot.pages.filter((page) => page.id !== pageId),
        tree: state.snapshot.tree.filter((item) => !(item.type === "page" && item.id === pageId)),
        updatedAt: nowIso(),
      };
      const tabs = state.tabs.filter((tab) => !(tab.type === "page" && tab.id === pageId));
      return {
        snapshot,
        tabs,
        activeTabKey: tabs.some((tab) => tab.key === state.activeTabKey)
          ? state.activeTabKey
          : (tabs[0]?.key ?? ""),
      };
    });
  },

  addBlock(type) {
    const active = get().tabs.find((tab) => tab.key === get().activeTabKey);
    if (!active || active.type !== "page") return;
    const block = createBlock(type);
    set((state) => ({
      snapshot: withUpdatedPage(state.snapshot, active.id, (page) => ({
        ...page,
        blocks: [...page.blocks, block],
      })),
    }));
  },

  updateBlock(pageId, blockId, patch) {
    set((state) => ({
      snapshot: withUpdatedPage(state.snapshot, pageId, (page) => ({
        ...page,
        blocks: page.blocks.map((block) =>
          block.id === blockId ? ({ ...block, ...patch, id: block.id, updatedAt: nowIso() } as AtriaBlock) : block,
        ),
      })),
    }));
  },

  deleteBlock(pageId, blockId) {
    set((state) => ({
      snapshot: withUpdatedPage(state.snapshot, pageId, (page) => ({
        ...page,
        blocks: page.blocks.filter((block) => block.id !== blockId),
      })),
    }));
  },

  moveBlock(pageId, blockId, direction) {
    set((state) => ({
      snapshot: withUpdatedPage(state.snapshot, pageId, (page) => {
        const blocks = [...page.blocks];
        const index = blocks.findIndex((block) => block.id === blockId);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= blocks.length) return page;
        const [block] = blocks.splice(index, 1);
        blocks.splice(nextIndex, 0, block!);
        return { ...page, blocks };
      }),
    }));
  },
}));

export function getActiveTab(state: Pick<AtriaState, "activeTabKey" | "tabs">): WorkspaceTab | undefined {
  return state.tabs.find((tab) => tab.key === state.activeTabKey);
}

export function duplicateSafeSlug(title: string): string {
  return slugify(title, "page");
}

