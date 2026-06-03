import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import styles from "../app/App.module.css";

interface RichTextBlockProps {
  value: string;
  placeholder?: string;
  onPasteImage?(dataUrl: string): void;
  onChange(value: string): void;
}

export function RichTextBlock({ value, placeholder = "Type here", onPasteImage, onChange }: RichTextBlockProps) {
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
    if (!editor || editor.getHTML() === value) return;
    editor.commands.setContent(value || "", false);
  }, [editor, value]);

  return <EditorContent editor={editor} />;
}
