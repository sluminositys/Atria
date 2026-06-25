import { useMemo } from "react";
import { ArrowRight, FileCode2, FileText } from "lucide-react";
import { buildDocumentGraph, DocumentGraphNode } from "@atria/core";
import { WorkspaceSnapshot } from "@atria/schema";
import { useAtriaStore } from "../app/store";
import styles from "../app/App.module.css";

const GRAPH_WIDTH = 286;
const GRAPH_HEIGHT = 218;
const GRAPH_NODE_LIMIT = 22;

interface PositionedNode extends DocumentGraphNode {
  x: number;
  y: number;
}

export function DocumentGraphPane({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const { activeTabKey, tabs, openNode } = useAtriaStore();
  const activeTab = tabs.find((tab) => tab.key === activeTabKey);
  const graph = useMemo(() => buildDocumentGraph(snapshot), [snapshot]);
  const visibleNodes = useMemo(
    () => positionNodes(graph.nodes, graph.edges, activeTab?.id),
    [activeTab?.id, graph.edges, graph.nodes],
  );
  const positions = new Map(visibleNodes.map((node) => [node.id, node]));
  const visibleEdges = graph.edges.filter((edge) => positions.has(edge.sourceId) && positions.has(edge.targetId));
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  const openGraphNode = (node: DocumentGraphNode) => openNode(node.type, node.id);

  return (
    <>
      <div className={styles.sideTitle}>
        <strong>Graph</strong>
        <span>{graph.nodes.length} files · {graph.edges.length} links</span>
      </div>
      <div className={styles.documentGraphPane}>
        <div className={styles.graphLegend}>
          <span><i className={styles.graphHumanSwatch} />Human</span>
          <span><i className={styles.graphAgentSwatch} />Agent</span>
        </div>
        <svg
          className={styles.documentGraphCanvas}
          viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
          role="img"
          aria-label="Document relationship graph"
        >
          {visibleEdges.map((edge) => {
            const source = positions.get(edge.sourceId)!;
            const target = positions.get(edge.targetId)!;
            return (
              <line
                key={`${edge.sourceId}:${edge.targetId}:${edge.kind}`}
                className={edge.kind === "embed" ? styles.graphEmbedEdge : styles.graphLinkEdge}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
              />
            );
          })}
          {visibleNodes.map((node) => {
            const active = node.id === activeTab?.id;
            return (
              <g
                key={`${node.type}:${node.id}`}
                className={styles.graphNode}
                role="button"
                tabIndex={0}
                aria-label={node.title}
                onClick={() => openGraphNode(node)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") openGraphNode(node);
                }}
              >
                <circle
                  className={node.source === "ai" ? styles.graphAgentNode : styles.graphHumanNode}
                  cx={node.x}
                  cy={node.y}
                  r={active ? 9 : 6.5}
                />
                {active && <circle className={styles.graphActiveRing} cx={node.x} cy={node.y} r={13} />}
                <title>{node.title}</title>
              </g>
            );
          })}
        </svg>

        <div className={styles.graphRelations}>
          {graph.edges.slice(0, 30).map((edge) => {
            const source = nodesById.get(edge.sourceId);
            const target = nodesById.get(edge.targetId);
            if (!source || !target) return null;
            return (
              <button
                type="button"
                key={`${edge.sourceId}:${edge.targetId}:${edge.kind}`}
                title={`${source.title} -> ${target.title}`}
                onClick={() => openGraphNode(target)}
              >
                {source.type === "artifact" ? <FileCode2 size={13} /> : <FileText size={13} />}
                <span>{source.title}</span>
                <ArrowRight size={12} />
                <span>{target.title}</span>
                <small>{edge.kind}</small>
              </button>
            );
          })}
          {graph.edges.length === 0 && (
            <div className={styles.graphEmpty}>No document links</div>
          )}
        </div>
      </div>
    </>
  );
}

function positionNodes(
  nodes: DocumentGraphNode[],
  edges: Array<{ sourceId: string; targetId: string }>,
  activeId?: string,
): PositionedNode[] {
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.sourceId, (degree.get(edge.sourceId) ?? 0) + 1);
    degree.set(edge.targetId, (degree.get(edge.targetId) ?? 0) + 1);
  }
  const visible = [...nodes]
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
  const radiusY = 78;
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
