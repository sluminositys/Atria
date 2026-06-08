import {
  DocumentPatch,
  DocumentRecord,
  DocumentRecordSchema,
  DocumentTransaction,
  DocumentTransactionResult,
  DocumentTransactionSchema,
  Revision,
} from "@atria/schema";
import {
  isSemanticDocument,
  parseSemanticDocument,
  serializeSemanticDocument,
} from "./documentHtml";

export interface StoredDocument {
  record: DocumentRecord;
  content: string;
}

export interface DocumentStore {
  read(documentId: string): Promise<StoredDocument | undefined>;
  write(document: StoredDocument): Promise<void>;
  delete(document: DocumentRecord): Promise<void>;
}

export interface RevisionStore {
  current(documentId: string): Promise<Revision | undefined>;
  content(revisionId: string): Promise<string | undefined>;
  transaction(transactionId: string): Promise<DocumentTransactionResult | undefined>;
  append(result: DocumentTransactionResult, content: string, checkpoint: boolean): Promise<Revision>;
}

export interface DocumentProjection {
  upsert(document: DocumentRecord): Promise<void>;
  remove(documentId: string): Promise<void>;
}

export class DocumentConflictError extends Error {
  readonly code = "DOCUMENT_CONFLICT";

  constructor(
    readonly documentId: string,
    readonly expectedRevision: string | undefined,
    readonly actualRevision: string | undefined,
  ) {
    super(`Document ${documentId} changed from ${expectedRevision ?? "empty"} to ${actualRevision ?? "empty"}`);
  }
}

export class DocumentPatchError extends Error {
  readonly code = "DOCUMENT_PATCH_FAILED";
}

export class DocumentTransactionModule {
  constructor(
    private readonly documents: DocumentStore,
    private readonly revisions: RevisionStore,
    private readonly projection?: DocumentProjection,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async execute(rawTransaction: DocumentTransaction): Promise<DocumentTransactionResult> {
    const transaction = DocumentTransactionSchema.parse(rawTransaction);
    const duplicate = await this.revisions.transaction(transaction.id);
    if (duplicate) return duplicate;

    const stored = await this.documents.read(transaction.documentId);
    const currentRevision = await this.revisions.current(transaction.documentId);
    this.assertBaseRevision(transaction, currentRevision, stored);

    const next = await this.applyOperation(transaction, stored);
    const contentHash = await hashContent(next.content);
    const revision: Revision = {
      id: crypto.randomUUID(),
      transactionId: transaction.id,
      documentId: next.record.id,
      parentId: currentRevision?.id,
      actor: transaction.actor,
      intent: transaction.intent,
      contentHash,
      createdAt: this.now(),
    };
    const document = DocumentRecordSchema.parse({
      ...next.record,
      currentRevision: revision.id,
      updatedAt: revision.createdAt,
    });
    const provisional = { document, revision };

    if (transaction.operation.type === "delete") {
      await this.documents.delete(document);
      await this.projection?.remove(document.id);
    } else {
      await this.documents.write({ record: document, content: next.content });
      await this.projection?.upsert(document);
    }

    const committedRevision = await this.revisions.append(provisional, next.content, transaction.checkpoint);
    return { document, revision: committedRevision };
  }

  private assertBaseRevision(
    transaction: DocumentTransaction,
    currentRevision: Revision | undefined,
    stored: StoredDocument | undefined,
  ) {
    const actual = currentRevision?.id ?? stored?.record.currentRevision;
    const createsNew = transaction.operation.type === "create" && !stored;
    if (createsNew && !transaction.baseRevision) return;
    if (transaction.baseRevision !== actual) {
      throw new DocumentConflictError(transaction.documentId, transaction.baseRevision, actual);
    }
  }

  private async applyOperation(
    transaction: DocumentTransaction,
    stored: StoredDocument | undefined,
  ): Promise<StoredDocument> {
    const operation = transaction.operation;
    if (operation.type === "create") {
      if (stored) throw new DocumentPatchError(`Document already exists: ${transaction.documentId}`);
      const createdAt = this.now();
      const record = DocumentRecordSchema.parse({
        ...operation.document,
        id: transaction.documentId,
        createdAt,
        updatedAt: createdAt,
      });
      return { record, content: canonicalContent(record, operation.content) };
    }

    if (!stored) throw new DocumentPatchError(`Document not found: ${transaction.documentId}`);

    switch (operation.type) {
      case "replace":
        return { record: stored.record, content: canonicalContent(stored.record, operation.content) };
      case "patch":
        return {
          record: stored.record,
          content: canonicalContent(stored.record, applyPatches(stored.content, operation.patches)),
        };
      case "move":
        return {
          record: DocumentRecordSchema.parse({ ...stored.record, path: operation.path }),
          content: stored.content,
        };
      case "delete":
        return stored;
      case "restore": {
        const content = await this.revisions.content(operation.revisionId);
        if (content === undefined) throw new DocumentPatchError(`Revision not found: ${operation.revisionId}`);
        return { record: stored.record, content: canonicalContent(stored.record, content) };
      }
    }
  }
}

export class MemoryDocumentStore implements DocumentStore {
  private readonly documents = new Map<string, StoredDocument>();

  async read(documentId: string): Promise<StoredDocument | undefined> {
    const stored = this.documents.get(documentId);
    return stored ? structuredClone(stored) : undefined;
  }

  async write(document: StoredDocument): Promise<void> {
    this.documents.set(document.record.id, structuredClone(document));
  }

  async delete(document: DocumentRecord): Promise<void> {
    this.documents.delete(document.id);
  }
}

export class MemoryRevisionStore implements RevisionStore {
  private readonly revisions = new Map<string, { result: DocumentTransactionResult; content: string }>();
  private readonly transactions = new Map<string, DocumentTransactionResult>();
  private readonly currentRevisions = new Map<string, Revision>();

  async current(documentId: string): Promise<Revision | undefined> {
    return structuredClone(this.currentRevisions.get(documentId));
  }

  async content(revisionId: string): Promise<string | undefined> {
    return this.revisions.get(revisionId)?.content;
  }

  async transaction(transactionId: string): Promise<DocumentTransactionResult | undefined> {
    return structuredClone(this.transactions.get(transactionId));
  }

  async append(
    result: DocumentTransactionResult,
    content: string,
    checkpoint: boolean,
  ): Promise<Revision> {
    const revision = checkpoint
      ? { ...result.revision, commitId: `memory-${result.revision.id}` }
      : result.revision;
    const committed = { ...result, revision };
    this.revisions.set(revision.id, { result: structuredClone(committed), content });
    this.transactions.set(revision.transactionId, structuredClone(committed));
    this.currentRevisions.set(revision.documentId, structuredClone(revision));
    return structuredClone(revision);
  }
}

function canonicalContent(document: DocumentRecord, content: string): string {
  if (document.kind !== "rich-document") return content;
  const parsed = isSemanticDocument(content) ? parseSemanticDocument(content) : undefined;
  return serializeSemanticDocument({
    id: document.id,
    title: document.title,
    body: parsed?.body ?? content,
    language: parsed?.language,
  });
}

function applyPatches(content: string, patches: DocumentPatch[]): string {
  return patches.reduce((current, patch) => {
    if (patch.type === "replace-text") {
      const occurrences = current.split(patch.search).length - 1;
      if (occurrences !== patch.expectedOccurrences) {
        throw new DocumentPatchError(
          `Expected ${patch.expectedOccurrences} occurrence(s) of text but found ${occurrences}`,
        );
      }
      return current.split(patch.search).join(patch.replacement);
    }

    const range = findNodeRange(current, patch.nodeId);
    if (!range) throw new DocumentPatchError(`Node not found: ${patch.nodeId}`);
    if (patch.type === "replace-node") {
      return `${current.slice(0, range.start)}${patch.html}${current.slice(range.end)}`;
    }
    return `${current.slice(0, range.end)}${patch.html}${current.slice(range.end)}`;
  }, content);
}

function findNodeRange(html: string, nodeId: string): { start: number; end: number } | undefined {
  const escapedId = escapeRegExp(nodeId);
  const startPattern = new RegExp(
    `<([a-z][\\w:-]*)\\b[^>]*\\bdata-atria-id=["']${escapedId}["'][^>]*>`,
    "i",
  );
  const startMatch = startPattern.exec(html);
  if (!startMatch || !startMatch[1]) return undefined;

  const start = startMatch.index;
  const openingEnd = start + startMatch[0].length;
  const tag = startMatch[1];
  if (startMatch[0].endsWith("/>") || VOID_TAGS.has(tag.toLowerCase())) {
    return { start, end: openingEnd };
  }

  const tokenPattern = new RegExp(`<\\/?${escapeRegExp(tag)}\\b[^>]*>`, "gi");
  tokenPattern.lastIndex = openingEnd;
  let depth = 1;
  for (let match = tokenPattern.exec(html); match; match = tokenPattern.exec(html)) {
    const token = match[0];
    if (token.startsWith("</")) depth -= 1;
    else if (!token.endsWith("/>")) depth += 1;
    if (depth === 0) return { start, end: match.index + token.length };
  }
  return undefined;
}

async function hashContent(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
