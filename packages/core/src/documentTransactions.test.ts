import { describe, expect, it } from "vitest";
import type { Actor, DocumentTransaction } from "@atria/schema";
import {
  DocumentConflictError,
  DocumentPatchError,
  DocumentTransactionModule,
  MemoryDocumentStore,
  MemoryRevisionStore,
} from "./documentTransactions";
import { parseSemanticDocument } from "./documentHtml";

const actor: Actor = { id: "codex", label: "Codex", kind: "agent", tool: "codex" };

function createTransaction(overrides: Partial<DocumentTransaction> = {}): DocumentTransaction {
  return {
    id: crypto.randomUUID(),
    documentId: "doc-1",
    actor,
    intent: "Create the experiment note",
    checkpoint: true,
    operation: {
      type: "create",
      document: {
        id: "doc-1",
        path: "Notes/experiment.html",
        title: "Experiment",
        kind: "rich-document",
        tags: ["experiment"],
        createdBy: actor,
      },
      content: '<h1 data-atria-id="heading">Experiment</h1><p data-atria-id="summary">Initial</p>',
    },
    ...overrides,
  };
}

describe("DocumentTransactionModule", () => {
  it("creates a canonical document and returns the same result for a duplicate transaction", async () => {
    const documents = new MemoryDocumentStore();
    const module = new DocumentTransactionModule(documents, new MemoryRevisionStore());
    const transaction = createTransaction();

    const first = await module.execute(transaction);
    const duplicate = await module.execute(transaction);
    const stored = await documents.read("doc-1");

    expect(duplicate).toEqual(first);
    expect(first.revision.commitId).toBe(`memory-${first.revision.id}`);
    expect(parseSemanticDocument(stored!.content).body).toContain("Initial");
    expect(stored?.record.currentRevision).toBe(first.revision.id);
  });

  it("patches one stable node and rejects stale base revisions", async () => {
    const module = new DocumentTransactionModule(new MemoryDocumentStore(), new MemoryRevisionStore());
    const created = await module.execute(createTransaction());
    const patched = await module.execute({
      id: "patch-1",
      documentId: "doc-1",
      baseRevision: created.revision.id,
      actor,
      intent: "Update the result summary",
      checkpoint: true,
      operation: {
        type: "patch",
        patches: [{ type: "replace-node", nodeId: "summary", html: '<p data-atria-id="summary">Improved</p>' }],
      },
    });

    expect(patched.revision.parentId).toBe(created.revision.id);
    await expect(
      module.execute({
        id: "stale-patch",
        documentId: "doc-1",
        baseRevision: created.revision.id,
        actor,
        intent: "Apply a stale edit",
        checkpoint: true,
        operation: { type: "replace", content: "<p>Stale</p>" },
      }),
    ).rejects.toBeInstanceOf(DocumentConflictError);
  });

  it("restores historical content as a new revision", async () => {
    const documents = new MemoryDocumentStore();
    const revisions = new MemoryRevisionStore();
    const module = new DocumentTransactionModule(documents, revisions);
    const created = await module.execute(createTransaction());
    const changed = await module.execute({
      id: "replace-1",
      documentId: "doc-1",
      baseRevision: created.revision.id,
      actor,
      intent: "Replace content",
      checkpoint: true,
      operation: { type: "replace", content: "<p>Changed</p>" },
    });
    const restored = await module.execute({
      id: "restore-1",
      documentId: "doc-1",
      baseRevision: changed.revision.id,
      actor,
      intent: "Restore original content",
      checkpoint: true,
      operation: { type: "restore", revisionId: created.revision.id },
    });

    expect(restored.revision.parentId).toBe(changed.revision.id);
    expect(parseSemanticDocument((await documents.read("doc-1"))!.content).body).toContain("Initial");
  });

  it("rejects a patch when its text occurrence expectation is not met", async () => {
    const module = new DocumentTransactionModule(new MemoryDocumentStore(), new MemoryRevisionStore());
    const created = await module.execute(createTransaction());

    await expect(
      module.execute({
        id: "ambiguous-patch",
        documentId: "doc-1",
        baseRevision: created.revision.id,
        actor,
        intent: "Ambiguous replacement",
        checkpoint: true,
        operation: {
          type: "patch",
          patches: [{ type: "replace-text", search: "Experiment", replacement: "Trial", expectedOccurrences: 1 }],
        },
      }),
    ).rejects.toBeInstanceOf(DocumentPatchError);
  });
});
