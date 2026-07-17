import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  Check,
  Code2,
  Copy,
  FileCode2,
  GitBranch,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Info,
  ListTodo,
  PanelTop,
  Pilcrow,
  Quote,
  Sigma,
  Table2,
  Trash2,
} from "lucide-react";
import { insertBlockAtSelection } from "./commands/selectionCommands";
import styles from "../../app/App.module.css";

export interface ContextMenuState {
  x: number;
  y: number;
}

interface EditorContextMenuProps {
  editor: Editor;
  state: ContextMenuState | null;
  onClose(): void;
  onInsertArtifact(): void;
  onInsertImage(): void;
  onInsertTable(): void;
}

export function EditorContextMenu({ editor, state, onClose, onInsertArtifact, onInsertImage, onInsertTable }: EditorContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const selectionEmpty = editor.state.selection.empty;

  useLayoutEffect(() => {
    if (!state) return;
    const menu = menuRef.current;
    const width = menu?.offsetWidth ?? 232;
    const height = menu?.offsetHeight ?? 480;
    setPosition({
      x: Math.max(8, Math.min(state.x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(state.y, window.innerHeight - height - 8)),
    });
    window.requestAnimationFrame(() => menu?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus());
  }, [state]);

  useEffect(() => {
    if (!state) return;
    function closeOutside(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    }
    function closeOnResize() {
      onClose();
    }
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("resize", closeOnResize);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [onClose, state]);

  if (!state) return null;

  function run(command: () => void) {
    command();
    onClose();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      editor.commands.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Home") items[0]?.focus();
    else if (event.key === "End") items.at(-1)?.focus();
    else {
      const offset = event.key === "ArrowDown" ? 1 : -1;
      items[(current + offset + items.length) % items.length]?.focus();
    }
  }

  return (
    <div
      ref={menuRef}
      className={styles.editorContextMenu}
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label="Editor actions"
      onKeyDown={handleKeyDown}
    >
      <section role="group" aria-label="Turn into">
        <div className={styles.editorContextMenuLabel}>Turn into</div>
        <MenuItem icon={Pilcrow} active={editor.isActive("paragraph")} label="Paragraph" onClick={() => run(() => editor.chain().focus().setParagraph().run())} />
        <MenuItem icon={Heading1} active={editor.isActive("heading", { level: 1 })} label="Heading 1" onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 1 }).run())} />
        <MenuItem icon={Heading2} active={editor.isActive("heading", { level: 2 })} label="Heading 2" onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 2 }).run())} />
        <MenuItem icon={Heading3} active={editor.isActive("heading", { level: 3 })} label="Heading 3" onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 3 }).run())} />
        <MenuItem icon={Quote} label="Quote" onClick={() => run(() => editor.chain().focus().toggleBlockquote().run())} />
        <MenuItem icon={Code2} label="Code block" onClick={() => run(() => editor.chain().focus().toggleCodeBlock().run())} />
        <MenuItem icon={ListTodo} label="Todo list" onClick={() => run(() => editor.chain().focus().toggleTaskList().run())} />
      </section>
      <section role="group" aria-label="Insert">
        <div className={styles.editorContextMenuLabel}>Insert after</div>
        <MenuItem icon={Info} label="Callout" onClick={() => run(() => insertCallout(editor))} />
        <MenuItem icon={PanelTop} label="Card" onClick={() => run(() => insertCard(editor))} />
        <MenuItem icon={Image} label="Image" onClick={() => run(onInsertImage)} />
        <MenuItem icon={FileCode2} label="Artifact" onClick={() => run(onInsertArtifact)} />
        <MenuItem icon={Table2} label="Table" onClick={() => run(onInsertTable)} />
        <MenuItem icon={Code2} label="Code" onClick={() => run(() => insertCode(editor))} />
        <MenuItem icon={GitBranch} label="Mermaid" onClick={() => run(() => insertMermaid(editor))} />
        <MenuItem icon={Sigma} label="LaTeX" onClick={() => run(() => insertLatex(editor))} />
        <MenuItem icon={Code2} label="HTML" onClick={() => run(() => insertHtml(editor))} />
      </section>
      {editor.isActive("table") && (
        <section role="group" aria-label="Table">
          <div className={styles.editorContextMenuLabel}>Table</div>
          <MenuItem label="Insert row above" onClick={() => run(() => editor.chain().focus().addRowBefore().run())} />
          <MenuItem label="Insert row below" onClick={() => run(() => editor.chain().focus().addRowAfter().run())} />
          <MenuItem label="Insert column left" onClick={() => run(() => editor.chain().focus().addColumnBefore().run())} />
          <MenuItem label="Insert column right" onClick={() => run(() => editor.chain().focus().addColumnAfter().run())} />
          <MenuItem label="Delete row" onClick={() => run(() => editor.chain().focus().deleteRow().run())} />
          <MenuItem label="Delete column" onClick={() => run(() => editor.chain().focus().deleteColumn().run())} />
          <MenuItem label="Merge cells" disabled={!editor.can().mergeCells()} onClick={() => run(() => editor.chain().focus().mergeCells().run())} />
          <MenuItem label="Split cell" disabled={!editor.can().splitCell()} onClick={() => run(() => editor.chain().focus().splitCell().run())} />
          <MenuItem label="Toggle header row" onClick={() => run(() => editor.chain().focus().toggleHeaderRow().run())} />
          <MenuItem label="Toggle header column" onClick={() => run(() => editor.chain().focus().toggleHeaderColumn().run())} />
          <MenuItem label="Delete table" danger onClick={() => run(() => editor.chain().focus().deleteTable().run())} />
        </section>
      )}
      <section role="group" aria-label="Actions">
        <div className={styles.editorContextMenuLabel}>Selection</div>
        <MenuItem icon={Copy} label="Copy" disabled={selectionEmpty} onClick={() => run(() => void copySelection(editor))} />
        <MenuItem icon={Trash2} label="Delete" danger disabled={selectionEmpty} onClick={() => run(() => editor.chain().focus().deleteSelection().run())} />
      </section>
    </div>
  );
}

function MenuItem({
  active = false,
  danger = false,
  disabled = false,
  icon: Icon,
  label,
  onClick,
}: {
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  icon?: React.ComponentType<{ size?: number }>;
  label: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={danger ? styles.editorContextMenuDanger : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <span className={styles.editorContextMenuIcon}>{active ? <Check size={14} /> : Icon ? <Icon size={14} /> : null}</span>
      <span>{label}</span>
    </button>
  );
}

function insertCallout(editor: Editor) {
  insertBlockAtSelection(editor, {
    type: "atriaCallout",
    attrs: { title: "Note", tone: "info", width: null, layout: "normal", align: "left" },
    content: [{ type: "paragraph" }],
  });
}

function insertCard(editor: Editor) {
  insertBlockAtSelection(editor, {
    type: "atriaCard",
    attrs: { title: "", width: null, layout: "normal", align: "left" },
    content: [{ type: "paragraph" }],
  });
}

function insertCode(editor: Editor) {
  insertBlockAtSelection(editor, {
    type: "codeBlock",
    attrs: { language: "text", height: 220, layout: "normal", align: "left" },
  });
}

function insertMermaid(editor: Editor) {
  insertBlockAtSelection(editor, {
    type: "atriaMermaid",
    attrs: { code: "graph TD\n  A[Atria] --> B[Artifact]", width: 760, height: 260, layout: "wide", align: "center" },
  });
}

function insertLatex(editor: Editor) {
  insertBlockAtSelection(editor, {
    type: "atriaLatex",
    attrs: { formula: "E = mc^2", display: true, width: 520, layout: "normal", align: "center" },
  });
}

function insertHtml(editor: Editor) {
  insertBlockAtSelection(editor, {
    type: "atriaHtml",
    attrs: { html: "<section></section>", width: 820, height: 320, layout: "wide", align: "center" },
  });
}

async function copySelection(editor: Editor) {
  const { from, to } = editor.state.selection;
  const text = editor.state.doc.textBetween(from, to, "\n");
  if (text) await navigator.clipboard?.writeText(text);
}
