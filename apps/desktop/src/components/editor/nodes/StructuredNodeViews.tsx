import { useEffect, useMemo, useState, type PointerEvent } from "react";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { ChevronDown, ChevronRight, Copy, ExternalLink, RefreshCcw } from "lucide-react";
import katex from "katex";
import mermaid from "mermaid";
import type { Artifact, WorkspaceSnapshot } from "@atria/schema";
import { toWorkspaceFileAssetUrl } from "../../../app/workspaceClient";
import { NodeFrame } from "./NodeFrame";
import styles from "../../../app/App.module.css";
import "katex/dist/katex.min.css";

type ArtifactNodeViewProps = NodeViewProps & {
  artifacts: Artifact[];
  snapshot?: WorkspaceSnapshot;
};

type ImageNodeViewProps = NodeViewProps & {
  snapshot?: WorkspaceSnapshot;
};

export function CardNodeView(props: NodeViewProps) {
  const title = String(props.node.attrs.title ?? "Card");
  return (
    <NodeViewWrapper>
      <NodeFrame {...props} className={styles.documentCardNode}>
        <input
          className={styles.nodeTitleInput}
          value={title}
          placeholder="Card title"
          onChange={(event) => props.updateAttributes({ title: event.target.value })}
        />
        <NodeViewContent className={styles.nodeRichBody} />
      </NodeFrame>
    </NodeViewWrapper>
  );
}

export function CalloutNodeView(props: NodeViewProps) {
  const tone = String(props.node.attrs.tone ?? "info");
  const title = String(props.node.attrs.title ?? "Note");
  return (
    <NodeViewWrapper>
      <NodeFrame {...props} className={`${styles.documentCalloutNode} ${styles[`calloutTone_${tone}`]}`}>
        <div className={styles.calloutHeader}>
          <select value={tone} onChange={(event) => props.updateAttributes({ tone: event.target.value })}>
            <option value="info">Info</option>
            <option value="note">Note</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="danger">Error</option>
          </select>
          <input
            value={title}
            placeholder="Callout title"
            onChange={(event) => props.updateAttributes({ title: event.target.value })}
          />
        </div>
        <NodeViewContent className={styles.nodeRichBody} />
      </NodeFrame>
    </NodeViewWrapper>
  );
}

export function ImageNodeView(props: ImageNodeViewProps) {
  const src = String(props.node.attrs.src ?? "");
  const caption = String(props.node.attrs.caption ?? "");
  const alt = String(props.node.attrs.alt ?? caption);
  const width = Number(props.node.attrs.width ?? 640);
  const resolvedSrc = toWorkspaceFileAssetUrl(props.snapshot, src);
  const [failed, setFailed] = useState(false);
  const [dragging, setDragging] = useState(false);

  function startResize(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function resize(event: PointerEvent<HTMLButtonElement>) {
    if (!dragging) return;
    const figure = event.currentTarget.closest("figure");
    const rect = figure?.getBoundingClientRect();
    if (!rect) return;
    const nextWidth = Math.round(Math.max(160, Math.min(1200, event.clientX - rect.left)));
    props.updateAttributes({ width: nextWidth });
  }

  return (
    <NodeViewWrapper>
      <NodeFrame {...props} className={styles.documentImageNode}>
        <figure className={styles.imageFigure} style={{ maxWidth: width }}>
          {src && !failed ? (
            <img src={resolvedSrc} alt={alt} onError={() => setFailed(true)} draggable={false} />
          ) : (
            <div className={styles.nodeError}>Image unavailable</div>
          )}
          <figcaption
            contentEditable
            suppressContentEditableWarning
            onBlur={(event) => props.updateAttributes({ caption: event.currentTarget.textContent ?? "" })}
          >
            {caption}
          </figcaption>
          <button
            className={styles.imageResizeHandle}
            title="Resize image"
            contentEditable={false}
            onPointerDown={startResize}
            onPointerMove={resize}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
          />
        </figure>
      </NodeFrame>
    </NodeViewWrapper>
  );
}

export function ArtifactNodeView(props: ArtifactNodeViewProps) {
  const artifactId = String(props.node.attrs.artifactId ?? "");
  const artifact = props.artifacts.find((item) => item.id === artifactId);
  const collapsed = Boolean(props.node.attrs.collapsed);
  const height = Number(props.node.attrs.height ?? 420);
  const note = String(props.node.attrs.note ?? "");
  const src = artifact?.entryUrl || toWorkspaceFileAssetUrl(props.snapshot, artifact?.filePath);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <NodeViewWrapper>
      <NodeFrame {...props} className={styles.documentArtifactNode}>
        <div className={styles.artifactNodeHeader} contentEditable={false}>
          <button
            className={styles.inlineIconButton}
            title={collapsed ? "Expand" : "Collapse"}
            onClick={() => props.updateAttributes({ collapsed: !collapsed })}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
          <div>
            <strong>{artifact?.title ?? "Missing artifact"}</strong>
            <small>{artifact?.filePath ?? "Select an artifact"}</small>
          </div>
          {src && (
            <>
              <button className={styles.inlineIconButton} title="Reload" onClick={() => setReloadKey((value) => value + 1)}>
                <RefreshCcw size={14} />
              </button>
              <button className={styles.inlineIconButton} title="Open" onClick={() => window.open(src)}>
                <ExternalLink size={14} />
              </button>
            </>
          )}
        </div>
        {!collapsed && (
          <>
            {artifact && src ? (
              <iframe
                key={reloadKey}
                src={src}
                title={artifact.title}
                sandbox="allow-scripts allow-forms allow-popups"
                style={{ height }}
              />
            ) : (
              <div className={styles.nodeError}>Current workspace has no matching artifact</div>
            )}
            <input
              className={styles.captionInput}
              value={note}
              placeholder="Caption"
              onChange={(event) => props.updateAttributes({ note: event.target.value })}
            />
          </>
        )}
      </NodeFrame>
    </NodeViewWrapper>
  );
}

export function CodeBlockNodeView(props: NodeViewProps) {
  const language = String(props.node.attrs.language ?? "text");
  const codeText = props.node.textContent;
  return (
    <NodeViewWrapper className={styles.documentCodeNode}>
      <div className={styles.codeBlockHeader} contentEditable={false}>
        <select value={language} onChange={(event) => props.updateAttributes({ language: event.target.value })}>
          {["text", "bash", "python", "javascript", "typescript", "json", "yaml", "rust", "markdown"].map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <button title="Copy code" onClick={() => void navigator.clipboard?.writeText(codeText)}>
          <Copy size={13} />
        </button>
      </div>
      <pre>
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  );
}

export function MermaidNodeView(props: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const code = String(props.node.attrs.code ?? "");

  useEffect(() => {
    if (editing) return;
    mermaid.initialize({ startOnLoad: false, theme: "neutral" });
    void mermaid
      .render(`atria-mermaid-${props.node.attrs.id ?? Math.random().toString(36).slice(2)}`, code || "graph TD\n  A[Atria] --> B[Artifact]")
      .then((result) => {
        setHtml(result.svg);
        setError("");
      })
      .catch((reason: unknown) => {
        setHtml("");
        setError(reason instanceof Error ? reason.message : "Mermaid render failed");
      });
  }, [code, editing, props.node.attrs.id]);

  return (
    <NodeViewWrapper>
      <NodeFrame {...props} className={styles.documentRenderNode}>
        <div className={styles.previewToggle} contentEditable={false}>
          <button onClick={() => setEditing((value) => !value)}>{editing ? "Preview" : "Edit"}</button>
        </div>
        {editing ? (
          <textarea value={code} onChange={(event) => props.updateAttributes({ code: event.target.value })} />
        ) : error ? (
          <div className={styles.nodeError}>{error}</div>
        ) : (
          <div className={styles.renderedBlock} dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </NodeFrame>
    </NodeViewWrapper>
  );
}

export function LatexNodeView(props: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const formula = String(props.node.attrs.formula ?? "");
  const display = Boolean(props.node.attrs.display ?? true);
  const html = useMemo(
    () => katex.renderToString(formula || " ", { displayMode: display, throwOnError: false }),
    [display, formula],
  );

  return (
    <NodeViewWrapper>
      <NodeFrame {...props} className={styles.documentRenderNode}>
        <div className={styles.previewToggle} contentEditable={false}>
          <button onClick={() => setEditing((value) => !value)}>{editing ? "Preview" : "Edit"}</button>
        </div>
        {editing ? (
          <input value={formula} onChange={(event) => props.updateAttributes({ formula: event.target.value })} />
        ) : (
          <div className={styles.renderedBlock} dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </NodeFrame>
    </NodeViewWrapper>
  );
}

export function HtmlNodeView(props: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const html = String(props.node.attrs.html ?? "");
  const height = Number(props.node.attrs.height ?? 320);
  return (
    <NodeViewWrapper>
      <NodeFrame {...props} className={styles.documentHtmlNode}>
        <div className={styles.previewToggle} contentEditable={false}>
          <button onClick={() => setEditing((value) => !value)}>{editing ? "Preview" : "Edit"}</button>
        </div>
        {editing ? (
          <textarea value={html} onChange={(event) => props.updateAttributes({ html: event.target.value })} />
        ) : (
          <iframe srcDoc={html} title="Custom HTML" sandbox="allow-scripts allow-forms allow-popups" style={{ height }} />
        )}
      </NodeFrame>
    </NodeViewWrapper>
  );
}

export function MetricNodeView(props: NodeViewProps) {
  return (
    <NodeViewWrapper>
      <NodeFrame {...props} className={styles.documentMetricNode}>
        <input
          value={String(props.node.attrs.label ?? "Metric")}
          onChange={(event) => props.updateAttributes({ label: event.target.value })}
        />
        <strong>{String(props.node.attrs.value ?? "") || "0"}</strong>
        <small>{String(props.node.attrs.delta ?? "")}</small>
      </NodeFrame>
    </NodeViewWrapper>
  );
}

export function TimelineNodeView(props: NodeViewProps) {
  const items = Array.isArray(props.node.attrs.items) ? props.node.attrs.items : [];
  return (
    <NodeViewWrapper>
      <NodeFrame {...props} className={styles.documentTimelineNode}>
        {items.length ? (
          items.map((item: Record<string, unknown>, index: number) => (
            <div key={index} className={styles.timelineItem}>
              <time>{String(item.at ?? "")}</time>
              <strong>{String(item.title ?? "")}</strong>
              <p>{String(item.detail ?? "")}</p>
            </div>
          ))
        ) : (
          <div className={styles.nodeError}>Empty timeline</div>
        )}
      </NodeFrame>
    </NodeViewWrapper>
  );
}

export function LegacyNodeView(props: NodeViewProps) {
  return (
    <NodeViewWrapper>
      <NodeFrame {...props} className={styles.documentLegacyNode}>
        <strong>Legacy {String(props.node.attrs.legacyType ?? "content")}</strong>
        <small>Preserved from an older page. The main insert toolbar hides this unfinished feature.</small>
      </NodeFrame>
    </NodeViewWrapper>
  );
}
