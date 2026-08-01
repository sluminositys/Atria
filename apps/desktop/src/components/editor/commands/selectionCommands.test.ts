import { Schema } from "@tiptap/pm/model";
import { AllSelection, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { hasTextSelection, siblingInsertionPosition } from "./selectionCommands";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "text*", group: "block" },
    atriaCard: { content: "block+", group: "block" },
    text: { group: "inline" },
  },
});

const documentNode = schema.node("doc", null, [
  schema.node("paragraph", null, schema.text("alpha")),
  schema.node("atriaCard", null, schema.node("paragraph")),
  schema.node("paragraph", null, schema.text("omega")),
]);

describe("selection commands", () => {
  it("treats selected text and a whole-document selection as formattable", () => {
    const cursor = TextSelection.create(documentNode, 2);
    const range = TextSelection.create(documentNode, 1, 4);
    const all = new AllSelection(documentNode);
    const node = NodeSelection.create(documentNode, 7);

    expect(hasTextSelection(cursor)).toBe(false);
    expect(hasTextSelection(range)).toBe(true);
    expect(hasTextSelection(all)).toBe(true);
    expect(hasTextSelection(node)).toBe(false);
  });

  it("inserts after a selected block instead of replacing it", () => {
    expect(siblingInsertionPosition(NodeSelection.create(documentNode, 7))).toBe(11);
  });

  it("escapes a structured container before inserting another block", () => {
    expect(siblingInsertionPosition(TextSelection.create(documentNode, 9))).toBe(11);
    expect(siblingInsertionPosition(TextSelection.create(documentNode, 2))).toBeNull();
  });
});
