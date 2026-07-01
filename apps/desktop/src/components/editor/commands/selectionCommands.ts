import type { Content } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";

const siblingInsertionContainers = new Set([
  "table",
  "codeBlock",
  "atriaCard",
  "atriaCallout",
  "atriaImage",
  "atriaArtifact",
  "atriaMermaid",
  "atriaLatex",
  "atriaHtml",
  "atriaDrawing",
  "atriaMetric",
  "atriaTimeline",
  "atriaLegacy",
]);

export function hasTextSelection(editor: Editor): boolean {
  return editor.state.selection instanceof TextSelection && !editor.state.selection.empty;
}

export function insertBlockAtSelection(editor: Editor, content: Content): boolean {
  const insertionPosition = siblingInsertionPosition(editor);
  if (insertionPosition !== null) {
    return editor.chain().focus().insertContentAt(insertionPosition, content, { updateSelection: true }).run();
  }
  return editor.chain().focus().insertContent(content, { updateSelection: true }).run();
}

function siblingInsertionPosition(editor: Editor): number | null {
  const { selection } = editor.state;
  if (selection instanceof NodeSelection) return selection.to;

  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if (siblingInsertionContainers.has($from.node(depth).type.name)) return $from.after(depth);
  }
  return null;
}
