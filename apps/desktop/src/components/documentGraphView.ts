import type { DocumentGraphEdge, DocumentGraphNode } from "@atria/core";

export const GRAPH_WIDTH = 300;
export const GRAPH_HEIGHT = 220;
export const GRAPH_NODE_LIMIT = 14;

export type GraphNodeType = DocumentGraphNode["type"];
export type GraphTypeFilter = Record<GraphNodeType, boolean>;

export const ALL_GRAPH_TYPES: GraphTypeFilter = {
  page: true,
  artifact: true,
  asset: true,
};

export interface PositionedGraphNode extends DocumentGraphNode {
  x: number;
  y: number;
}

export function filterGraphNodes(
  nodes: DocumentGraphNode[],
  query: string,
  types: GraphTypeFilter,
): DocumentGraphNode[] {
  const needle = query.trim().toLocaleLowerCase();
  return nodes.filter((node) => {
    if (!types[node.type]) return false;
    if (!needle) return true;
    return `${node.title}\n${node.filePath}`.toLocaleLowerCase().includes(needle);
  });
}

export function positionGraphNodes(
  nodes: DocumentGraphNode[],
  edges: DocumentGraphEdge[],
  activeId?: string,
): PositionedGraphNode[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const visibleEdges = edges.filter((edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId));
  const degree = new Map<string, number>();
  for (const edge of visibleEdges) {
    degree.set(edge.sourceId, (degree.get(edge.sourceId) ?? 0) + 1);
    degree.set(edge.targetId, (degree.get(edge.targetId) ?? 0) + 1);
  }

  const connectedIds = activeId
    ? new Set(
        visibleEdges.flatMap((edge) => {
          if (edge.sourceId === activeId) return [edge.targetId];
          if (edge.targetId === activeId) return [edge.sourceId];
          return [];
        }),
      )
    : new Set<string>();
  const candidates = activeId && connectedIds.size
    ? nodes.filter((node) => node.id === activeId || connectedIds.has(node.id))
    : nodes;
  const visible = [...candidates]
    .sort((left, right) => {
      if (left.id === activeId) return -1;
      if (right.id === activeId) return 1;
      return (degree.get(right.id) ?? 0) - (degree.get(left.id) ?? 0) || left.title.localeCompare(right.title);
    })
    .slice(0, GRAPH_NODE_LIMIT);

  const active = visible[0]?.id === activeId ? visible.shift() : undefined;
  const centerX = GRAPH_WIDTH / 2;
  const centerY = GRAPH_HEIGHT / 2;
  const radiusX = 112;
  const radiusY = 70;
  const positioned = visible.map((node, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(visible.length, 1)) * Math.PI * 2;
    return {
      ...node,
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY,
    };
  });
  if (active) positioned.unshift({ ...active, x: centerX, y: centerY });
  return positioned;
}

export function clampGraphZoom(value: number): number {
  return Math.min(1.8, Math.max(0.7, Math.round(value * 10) / 10));
}
