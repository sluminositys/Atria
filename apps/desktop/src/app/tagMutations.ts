import type { WorkspaceSnapshot } from "@atria/schema";
import { nowIso } from "@atria/core";

export interface WorkspaceTagItem {
  id: string;
  type: "page" | "artifact";
  title: string;
  updatedAt: string;
}

export interface WorkspaceTagSummary {
  name: string;
  items: WorkspaceTagItem[];
}

export interface WorkspaceTagMutation {
  snapshot: WorkspaceSnapshot;
  changedPaths: string[];
  changed: boolean;
}

export function normalizeTagName(value: string): string {
  return value.trim().replace(/^#+/, "").trim().replace(/\s+/g, " ");
}

export function buildWorkspaceTagIndex(snapshot: WorkspaceSnapshot): WorkspaceTagSummary[] {
  const index = new Map<string, WorkspaceTagSummary>();
  const items = [
    ...snapshot.pages.map((page) => ({
      id: page.id,
      type: "page" as const,
      title: page.title,
      updatedAt: page.updatedAt,
      tags: page.tags,
    })),
    ...snapshot.artifacts
      .filter((artifact) => artifact.status === "active")
      .map((artifact) => ({
        id: artifact.id,
        type: "artifact" as const,
        title: artifact.title,
        updatedAt: artifact.updatedAt,
        tags: artifact.tags,
      })),
  ];

  for (const item of items) {
    for (const rawTag of item.tags) {
      const name = normalizeTagName(rawTag);
      const key = tagKey(name);
      if (!key) continue;
      const summary = index.get(key) ?? { name, items: [] };
      if (!summary.items.some((entry) => entry.type === item.type && entry.id === item.id)) {
        summary.items.push({ id: item.id, type: item.type, title: item.title, updatedAt: item.updatedAt });
      }
      index.set(key, summary);
    }
  }

  return [...index.values()]
    .map((summary) => ({
      ...summary,
      items: summary.items.sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title),
      ),
    }))
    .sort((left, right) => right.items.length - left.items.length || left.name.localeCompare(right.name));
}

export function mutateWorkspaceTag(
  snapshot: WorkspaceSnapshot,
  currentTag: string,
  replacement?: string,
  updatedAt = nowIso(),
): WorkspaceTagMutation {
  const currentKey = tagKey(normalizeTagName(currentTag));
  const nextName = replacement === undefined ? undefined : normalizeTagName(replacement);
  if (!currentKey || replacement !== undefined && !nextName) {
    return { snapshot, changedPaths: [], changed: false };
  }

  const changedIds = new Set<string>();
  const changedPaths = new Set<string>();
  const pages = snapshot.pages.map((page) => {
    const tags = replaceTag(page.tags, currentKey, nextName);
    if (tags === page.tags) return page;
    changedIds.add(page.id);
    if (page.filePath) changedPaths.add(page.filePath);
    return { ...page, tags, updatedAt };
  });
  const artifacts = snapshot.artifacts.map((artifact) => {
    const tags = replaceTag(artifact.tags, currentKey, nextName);
    if (tags === artifact.tags) return artifact;
    changedIds.add(artifact.id);
    if (artifact.filePath) changedPaths.add(artifact.filePath);
    return { ...artifact, tags, updatedAt };
  });

  if (!changedIds.size) return { snapshot, changedPaths: [], changed: false };
  const tagsById = new Map([
    ...pages.map((page) => [page.id, page.tags] as const),
    ...artifacts.map((artifact) => [artifact.id, artifact.tags] as const),
  ]);
  return {
    snapshot: {
      ...snapshot,
      pages,
      artifacts,
      documents: snapshot.documents.map((document) =>
        changedIds.has(document.id)
          ? { ...document, tags: tagsById.get(document.id) ?? document.tags, updatedAt }
          : document,
      ),
      updatedAt,
    },
    changedPaths: [...changedPaths],
    changed: true,
  };
}

function replaceTag(tags: string[], currentKey: string, replacement: string | undefined): string[] {
  if (!tags.some((tag) => tagKey(normalizeTagName(tag)) === currentKey)) return tags;
  const next: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const name = tagKey(normalizeTagName(tag)) === currentKey ? replacement : normalizeTagName(tag);
    const key = name ? tagKey(name) : "";
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    next.push(name);
  }
  return next;
}

function tagKey(value: string): string {
  return value.toLocaleLowerCase();
}
