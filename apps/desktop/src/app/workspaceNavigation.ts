import type { RecentFile, WorkspaceSnapshot } from "@atria/schema";

export function existingRecentFiles(snapshot: WorkspaceSnapshot, limit = 20): RecentFile[] {
  const validKeys = new Set([
    ...snapshot.pages.map((document) => `page:${document.id}`),
    ...snapshot.artifacts.map((artifact) => `artifact:${artifact.id}`),
    ...snapshot.assets.map((asset) => `asset:${asset.id}`),
    ...snapshot.timeline.map((summary) => `timeline:${summary.id}`),
  ]);
  const seen = new Set<string>();
  return [...(snapshot.settings.recentFiles ?? [])]
    .sort((left, right) => right.openedAt.localeCompare(left.openedAt))
    .filter((item) => {
      const key = `${item.type}:${item.id}`;
      if (!validKeys.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(0, limit));
}

export function relativeTimeLabel(value: string, now = Date.now()): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
