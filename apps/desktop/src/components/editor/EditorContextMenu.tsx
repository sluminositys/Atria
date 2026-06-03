import type { Editor } from "@tiptap/react";
import { Check, Copy, FileCode2, Image, PanelTop, Trash2 } from "lucide-react";
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
}

export function EditorContextMenu({ editor, state, onClose, onInsertArtifact, onInsertImage }: EditorContextMenuProps) {
  if (!state) return null;

  function run(command: () => void) {
    command();
    onClose();
  }

  return (
    <div className={styles.editorContextMenu} style={{ left: state.x, top: state.y }}>
      <section>
        <label>Turn into</label>
        <button onClick={() => run(() => editor.chain().focus().setParagraph().run())}>
          {editor.isActive("paragraph") && <Check size={13} />} Paragraph
        </button>
        {[1, 2, 3].map((level) => (
          <button
            key={level}
            onClick={() => run(() => editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run())}
          >
            {editor.isActive("heading", { level }) && <Check size={13} />} Heading {level}
          </button>
        ))}
        <button onClick={() => run(() => editor.chain().focus().toggleBlockquote().run())}>Quote</button>
        <button onClick={() => run(() => editor.chain().focus().toggleCodeBlock().run())}>Code block</button>
        <button onClick={() => run(() => editor.chain().focus().toggleTaskList().run())}>Todo list</button>
      </section>
      <section>
        <label>Insert</label>
        <button onClick={() => run(() => insertCallout(editor))}>Callout</button>
        <button onClick={() => run(() => insertCard(editor))}>
          <PanelTop size={13} /> Card
        </button>
        <button onClick={() => run(onInsertImage)}>
          <Image size={13} /> Image
        </button>
        <button onClick={() => run(onInsertArtifact)}>
          <FileCode2 size={13} /> Artifact
        </button>
        <button onClick={() => run(() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}>
          Table
        </button>
        <button onClick={() => run(() => insertCode(editor))}>Code</button>
        <button onClick={() => run(() => insertMermaid(editor))}>Mermaid</button>
        <button onClick={() => run(() => insertLatex(editor))}>LaTeX</button>
        <button onClick={() => run(() => insertHtml(editor))}>Custom HTML</button>
      </section>
      {editor.isActive("table") && (
        <section>
          <label>Table</label>
          <button onClick={() => run(() => editor.chain().focus().addRowBefore().run())}>Insert row above</button>
          <button onClick={() => run(() => editor.chain().focus().addRowAfter().run())}>Insert row below</button>
          <button onClick={() => run(() => editor.chain().focus().addColumnBefore().run())}>Insert column left</button>
          <button onClick={() => run(() => editor.chain().focus().addColumnAfter().run())}>Insert column right</button>
          <button onClick={() => run(() => editor.chain().focus().deleteRow().run())}>Delete row</button>
          <button onClick={() => run(() => editor.chain().focus().deleteColumn().run())}>Delete column</button>
          <button onClick={() => run(() => editor.chain().focus().mergeCells().run())}>Merge cells</button>
          <button onClick={() => run(() => editor.chain().focus().splitCell().run())}>Split cell</button>
          <button onClick={() => run(() => editor.chain().focus().toggleHeaderRow().run())}>Toggle header row</button>
          <button onClick={() => run(() => editor.chain().focus().toggleHeaderColumn().run())}>Toggle header column</button>
          <button onClick={() => run(() => editor.chain().focus().deleteTable().run())}>Delete table</button>
        </section>
      )}
      <section>
        <label>Actions</label>
        <button onClick={() => run(() => void navigator.clipboard?.writeText(editor.getText()))}>
          <Copy size={13} /> Copy text
        </button>
        <button onClick={() => run(() => editor.chain().focus().deleteSelection().run())}>
          <Trash2 size={13} /> Delete selection
        </button>
      </section>
    </div>
  );
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

function insertCode(editor: Editor) {
  editor.chain().focus().insertContent({ type: "codeBlock", attrs: { language: "text" }, content: [{ type: "text", text: "" }] }).run();
}

function insertMermaid(editor: Editor) {
  editor.chain().focus().insertContent({ type: "atriaMermaid", attrs: { code: "graph TD\n  A[Atria] --> B[Artifact]", layout: "wide", align: "center" } }).run();
}

function insertLatex(editor: Editor) {
  editor.chain().focus().insertContent({ type: "atriaLatex", attrs: { formula: "E = mc^2", display: true, layout: "normal", align: "center" } }).run();
}

function insertHtml(editor: Editor) {
  editor.chain().focus().insertContent({ type: "atriaHtml", attrs: { html: "<section></section>", height: 320, layout: "wide", align: "center" } }).run();
}
