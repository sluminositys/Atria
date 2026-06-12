import { useEffect, useReducer, type MouseEvent } from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  CheckSquare,
  Code2,
  FileCode2,
  Image,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Sigma,
  Strikethrough,
  Table2,
  Undo2,
} from "lucide-react";
import type { AtriaBlockType } from "@atria/schema";
import type { SlashCommand } from "./SlashCommandMenu";
import styles from "../../app/App.module.css";

interface EditorToolbarProps {
  editor: Editor;
  onInsert(type: AtriaBlockType | SlashCommand): void;
}

export function EditorToolbar({ editor, onInsert }: EditorToolbarProps) {
  const [, refresh] = useReducer((value: number) => value + 1, 0);

  useEffect(() => {
    editor.on("selectionUpdate", refresh);
    editor.on("transaction", refresh);
    return () => {
      editor.off("selectionUpdate", refresh);
      editor.off("transaction", refresh);
    };
  }, [editor]);

  function run(event: MouseEvent, command: () => void) {
    event.preventDefault();
    command();
  }

  return (
    <div className={styles.editorToolbar} role="toolbar" aria-label="Document formatting">
      <select
        className={styles.toolbarSelect}
        aria-label="Text style"
        value={currentBlockStyle(editor)}
        onChange={(event) => setBlockStyle(editor, event.target.value)}
      >
        <option value="paragraph">Paragraph</option>
        <option value="heading-1">Heading 1</option>
        <option value="heading-2">Heading 2</option>
        <option value="heading-3">Heading 3</option>
      </select>

      <ToolbarGroup>
        <ToolbarButton label="Undo" disabled={!editor.can().undo()} onMouseDown={(event) => run(event, () => editor.chain().focus().undo().run())}>
          <Undo2 size={15} />
        </ToolbarButton>
        <ToolbarButton label="Redo" disabled={!editor.can().redo()} onMouseDown={(event) => run(event, () => editor.chain().focus().redo().run())}>
          <Redo2 size={15} />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton label="Bold" active={editor.isActive("bold")} onMouseDown={(event) => run(event, () => editor.chain().focus().toggleBold().run())}>
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton label="Italic" active={editor.isActive("italic")} onMouseDown={(event) => run(event, () => editor.chain().focus().toggleItalic().run())}>
          <Italic size={15} />
        </ToolbarButton>
        <ToolbarButton label="Strikethrough" active={editor.isActive("strike")} onMouseDown={(event) => run(event, () => editor.chain().focus().toggleStrike().run())}>
          <Strikethrough size={15} />
        </ToolbarButton>
        <ToolbarButton label="Inline code" active={editor.isActive("code")} onMouseDown={(event) => run(event, () => editor.chain().focus().toggleCode().run())}>
          <Code2 size={15} />
        </ToolbarButton>
        <ToolbarButton label="Link" active={editor.isActive("link")} onMouseDown={(event) => run(event, () => setLink(editor))}>
          <LinkIcon size={15} />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton label="Bullet list" active={editor.isActive("bulletList")} onMouseDown={(event) => run(event, () => editor.chain().focus().toggleBulletList().run())}>
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")} onMouseDown={(event) => run(event, () => editor.chain().focus().toggleOrderedList().run())}>
          <ListOrdered size={15} />
        </ToolbarButton>
        <ToolbarButton label="Todo list" active={editor.isActive("taskList")} onMouseDown={(event) => run(event, () => editor.chain().focus().toggleTaskList().run())}>
          <CheckSquare size={15} />
        </ToolbarButton>
        <ToolbarButton label="Quote" active={editor.isActive("blockquote")} onMouseDown={(event) => run(event, () => editor.chain().focus().toggleBlockquote().run())}>
          <Quote size={15} />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton label="Code block" active={editor.isActive("codeBlock")} onMouseDown={(event) => run(event, () => onInsert("code"))}>
          <FileCode2 size={15} />
        </ToolbarButton>
        <ToolbarButton label="Table" active={editor.isActive("table")} onMouseDown={(event) => run(event, () => onInsert("table"))}>
          <Table2 size={15} />
        </ToolbarButton>
        <ToolbarButton label="Formula" active={editor.isActive("atriaLatex")} onMouseDown={(event) => run(event, () => onInsert("latex"))}>
          <Sigma size={15} />
        </ToolbarButton>
        <ToolbarButton label="Image" onMouseDown={(event) => run(event, () => onInsert("image"))}>
          <Image size={15} />
        </ToolbarButton>
        <ToolbarButton label="Divider" onMouseDown={(event) => run(event, () => editor.chain().focus().setHorizontalRule().run())}>
          <Minus size={15} />
        </ToolbarButton>
      </ToolbarGroup>
    </div>
  );
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className={styles.toolbarGroup}>{children}</div>;
}

function ToolbarButton({
  active = false,
  children,
  disabled = false,
  label,
  onMouseDown,
}: {
  active?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onMouseDown(event: MouseEvent<HTMLButtonElement>): void;
}) {
  return (
    <button
      type="button"
      className={active ? styles.toolbarButtonActive : styles.toolbarButton}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={onMouseDown}
    >
      {children}
    </button>
  );
}

function currentBlockStyle(editor: Editor): string {
  if (editor.isActive("heading", { level: 1 })) return "heading-1";
  if (editor.isActive("heading", { level: 2 })) return "heading-2";
  if (editor.isActive("heading", { level: 3 })) return "heading-3";
  return "paragraph";
}

function setBlockStyle(editor: Editor, value: string) {
  if (value === "heading-1") editor.chain().focus().setHeading({ level: 1 }).run();
  else if (value === "heading-2") editor.chain().focus().setHeading({ level: 2 }).run();
  else if (value === "heading-3") editor.chain().focus().setHeading({ level: 3 }).run();
  else editor.chain().focus().setParagraph().run();
}

function setLink(editor: Editor) {
  const previousUrl = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt("Link URL", previousUrl ?? "");
  if (url === null) return;
  if (!url.trim()) editor.chain().focus().extendMarkRange("link").unsetLink().run();
  else editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
}
