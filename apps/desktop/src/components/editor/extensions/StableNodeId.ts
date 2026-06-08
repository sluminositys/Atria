import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

const stableNodeTypes = [
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "codeBlock",
  "horizontalRule",
  "table",
  "atriaCard",
  "atriaCallout",
  "atriaImage",
  "atriaArtifact",
  "atriaMermaid",
  "atriaLatex",
  "atriaHtml",
  "atriaMetric",
  "atriaTimeline",
  "atriaLegacy",
];

export const StableNodeId = Extension.create({
  name: "stableNodeId",

  addGlobalAttributes() {
    return [
      {
        types: stableNodeTypes,
        attributes: {
          atriaId: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-atria-id"),
            renderHTML: (attributes) =>
              attributes.atriaId ? { "data-atria-id": attributes.atriaId } : {},
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("atriaStableNodeId"),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          const transaction = newState.tr;
          let changed = false;
          newState.doc.descendants((node, position) => {
            if (!stableNodeTypes.includes(node.type.name) || node.attrs.atriaId) return;
            transaction.setNodeMarkup(position, undefined, {
              ...node.attrs,
              atriaId: crypto.randomUUID(),
            });
            changed = true;
          });
          return changed ? transaction : null;
        },
      }),
    ];
  },

  onCreate() {
    queueMicrotask(() => {
      const transaction = this.editor.state.tr;
      let changed = false;
      this.editor.state.doc.descendants((node, position) => {
        if (!stableNodeTypes.includes(node.type.name) || node.attrs.atriaId) return;
        transaction.setNodeMarkup(position, undefined, {
          ...node.attrs,
          atriaId: crypto.randomUUID(),
        });
        changed = true;
      });
      if (changed && !this.editor.isDestroyed) this.editor.view.dispatch(transaction);
    });
  },
});
