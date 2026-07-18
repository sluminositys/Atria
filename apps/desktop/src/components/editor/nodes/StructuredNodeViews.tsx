import { lazy, Suspense, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Code2,
  Eye,
  ExternalLink,
  ImageUp,
  ListOrdered,
  Maximize2,
  Palette,
  RefreshCcw,
  RotateCcw,
  WrapText,
  X,
} from "lucide-react";
import type { Artifact, WorkspaceSnapshot } from "@atria/schema";
import { importImageDataUrl, toWorkspaceFileAssetUrl } from "../../../app/workspaceClient";
import { imageFileValidationError, readImageFileAsDataUrl } from "../imageFiles";
import { buildHtmlPreviewDocument, defaultHtmlSource } from "../htmlPreview";
import { formatLatexError, formatMermaidError } from "../renderNodeErrors";
import { DirectManipulationLayer } from "../interaction/DirectManipulationLayer";
import { MathSourceInput } from "../MathSourceInput";
import styles from "../../../app/App.module.css";

const HtmlSourceEditor = lazy(() =>
  import("../HtmlSourceEditor").then((module) => ({ default: module.HtmlSourceEditor })),
);

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

const defaultMermaidSource = "flowchart TD\n  A[Atria] --> B[Result]";
const defaultLatexSource = String.raw`E = mc^2`;

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
  const [rendering, setRendering] = useState(true);
  const renderSequenceRef = useRef(0);
  const code = String(props.node.attrs.code ?? "");
  const { copyState, copy } = useCopyFeedback(code);

  useEffect(() => {
    if (!props.selected) setEditing(false);
  }, [props.selected]);

  useEffect(() => {
    let active = true;
    setRendering(true);
    const timer = window.setTimeout(() => {
      const sequence = ++renderSequenceRef.current;
      const nodeId = String(props.node.attrs.atriaId ?? "node").replace(/[^a-zA-Z0-9_-]/g, "-");
      void import("../renderers/mermaidRenderer")
        .then(({ renderMermaid }) => renderMermaid(`atria-mermaid-${nodeId}-${sequence}-${crypto.randomUUID()}`, code))
        .then((svg) => {
          if (!active || sequence !== renderSequenceRef.current) return;
          setHtml(svg);
          setError("");
          setRendering(false);
        })
        .catch((reason: unknown) => {
          if (!active || sequence !== renderSequenceRef.current) return;
          setError(formatMermaidError(reason));
          setRendering(false);
        });
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [code, props.node.attrs.atriaId]);

  return (
    <NodeViewWrapper>
      <DirectManipulationLayer
        {...props}
        className={styles.nodeBlockObject}
        resizeMode="both"
        resizeBounds={{ minWidth: 260, minHeight: 160, maxWidth: 1280, maxHeight: 900 }}
      >
        <section className={styles.documentRenderNode}>
          <RenderNodeToolbar
            kind="Mermaid"
            editing={editing}
            copyState={copyState}
            onModeChange={setEditing}
            onCopy={() => void copy()}
            onReset={() => props.updateAttributes({ code: defaultMermaidSource })}
          />
          {editing ? (
            <div className={styles.renderSourcePane}>
              <textarea
                aria-label="Mermaid source"
                spellCheck={false}
                value={code}
                onChange={(event) => props.updateAttributes({ code: event.target.value })}
              />
              {error && <RenderNodeError message={error} />}
            </div>
          ) : (
            <div className={styles.renderPreviewPane} aria-busy={rendering}>
              {html ? (
                <div className={styles.renderedBlock} dangerouslySetInnerHTML={{ __html: html }} />
              ) : rendering ? (
                <div className={styles.renderNodeLoading}>Rendering diagram...</div>
              ) : null}
              {error && <RenderNodeError message={error} />}
            </div>
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
  const { html, error, rendering } = useLatexRender(formula, display);
  const { copyState, copy } = useCopyFeedback(formula);

  useEffect(() => {
    if (!props.selected) setEditing(false);
  }, [props.selected]);

  return (
    <NodeViewWrapper>
      <DirectManipulationLayer
        {...props}
        className={styles.nodeBlockObject}
        resizeMode="width"
        resizeBounds={{ minWidth: 260, maxWidth: 980 }}
      >
        <section className={styles.documentRenderNode}>
          <RenderNodeToolbar
            kind="LaTeX"
            editing={editing}
            copyState={copyState}
            onModeChange={setEditing}
            onCopy={() => void copy()}
            onReset={() => props.updateAttributes({ formula: defaultLatexSource, display: true })}
          />
          {editing ? (
            <div className={styles.renderSourcePane}>
              <MathSourceInput
                value={formula}
                multiline
                ariaLabel="LaTeX source"
                onChange={(value) => props.updateAttributes({ formula: value })}
              />
              <fieldset className={styles.latexLayoutControl}>
                <legend>Formula layout</legend>
                <button
                  type="button"
                  aria-pressed={display}
                  onClick={() => props.updateAttributes({ display: true })}
                >
                  Display
                </button>
                <button
                  type="button"
                  aria-pressed={!display}
                  onClick={() => props.updateAttributes({ display: false })}
                >
                  Inline
                </button>
              </fieldset>
              {error && <RenderNodeError message={error} />}
            </div>
          ) : (
            <div className={`${styles.renderPreviewPane} ${styles.latexPreviewPane}`} aria-busy={rendering}>
              {html ? <div className={styles.renderedBlock} dangerouslySetInnerHTML={{ __html: html }} /> : null}
              {!html && rendering ? <div className={styles.renderNodeLoading}>Rendering formula...</div> : null}
              {error && <RenderNodeError message={error} />}
            </div>
          )}
        </section>
      </DirectManipulationLayer>
    </NodeViewWrapper>
  );
}

export function InlineMathNodeView(props: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const formula = String(props.node.attrs.formula ?? "x");
  const { html, error } = useLatexRender(formula, false);

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
      ) : error ? (
        <span className={styles.inlineMathError} role="img" aria-label={`Invalid formula: ${error}`} title={error}>
          Invalid formula
        </span>
      ) : (
        <span dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </NodeViewWrapper>
  );
}

export function HtmlNodeView(props: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const expandButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogTitleId = useId();
  const html = String(props.node.attrs.html ?? "");
  const { copyState, copy } = useCopyFeedback(html);

  useEffect(() => {
    if (!props.selected) setEditing(false);
  }, [props.selected]);

  useEffect(() => {
    if (editing) return;
    setPreviewReady(false);
  }, [editing, html]);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setExpanded(false);
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("keydown", closeOnEscape, true);
      document.body.style.overflow = previousOverflow;
      (expandButtonRef.current ?? previousFocus)?.focus();
    };
  }, [expanded]);

  function openExpandedEditor() {
    setEditing(true);
    setExpanded(true);
  }

  return (
    <NodeViewWrapper>
      <DirectManipulationLayer
        {...props}
        className={styles.nodeBlockObject}
        resizeMode="both"
        resizeBounds={{ minWidth: 280, minHeight: 180, maxWidth: 1280, maxHeight: 960 }}
      >
        <section className={styles.documentHtmlNode}>
          <RenderNodeToolbar
            kind="HTML"
            editing={editing}
            copyState={copyState}
            expandButtonRef={expandButtonRef}
            onModeChange={setEditing}
            onCopy={() => void copy()}
            onReset={() => props.updateAttributes({ html: defaultHtmlSource })}
            onExpand={openExpandedEditor}
          />
          {editing ? (
            <div className={styles.htmlNodeSource} contentEditable={false}>
              <Suspense fallback={<div className={styles.renderNodeLoading}>Loading editor...</div>}>
                <HtmlSourceEditor
                  value={html}
                  ariaLabel="HTML source"
                  onChange={(value) => props.updateAttributes({ html: value })}
                />
              </Suspense>
            </div>
          ) : (
            html.trim() ? (
              <div className={styles.htmlViewport} data-ready={previewReady ? "true" : "false"}>
                {!previewReady && <div className={styles.htmlPreviewLoading}>Loading preview...</div>}
                <iframe
                  key={html}
                  srcDoc={buildHtmlPreviewDocument(html)}
                  title="HTML preview"
                  referrerPolicy="no-referrer"
                  sandbox="allow-scripts allow-forms"
                  onLoad={() => setPreviewReady(true)}
                />
              </div>
            ) : (
              <div className={styles.emptyBlock}>Empty HTML</div>
            )
          )}
        </section>
      </DirectManipulationLayer>
      {expanded && createPortal(
        <div className={styles.htmlEditorBackdrop} contentEditable={false}>
          <div className={styles.htmlEditorDialog} role="dialog" aria-modal="true" aria-labelledby={dialogTitleId}>
            <header className={styles.htmlEditorHeader}>
              <span>
                <Code2 size={16} />
                <strong id={dialogTitleId}>HTML source</strong>
                <small>Local sandbox</small>
              </span>
              <button type="button" aria-label="Close full screen HTML editor" title="Close" onClick={() => setExpanded(false)}>
                <X size={17} />
              </button>
            </header>
            <div className={styles.htmlEditorSurface}>
              <Suspense fallback={<div className={styles.renderNodeLoading}>Loading editor...</div>}>
                <HtmlSourceEditor
                  value={html}
                  ariaLabel="Full screen HTML source"
                  autoFocus
                  onChange={(value) => props.updateAttributes({ html: value })}
                />
              </Suspense>
            </div>
            <footer className={styles.htmlEditorFooter}>
              <span>{html.split("\n").length} lines · {html.length.toLocaleString()} characters</span>
              <button type="button" onClick={() => setExpanded(false)}>Done</button>
            </footer>
          </div>
        </div>,
        document.body,
      )}
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

type CopyFeedbackState = "idle" | "copied" | "error";

function useCopyFeedback(value: string) {
  const [copyState, setCopyState] = useState<CopyFeedbackState>("idle");
  useEffect(() => {
    if (copyState === "idle") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return { copyState, copy };
}

function RenderNodeToolbar({
  kind,
  editing,
  copyState,
  onModeChange,
  onCopy,
  onReset,
  onExpand,
  expandButtonRef,
}: {
  kind: string;
  editing: boolean;
  copyState: CopyFeedbackState;
  onModeChange(editing: boolean): void;
  onCopy(): void;
  onReset(): void;
  onExpand?(): void;
  expandButtonRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const copyLabel = copyState === "copied" ? `${kind} source copied` : copyState === "error" ? `Copy ${kind} source failed` : `Copy ${kind} source`;
  return (
    <div className={styles.renderNodeToolbar} contentEditable={false}>
      <strong>{kind}</strong>
      <div className={styles.renderModeControl} aria-label={`${kind} mode`}>
        <button type="button" aria-pressed={!editing} onClick={() => onModeChange(false)}>
          <Eye size={13} />
          <span>Preview</span>
        </button>
        <button type="button" aria-pressed={editing} onClick={() => onModeChange(true)}>
          <Code2 size={13} />
          <span>Source</span>
        </button>
      </div>
      <div className={styles.renderNodeActions}>
        {onExpand && (
          <button
            ref={expandButtonRef}
            type="button"
            data-render-expand
            aria-label={`Open full screen ${kind} editor`}
            title="Open full screen editor"
            onClick={onExpand}
          >
            <Maximize2 size={14} />
          </button>
        )}
        <button type="button" data-render-copy aria-label={copyLabel} title={copyLabel} onClick={onCopy}>
          {copyState === "copied" ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <button type="button" data-render-reset aria-label={`Reset ${kind} source`} title="Reset source" onClick={onReset}>
          <RotateCcw size={14} />
        </button>
      </div>
      <span className={styles.visuallyHidden} role="status">
        {copyState === "copied" ? `${kind} source copied` : copyState === "error" ? `Copy ${kind} source failed` : ""}
      </span>
    </div>
  );
}

function RenderNodeError({ message }: { message: string }) {
  return (
    <div className={styles.renderNodeError} role="alert">
      <strong>Could not render</strong>
      <span>{message}</span>
    </div>
  );
}

function useLatexRender(formula: string, displayMode: boolean) {
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState(true);
  useEffect(() => {
    let active = true;
    setRendering(true);
    void import("../renderers/latexRenderer")
      .then(({ renderLatex }) => {
        if (!active) return;
        try {
          setHtml(renderLatex(formula, displayMode));
          setError("");
        } catch (reason: unknown) {
          setError(formatLatexError(reason));
        } finally {
          setRendering(false);
        }
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(formatLatexError(reason));
        setRendering(false);
      });
    return () => {
      active = false;
    };
  }, [displayMode, formula]);
  return { html, error, rendering };
}
