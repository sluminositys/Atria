import { useEffect, useRef } from "react";
import { Editor, EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { AtriaBlockType } from "@atria/schema";
import styles from "../app/App.module.css";

interface RichTextBlockProps {
  value: string;
  active?: boolean;
  placeholder?: string;
  onEnter?(): void;
  onBackspaceEmpty?(): void;
  onSlashCommand?(type: AtriaBlockType): void;
  onPasteImage?(dataUrl: string): void;
  onChange(value: string): void;
}

const slashCommands: Record<string, AtriaBlockType> = {
  "/heading": "heading",
  "/text": "text",
  "/card": "card",
  "/callout": "callout",
  "/todo": "todo",
  "/code": "code",
  "/artifact": "artifact",
  "/image": "image",
};

export function RichTextBlock({
  value,
  active,
  placeholder = "Write notes, conclusions, or '/' for blocks",
  onEnter,
  onBackspaceEmpty,
  onSlashCommand,
  onPasteImage,
  onChange,
}: RichTextBlockProps) {
  const editorRef = useRef<Editor | null>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: styles.tiptapSurface ?? "",
      },
      handleKeyDown(_view, event) {
        const currentEditor = editorRef.current;
        if (event.key === "Enter" && !event.shiftKey) {
          const command = slashCommands[currentEditor?.getText().trim().toLowerCase() ?? ""];
          event.preventDefault();
          if (command && onSlashCommand) {
            currentEditor?.commands.clearContent();
            onChange("<p></p>");
            onSlashCommand(command);
            return true;
          }
          onEnter?.();
          return true;
        }

        if (event.key === "Backspace" && currentEditor?.isEmpty) {
          event.preventDefault();
          onBackspaceEmpty?.();
          return true;
        }

        return false;
      },
      handlePaste(_view, event) {
        const item = Array.from(event.clipboardData?.items ?? []).find((clipboardItem) =>
          clipboardItem.type.startsWith("image/"),
        );
        const file = item?.getAsFile();
        if (!file || !onPasteImage) return false;
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") onPasteImage(reader.result);
        };
        reader.readAsDataURL(file);
        return true;
      },
    },
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor || editor.getHTML() === value) return;
    editor.commands.setContent(value || "", false);
  }, [editor, value]);

  useEffect(() => {
    if (active) editor?.commands.focus("end");
  }, [active, editor]);

  return <EditorContent editor={editor} />;
}
