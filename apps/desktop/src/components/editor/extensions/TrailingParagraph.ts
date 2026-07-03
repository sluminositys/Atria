import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export const TrailingParagraph = Extension.create({
  name: "atriaTrailingParagraph",

  addProseMirrorPlugins() {
    const paragraph = this.editor.schema.nodes.paragraph;
    if (!paragraph) return [];

    return [
      new Plugin({
        key: new PluginKey("atriaTrailingParagraph"),
        appendTransaction(_transactions, _oldState, newState) {
          if (newState.doc.lastChild?.type === paragraph) return null;
          return newState.tr.insert(newState.doc.content.size, paragraph.create());
        },
      }),
    ];
  },
});
