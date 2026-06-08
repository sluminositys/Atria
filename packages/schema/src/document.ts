import { z } from "zod";

export const DocumentKindSchema = z.enum(["rich-document", "html-artifact", "drawing", "asset"]);

export const ActorSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["human", "agent", "system"]),
  tool: z.string().optional(),
  model: z.string().optional(),
  runId: z.string().optional(),
});

export const DocumentRecordSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  title: z.string().min(1),
  kind: DocumentKindSchema,
  tags: z.array(z.string()).default([]),
  createdBy: ActorSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  currentRevision: z.string().optional(),
});

export const RevisionSchema = z.object({
  id: z.string().min(1),
  transactionId: z.string().min(1),
  documentId: z.string().min(1),
  parentId: z.string().optional(),
  actor: ActorSchema,
  intent: z.string().min(1),
  contentHash: z.string().min(1),
  commitId: z.string().optional(),
  createdAt: z.string(),
});

export const DocumentPatchSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("replace-text"),
    search: z.string().min(1),
    replacement: z.string(),
    expectedOccurrences: z.number().int().min(1).default(1),
  }),
  z.object({
    type: z.literal("replace-node"),
    nodeId: z.string().min(1),
    html: z.string(),
  }),
  z.object({
    type: z.literal("insert-after"),
    nodeId: z.string().min(1),
    html: z.string(),
  }),
]);

export const DocumentOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create"),
    document: DocumentRecordSchema.omit({ createdAt: true, updatedAt: true, currentRevision: true }),
    content: z.string(),
  }),
  z.object({ type: z.literal("replace"), content: z.string() }),
  z.object({ type: z.literal("patch"), patches: z.array(DocumentPatchSchema).min(1) }),
  z.object({ type: z.literal("move"), path: z.string().min(1) }),
  z.object({ type: z.literal("delete") }),
  z.object({ type: z.literal("restore"), revisionId: z.string().min(1) }),
]);

export const DocumentTransactionSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  baseRevision: z.string().optional(),
  actor: ActorSchema,
  intent: z.string().min(1),
  checkpoint: z.boolean().default(true),
  operation: DocumentOperationSchema,
});

export const DocumentTransactionResultSchema = z.object({
  document: DocumentRecordSchema,
  revision: RevisionSchema,
});

export type DocumentKind = z.infer<typeof DocumentKindSchema>;
export type Actor = z.infer<typeof ActorSchema>;
export type DocumentRecord = z.infer<typeof DocumentRecordSchema>;
export type Revision = z.infer<typeof RevisionSchema>;
export type DocumentPatch = z.infer<typeof DocumentPatchSchema>;
export type DocumentOperation = z.infer<typeof DocumentOperationSchema>;
export type DocumentTransaction = z.infer<typeof DocumentTransactionSchema>;
export type DocumentTransactionResult = z.infer<typeof DocumentTransactionResultSchema>;
