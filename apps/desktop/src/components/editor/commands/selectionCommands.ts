import type { Content } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import { AllSelection, NodeSelection, TextSelection, type Selection } from "@tiptap/pm/state";

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

export function hasTextSelection(selection: Selection): boolean {
  return !selection.empty && (selection instanceof TextSelection || selection instanceof AllSelection);
}

export function insertBlockAtSelection(editor: Editor, content: Content): boolean {
  const insertionPosition = siblingInsertionPosition(editor.state.selection);
  if (insertionPosition !== null) {
    return editor.chain().focus().insertContentAt(insertionPosition, content, { updateSelection: true }).run();
  }
  return editor.chain().focus().insertContent(content, { updateSelection: true }).run();
}

export function siblingInsertionPosition(selection: Selection): number | null {
  if (selection instanceof NodeSelection) return selection.to;

  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if (siblingInsertionContainers.has($from.node(depth).type.name)) return $from.after(depth);
  }
  return null;
}
