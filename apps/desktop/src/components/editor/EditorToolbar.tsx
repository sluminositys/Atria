import { useEffect, useReducer, type MouseEvent } from "react";
import type { Editor } from "@tiptap/react";
import {
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  AlignCenter,
  AlignLeft,
  AlignRight,
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
  TableCellsMerge,
  TableCellsSplit,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import type { AtriaBlockType } from "@atria/schema";
import type { SlashCommand } from "./SlashCommandMenu";
import { hasTextSelection } from "./commands/selectionCommands";
import styles from "../../app/App.module.css";

interface EditorToolbarProps {
  editor: Editor;
  onInsert(type: AtriaBlockType | SlashCommand): void;
  onEditLink(): void;
}

export function EditorToolbar({ editor, onInsert, onEditLink }: EditorToolbarProps) {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const textSelected = hasTextSelection(editor.state.selection);

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
    <>
      <div className={styles.editorToolbar} role="toolbar" aria-label="Document formatting">
      <select
        className={styles.toolbarSelect}
        aria-label="Text style"
        value={currentBlockStyle(editor)}
        disabled={!textSelected}
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
        <ToolbarButton label="Bold selected text" disabled={!textSelected} active={editor.isActive("bold")} onMouseDown={(event) => run(event, () => editor.chain().focus().toggleBold().run())}>
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton label="Italicize selected text" disabled={!textSelected} active={editor.isActive("italic")} onMouseDown={(event) => run(event, () => editor.chain().focus().toggleItalic().run())}>
          <Italic size={15} />
        </ToolbarButton>
        <ToolbarButton label="Underline selected text" disabled={!textSelected} active={editor.isActive("underline")} onMouseDown={(event) => run(event, () => editor.chain().focus().toggleUnderline().run())}>
          <UnderlineIcon size={15} />
        </ToolbarButton>
        <ToolbarButton label="Strike selected text" disabled={!textSelected} active={editor.isActive("strike")} onMouseDown={(event) => run(event, () => editor.chain().focus().toggleStrike().run())}>
          <Strikethrough size={15} />
        </ToolbarButton>
        <ToolbarButton label="Inline code for selected text" disabled={!textSelected} active={editor.isActive("code")} onMouseDown={(event) => run(event, () => editor.chain().focus().toggleCode().run())}>
          <Code2 size={15} />
        </ToolbarButton>
        <ToolbarButton label="Link selected text" disabled={!textSelected} active={editor.isActive("link")} onMouseDown={(event) => run(event, onEditLink)}>
          <LinkIcon size={15} />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton label="Bullet list for selected paragraphs" disabled={!textSelected} active={editor.isActive("bulletList")} onMouseDown={(event) => run(event, () => editor.chain().focus().toggleBulletList().run())}>
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton label="Numbered list for selected paragraphs" disabled={!textSelected} active={editor.isActive("orderedList")} onMouseDown={(event) => run(event, () => editor.chain().focus().toggleOrderedList().run())}>
          <ListOrdered size={15} />
        </ToolbarButton>
        <ToolbarButton label="Todo list for selected paragraphs" disabled={!textSelected} active={editor.isActive("taskList")} onMouseDown={(event) => run(event, () => editor.chain().focus().toggleTaskList().run())}>
          <CheckSquare size={15} />
        </ToolbarButton>
        <ToolbarButton label="Quote selected paragraphs" disabled={!textSelected} active={editor.isActive("blockquote")} onMouseDown={(event) => run(event, () => editor.chain().focus().toggleBlockquote().run())}>
          <Quote size={15} />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton label="Code block (also available with triple backticks)" active={editor.isActive("codeBlock")} onMouseDown={(event) => run(event, () => onInsert("code"))}>
          <FileCode2 size={15} />
        </ToolbarButton>
        <ToolbarButton label="Table" active={editor.isActive("table")} onMouseDown={(event) => run(event, () => onInsert("table"))}>
          <Table2 size={15} />
        </ToolbarButton>
        <ToolbarButton label="Inline formula" active={editor.isActive("atriaInlineMath")} onMouseDown={(event) => run(event, () => onInsert("inline-math"))}>
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

      {editor.isActive("table") && (
        <div className={styles.tableContextToolbar} role="toolbar" aria-label="Table formatting">
          <span className={styles.tableContextLabel}><Table2 size={14} />Table</span>
          <ToolbarGroup>
          <ToolbarButton label="Insert row above" onMouseDown={(event) => run(event, () => editor.chain().focus().addRowBefore().run())}>
            <BetweenHorizontalStart size={15} />
          </ToolbarButton>
          <ToolbarButton label="Insert row below" onMouseDown={(event) => run(event, () => editor.chain().focus().addRowAfter().run())}>
            <BetweenHorizontalEnd size={15} />
          </ToolbarButton>
          <ToolbarButton label="Insert column left" onMouseDown={(event) => run(event, () => editor.chain().focus().addColumnBefore().run())}>
            <BetweenVerticalStart size={15} />
          </ToolbarButton>
          <ToolbarButton label="Insert column right" onMouseDown={(event) => run(event, () => editor.chain().focus().addColumnAfter().run())}>
            <BetweenVerticalEnd size={15} />
          </ToolbarButton>
          <ToolbarButton label="Toggle header row" onMouseDown={(event) => run(event, () => editor.chain().focus().toggleHeaderRow().run())}>
            <Table2 size={15} />
          </ToolbarButton>
          <ToolbarButton label="Toggle header column" onMouseDown={(event) => run(event, () => editor.chain().focus().toggleHeaderColumn().run())}>
            <BetweenVerticalStart size={15} />
          </ToolbarButton>
          <ToolbarButton
            label="Merge cells"
            disabled={!editor.can().mergeCells()}
            onMouseDown={(event) => run(event, () => editor.chain().focus().mergeCells().run())}
          >
            <TableCellsMerge size={15} />
          </ToolbarButton>
          <ToolbarButton
            label="Split cell"
            disabled={!editor.can().splitCell()}
            onMouseDown={(event) => run(event, () => editor.chain().focus().splitCell().run())}
          >
            <TableCellsSplit size={15} />
          </ToolbarButton>
          <ToolbarButton label="Delete row" onMouseDown={(event) => run(event, () => editor.chain().focus().deleteRow().run())}>
            <BetweenHorizontalEnd size={15} />
          </ToolbarButton>
          <ToolbarButton label="Delete column" onMouseDown={(event) => run(event, () => editor.chain().focus().deleteColumn().run())}>
            <BetweenVerticalEnd size={15} />
          </ToolbarButton>
          <ToolbarButton label="Delete table" onMouseDown={(event) => run(event, () => editor.chain().focus().deleteTable().run())}>
            <Trash2 size={15} />
          </ToolbarButton>
          </ToolbarGroup>
          <ToolbarGroup>
          <ToolbarButton
            label="Align cell text left"
            active={currentCellAttribute(editor, "textAlign") === "left"}
            onMouseDown={(event) => run(event, () => editor.chain().focus().setCellAttribute("textAlign", "left").run())}
          >
            <AlignLeft size={15} />
          </ToolbarButton>
          <ToolbarButton
            label="Align cell text center"
            active={currentCellAttribute(editor, "textAlign") === "center"}
            onMouseDown={(event) => run(event, () => editor.chain().focus().setCellAttribute("textAlign", "center").run())}
          >
            <AlignCenter size={15} />
          </ToolbarButton>
          <ToolbarButton
            label="Align cell text right"
            active={currentCellAttribute(editor, "textAlign") === "right"}
            onMouseDown={(event) => run(event, () => editor.chain().focus().setCellAttribute("textAlign", "right").run())}
          >
            <AlignRight size={15} />
          </ToolbarButton>
          {[
            ["none", null, "Clear cell background"],
            ["gray", "gray", "Gray cell background"],
            ["red", "red", "Red cell background"],
            ["yellow", "yellow", "Yellow cell background"],
            ["green", "green", "Green cell background"],
            ["blue", "blue", "Blue cell background"],
          ].map(([tone, value, label]) => (
            <button
              key={tone}
              type="button"
              className={`${styles.tableToneButton} ${styles[`tableTone_${tone}`] ?? ""}`}
              title={label ?? "Cell background"}
              aria-label={label ?? "Cell background"}
              aria-pressed={currentCellAttribute(editor, "cellTone") === value}
              onMouseDown={(event) => run(event, () => editor.chain().focus().setCellAttribute("cellTone", value).run())}
            />
          ))}
          </ToolbarGroup>
        </div>
      )}
    </>
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

function currentCellAttribute(editor: Editor, attribute: "textAlign" | "cellTone") {
  return editor.getAttributes(editor.isActive("tableHeader") ? "tableHeader" : "tableCell")[attribute] ?? null;
}
