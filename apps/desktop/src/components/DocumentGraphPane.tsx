import { useMemo } from "react";
import { ArrowDownLeft, ArrowUpRight, FileCode2, FileImage, FileText, Focus } from "lucide-react";
import { buildDocumentGraph, DocumentGraphNode } from "@atria/core";
import { WorkspaceSnapshot } from "@atria/schema";
import { useAtriaStore } from "../app/store";
import styles from "../app/App.module.css";

const GRAPH_WIDTH = 300;
const GRAPH_HEIGHT = 238;
const GRAPH_NODE_LIMIT = 14;

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
  const activeNode = activeTab ? nodesById.get(activeTab.id) : undefined;
  const relatedEdges = activeNode
    ? graph.edges.filter((edge) => edge.sourceId === activeNode.id || edge.targetId === activeNode.id)
    : graph.edges;

  const openGraphNode = (node: DocumentGraphNode) => openNode(node.type, node.id);

  return (
    <>
      <div className={styles.sideTitle}>
        <strong>File relations</strong>
        <span>{graph.nodes.length} files / {graph.edges.length} connections</span>
      </div>
      <div className={styles.documentGraphPane}>
        <div className={styles.graphScope}>
          <Focus size={13} />
          <strong>{activeNode?.title ?? "Workspace"}</strong>
          <small>
            {visibleNodes.length === graph.nodes.length
              ? `${visibleNodes.length} shown`
              : `${visibleNodes.length} of ${graph.nodes.length}`}
          </small>
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
            const isActive = activeNode && (edge.sourceId === activeNode.id || edge.targetId === activeNode.id);
            return (
              <line
                key={`${edge.sourceId}:${edge.targetId}:${edge.kind}`}
                className={`${edge.kind === "embed" ? styles.graphEmbedEdge : styles.graphLinkEdge} ${
                  isActive ? styles.graphActiveEdge : ""
                }`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
              />
            );
          })}
          {visibleNodes.map((node) => {
            const active = node.id === activeNode?.id;
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
                {node.type === "artifact" ? (
                  <rect
                    className={styles.graphArtifactNode}
                    x={node.x - (active ? 8 : 6)}
                    y={node.y - (active ? 8 : 6)}
                    width={active ? 16 : 12}
                    height={active ? 16 : 12}
                    rx="2"
                  />
                ) : node.type === "asset" ? (
                  <rect
                    className={styles.graphAssetNode}
                    x={node.x - (active ? 7 : 5)}
                    y={node.y - (active ? 7 : 5)}
                    width={active ? 14 : 10}
                    height={active ? 14 : 10}
                    transform={`rotate(45 ${node.x} ${node.y})`}
                  />
                ) : (
                  <circle className={styles.graphDocumentNode} cx={node.x} cy={node.y} r={active ? 8 : 6} />
                )}
                {active && <circle className={styles.graphActiveRing} cx={node.x} cy={node.y} r={13} />}
                <text className={styles.graphNodeLabel} x={node.x} y={node.y + (active ? 27 : 22)} textAnchor="middle">
                  {compactTitle(node.title)}
                </text>
                <title>{node.title}</title>
                <rect
                  className={styles.graphNodeHitArea}
                  x={node.x - 46}
                  y={node.y - 18}
                  width={92}
                  height={48}
                  rx="4"
                />
              </g>
            );
          })}
        </svg>

        <div className={styles.graphLegend} aria-label="File relation legend">
          <span><i className={styles.graphLegendDocument} />Document</span>
          <span><i className={styles.graphLegendArtifact} />HTML</span>
          <span><i className={styles.graphLegendAsset} />Asset</span>
          <span><i className={styles.graphLegendEmbed} />Embed</span>
        </div>

        <div className={styles.graphRelations}>
          <div className={styles.graphRelationsHeader}>
            <strong>{activeNode ? "Related files" : "Workspace connections"}</strong>
            <small>{relatedEdges.length}</small>
          </div>
          {relatedEdges.slice(0, 40).map((edge) => {
            const source = nodesById.get(edge.sourceId);
            const target = nodesById.get(edge.targetId);
            if (!source || !target) return null;
            const related = activeNode?.id === target.id ? source : target;
            const direction = activeNode?.id === target.id ? "incoming" : "outgoing";
            return (
              <button
                type="button"
                key={`${edge.sourceId}:${edge.targetId}:${edge.kind}`}
                title={`${source.title} -> ${target.title}`}
                onClick={() => openGraphNode(related)}
              >
                <NodeIcon node={related} />
                <span>
                  <strong>{activeNode ? related.title : `${source.title} to ${target.title}`}</strong>
                  <small>{relationLabel(edge.kind, direction, Boolean(activeNode))}</small>
                </span>
                {direction === "incoming" && activeNode ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
              </button>
            );
          })}
          {relatedEdges.length === 0 && (
            <div className={styles.graphEmpty}>
              <strong>{activeNode ? "No related files" : "No connections yet"}</strong>
              <span>
                {activeNode
                  ? "This file has no local links or embeds."
                  : "Connections appear when local files are linked or embedded."}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function NodeIcon({ node }: { node: DocumentGraphNode }) {
  if (node.type === "artifact") return <FileCode2 size={14} />;
  if (node.type === "asset") return <FileImage size={14} />;
  return <FileText size={14} />;
}

function relationLabel(
  kind: "link" | "embed",
  direction: "incoming" | "outgoing",
  hasActiveNode: boolean,
): string {
  if (!hasActiveNode) return kind === "embed" ? "Embedded file" : "Linked file";
  if (kind === "embed") return direction === "incoming" ? "Embeds this file" : "Embedded in this file";
  return direction === "incoming" ? "Links to this file" : "Linked from this file";
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
  const connectedIds = activeId
    ? new Set(
        edges.flatMap((edge) => {
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
  const radiusY = 76;
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

function compactTitle(title: string): string {
  const clean = title.trim() || "Untitled";
  return clean.length > 16 ? `${clean.slice(0, 13)}...` : clean;
}
