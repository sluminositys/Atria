import { EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import styles from "../app/App.module.css";

interface RichTextBlockProps {
  value: string;
  placeholder?: string;
  onChange(value: string): void;
}

export function RichTextBlock({ value, placeholder = "Type here", onChange }: RichTextBlockProps) {
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
    },
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
  });

  return <EditorContent editor={editor} />;
}
