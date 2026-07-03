import { useState, type MouseEvent } from "react";
import { BubbleMenu, type Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import {
  Bold,
  CheckSquare,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Type,
} from "lucide-react";
import styles from "../../app/App.module.css";

interface SelectionBubbleMenuProps {
  editor: Editor;
}

export function SelectionBubbleMenu({ editor }: SelectionBubbleMenuProps) {
  const [styleOpen, setStyleOpen] = useState(false);

  function run(event: MouseEvent, command: () => void) {
    event.preventDefault();
    command();
  }

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor }) =>
        editor.isEditable
        && editor.state.selection instanceof TextSelection
        && !editor.state.selection.empty
      }
      tippyOptions={{
        duration: 120,
        placement: "top",
        appendTo: () => document.body,
        popperOptions: {
          modifiers: [
            { name: "flip", options: { padding: 16 } },
            { name: "preventOverflow", options: { boundary: "viewport", padding: 16 } },
          ],
        },
      }}
      className={styles.selectionBubble}
    >
      <button
        className={styleOpen ? styles.menuButtonActive : styles.menuButton}
        title="Text style"
        onMouseDown={(event) => run(event, () => setStyleOpen((value) => !value))}
      >
        <Type size={14} />
        <span>{currentTextLabel(editor)}</span>
      </button>
      <span className={styles.menuDivider} />
      <button className={editor.isActive("bold") ? styles.menuButtonActive : styles.menuButton} title="Bold" onMouseDown={(event) => run(event, () => editor.chain().focus().toggleBold().run())}>
        <Bold size={14} />
      </button>
      <button className={editor.isActive("italic") ? styles.menuButtonActive : styles.menuButton} title="Italic" onMouseDown={(event) => run(event, () => editor.chain().focus().toggleItalic().run())}>
        <Italic size={14} />
      </button>
      <button className={editor.isActive("code") ? styles.menuButtonActive : styles.menuButton} title="Inline code for selected text" onMouseDown={(event) => run(event, () => editor.chain().focus().toggleCode().run())}>
        <Code2 size={14} />
      </button>
      <button className={styles.menuButton} title="Link" onMouseDown={(event) => run(event, () => setLink(editor))}>
        <LinkIcon size={14} />
      </button>
      {styleOpen && (
        <div className={styles.textStyleMenu} onMouseDown={(event) => event.preventDefault()}>
          <button onClick={() => editor.chain().focus().setParagraph().run()}>
            <Pilcrow size={14} />
            Paragraph
          </button>
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
            <Heading1 size={14} />
            Heading 1
          </button>
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 size={14} />
            Heading 2
          </button>
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            <Heading3 size={14} />
            Heading 3
          </button>
          <span />
          <button onClick={() => setTextSize(editor, "0.92em")}>Small</button>
          <button onClick={() => clearTextSize(editor)}>Normal</button>
          <button onClick={() => setTextSize(editor, "1.14em")}>Large</button>
          <button onClick={() => editor.chain().focus().toggleHighlight({ color: "#fff1a8" }).run()}>
            <Highlighter size={14} />
            Highlight
          </button>
          <span />
          <button onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List size={14} />
            Bullet list
          </button>
          <button onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered size={14} />
            Numbered list
          </button>
          <button onClick={() => editor.chain().focus().toggleTaskList().run()}>
            <CheckSquare size={14} />
            Todo list
          </button>
          <button onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <Quote size={14} />
            Quote
          </button>
        </div>
      )}
    </BubbleMenu>
  );
}

function currentTextLabel(editor: Editor): string {
  if (editor.isActive("heading", { level: 1 })) return "H1";
  if (editor.isActive("heading", { level: 2 })) return "H2";
  if (editor.isActive("heading", { level: 3 })) return "H3";
  return "Aa";
}

function setLink(editor: Editor) {
  const previousUrl = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt("Link URL", previousUrl ?? "");
  if (url === null) return;
  if (!url.trim()) {
    editor.chain().focus().unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
}

function setTextSize(editor: Editor, fontSize: string) {
  editor.chain().focus().setMark("textStyle", { fontSize }).run();
}

function clearTextSize(editor: Editor) {
  editor.chain().focus().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run();
}
