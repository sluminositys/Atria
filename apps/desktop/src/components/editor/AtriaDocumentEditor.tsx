import { useEffect, useMemo, useRef, useState } from "react";
import { Extension, InputRule, Node, mergeAttributes } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextStyle from "@tiptap/extension-text-style";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { EditorContent, ReactNodeViewRenderer, useEditor, type Editor } from "@tiptap/react";
import { Selection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { createLowlight } from "lowlight";
import bash from "highlight.js/lib/languages/bash";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import typescript from "highlight.js/lib/languages/typescript";
import yaml from "highlight.js/lib/languages/yaml";
import type { Artifact, AtriaBlockType, AtriaDocumentContent, WorkspaceSnapshot } from "@atria/schema";
import { createEmptyDocument } from "@atria/core";
import { importImageDataUrl } from "../../app/workspaceClient";
import { ArtifactPicker } from "./ArtifactPicker";
import { EditorContextMenu, type ContextMenuState } from "./EditorContextMenu";
import { EditorToolbar } from "./EditorToolbar";
import { ImageInsertDialog } from "./ImageInsertDialog";
import { SelectionBubbleMenu } from "./SelectionBubbleMenu";
import {
  SlashCommandMenu,
  slashCommandAt,
  slashCommandCount,
  type SlashCommand,
  type SlashMenuState,
} from "./SlashCommandMenu";
import {
  ArtifactNodeView,
  CalloutNodeView,
  CardNodeView,
  CodeBlockNodeView,
  HtmlNodeView,
  ImageNodeView,
  InlineMathNodeView,
  LatexNodeView,
  LegacyNodeView,
  MermaidNodeView,
  MetricNodeView,
  TimelineNodeView,
} from "./nodes/StructuredNodeViews";
import { TableInteractionView } from "./interaction/TableInteractionView";
import { StableNodeId } from "./extensions/StableNodeId";
import { TrailingParagraph } from "./extensions/TrailingParagraph";
import { DrawingNodeView } from "./nodes/DrawingNodeView";
import { insertBlockAtSelection } from "./commands/selectionCommands";
import styles from "../../app/App.module.css";

interface AtriaDocumentEditorProps {
  value?: AtriaDocumentContent | string;
  artifacts: Artifact[];
  snapshot?: WorkspaceSnapshot;
  onChange(content: AtriaDocumentContent, html: string): void;
}

interface SlashState extends SlashMenuState {
  range: { from: number; to: number };
}

const lowlight = createLowlight();
lowlight.register({
  text: plaintext,
  bash,
  python,
  javascript,
  typescript,
  json,
  yaml,
  rust,
  markdown,
});

const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
});

export function AtriaDocumentEditor({ value, artifacts, snapshot, onChange }: AtriaDocumentEditorProps) {
  const editorRef = useRef<Editor | null>(null);
  const [artifactPickerOpen, setArtifactPickerOpen] = useState(false);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageInsertError, setImageInsertError] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [slash, setSlash] = useState<SlashState | null>(null);
  const slashRef = useRef<SlashState | null>(null);

  const workspacePath = snapshot?.settings.workspacePath ?? "";
  const assetSnapshot = useMemo(
    () => (workspacePath ? ({ settings: { workspacePath } } as WorkspaceSnapshot) : undefined),
    [workspacePath],
  );
  const extensions = useMemo(() => createExtensions(artifacts, assetSnapshot), [artifacts, assetSnapshot]);
  const editor = useEditor(
    {
      extensions,
      content: value ?? createEmptyDocument(),
      editorProps: {
        attributes: {
          class: styles.documentEditorSurface ?? "",
        },
        handleTextInput(view, from, _to, text) {
          if (text !== "/") return false;
          const coords = view.coordsAtPos(from);
          setSlash({
            x: coords.left,
            y: coords.bottom + 8,
            selectedIndex: 0,
            query: "",
            range: { from, to: from + 1 },
          });
          slashRef.current = {
            x: coords.left,
            y: coords.bottom + 8,
            selectedIndex: 0,
            query: "",
            range: { from, to: from + 1 },
          };
          return false;
        },
        handleKeyDown(_view, event) {
          const slashMenu = slashRef.current;
          if (slashMenu) {
            const commandCount = slashCommandCount(slashMenu.query);
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (commandCount) setSlashState({ ...slashMenu, selectedIndex: (slashMenu.selectedIndex + 1) % commandCount });
              return true;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              if (commandCount) {
                setSlashState({ ...slashMenu, selectedIndex: (slashMenu.selectedIndex - 1 + commandCount) % commandCount });
              }
              return true;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (commandCount) executeSlashCommand(slashCommandAt(slashMenu.selectedIndex, slashMenu.query));
              return true;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setSlashState(null);
              return true;
            }
          }
          if (event.key === "Escape") setContextMenu(null);
          return false;
        },
        handlePaste(_view, event) {
          const file = Array.from(event.clipboardData?.items ?? [])
            .find((item) => item.type.startsWith("image/"))
            ?.getAsFile();
          if (!file) return false;
          event.preventDefault();
          void insertImageFile(file);
          return true;
        },
        handleDrop(_view, event) {
          const file = Array.from(event.dataTransfer?.files ?? []).find((item) => item.type.startsWith("image/"));
          if (!file) return false;
          event.preventDefault();
          void insertImageFile(file);
          return true;
        },
        handleDOMEvents: {
          click(view, event) {
            if (event.target !== view.dom) return false;
            const end = view.state.doc.content.size;
            view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(end), -1)));
            view.focus();
            return true;
          },
          contextmenu(_view, event) {
            event.preventDefault();
            setSlash(null);
            setContextMenu({ x: event.clientX, y: event.clientY });
            return true;
          },
        },
      },
      onUpdate({ editor }) {
        updateSlashQuery(editor);
        onChange(editor.getJSON() as AtriaDocumentContent, editor.getHTML());
      },
      onSelectionUpdate() {
        setContextMenu(null);
      },
    },
    [extensions],
  );

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const next = value ?? createEmptyDocument();
    const changed =
      typeof next === "string"
        ? editor.getHTML() !== next
        : JSON.stringify(editor.getJSON()) !== JSON.stringify(next);
    if (changed) {
      editor.commands.setContent(next, false);
    }
  }, [editor, value]);

  useEffect(() => {
    function onInsert(event: Event) {
      const detail = (event as CustomEvent<{ type: AtriaBlockType | SlashCommand }>).detail;
      if (!detail?.type) return;
      insertFromPalette(detail.type);
    }
    window.addEventListener("atria:insert-node", onInsert);
    return () => window.removeEventListener("atria:insert-node", onInsert);
  });

  useEffect(() => {
    function closeMenus() {
      setContextMenu(null);
      setSlashState(null);
    }
    window.addEventListener("click", closeMenus);
    return () => window.removeEventListener("click", closeMenus);
  }, []);

  if (!editor) return null;

  async function insertImageFile(file: File): Promise<boolean> {
    const currentEditor = editorRef.current;
    setImageInsertError("");
    try {
      if (!currentEditor) throw new Error("Editor is not ready.");
      if (!snapshot?.settings.workspacePath) {
        throw new Error("Open or create a workspace before inserting a local image.");
      }
      const dataUrl = await readFileAsDataUrl(file);
      const src = await importImageDataUrl(snapshot, dataUrl);
      return insertImage(src, file.name);
    } catch (error) {
      setImageInsertError(error instanceof Error ? error.message : "Image insert failed.");
      return false;
    }
  }

  function insertImage(src: string, alt = ""): boolean {
    const cleanSrc = src.trim();
    if (!cleanSrc) {
      setImageInsertError("Image source is empty.");
      return false;
    }
    const currentEditor = editorRef.current;
    if (!currentEditor) {
      setImageInsertError("Editor is not ready.");
      return false;
    }
    insertBlockAtSelection(currentEditor, {
        type: "atriaImage",
        attrs: { src: cleanSrc, alt, caption: "", width: 640, layout: "normal", align: "center" },
      });
    setImageInsertError("");
    setImageDialogOpen(false);
    return true;
  }

  function insertArtifact(artifact: Artifact) {
    const current = editorRef.current;
    if (!current) return;
    insertBlockAtSelection(current, {
        type: "atriaArtifact",
        attrs: {
          artifactId: artifact.id,
          width: 820,
          height: 420,
          collapsed: false,
          note: "",
          layout: "wide",
          align: "center",
        },
      });
  }

  function executeSlashCommand(command: SlashCommand) {
    const current = editorRef.current;
    const slashMenu = slashRef.current;
    if (!current || !slashMenu) return;
    current.chain().focus().deleteRange(slashMenu.range).run();
    setSlashState(null);
    applySlashCommand(command);
  }

  function setSlashState(next: SlashState | null) {
    slashRef.current = next;
    setSlash(next);
  }

  function updateSlashQuery(current: Editor) {
    const slashMenu = slashRef.current;
    if (!slashMenu || !current.state.selection.empty) return;
    const cursor = current.state.selection.from;
    if (cursor < slashMenu.range.from + 1) {
      setSlashState(null);
      return;
    }
    const typed = current.state.doc.textBetween(slashMenu.range.from, cursor, "\n", "\n");
    if (!typed.startsWith("/") || /\s/.test(typed.slice(1))) {
      setSlashState(null);
      return;
    }
    const query = typed.slice(1);
    if (query !== slashMenu.query || cursor !== slashMenu.range.to) {
      setSlashState({ ...slashMenu, query, selectedIndex: 0, range: { ...slashMenu.range, to: cursor } });
    }
  }

  function applySlashCommand(command: SlashCommand) {
    const current = editorRef.current;
    if (!current) return;
    if (command === "paragraph") current.chain().focus().setParagraph().run();
    else if (command === "heading-1") current.chain().focus().setHeading({ level: 1 }).run();
    else if (command === "heading-2") current.chain().focus().setHeading({ level: 2 }).run();
    else if (command === "heading-3") current.chain().focus().setHeading({ level: 3 }).run();
    else if (command === "todo") current.chain().focus().toggleTaskList().run();
    else if (command === "quote") current.chain().focus().toggleBlockquote().run();
    else if (command === "code") {
      current.chain().focus().setCodeBlock({ language: "text" }).run();
    } else insertFromPalette(command);
  }

  function insertFromPalette(type: AtriaBlockType | SlashCommand) {
    const current = editorRef.current;
    if (!current) return;
    current.chain().focus().run();
    switch (type) {
      case "paragraph":
      case "text":
        insertBlockAtSelection(current, { type: "paragraph" });
        return;
      case "heading":
      case "heading-1":
        insertBlockAtSelection(current, { type: "heading", attrs: { level: 1 } });
        return;
      case "heading-2":
        insertBlockAtSelection(current, { type: "heading", attrs: { level: 2 } });
        return;
      case "heading-3":
        insertBlockAtSelection(current, { type: "heading", attrs: { level: 3 } });
        return;
      case "todo":
        insertBlockAtSelection(current, {
            type: "taskList",
            content: [
              {
                type: "taskItem",
                attrs: { checked: false },
                content: [{ type: "paragraph" }],
              },
            ],
          });
        return;
      case "quote":
        insertBlockAtSelection(current, { type: "blockquote", content: [{ type: "paragraph" }] });
        return;
      case "code":
        insertBlockAtSelection(current, {
            type: "codeBlock",
            attrs: {
              language: "text",
              height: 220,
              lineNumbers: true,
              wrap: false,
              layout: "normal",
              align: "left",
            },
          });
        return;
      case "callout":
        insertBlockAtSelection(current, {
            type: "atriaCallout",
            attrs: { tone: "info", title: "Note", width: null, layout: "normal", align: "left" },
            content: [{ type: "paragraph" }],
          });
        return;
      case "card":
        insertBlockAtSelection(current, {
            type: "atriaCard",
            attrs: { title: "", width: null, layout: "normal", align: "left" },
            content: [{ type: "paragraph" }],
          });
        return;
      case "artifact":
        setArtifactPickerOpen(true);
        return;
      case "image":
        setImageDialogOpen(true);
        return;
      case "table":
        insertBlockAtSelection(current, {
          type: "table",
          content: Array.from({ length: 3 }, (_, rowIndex) => ({
            type: "tableRow",
            content: Array.from({ length: 3 }, () => ({
              type: rowIndex === 0 ? "tableHeader" : "tableCell",
              content: [{ type: "paragraph" }],
            })),
          })),
        });
        return;
      case "mermaid":
        insertBlockAtSelection(current, {
            type: "atriaMermaid",
            attrs: { code: "graph TD\n  A[Atria] --> B[Artifact]", width: 760, height: 260, layout: "wide", align: "center" },
          });
        return;
      case "latex":
        insertBlockAtSelection(current, {
            type: "atriaLatex",
            attrs: { formula: "E = mc^2", display: true, width: 520, layout: "normal", align: "center" },
          });
        return;
      case "inline-math": {
        const { from, to } = current.state.selection;
        const selectedFormula = current.state.doc.textBetween(from, to, " ").trim();
        current
          .chain()
          .focus()
          .deleteSelection()
          .insertContent({ type: "atriaInlineMath", attrs: { formula: selectedFormula || "x" } })
          .run();
        return;
      }
      case "custom-html":
      case "html":
        insertBlockAtSelection(current, {
            type: "atriaHtml",
            attrs: { html: "<section></section>", width: 820, height: 320, layout: "wide", align: "center" },
          });
        return;
      case "drawing":
        insertBlockAtSelection(current, {
            type: "atriaDrawing",
            attrs: { scene: [], width: 820, height: 480, layout: "wide", align: "center" },
          });
        return;
      case "timeline":
        insertBlockAtSelection(current, { type: "atriaTimeline", attrs: { items: [], width: 760, layout: "wide", align: "left" } });
        return;
      case "metric-card":
        insertBlockAtSelection(current, {
            type: "atriaMetric",
            attrs: { label: "Metric", value: "0", delta: "", width: 240, layout: "normal", align: "left" },
          });
        return;
      default:
        return;
    }
  }

  return (
    <div className={styles.documentEditor}>
      <EditorToolbar editor={editor} onInsert={insertFromPalette} />
      <SelectionBubbleMenu editor={editor} />
      <EditorContent editor={editor} />
      {imageInsertError && (
        <div className={styles.editorToast} contentEditable={false}>
          <span>{imageInsertError}</span>
          <button onClick={() => setImageInsertError("")}>Dismiss</button>
        </div>
      )}
      <EditorContextMenu
        editor={editor}
        state={contextMenu}
        onClose={() => setContextMenu(null)}
        onInsertArtifact={() => setArtifactPickerOpen(true)}
        onInsertImage={() => setImageDialogOpen(true)}
      />
      <SlashCommandMenu state={slash} onSelect={executeSlashCommand} />
      <ArtifactPicker
        artifacts={artifacts}
        open={artifactPickerOpen}
        onClose={() => setArtifactPickerOpen(false)}
        onSelect={insertArtifact}
      />
      <ImageInsertDialog
        open={imageDialogOpen}
        error={imageInsertError}
        onClearError={() => setImageInsertError("")}
        onClose={() => {
          setImageDialogOpen(false);
          setImageInsertError("");
        }}
        onInsertUrl={insertImage}
        onInsertFile={insertImageFile}
      />
    </div>
  );
}

function createExtensions(artifacts: Artifact[], snapshot?: WorkspaceSnapshot) {
  return [
    StableNodeId,
    TrailingParagraph,
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [1, 2, 3, 4] },
    }),
    Placeholder.configure({
      placeholder: "Write, paste, or type / to insert...",
    }),
    Link.configure({
      openOnClick: true,
      autolink: true,
      linkOnPaste: true,
    }),
    TextStyle,
    FontSize,
    Highlight.configure({ multicolor: true }),
    TaskList.configure({ HTMLAttributes: { class: styles.documentTaskList } }),
    TaskItem.configure({ nested: true, HTMLAttributes: { class: styles.documentTaskItem } }),
    Table.extend({
      draggable: true,
      addAttributes() {
        return {
          ...(this.parent?.() ?? {}),
          width: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-width"),
            renderHTML: (attrs: Record<string, unknown>) => (attrs.width ? { "data-width": attrs.width } : {}),
          },
          layout: {
            default: "normal",
            parseHTML: (element: HTMLElement) => element.getAttribute("data-layout") ?? "normal",
            renderHTML: (attrs: Record<string, unknown>) => ({ "data-layout": attrs.layout }),
          },
          align: {
            default: "center",
            parseHTML: (element: HTMLElement) => element.getAttribute("data-align") ?? "center",
            renderHTML: (attrs: Record<string, unknown>) => ({ "data-align": attrs.align }),
          },
          offsetX: {
            default: 0,
            parseHTML: (element: HTMLElement) => Number(element.getAttribute("data-offset-x") ?? 0),
            renderHTML: (attrs: Record<string, unknown>) => Number(attrs.offsetX) ? { "data-offset-x": attrs.offsetX } : {},
          },
        };
      },
    }).configure({
      resizable: true,
      HTMLAttributes: { class: styles.documentTable },
      View: TableInteractionView,
    }),
    TableRow,
    TableHeader,
    TableCell,
    CodeBlockLowlight.extend({
      draggable: true,
      addAttributes() {
        return {
          ...(this.parent?.() ?? {}),
          width: { default: null },
          height: { default: null },
          lineNumbers: {
            default: true,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-line-numbers") !== "false",
            renderHTML: (attrs: Record<string, unknown>) => ({ "data-line-numbers": String(attrs.lineNumbers !== false) }),
          },
          wrap: {
            default: false,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-wrap") === "true",
            renderHTML: (attrs: Record<string, unknown>) => ({ "data-wrap": String(attrs.wrap === true) }),
          },
          ...layoutAttributes,
        };
      },
      addNodeView() {
        return ReactNodeViewRenderer(CodeBlockNodeView);
      },
    }).configure({ lowlight }),
    createCardNode(),
    createCalloutNode(),
    createImageNode(snapshot),
    createArtifactNode(artifacts, snapshot),
    createMermaidNode(),
    createInlineMathNode(),
    createLatexNode(),
    createHtmlNode(),
    createDrawingNode(),
    createMetricNode(),
    createTimelineNode(),
    createLegacyNode(),
  ];
}

const layoutAttributes = {
  layout: {
    default: "normal",
    parseHTML: (element: HTMLElement) => element.getAttribute("data-layout") ?? "normal",
    renderHTML: (attrs: Record<string, unknown>) => ({ "data-layout": attrs.layout }),
  },
  align: {
    default: "left",
    parseHTML: (element: HTMLElement) => element.getAttribute("data-align") ?? "left",
    renderHTML: (attrs: Record<string, unknown>) => ({ "data-align": attrs.align }),
  },
  offsetX: {
    default: 0,
    parseHTML: (element: HTMLElement) => Number(element.getAttribute("data-offset-x") ?? 0),
    renderHTML: (attrs: Record<string, unknown>) => Number(attrs.offsetX) ? { "data-offset-x": attrs.offsetX } : {},
  },
  offsetY: {
    default: 0,
    parseHTML: (element: HTMLElement) => Number(element.getAttribute("data-offset-y") ?? 0),
    renderHTML: (attrs: Record<string, unknown>) => Number(attrs.offsetY) ? { "data-offset-y": attrs.offsetY } : {},
  },
};

const sizeAttributes = {
  width: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute("data-width"),
    renderHTML: (attrs: Record<string, unknown>) => (attrs.width ? { "data-width": attrs.width } : {}),
  },
  height: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute("data-height"),
    renderHTML: (attrs: Record<string, unknown>) => (attrs.height ? { "data-height": attrs.height } : {}),
  },
};

function createCardNode() {
  return Node.create({
    name: "atriaCard",
    group: "block",
    content: "block+",
    defining: true,
    isolating: true,
    draggable: true,
    addAttributes() {
      return {
        title: { default: "Card" },
        ...sizeAttributes,
        ...layoutAttributes,
      };
    },
    parseHTML() {
      return [{ tag: 'section[data-atria-node="card"]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["section", mergeAttributes(HTMLAttributes, { "data-atria-node": "card" }), 0];
    },
    addNodeView() {
      return ReactNodeViewRenderer(CardNodeView);
    },
  });
}

function createCalloutNode() {
  return Node.create({
    name: "atriaCallout",
    group: "block",
    content: "block+",
    defining: true,
    isolating: true,
    draggable: true,
    addAttributes() {
      return {
        title: { default: "Note" },
        tone: { default: "info" },
        ...sizeAttributes,
        ...layoutAttributes,
      };
    },
    parseHTML() {
      return [{ tag: 'aside[data-atria-node="callout"]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["aside", mergeAttributes(HTMLAttributes, { "data-atria-node": "callout" }), 0];
    },
    addNodeView() {
      return ReactNodeViewRenderer(CalloutNodeView);
    },
  });
}

function createImageNode(snapshot?: WorkspaceSnapshot) {
  return Node.create({
    name: "atriaImage",
    group: "block",
    atom: true,
    draggable: true,
    addAttributes() {
      return {
        src: { default: "" },
        caption: { default: "" },
        alt: { default: "" },
        width: { default: 640 },
        height: { default: null },
        ...layoutAttributes,
      };
    },
    parseHTML() {
      return [{ tag: 'figure[data-atria-node="image"]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["figure", mergeAttributes(HTMLAttributes, { "data-atria-node": "image" })];
    },
    addNodeView() {
      return ReactNodeViewRenderer((props) => <ImageNodeView {...props} snapshot={snapshot} />);
    },
  });
}

function createArtifactNode(artifacts: Artifact[], snapshot?: WorkspaceSnapshot) {
  return Node.create({
    name: "atriaArtifact",
    group: "block",
    atom: true,
    draggable: true,
    addAttributes() {
      return {
        artifactId: { default: "" },
        width: { default: 820 },
        height: { default: 420 },
        collapsed: { default: false },
        note: { default: "" },
        ...layoutAttributes,
      };
    },
    parseHTML() {
      return [{ tag: 'section[data-atria-node="artifact"]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["section", mergeAttributes(HTMLAttributes, { "data-atria-node": "artifact" })];
    },
    addNodeView() {
      return ReactNodeViewRenderer((props) => <ArtifactNodeView {...props} artifacts={artifacts} snapshot={snapshot} />);
    },
  });
}

function createMermaidNode() {
  return Node.create({
    name: "atriaMermaid",
    group: "block",
    atom: true,
    draggable: true,
    addAttributes() {
      return {
        code: { default: "graph TD\n  A[Atria] --> B[Artifact]" },
        width: { default: 760 },
        height: { default: null },
        ...layoutAttributes,
      };
    },
    parseHTML() {
      return [{ tag: 'section[data-atria-node="mermaid"]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["section", mergeAttributes(HTMLAttributes, { "data-atria-node": "mermaid" })];
    },
    addNodeView() {
      return ReactNodeViewRenderer(MermaidNodeView);
    },
  });
}

function createLatexNode() {
  return Node.create({
    name: "atriaLatex",
    group: "block",
    atom: true,
    draggable: true,
    addAttributes() {
      return {
        formula: { default: "" },
        display: { default: true },
        width: { default: null },
        height: { default: null },
        ...layoutAttributes,
      };
    },
    parseHTML() {
      return [{ tag: 'section[data-atria-node="latex"]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["section", mergeAttributes(HTMLAttributes, { "data-atria-node": "latex" })];
    },
    addNodeView() {
      return ReactNodeViewRenderer(LatexNodeView);
    },
  });
}

function createInlineMathNode() {
  return Node.create({
    name: "atriaInlineMath",
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,
    addAttributes() {
      return {
        formula: {
          default: "x",
          parseHTML: (element: HTMLElement) => element.getAttribute("data-formula") ?? "x",
          renderHTML: (attrs: Record<string, unknown>) => ({ "data-formula": attrs.formula }),
        },
      };
    },
    parseHTML() {
      return [{ tag: 'span[data-atria-node="inline-math"]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["span", mergeAttributes(HTMLAttributes, { "data-atria-node": "inline-math" })];
    },
    addInputRules() {
      return [
        new InputRule({
          find: /\$([^$\n]+)\$$/,
          handler: ({ state, range, match }) => {
            const formula = match[1]?.trim();
            if (!formula) return null;
            state.tr.replaceWith(range.from, range.to, this.type.create({ formula }));
          },
        }),
      ];
    },
    addKeyboardShortcuts() {
      return {
        "Mod-m": () => {
          const { from, to } = this.editor.state.selection;
          const formula = this.editor.state.doc.textBetween(from, to, " ").trim() || "x";
          return this.editor.chain().focus().deleteSelection().insertContent({ type: this.name, attrs: { formula } }).run();
        },
      };
    },
    addNodeView() {
      return ReactNodeViewRenderer(InlineMathNodeView);
    },
  });
}

function createHtmlNode() {
  return Node.create({
    name: "atriaHtml",
    group: "block",
    atom: true,
    draggable: true,
    addAttributes() {
      return {
        html: { default: "<section></section>" },
        width: { default: 820 },
        height: { default: 320 },
        ...layoutAttributes,
      };
    },
    parseHTML() {
      return [{ tag: 'section[data-atria-node="html"]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["section", mergeAttributes(HTMLAttributes, { "data-atria-node": "html" })];
    },
    addNodeView() {
      return ReactNodeViewRenderer(HtmlNodeView);
    },
  });
}

function createMetricNode() {
  return Node.create({
    name: "atriaMetric",
    group: "block",
    atom: true,
    draggable: true,
    addAttributes() {
      return {
        label: { default: "Metric" },
        value: { default: "0" },
        delta: { default: "" },
        width: { default: 240 },
        height: { default: null },
        ...layoutAttributes,
      };
    },
    parseHTML() {
      return [{ tag: 'section[data-atria-node="metric"]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["section", mergeAttributes(HTMLAttributes, { "data-atria-node": "metric" })];
    },
    addNodeView() {
      return ReactNodeViewRenderer(MetricNodeView);
    },
  });
}

function createDrawingNode() {
  return Node.create({
    name: "atriaDrawing",
    group: "block",
    atom: true,
    draggable: true,
    addAttributes() {
      return {
        scene: {
          default: [],
          parseHTML: (element: HTMLElement) => {
            try {
              return JSON.parse(element.getAttribute("data-scene") ?? "[]");
            } catch {
              return [];
            }
          },
          renderHTML: (attrs: Record<string, unknown>) => ({ "data-scene": JSON.stringify(attrs.scene ?? []) }),
        },
        ...sizeAttributes,
        ...layoutAttributes,
      };
    },
    parseHTML() {
      return [{ tag: 'section[data-atria-node="drawing"]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["section", mergeAttributes(HTMLAttributes, { "data-atria-node": "drawing" })];
    },
    addNodeView() {
      return ReactNodeViewRenderer(DrawingNodeView);
    },
  });
}

function createTimelineNode() {
  return Node.create({
    name: "atriaTimeline",
    group: "block",
    atom: true,
    draggable: true,
    addAttributes() {
      return {
        items: { default: [] },
        width: { default: 760 },
        height: { default: null },
        ...layoutAttributes,
      };
    },
    parseHTML() {
      return [{ tag: 'section[data-atria-node="timeline"]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["section", mergeAttributes(HTMLAttributes, { "data-atria-node": "timeline" })];
    },
    addNodeView() {
      return ReactNodeViewRenderer(TimelineNodeView);
    },
  });
}

function createLegacyNode() {
  return Node.create({
    name: "atriaLegacy",
    group: "block",
    atom: true,
    draggable: true,
    addAttributes() {
      return {
        legacyType: { default: "legacy" },
        data: { default: null },
        width: { default: 640 },
        height: { default: null },
        ...layoutAttributes,
      };
    },
    parseHTML() {
      return [{ tag: 'section[data-atria-node="legacy"]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["section", mergeAttributes(HTMLAttributes, { "data-atria-node": "legacy" })];
    },
    addNodeView() {
      return ReactNodeViewRenderer(LegacyNodeView);
    },
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to read image"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}
