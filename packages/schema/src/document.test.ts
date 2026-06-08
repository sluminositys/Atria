import { describe, expect, it } from "vitest";
import { DocumentRecordSchema, DocumentTransactionSchema } from "./document";

const actor = { id: "local-user", label: "Local user", kind: "human" as const };

describe("document schemas", () => {
  it("applies stable defaults to records and transactions", () => {
    const document = DocumentRecordSchema.parse({
      id: "doc-1",
      path: "Notes/result.html",
      title: "Result",
      kind: "rich-document",
      createdBy: actor,
      createdAt: "2026-07-31T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:00.000Z",
    });
    const transaction = DocumentTransactionSchema.parse({
      id: "transaction-1",
      documentId: document.id,
      actor,
      intent: "Create result",
      operation: {
        type: "create",
        document: {
          id: document.id,
          path: document.path,
          title: document.title,
          kind: document.kind,
          createdBy: actor,
        },
        content: "<p>Result</p>",
      },
    });

    expect(document.tags).toEqual([]);
    expect(transaction.checkpoint).toBe(true);
  });

  it("rejects empty agent patch anchors", () => {
    expect(() =>
      DocumentTransactionSchema.parse({
        id: "transaction-2",
        documentId: "doc-1",
        baseRevision: "revision-1",
        actor,
        intent: "Patch result",
        operation: {
          type: "patch",
          patches: [{ type: "replace-node", nodeId: "", html: "<p>New</p>" }],
        },
      }),
    ).toThrow();
  });
});
