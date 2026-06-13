import { useEffect, useMemo, useState } from "react";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { ChevronDown, ChevronRight, Copy, ExternalLink, RefreshCcw, RotateCcw } from "lucide-react";
import katex from "katex";
import mermaid from "mermaid";
import type { Artifact, WorkspaceSnapshot } from "@atria/schema";
import { toWorkspaceFileAssetUrl } from "../../../app/workspaceClient";
import { DirectManipulationLayer } from "../interaction/DirectManipulationLayer";
import { MathSourceInput } from "../MathSourceInput";
import styles from "../../../app/App.module.css";
import "katex/dist/katex.min.css";

type ArtifactNodeViewProps = NodeViewProps & {
  artifacts: Artifact[];
  snapshot?: WorkspaceSnapshot;
};

type ImageNodeViewProps = NodeViewProps & {
  snapshot?: WorkspaceSnapshot;
};

const calloutTones = ["info", "note", "success", "warning", "danger"] as const;

export function CardNodeView(props: NodeViewProps) {
  const title = String(props.node.attrs.title ?? "Card");
  return (
    <NodeViewWrapper>
      <DirectManipulationLayer {...props} className={styles.nodeBlockObject} resizeMode="width" resizeBounds={{ minWidth: 260 }}>
        <section className={styles.documentCardNode}>
          <EditableNodeTitle value={title} placeholder="Card title" onCommit={(value) => props.updateAttributes({ title: value || "Card" })} />
          <NodeViewContent className={styles.nodeRichBody} />
        </section>
      </DirectManipulationLayer>
    </NodeViewWrapper>
  );
}

export function CalloutNodeView(props: NodeViewProps) {
  const tone = String(props.node.attrs.tone ?? "info");
  const title = String(props.node.attrs.title ?? "Note");
  const nextTone = calloutTones[(calloutTones.indexOf(tone as (typeof calloutTones)[number]) + 1) % calloutTones.length] ?? "info";
  return (
    <NodeViewWrapper>
      <DirectManipulationLayer {...props} className={styles.nodeBlockObject} resizeMode="width" resizeBounds={{ minWidth: 260 }}>
        <aside className={`${styles.documentCalloutNode} ${styles[`calloutTone_${tone}`]}`}>
          <div className={styles.calloutHeader}>
            <button
              className={styles.calloutToneButton}
              title={`Tone: ${tone}`}
              contentEditable={false}
              onClick={() => props.updateAttributes({ tone: nextTone })}
            />
            <EditableNodeTitle value={title} placeholder="Callout title" onCommit={(value) => props.updateAttributes({ title: value || "Note" })} />
          </div>
          <NodeViewContent className={styles.nodeRichBody} />
        </aside>
      </DirectManipulationLayer>
    </NodeViewWrapper>
  );
}

export function ImageNodeView(props: ImageNodeViewProps) {
  const src = String(props.node.attrs.src ?? "");
  const caption = String(props.node.attrs.caption ?? "");
  const alt = String(props.node.attrs.alt ?? caption);
  const resolvedSrc = toWorkspaceFileAssetUrl(props.snapshot, src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [resolvedSrc]);

  return (
    <NodeViewWrapper className={styles.imageNodeWrapper}>
      <DirectManipulationLayer
        {...props}
        className={styles.imageInteractionLayer}
        resizeMode="image"
        resizeBounds={{ minWidth: 120, maxWidth: 1280 }}
        lockAspectRatioOnCorner
      >
        <figure className={styles.imageNode}>
          {src && !failed ? (
            <img src={resolvedSrc} alt={alt} onError={() => setFailed(true)} />
          ) : (
            <div className={styles.imageErrorCard} contentEditable={false}>
              <strong>Image unavailable</strong>
              <span>{src || "No image source"}</span>
              {src && (
                <button onClick={() => setFailed(false)}>
                  <RotateCcw size={14} />
                  Retry
                </button>
              )}
            </div>
          )}
          {(caption || props.selected) && (
            <figcaption
              className={caption ? styles.imageCaption : styles.imageCaptionEmpty}
              contentEditable
              suppressContentEditableWarning
              data-placeholder="Add caption"
              onBlur={(event) => props.updateAttributes({ caption: event.currentTarget.textContent?.trim() ?? "" })}
            >
              {caption}
            </figcaption>
          )}
        </figure>
      </DirectManipulationLayer>
    </NodeViewWrapper>
  );
}

export function ArtifactNodeView(props: ArtifactNodeViewProps) {
  const artifactId = String(props.node.attrs.artifactId ?? "");
  const artifact = props.artifacts.find((item) => item.id === artifactId);
  const collapsed = Boolean(props.node.attrs.collapsed);
  const note = String(props.node.attrs.note ?? "");
  const src = artifact?.entryUrl || toWorkspaceFileAssetUrl(props.snapshot, artifact?.filePath);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <NodeViewWrapper>
      <DirectManipulationLayer
        {...props}
        className={styles.nodeBlockObject}
        resizeMode="both"
        resizeBounds={{ minWidth: 320, minHeight: 220, maxWidth: 1280, maxHeight: 960 }}
      >
        <section className={styles.documentArtifactNode}>
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
                <div className={styles.artifactViewport}>
                  <iframe key={reloadKey} src={src} title={artifact.title} sandbox="allow-scripts allow-forms allow-popups" />
                </div>
              ) : (
                <div className={styles.nodeError}>Current workspace has no matching artifact</div>
              )}
              {(note || props.selected) && (
                <div
                  className={styles.artifactCaption}
                  contentEditable
                  suppressContentEditableWarning
                  data-placeholder="Add note"
                  onBlur={(event) => props.updateAttributes({ note: event.currentTarget.textContent?.trim() ?? "" })}
                >
                  {note}
                </div>
              )}
            </>
          )}
        </section>
      </DirectManipulationLayer>
    </NodeViewWrapper>
  );
}

export function CodeBlockNodeView(props: NodeViewProps) {
  const language = String(props.node.attrs.language ?? "text");
  const codeText = props.node.textContent;
  return (
    <NodeViewWrapper>
      <DirectManipulationLayer
        {...props}
        className={styles.nodeBlockObject}
        resizeMode="height"
        resizeBounds={{ minHeight: 116, maxHeight: 720 }}
      >
        <section className={styles.documentCodeNode}>
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
        </section>
      </DirectManipulationLayer>
    </NodeViewWrapper>
  );
}

export function MermaidNodeView(props: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const code = String(props.node.attrs.code ?? "");

  useEffect(() => {
    if (!props.selected) setEditing(false);
  }, [props.selected]);

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
      <DirectManipulationLayer
        {...props}
        className={styles.nodeBlockObject}
        resizeMode="both"
        resizeBounds={{ minWidth: 260, minHeight: 160, maxWidth: 1280, maxHeight: 900 }}
      >
        <section className={styles.documentRenderNode}>
          <PreviewToggle editing={editing} onToggle={() => setEditing((value) => !value)} />
          {editing ? (
            <textarea value={code} onChange={(event) => props.updateAttributes({ code: event.target.value })} />
          ) : error ? (
            <div className={styles.nodeError}>{error}</div>
          ) : (
            <div className={styles.renderedBlock} dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </section>
      </DirectManipulationLayer>
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

  useEffect(() => {
    if (!props.selected) setEditing(false);
  }, [props.selected]);

  return (
    <NodeViewWrapper>
      <DirectManipulationLayer
        {...props}
        className={styles.nodeBlockObject}
        resizeMode="width"
        resizeBounds={{ minWidth: 180, maxWidth: 980 }}
      >
        <section className={styles.documentRenderNode}>
          <PreviewToggle editing={editing} onToggle={() => setEditing((value) => !value)} />
          {editing ? (
            <MathSourceInput
              value={formula}
              multiline
              ariaLabel="Display formula"
              onChange={(value) => props.updateAttributes({ formula: value })}
            />
          ) : (
            <div className={styles.renderedBlock} dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </section>
      </DirectManipulationLayer>
    </NodeViewWrapper>
  );
}

export function InlineMathNodeView(props: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const formula = String(props.node.attrs.formula ?? "x");
  const html = useMemo(
    () => katex.renderToString(formula || " ", { displayMode: false, throwOnError: false }),
    [formula],
  );

  useEffect(() => {
    if (!props.selected) setEditing(false);
  }, [props.selected]);

  return (
    <NodeViewWrapper
      as="span"
      className={props.selected ? styles.inlineMathSelected : styles.inlineMath}
      onDoubleClick={() => setEditing(true)}
    >
      {editing ? (
        <MathSourceInput
          autoFocus
          value={formula}
          ariaLabel="Inline formula"
          onChange={(value) => props.updateAttributes({ formula: value })}
          onBlur={() => setEditing(false)}
          onExit={() => setEditing(false)}
        />
      ) : (
        <span dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </NodeViewWrapper>
  );
}

export function HtmlNodeView(props: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const html = String(props.node.attrs.html ?? "");

  useEffect(() => {
    if (!props.selected) setEditing(false);
  }, [props.selected]);
  return (
    <NodeViewWrapper>
      <DirectManipulationLayer
        {...props}
        className={styles.nodeBlockObject}
        resizeMode="both"
        resizeBounds={{ minWidth: 280, minHeight: 180, maxWidth: 1280, maxHeight: 960 }}
      >
        <section className={styles.documentHtmlNode}>
          <PreviewToggle editing={editing} onToggle={() => setEditing((value) => !value)} />
          {editing ? (
            <textarea value={html} onChange={(event) => props.updateAttributes({ html: event.target.value })} />
          ) : (
            <div className={styles.htmlViewport}>
              <iframe srcDoc={html} title="Custom HTML" sandbox="allow-scripts allow-forms allow-popups" />
            </div>
          )}
        </section>
      </DirectManipulationLayer>
    </NodeViewWrapper>
  );
}

export function MetricNodeView(props: NodeViewProps) {
  return (
    <NodeViewWrapper>
      <DirectManipulationLayer {...props} className={styles.nodeBlockObject} resizeMode="width" resizeBounds={{ minWidth: 180, maxWidth: 520 }}>
        <section className={styles.documentMetricNode}>
          <EditableInline value={String(props.node.attrs.label ?? "Metric")} onCommit={(value) => props.updateAttributes({ label: value || "Metric" })} />
          <strong
            contentEditable
            suppressContentEditableWarning
            onBlur={(event) => props.updateAttributes({ value: event.currentTarget.textContent?.trim() ?? "0" })}
          >
            {String(props.node.attrs.value ?? "") || "0"}
          </strong>
          <small
            contentEditable
            suppressContentEditableWarning
            onBlur={(event) => props.updateAttributes({ delta: event.currentTarget.textContent?.trim() ?? "" })}
          >
            {String(props.node.attrs.delta ?? "")}
          </small>
        </section>
      </DirectManipulationLayer>
    </NodeViewWrapper>
  );
}

export function TimelineNodeView(props: NodeViewProps) {
  const items = Array.isArray(props.node.attrs.items) ? props.node.attrs.items : [];
  return (
    <NodeViewWrapper>
      <DirectManipulationLayer {...props} className={styles.nodeBlockObject} resizeMode="width" resizeBounds={{ minWidth: 300, maxWidth: 1120 }}>
        <section className={styles.documentTimelineNode}>
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
        </section>
      </DirectManipulationLayer>
    </NodeViewWrapper>
  );
}

export function LegacyNodeView(props: NodeViewProps) {
  return (
    <NodeViewWrapper>
      <DirectManipulationLayer {...props} className={styles.nodeBlockObject} resizeMode="width" resizeBounds={{ minWidth: 260, maxWidth: 960 }}>
        <section className={styles.documentLegacyNode}>
          <strong>Legacy {String(props.node.attrs.legacyType ?? "content")}</strong>
          <small>Preserved from an older page. The main insert toolbar hides this unfinished feature.</small>
        </section>
      </DirectManipulationLayer>
    </NodeViewWrapper>
  );
}

function EditableNodeTitle({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder: string;
  onCommit(value: string): void;
}) {
  return (
    <div
      className={styles.nodeTitleEditable}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onBlur={(event) => onCommit(event.currentTarget.textContent?.trim() ?? "")}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    >
      {value}
    </div>
  );
}

function EditableInline({ value, onCommit }: { value: string; onCommit(value: string): void }) {
  return (
    <span
      contentEditable
      suppressContentEditableWarning
      onBlur={(event) => onCommit(event.currentTarget.textContent?.trim() ?? "")}
    >
      {value}
    </span>
  );
}

function PreviewToggle({ editing, onToggle }: { editing: boolean; onToggle(): void }) {
  return (
    <div className={styles.previewToggle} contentEditable={false}>
      <button onClick={onToggle}>{editing ? "Preview" : "Edit"}</button>
    </div>
  );
}
