export interface VirtualDocumentMetric {
  nodeId: string;
  top: number;
  height: number;
}

export function findMetricAtY(metrics: VirtualDocumentMetric[], y: number): VirtualDocumentMetric | null {
  return metrics.find((metric) => y >= metric.top && y <= metric.top + metric.height) ?? null;
}
