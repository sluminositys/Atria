import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  ImageUp,
  ListOrdered,
  Maximize2,
  Palette,
  RefreshCcw,
  RotateCcw,
  WrapText,
} from "lucide-react";
import type { Artifact, WorkspaceSnapshot } from "@atria/schema";
import { importImageDataUrl, toWorkspaceFileAssetUrl } from "../../../app/workspaceClient";
import { imageFileValidationError, readImageFileAsDataUrl } from "../imageFiles";
import { DirectManipulationLayer } from "../interaction/DirectManipulationLayer";
import { MathSourceInput } from "../MathSourceInput";
import styles from "../../../app/App.module.css";

type ArtifactNodeViewProps = NodeViewProps & {
  artifacts: Artifact[];
  snapshot?: WorkspaceSnapshot;
};

type ImageNodeViewProps = NodeViewProps & {
  snapshot?: WorkspaceSnapshot;
};

const calloutToneOptions = [
  { value: "info", label: "Info" },
  { value: "note", label: "Note" },
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
  { value: "danger", label: "Danger" },
] as const;

type CalloutTone = (typeof calloutToneOptions)[number]["value"];

export function CardNodeView(props: NodeViewProps) {
  const title = String(props.node.attrs.title ?? "");
  return (
    <NodeViewWrapper>
      <DirectManipulationLayer {...props} className={styles.nodeBlockObject} resizeMode="width" resizeBounds={{ minWidth: 260 }}>
        <section className={styles.documentCardNode}>
          <EditableNodeTitle
            value={title}
            placeholder="Optional title"
            optional={!title}
            onCommit={(value) => props.updateAttributes({ title: value })}
          />
          <NodeViewContent className={styles.nodeRichBody} />
        </section>
      </DirectManipulationLayer>
    </NodeViewWrapper>
  );
}

export function CalloutNodeView(props: NodeViewProps) {
  const requestedTone = String(props.node.attrs.tone ?? "info");
  const tone = calloutToneOptions.some((item) => item.value === requestedTone) ? requestedTone as CalloutTone : "info";
  const title = String(props.node.attrs.title ?? "Note");
  const [toneMenuOpen, setToneMenuOpen] = useState(false);
  const toneButtonRef = useRef<HTMLButtonElement | null>(null);
  const toneMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!toneMenuOpen) return;
    const selectedItem = toneMenuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
    selectedItem?.focus();
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!toneMenuRef.current?.contains(event.target as Node) && !toneButtonRef.current?.contains(event.target as Node)) {
        setToneMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [toneMenuOpen]);

  function chooseTone(value: CalloutTone) {
    props.updateAttributes({ tone: value });
    setToneMenuOpen(false);
    toneButtonRef.current?.focus();
  }

  function handleToneMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(toneMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      setToneMenuOpen(false);
      toneButtonRef.current?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || !items.length) return;
    event.preventDefault();
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <NodeViewWrapper>
      <DirectManipulationLayer {...props} className={styles.nodeBlockObject} resizeMode="width" resizeBounds={{ minWidth: 260 }}>
        <aside className={`${styles.documentCalloutNode} ${styles[`calloutTone_${tone}`]}`}>
          <div className={styles.calloutHeader}>
            <button
              ref={toneButtonRef}
              type="button"
              className={styles.calloutToneButton}
              title={`Tone: ${calloutToneOptions.find((item) => item.value === tone)?.label}`}
              aria-label="Change callout tone"
              aria-haspopup="menu"
              aria-expanded={toneMenuOpen}
              contentEditable={false}
              onClick={() => setToneMenuOpen((value) => !value)}
            >
              <Palette size={14} />
              <span className={`${styles.calloutToneSwatch} ${styles[`calloutToneSwatch_${tone}`]}`} />
              <ChevronDown size={12} />
            </button>
            {toneMenuOpen && (
              <div
                ref={toneMenuRef}
                role="menu"
                aria-label="Callout tone"
                className={styles.calloutToneMenu}
                contentEditable={false}
                onKeyDown={handleToneMenuKeyDown}
              >
                {calloutToneOptions.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={tone === item.value}
                    onClick={() => chooseTone(item.value)}
                  >
                    <span className={`${styles.calloutToneSwatch} ${styles[`calloutToneSwatch_${item.value}`]}`} />
                    <span>{item.label}</span>
                    {tone === item.value && <Check size={13} />}
                  </button>
                ))}
              </div>
            )}
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
  const [altDraft, setAltDraft] = useState(alt);
  const [naturalWidth, setNaturalWidth] = useState(0);
  const [replaceState, setReplaceState] = useState<{ kind: "idle" | "busy" | "success" | "error"; message: string }>({
    kind: "idle",
    message: "",
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const altInputId = useId();

  useEffect(() => {
    setFailed(false);
    setNaturalWidth(0);
  }, [resolvedSrc]);

  useEffect(() => setAltDraft(alt), [alt]);

  async function replaceImage(file: File) {
    try {
      const validationError = imageFileValidationError(file);
      if (validationError) throw new Error(validationError);
      if (!props.snapshot?.settings.workspacePath) throw new Error("Open a Workspace before replacing this image.");
      setReplaceState({ kind: "busy", message: "Importing image..." });
      const dataUrl = await readImageFileAsDataUrl(file);
      const nextSrc = await importImageDataUrl(props.snapshot, dataUrl);
      const nextAlt = alt.trim() || file.name;
      props.updateAttributes({ src: nextSrc, alt: nextAlt });
      setAltDraft(nextAlt);
      setFailed(false);
      setReplaceState({ kind: "success", message: "Image replaced" });
    } catch (error) {
      setReplaceState({
        kind: "error",
        message: error instanceof Error ? error.message : "Image replacement failed.",
      });
    }
  }

  function fitImage() {
    const availableWidth = Math.max(120, Math.min(1280, props.editor.view.dom.clientWidth));
    props.updateAttributes({ width: Math.round(availableWidth), offsetX: 0 });
  }

  function useActualImageSize() {
    if (!naturalWidth) return;
    props.updateAttributes({ width: Math.max(120, Math.min(1280, naturalWidth)), offsetX: 0 });
  }

  function commitAltText() {
    const nextAlt = altDraft.trim();
    if (nextAlt !== alt) props.updateAttributes({ alt: nextAlt });
  }

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
          {props.selected && (
            <div className={styles.imageNodeToolbar} contentEditable={false}>
              <button
                type="button"
                aria-label="Replace image"
                title="Replace image"
                disabled={replaceState.kind === "busy" || !props.snapshot}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageUp size={15} />
              </button>
              <button
                type="button"
                aria-label="Fit image to document"
                title="Fit to document"
                onMouseDown={(event) => event.preventDefault()}
                onClick={fitImage}
              >
                <Maximize2 size={15} />
              </button>
              <button
                type="button"
                aria-label="Use actual image size"
                title="Actual size"
                disabled={!naturalWidth}
                onMouseDown={(event) => event.preventDefault()}
                onClick={useActualImageSize}
              >
                <RotateCcw size={15} />
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept="image/*"
            aria-label="Replace image file"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void replaceImage(file);
              event.currentTarget.value = "";
            }}
          />
          {src && !failed ? (
            <img
              src={resolvedSrc}
              alt={alt}
              onLoad={(event) => {
                setFailed(false);
                setNaturalWidth(event.currentTarget.naturalWidth);
              }}
              onError={() => setFailed(true)}
            />
          ) : (
            <div className={styles.imageErrorCard} contentEditable={false}>
              <strong>Image unavailable</strong>
              <span>{src ? "The source file could not be loaded." : "This image has no source file."}</span>
              <div>
                {src && <button type="button" onClick={() => setFailed(false)}>
                  <RotateCcw size={14} />
                  Retry
                </button>}
                <button type="button" disabled={!props.snapshot} onClick={() => fileInputRef.current?.click()}>
                  <ImageUp size={14} />
                  Replace
                </button>
              </div>
            </div>
          )}
          {props.selected && (
            <div className={styles.imageMetadataPanel} contentEditable={false}>
              <label htmlFor={altInputId}>Alt text</label>
              <input
                id={altInputId}
                value={altDraft}
                placeholder="Describe the image"
                onChange={(event) => setAltDraft(event.target.value)}
                onBlur={commitAltText}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  } else if (event.key === "Escape") {
                    setAltDraft(alt);
                    event.currentTarget.blur();
                  }
                }}
              />
              <span role="status" data-state={replaceState.kind}>{replaceState.message}</span>
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
  const src = toWorkspaceFileAssetUrl(props.snapshot, artifact?.entryUrl || artifact?.filePath);
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
  const lineNumbers = Boolean(props.node.attrs.lineNumbers ?? true);
  const wrap = Boolean(props.node.attrs.wrap ?? false);
  const lineNumberRef = useRef<HTMLDivElement | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const lines = Math.max(1, codeText.split("\n").length);

  useEffect(() => {
    if (copyState === "idle") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function copyCode() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(codeText);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

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
            <select aria-label="Code language" value={language} onChange={(event) => props.updateAttributes({ language: event.target.value })}>
              {["text", "bash", "python", "javascript", "typescript", "json", "yaml", "rust", "markdown"].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <span>
              <button
                className={lineNumbers ? styles.codeHeaderButtonActive : undefined}
                title="Toggle line numbers"
                aria-label="Toggle line numbers"
                aria-pressed={lineNumbers}
                onClick={() => props.updateAttributes({ lineNumbers: !lineNumbers })}
              >
                <ListOrdered size={13} />
              </button>
              <button
                className={wrap ? styles.codeHeaderButtonActive : undefined}
                title="Toggle line wrapping"
                aria-label="Toggle line wrapping"
                aria-pressed={wrap}
                onClick={() => props.updateAttributes({ wrap: !wrap })}
              >
                <WrapText size={13} />
              </button>
              <button
                className={copyState === "error" ? styles.codeCopyError : undefined}
                title={copyState === "copied" ? "Code copied" : copyState === "error" ? "Copy failed" : "Copy code"}
                aria-label={copyState === "copied" ? "Code copied" : copyState === "error" ? "Copy failed" : "Copy code"}
                onClick={() => void copyCode()}
              >
                {copyState === "copied" ? <Check size={13} /> : <Copy size={13} />}
              </button>
              <span className={styles.visuallyHidden} role="status">
                {copyState === "copied" ? "Code copied" : copyState === "error" ? "Copy failed" : ""}
              </span>
            </span>
          </div>
          <div
            className={styles.codeBlockBody}
            data-line-numbers={lineNumbers ? "true" : "false"}
            data-wrap={wrap ? "true" : "false"}
          >
            {lineNumbers && (
              <div ref={lineNumberRef} className={styles.codeLineNumbers} contentEditable={false} aria-hidden="true">
                {Array.from({ length: lines }, (_, index) => <span key={index}>{index + 1}</span>)}
              </div>
            )}
            <pre onScroll={(event) => { if (lineNumberRef.current) lineNumberRef.current.scrollTop = event.currentTarget.scrollTop; }}>
              <NodeViewContent as="code" />
            </pre>
          </div>
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
    let active = true;
    void import("../renderers/mermaidRenderer")
      .then(({ renderMermaid }) => renderMermaid(
        `atria-mermaid-${props.node.attrs.atriaId ?? Math.random().toString(36).slice(2)}`,
        code,
      ))
      .then((svg) => {
        if (!active) return;
        setHtml(svg);
        setError("");
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setHtml("");
        setError(reason instanceof Error ? reason.message : "Mermaid render failed");
      });
    return () => {
      active = false;
    };
  }, [code, editing, props.node.attrs.atriaId]);

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
  const html = useLatexHtml(formula, display);

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
  const html = useLatexHtml(formula, false);

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
  optional = false,
  onCommit,
}: {
  value: string;
  placeholder: string;
  optional?: boolean;
  onCommit(value: string): void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  function commit() {
    const nextValue = draft.trim();
    if (nextValue !== value) onCommit(nextValue);
  }

  return (
    <input
      type="text"
      className={[styles.nodeTitleEditable, optional ? styles.nodeTitleEditableOptional : ""].join(" ")}
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
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

function useLatexHtml(formula: string, displayMode: boolean): string {
  const [html, setHtml] = useState("");
  useEffect(() => {
    let active = true;
    void import("../renderers/latexRenderer").then(({ renderLatex }) => {
      if (active) setHtml(renderLatex(formula, displayMode));
    });
    return () => {
      active = false;
    };
  }, [displayMode, formula]);
  return html;
}
