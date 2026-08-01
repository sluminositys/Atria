const RECENT_WORKSPACES_KEY = "atria:recent-workspaces";
const ACTIVE_WORKSPACE_KEY = "atria:active-workspace";

interface WorkspacePreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readRecentWorkspacePaths(
  currentPath = "",
  storage: WorkspacePreferenceStorage | undefined = browserStorage(),
): string[] {
  let stored: string[] = [];
  try {
    const value = JSON.parse(storage?.getItem(RECENT_WORKSPACES_KEY) ?? "[]") as unknown;
    stored = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    stored = [];
  }
  return uniqueWorkspacePaths([currentPath, ...stored]).slice(0, 8);
}

export function rememberWorkspacePath(
  path: string,
  storage: WorkspacePreferenceStorage | undefined = browserStorage(),
): string[] {
  const recent = uniqueWorkspacePaths([path, ...readRecentWorkspacePaths("", storage)]).slice(0, 8);
  storage?.setItem(RECENT_WORKSPACES_KEY, JSON.stringify(recent));
  return recent;
}

export function forgetRecentWorkspacePath(
  path: string,
  currentPath: string,
  storage: WorkspacePreferenceStorage | undefined = browserStorage(),
): string[] {
  const recent = readRecentWorkspacePaths(currentPath, storage).filter((item) => sameWorkspacePath(item, currentPath) || !sameWorkspacePath(item, path));
  storage?.setItem(RECENT_WORKSPACES_KEY, JSON.stringify(recent));
  return recent;
}

export function readActiveWorkspacePath(
  storage: WorkspacePreferenceStorage | undefined = browserStorage(),
): string {
  return storage?.getItem(ACTIVE_WORKSPACE_KEY)?.trim() ?? "";
}

export function setActiveWorkspacePath(
  path: string,
  storage: WorkspacePreferenceStorage | undefined = browserStorage(),
): void {
  if (path.trim()) storage?.setItem(ACTIVE_WORKSPACE_KEY, path.trim());
}

export function sameWorkspacePath(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return left === right;
  return normalizedWorkspacePath(left) === normalizedWorkspacePath(right);
}

export function workspaceName(path: string): string {
  const normalized = path.trim().replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]/).pop() || "Local workspace";
}

export function workspaceDisplayLabels(paths: string[]): Map<string, string> {
  const totals = new Map<string, number>();
  for (const path of paths) {
    const key = workspaceName(path).toLowerCase();
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return new Map(paths.map((path) => {
    const name = workspaceName(path);
    const key = name.toLowerCase();
    const index = (seen.get(key) ?? 0) + 1;
    seen.set(key, index);
    return [path, (totals.get(key) ?? 0) > 1 ? `${name} (${index})` : name];
  }));
}

function uniqueWorkspacePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  return paths.filter((path) => {
    const key = normalizedWorkspacePath(path);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizedWorkspacePath(path: string): string {
  return path.trim().replace(/[\\/]+$/, "").toLowerCase();
}

function browserStorage(): WorkspacePreferenceStorage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}
