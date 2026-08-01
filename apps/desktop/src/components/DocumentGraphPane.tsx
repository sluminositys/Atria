import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  FileCode2,
  FileImage,
  FileText,
  Focus,
  Maximize2,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { buildDocumentGraph, type DocumentGraphNode } from "@atria/core";
import { WorkspaceSnapshot } from "@atria/schema";
import { useAtriaStore } from "../app/store";
import {
  ALL_GRAPH_TYPES,
  clampGraphZoom,
  filterGraphNodes,
  GRAPH_HEIGHT,
  GRAPH_WIDTH,
  positionGraphNodes,
  type GraphNodeType,
  type GraphTypeFilter,
} from "./documentGraphView";
import styles from "../app/App.module.css";

interface GraphPan {
  x: number;
  y: number;
}

interface DragOrigin {
  pointerId: number;
  clientX: number;
  clientY: number;
  pan: GraphPan;
}

const graphTypeOptions: Array<{ type: GraphNodeType; label: string; icon: typeof FileText }> = [
  { type: "page", label: "Documents", icon: FileText },
  { type: "artifact", label: "HTML Artifacts", icon: FileCode2 },
  { type: "asset", label: "Assets", icon: FileImage },
];

export function DocumentGraphPane({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const { activeTabKey, tabs, openNode } = useAtriaStore();
  const activeTab = tabs.find((tab) => tab.key === activeTabKey);
  const graph = useMemo(() => buildDocumentGraph(snapshot), [snapshot]);
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<GraphTypeFilter>(ALL_GRAPH_TYPES);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<GraphPan>({ x: 0, y: 0 });
  const dragOrigin = useRef<DragOrigin | null>(null);
  const nodesById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const activeNode = activeTab ? nodesById.get(activeTab.id) : undefined;
  const filteredNodes = useMemo(() => filterGraphNodes(graph.nodes, query, types), [graph.nodes, query, types]);
  const filteredIds = useMemo(() => new Set(filteredNodes.map((node) => node.id)), [filteredNodes]);
  const filteredEdges = useMemo(
    () => graph.edges.filter((edge) => filteredIds.has(edge.sourceId) && filteredIds.has(edge.targetId)),
    [filteredIds, graph.edges],
  );
  const focusedId = !query.trim() && activeNode && filteredIds.has(activeNode.id) ? activeNode.id : undefined;
  const visibleNodes = useMemo(
    () => positionGraphNodes(filteredNodes, filteredEdges, focusedId),
    [filteredEdges, filteredNodes, focusedId],
  );
  const positions = new Map(visibleNodes.map((node) => [node.id, node]));
  const visibleEdges = filteredEdges.filter((edge) => positions.has(edge.sourceId) && positions.has(edge.targetId));
  const relationEdges = focusedId
    ? visibleEdges.filter((edge) => edge.sourceId === focusedId || edge.targetId === focusedId)
    : visibleEdges;
  const viewWidth = GRAPH_WIDTH / zoom;
  const viewHeight = GRAPH_HEIGHT / zoom;
  const viewX = (GRAPH_WIDTH - viewWidth) / 2 - pan.x;
  const viewY = (GRAPH_HEIGHT - viewHeight) / 2 - pan.y;

  const openGraphNode = (node: DocumentGraphNode) => openNode(node.type, node.id);
  const fitGraph = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <>
      <div className={styles.sideTitle}>
        <strong>File relations</strong>
        <span>{graph.nodes.length} files / {graph.edges.length} connections</span>
      </div>
      <div className={styles.documentGraphPane}>
        <label className={styles.graphSearch}>
          <Search size={14} />
          <input
            value={query}
            aria-label="Search file relations"
            placeholder="Find a file"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button type="button" title="Clear graph search" aria-label="Clear graph search" onClick={() => setQuery("")}>
              <X size={13} />
            </button>
          )}
        </label>

        <div className={styles.graphToolbar}>
          <div className={styles.graphTypeFilters} aria-label="File type filters">
            {graphTypeOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.type}
                  type="button"
                  className={types[option.type] ? styles.graphToolActive : undefined}
                  title={`${types[option.type] ? "Hide" : "Show"} ${option.label.toLowerCase()}`}
                  aria-label={`${types[option.type] ? "Hide" : "Show"} ${option.label.toLowerCase()}`}
                  aria-pressed={types[option.type]}
                  onClick={() => setTypes((current) => ({ ...current, [option.type]: !current[option.type] }))}
                >
                  <Icon size={13} />
                </button>
              );
            })}
          </div>
          <span className={styles.graphToolbarCount}>{filteredNodes.length} {query.trim() ? "matching" : "files"}</span>
          <div className={styles.graphZoomControls} aria-label="Graph view controls">
            <button
              type="button"
              title="Zoom out"
              aria-label="Zoom out"
              disabled={zoom <= 0.7}
              onClick={() => setZoom((current) => clampGraphZoom(current - 0.1))}
            >
              <ZoomOut size={13} />
            </button>
            <button type="button" title="Fit graph" aria-label="Fit graph" onClick={fitGraph}>
              <Maximize2 size={13} />
            </button>
            <button
              type="button"
              title="Zoom in"
              aria-label="Zoom in"
              disabled={zoom >= 1.8}
              onClick={() => setZoom((current) => clampGraphZoom(current + 0.1))}
            >
              <ZoomIn size={13} />
            </button>
          </div>
        </div>

        <div className={styles.graphScope}>
          <Focus size={13} />
          <strong>{focusedId ? activeNode?.title : query.trim() ? "Search results" : "Workspace"}</strong>
          <small>{visibleNodes.length === filteredNodes.length ? `${visibleNodes.length} shown` : `${visibleNodes.length} of ${filteredNodes.length}`}</small>
        </div>
        <svg
          className={styles.documentGraphCanvas}
          viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`}
          role="img"
          aria-label="Document relationship graph"
          data-dragging={Boolean(dragOrigin.current)}
          onPointerDown={beginPan}
          onPointerMove={continuePan}
          onPointerUp={endPan}
          onPointerCancel={endPan}
        >
          {visibleEdges.map((edge) => {
            const source = positions.get(edge.sourceId)!;
            const target = positions.get(edge.targetId)!;
            const isActive = focusedId && (edge.sourceId === focusedId || edge.targetId === focusedId);
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
            const active = node.id === focusedId;
            return (
              <g
                key={`${node.type}:${node.id}`}
                className={styles.graphNode}
                data-graph-node="true"
                role="button"
                tabIndex={0}
                aria-label={`Open ${node.title}`}
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
          {!visibleNodes.length && (
            <text className={styles.graphCanvasEmpty} x={GRAPH_WIDTH / 2} y={GRAPH_HEIGHT / 2} textAnchor="middle">
              {query.trim() ? "No matching files" : "No file types selected"}
            </text>
          )}
        </svg>

        <div className={styles.graphLegend} aria-label="File relation legend">
          <span><i className={styles.graphLegendDocument} />Document</span>
          <span><i className={styles.graphLegendArtifact} />HTML</span>
          <span><i className={styles.graphLegendAsset} />Asset</span>
          <span><i className={styles.graphLegendEmbed} />Embed</span>
        </div>

        <div className={styles.graphRelations}>
          <div className={styles.graphRelationsHeader}>
            <strong>{focusedId ? "Related files" : "Visible connections"}</strong>
            <small>{relationEdges.length}</small>
          </div>
          {relationEdges.slice(0, 40).map((edge) => {
            const source = nodesById.get(edge.sourceId);
            const target = nodesById.get(edge.targetId);
            if (!source || !target) return null;
            const related = focusedId === target.id ? source : target;
            const direction = focusedId === target.id ? "incoming" : "outgoing";
            return (
              <button
                type="button"
                key={`${edge.sourceId}:${edge.targetId}:${edge.kind}`}
                title={`${source.title} -> ${target.title}`}
                onClick={() => openGraphNode(related)}
              >
                <NodeIcon node={related} />
                <span>
                  <strong>{focusedId ? related.title : `${source.title} to ${target.title}`}</strong>
                  <small>{relationLabel(edge.kind, direction, Boolean(focusedId))}</small>
                </span>
                {direction === "incoming" && focusedId ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
              </button>
            );
          })}
          {relationEdges.length === 0 && (
            <div className={styles.graphEmpty}>
              <strong>{query.trim() ? "No matching connections" : focusedId ? "No related files" : "No connections yet"}</strong>
              <span>
                {query.trim()
                  ? "Try a broader file name or enable another file type."
                  : focusedId
                    ? "This file has no local links or embeds."
                    : "Connections appear when local files are linked or embedded."}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );

  function beginPan(event: ReactPointerEvent<SVGSVGElement>) {
    if ((event.target as Element).closest("[data-graph-node]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOrigin.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      pan,
    };
    event.currentTarget.dataset.dragging = "true";
  }

  function continuePan(event: ReactPointerEvent<SVGSVGElement>) {
    const origin = dragOrigin.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    const scaleX = viewWidth / Math.max(event.currentTarget.clientWidth, 1);
    const scaleY = viewHeight / Math.max(event.currentTarget.clientHeight, 1);
    setPan({
      x: origin.pan.x + (event.clientX - origin.clientX) * scaleX,
      y: origin.pan.y + (event.clientY - origin.clientY) * scaleY,
    });
  }

  function endPan(event: ReactPointerEvent<SVGSVGElement>) {
    if (dragOrigin.current?.pointerId !== event.pointerId) return;
    dragOrigin.current = null;
    event.currentTarget.dataset.dragging = "false";
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
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

function compactTitle(title: string): string {
  const clean = title.trim() || "Untitled";
  return clean.length > 16 ? `${clean.slice(0, 13)}...` : clean;
}
