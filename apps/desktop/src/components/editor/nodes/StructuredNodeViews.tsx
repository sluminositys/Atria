import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  Check,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Copy,
  Code2,
  Eye,
  ExternalLink,
  FileCode2,
  ImageUp,
  ListOrdered,
  Maximize2,
  LoaderCircle,
  Minus,
  Palette,
  Plus,
  RefreshCcw,
  Replace,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Trash2,
  WrapText,
  X,
} from "lucide-react";
import type { Artifact, WorkspaceSnapshot } from "@atria/schema";
import {
  importImageDataUrl,
  openWorkspaceFile,
  readWorkspaceTextFile,
  toWorkspaceFileAssetUrl,
} from "../../../app/workspaceClient";
import { ArtifactPicker } from "../ArtifactPicker";
import { imageFileValidationError, readImageFileAsDataUrl } from "../imageFiles";
import { buildHtmlPreviewDocument, defaultHtmlSource } from "../htmlPreview";
import { formatLatexError, formatMermaidError } from "../renderNodeErrors";
import { DirectManipulationLayer } from "../interaction/DirectManipulationLayer";
import { MathSourceInput } from "../MathSourceInput";
import { createTimelineItem, moveTimelineItem, parseTimelineItems, type TimelineItem } from "../timelineItems";
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
  const rootPath = props.snapshot?.settings.workspacePath ?? "";
  const relativePath = artifact?.filePath ?? "";
  const src = toWorkspaceFileAssetUrl(props.snapshot, artifact?.entryUrl || artifact?.filePath);
  const [reloadKey, setReloadKey] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewStatus, setPreviewStatus] = useState<"checking" | "loading" | "ready" | "error">("checking");
  const [validatedPreviewKey, setValidatedPreviewKey] = useState("");
  const [message, setMessage] = useState("");
  const previewKey = artifact ? `${artifact.id}\n${relativePath}\n${reloadKey}` : "";
  const previewValidated = Boolean(previewKey) && validatedPreviewKey === previewKey;

  useEffect(() => {
    let active = true;
    setMessage("");
    if (!artifact) {
      setValidatedPreviewKey("");
      setPreviewStatus("error");
      setMessage("The referenced HTML result is not available in this Workspace.");
      return () => { active = false; };
    }
    if (!rootPath || !relativePath || !src) {
      setValidatedPreviewKey("");
      setPreviewStatus("error");
      setMessage("This HTML result is not attached to a local Workspace file.");
      return () => { active = false; };
    }
    setValidatedPreviewKey("");
    setPreviewStatus("checking");
    void readWorkspaceTextFile(rootPath, relativePath)
      .then(() => {
        if (!active) return;
        setValidatedPreviewKey(previewKey);
        setPreviewStatus("loading");
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setPreviewStatus("error");
        setMessage(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
    };
  }, [artifact, previewKey, relativePath, rootPath, src]);

  function toggleCollapsed() {
    if (collapsed) {
      props.updateAttributes({ collapsed: false, height: Number(props.node.attrs.expandedHeight ?? 420) || 420 });
    } else {
      props.updateAttributes({
        collapsed: true,
        expandedHeight: Number(props.node.attrs.height ?? 420) || 420,
        height: null,
      });
    }
  }

  async function openArtifact() {
    if (!rootPath || !relativePath) return;
    setMessage("");
    try {
      await openWorkspaceFile(rootPath, relativePath);
    } catch (reason: unknown) {
      setMessage(reason instanceof Error ? reason.message : String(reason));
    }
  }

  function reloadArtifact() {
    setPreviewStatus("checking");
    setMessage("");
    setReloadKey((value) => value + 1);
  }

  const artifactMeta = artifact
    ? `${artifact.tags.slice(0, 2).join(" / ") || "HTML result"} / ${new Date(artifact.updatedAt).toLocaleDateString()}`
    : "Missing HTML result";

  return (
    <NodeViewWrapper>
      <DirectManipulationLayer
        {...props}
        className={styles.nodeBlockObject}
        resizeMode={collapsed ? "width" : "both"}
        resizeBounds={{ minWidth: 320, minHeight: 220, maxWidth: 1280, maxHeight: 960 }}
      >
        <section className={styles.documentArtifactNode}>
          <div className={styles.artifactNodeHeader} contentEditable={false}>
            <button
              className={styles.inlineIconButton}
              title={collapsed ? "Expand" : "Collapse"}
              aria-label={collapsed ? "Expand Artifact" : "Collapse Artifact"}
              onClick={toggleCollapsed}
            >
              {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
            <FileCode2 size={15} aria-hidden="true" />
            <div>
              <strong>{artifact?.title ?? "Missing artifact"}</strong>
              <small>{artifactMeta}</small>
            </div>
            <button className={styles.inlineIconButton} aria-label="Replace Artifact" title="Replace" onClick={() => setPickerOpen(true)}>
              <Replace size={14} />
            </button>
            <button
              className={styles.inlineIconButton}
              aria-label="Reload Artifact"
              title="Reload"
              disabled={!artifact || !previewValidated || previewStatus === "checking" || previewStatus === "loading"}
              onClick={reloadArtifact}
            >
              <RefreshCcw size={14} />
            </button>
            <button className={styles.inlineIconButton} aria-label="Open Artifact in default application" title="Open" disabled={!artifact || !relativePath} onClick={() => void openArtifact()}>
              <ExternalLink size={14} />
            </button>
          </div>
          {!collapsed && (
            <>
              {artifact && src && previewValidated && (previewStatus === "loading" || previewStatus === "ready") ? (
                <div className={styles.artifactViewport} data-loading={previewStatus === "loading" ? "true" : "false"}>
                  {previewStatus === "loading" && <LoaderCircle className={`${styles.spin} ${styles.artifactNodeSpinner}`} size={18} />}
                  <iframe
                    key={reloadKey}
                    src={src}
                    title={`${artifact.title} embedded preview`}
                    referrerPolicy="no-referrer"
                    sandbox="allow-scripts allow-forms allow-downloads"
                    onLoad={() => setPreviewStatus("ready")}
                    onError={() => {
                      setPreviewStatus("error");
                      setMessage("The local HTML result could not be loaded.");
                    }}
                  />
                </div>
              ) : previewStatus === "checking" || (previewStatus !== "error" && artifact && src && !previewValidated) ? (
                <div className={styles.artifactNodeChecking} role="status" contentEditable={false}>
                  <LoaderCircle className={styles.spin} size={18} />
                  <span>Checking local HTML result...</span>
                </div>
              ) : (
                <div className={styles.artifactNodeError} role="alert" contentEditable={false}>
                  <strong>Preview unavailable</strong>
                  <span>{message || "Choose another HTML result."}</span>
                  <div>
                    {artifact && <button type="button" onClick={reloadArtifact}><RefreshCcw size={14} />Retry</button>}
                    <button type="button" onClick={() => setPickerOpen(true)}><Replace size={14} />Choose Artifact</button>
                  </div>
                </div>
              )}
              {message && previewStatus !== "error" && <div className={styles.artifactNodeMessage} role="alert">{message}</div>}
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
      <ArtifactPicker
        artifacts={props.artifacts}
        open={pickerOpen}
        title="Replace Artifact"
        onClose={() => setPickerOpen(false)}
        onSelect={(nextArtifact) => {
          props.updateAttributes({ artifactId: nextArtifact.id, collapsed: false });
          setReloadKey((value) => value + 1);
        }}
      />
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
              <span>{html.split("\n").length} lines / {html.length.toLocaleString()} characters</span>
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
  const label = String(props.node.attrs.label ?? "Metric");
  const value = String(props.node.attrs.value ?? "0");
  const delta = String(props.node.attrs.delta ?? "");
  const trend = delta.trim().startsWith("-") ? "down" : delta.trim().startsWith("+") ? "up" : "neutral";
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  return (
    <NodeViewWrapper>
      <DirectManipulationLayer {...props} className={styles.nodeBlockObject} resizeMode="width" resizeBounds={{ minWidth: 220, maxWidth: 520 }}>
        <section className={styles.documentMetricNode} data-trend={trend} contentEditable={false}>
          <CommitInput
            className={styles.metricLabelInput}
            ariaLabel="Metric label"
            value={label}
            fallback="Metric"
            placeholder="Metric label"
            onCommit={(next) => props.updateAttributes({ label: next })}
          />
          <CommitInput
            className={styles.metricValueInput}
            ariaLabel="Metric value"
            value={value}
            fallback="0"
            placeholder="0"
            onCommit={(next) => props.updateAttributes({ value: next })}
          />
          <div className={styles.metricDeltaRow}>
            <TrendIcon size={14} aria-hidden="true" />
            <CommitInput
              className={styles.metricDeltaInput}
              ariaLabel="Metric change"
              value={delta}
              fallback=""
              placeholder="No change"
              onCommit={(next) => props.updateAttributes({ delta: next })}
            />
            <span className={styles.visuallyHidden}>{trend === "up" ? "Positive change" : trend === "down" ? "Negative change" : "No trend"}</span>
          </div>
        </section>
      </DirectManipulationLayer>
    </NodeViewWrapper>
  );
}

export function TimelineNodeView(props: NodeViewProps) {
  const rawItems = props.node.attrs.items;
  const items = useMemo(() => parseTimelineItems(rawItems), [rawItems]);
  const title = String(props.node.attrs.title ?? "Timeline");

  useEffect(() => {
    if (JSON.stringify(rawItems) !== JSON.stringify(items)) props.updateAttributes({ items });
  }, [items, rawItems]);

  function updateItems(next: TimelineItem[]) {
    props.updateAttributes({ items: next });
  }

  function updateItem(id: string, patch: Partial<TimelineItem>) {
    updateItems(items.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function addItem() {
    updateItems([...items, createTimelineItem({ at: "Date", title: "New event" })]);
  }

  return (
    <NodeViewWrapper>
      <DirectManipulationLayer {...props} className={styles.nodeBlockObject} resizeMode="width" resizeBounds={{ minWidth: 360, maxWidth: 1120 }}>
        <section className={styles.documentTimelineNode} contentEditable={false}>
          <header className={styles.timelineHeader}>
            <CalendarDays size={16} aria-hidden="true" />
            <CommitInput
              className={styles.timelineTitleInput}
              ariaLabel="Timeline title"
              value={title}
              fallback="Timeline"
              placeholder="Timeline"
              onCommit={(next) => props.updateAttributes({ title: next })}
            />
            <span>{items.length} {items.length === 1 ? "event" : "events"}</span>
            <button type="button" aria-label="Add timeline event" title="Add event" onClick={addItem}>
              <Plus size={15} />
            </button>
          </header>
          {items.length ? (
            <div className={styles.timelineList}>
              {items.map((item, index) => (
                <article key={item.id} className={styles.timelineItem}>
                  <div className={styles.timelineRail} aria-hidden="true"><span /></div>
                  <div className={styles.timelineItemContent}>
                    <CommitInput
                      className={styles.timelineDateInput}
                      ariaLabel={`Event ${index + 1} date`}
                      value={item.at}
                      fallback="Date"
                      placeholder="Date"
                      onCommit={(at) => updateItem(item.id, { at })}
                    />
                    <CommitInput
                      className={styles.timelineEventTitleInput}
                      ariaLabel={`Event ${index + 1} title`}
                      value={item.title}
                      fallback="Untitled event"
                      placeholder="Event title"
                      onCommit={(eventTitle) => updateItem(item.id, { title: eventTitle })}
                    />
                    <CommitTextarea
                      ariaLabel={`Event ${index + 1} details`}
                      value={item.detail}
                      placeholder="Add details"
                      onCommit={(detail) => updateItem(item.id, { detail })}
                    />
                  </div>
                  <div className={styles.timelineItemActions}>
                    <button type="button" aria-label={`Move event ${index + 1} up`} title="Move up" disabled={index === 0} onClick={() => updateItems(moveTimelineItem(items, index, -1))}>
                      <ArrowUp size={14} />
                    </button>
                    <button type="button" aria-label={`Move event ${index + 1} down`} title="Move down" disabled={index === items.length - 1} onClick={() => updateItems(moveTimelineItem(items, index, 1))}>
                      <ArrowDown size={14} />
                    </button>
                    <button type="button" aria-label={`Delete event ${index + 1}`} title="Delete event" onClick={() => updateItems(items.filter((candidate) => candidate.id !== item.id))}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <button type="button" className={styles.timelineEmpty} onClick={addItem}>
              <Plus size={16} />
              <span>Add first event</span>
            </button>
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

function CommitInput({
  value,
  fallback,
  placeholder,
  ariaLabel,
  className,
  onCommit,
}: {
  value: string;
  fallback: string;
  placeholder: string;
  ariaLabel: string;
  className?: string;
  onCommit(value: string): void;
}) {
  const [draft, setDraft] = useState(value);
  const cancelBlurRef = useRef(false);
  useEffect(() => setDraft(value), [value]);

  function commit() {
    const next = draft.trim() || fallback;
    setDraft(next);
    if (next !== value) onCommit(next);
  }

  return (
    <input
      className={className}
      aria-label={ariaLabel}
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (cancelBlurRef.current) {
          cancelBlurRef.current = false;
          return;
        }
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancelBlurRef.current = true;
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function CommitTextarea({
  value,
  placeholder,
  ariaLabel,
  onCommit,
}: {
  value: string;
  placeholder: string;
  ariaLabel: string;
  onCommit(value: string): void;
}) {
  const [draft, setDraft] = useState(value);
  const cancelBlurRef = useRef(false);
  useEffect(() => setDraft(value), [value]);

  function commit() {
    const next = draft.trim();
    setDraft(next);
    if (next !== value) onCommit(next);
  }

  return (
    <textarea
      aria-label={ariaLabel}
      value={draft}
      rows={2}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (cancelBlurRef.current) {
          cancelBlurRef.current = false;
          return;
        }
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancelBlurRef.current = true;
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
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
