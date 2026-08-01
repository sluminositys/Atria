import { describe, expect, it } from "vitest";
import type { DocumentGraphEdge, DocumentGraphNode } from "@atria/core";
import {
  ALL_GRAPH_TYPES,
  clampGraphZoom,
  filterGraphNodes,
  GRAPH_NODE_LIMIT,
  positionGraphNodes,
} from "./documentGraphView";

const nodes: DocumentGraphNode[] = [
  { id: "notes", type: "page", title: "Experiment notes", filePath: "Notes/experiment.html" },
  { id: "report", type: "artifact", title: "Model report", filePath: "Reports/model.html" },
  { id: "chart", type: "asset", title: "accuracy.png", filePath: "Assets/accuracy.png" },
];
const edges: DocumentGraphEdge[] = [
  { sourceId: "notes", targetId: "report", kind: "link" },
  { sourceId: "report", targetId: "chart", kind: "embed" },
];

describe("document graph view", () => {
  it("searches titles and relative paths while respecting type filters", () => {
    expect(filterGraphNodes(nodes, "reports/", ALL_GRAPH_TYPES).map((node) => node.id)).toEqual(["report"]);
    expect(filterGraphNodes(nodes, "experiment", { ...ALL_GRAPH_TYPES, page: false })).toEqual([]);
  });

  it("focuses an active file and its direct relations", () => {
    const positioned = positionGraphNodes(nodes, edges, "notes");
    expect(positioned.map((node) => node.id)).toEqual(["notes", "report"]);
    expect(positioned[0]).toMatchObject({ x: 150, y: 110 });
  });

  it("limits a workspace overview to the most useful nodes", () => {
    const manyNodes = Array.from({ length: 30 }, (_, index) => ({
      id: `node-${index}`,
      type: "page" as const,
      title: `Node ${index}`,
      filePath: `Notes/${index}.html`,
    }));
    expect(positionGraphNodes(manyNodes, [], undefined)).toHaveLength(GRAPH_NODE_LIMIT);
  });

  it("keeps zoom within the supported readable range", () => {
    expect(clampGraphZoom(0.1)).toBe(0.7);
    expect(clampGraphZoom(1.24)).toBe(1.2);
    expect(clampGraphZoom(4)).toBe(1.8);
  });
});
