import { BubbleMenu, type Editor } from "@tiptap/react";
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
  PanelTop,
  Pilcrow,
  Quote,
  Table2,
} from "lucide-react";
import styles from "../../app/App.module.css";

interface SelectionBubbleMenuProps {
  editor: Editor;
  onInsertArtifact(): void;
  onInsertImage(): void;
}

export function SelectionBubbleMenu({ editor, onInsertArtifact, onInsertImage }: SelectionBubbleMenuProps) {
  return (
    <BubbleMenu editor={editor} tippyOptions={{ duration: 120, placement: "top" }} className={styles.selectionBubble}>
      <select
        value={currentTextStyle(editor)}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "paragraph") editor.chain().focus().setParagraph().run();
          else editor.chain().focus().toggleHeading({ level: Number(value.replace("h", "")) as 1 | 2 | 3 }).run();
        }}
      >
        <option value="paragraph">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <button className={editor.isActive("bold") ? styles.menuButtonActive : styles.menuButton} title="Bold" onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold size={14} />
      </button>
      <button className={editor.isActive("italic") ? styles.menuButtonActive : styles.menuButton} title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic size={14} />
      </button>
      <button className={editor.isActive("code") ? styles.menuButtonActive : styles.menuButton} title="Inline code" onClick={() => editor.chain().focus().toggleCode().run()}>
        <Code2 size={14} />
      </button>
      <button className={styles.menuButton} title="Link" onClick={() => setLink(editor)}>
        <LinkIcon size={14} />
      </button>
      <span className={styles.menuDivider} />
      <button className={editor.isActive("bulletList") ? styles.menuButtonActive : styles.menuButton} title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List size={14} />
      </button>
      <button className={editor.isActive("orderedList") ? styles.menuButtonActive : styles.menuButton} title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered size={14} />
      </button>
      <button className={editor.isActive("taskList") ? styles.menuButtonActive : styles.menuButton} title="Todo list" onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <CheckSquare size={14} />
      </button>
      <button className={editor.isActive("blockquote") ? styles.menuButtonActive : styles.menuButton} title="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote size={14} />
      </button>
      <button className={styles.menuButton} title="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        <Code2 size={14} />
      </button>
      <span className={styles.menuDivider} />
      <button className={styles.menuButton} title="Callout" onClick={() => insertCallout(editor)}>
        <Pilcrow size={14} />
      </button>
      <button className={styles.menuButton} title="Card" onClick={() => insertCard(editor)}>
        <PanelTop size={14} />
      </button>
      <button className={styles.menuButton} title="Artifact" onClick={onInsertArtifact}>
        <FileCode2 size={14} />
      </button>
      <button className={styles.menuButton} title="Image" onClick={onInsertImage}>
        <Image size={14} />
      </button>
      <button className={styles.menuButton} title="Table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <Table2 size={14} />
      </button>
    </BubbleMenu>
  );
}

function currentTextStyle(editor: Editor): string {
  if (editor.isActive("heading", { level: 1 })) return "h1";
  if (editor.isActive("heading", { level: 2 })) return "h2";
  if (editor.isActive("heading", { level: 3 })) return "h3";
  return "paragraph";
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

function insertCallout(editor: Editor) {
  editor
    .chain()
    .focus()
    .insertContent({
      type: "atriaCallout",
      attrs: { title: "Note", tone: "info", layout: "normal", align: "left" },
      content: [{ type: "paragraph" }],
    })
    .run();
}

function insertCard(editor: Editor) {
  editor
    .chain()
    .focus()
    .insertContent({
      type: "atriaCard",
      attrs: { title: "Card", layout: "normal", align: "left" },
      content: [{ type: "paragraph" }],
    })
    .run();
}
