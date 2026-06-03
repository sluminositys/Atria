import { z } from "zod";
import { AtriaBlockSchema } from "./block";

export const WorkspaceSearchInputSchema = z.object({
  query: z.string(),
  limit: z.number().int().min(1).max(100).default(20),
});

export const ArtifactRegisterInputSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  directory: z.string().optional(),
  entryFile: z.string().default("index.html"),
  projectId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  description: z.string().default(""),
});

export const PageCreateToolInputSchema = z.object({
  title: z.string(),
  projectId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  blocks: z.array(AtriaBlockSchema).default([]),
});

export const PageAppendBlockInputSchema = z.object({
  pageId: z.string(),
  block: AtriaBlockSchema,
});

export type WorkspaceSearchInput = z.infer<typeof WorkspaceSearchInputSchema>;
export type ArtifactRegisterInput = z.infer<typeof ArtifactRegisterInputSchema>;
export type PageCreateToolInput = z.infer<typeof PageCreateToolInputSchema>;
export type PageAppendBlockInput = z.infer<typeof PageAppendBlockInputSchema>;

