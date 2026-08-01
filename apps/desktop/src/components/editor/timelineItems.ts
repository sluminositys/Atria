export interface TimelineItem {
  id: string;
  at: string;
  title: string;
  detail: string;
}

let fallbackId = 0;

export function createTimelineItem(input: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: input.id || nextTimelineId(),
    at: String(input.at ?? ""),
    title: String(input.title ?? ""),
    detail: String(input.detail ?? ""),
  };
}

export function parseTimelineItems(value: unknown): TimelineItem[] {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(source)) return [];
  return source
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => createTimelineItem({
      id: typeof item.id === "string" ? item.id : undefined,
      at: String(item.at ?? ""),
      title: String(item.title ?? ""),
      detail: String(item.detail ?? ""),
    }));
}

export function moveTimelineItem(items: TimelineItem[], index: number, direction: -1 | 1): TimelineItem[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const next = [...items];
  const currentItem = next[index]!;
  const targetItem = next[target]!;
  next[index] = targetItem;
  next[target] = currentItem;
  return next;
}

function nextTimelineId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  fallbackId += 1;
  return `timeline-${Date.now()}-${fallbackId}`;
}
