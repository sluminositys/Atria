import { z } from "zod";
import { AtriaBlockSchema, BlockSourceSchema } from "./block";

export const PageKindSchema = z.enum(["note", "timeline", "template"]);

export const PageSchema = z.object({
  id: z.string(),
  title: z.string(),
  source: BlockSourceSchema.default("human"),
  kind: PageKindSchema.default("note"),
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
  tags: true,
  blocks: true,
});

export type Page = z.infer<typeof PageSchema>;
export type PageCreateInput = z.infer<typeof PageCreateInputSchema>;

