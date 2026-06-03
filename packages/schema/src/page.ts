import { z } from "zod";
import { AtriaBlockSchema, BlockSourceSchema } from "./block";

export const PageKindSchema = z.enum(["note", "timeline", "template"]);

export const AtriaDocumentMarkSchema = z
  .object({
    type: z.string(),
    attrs: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type AtriaDocumentContent = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: AtriaDocumentContent[];
  marks?: z.infer<typeof AtriaDocumentMarkSchema>[];
  text?: string;
};

export const AtriaDocumentContentSchema: z.ZodType<AtriaDocumentContent> = z.lazy(() =>
  z
    .object({
      type: z.string(),
      attrs: z.record(z.unknown()).optional(),
      content: z.array(AtriaDocumentContentSchema).optional(),
      marks: z.array(AtriaDocumentMarkSchema).optional(),
      text: z.string().optional(),
    })
    .passthrough(),
);

export const PageSchema = z.object({
  id: z.string(),
  title: z.string(),
  source: BlockSourceSchema.default("human"),
  kind: PageKindSchema.default("note"),
  content: AtriaDocumentContentSchema.optional(),
  body: z.string().default(""),
  filePath: z.string().optional(),
  projectId: z.string().optional(),
  timelineRef: z.string().optional(),
  tags: z.array(z.string()).default([]),
  blocks: z.array(AtriaBlockSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const PageCreateInputSchema = PageSchema.omit({
  source: true,
  createdAt: true,
  updatedAt: true,
}).partial({
  id: true,
  kind: true,
  body: true,
  filePath: true,
  tags: true,
  blocks: true,
});

export type Page = z.infer<typeof PageSchema>;
export type PageCreateInput = z.infer<typeof PageCreateInputSchema>;
