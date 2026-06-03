import { z } from "zod";

export const ArtifactStatusSchema = z.enum(["active", "hidden", "deleted"]);

export const ArtifactSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().default(""),
  source: z.literal("ai").default("ai"),
  kind: z.enum(["html", "image", "dataset", "bundle"]).default("html"),
  entryFile: z.string().default("index.html"),
  entryUrl: z.string().optional(),
  filePath: z.string().optional(),
  projectId: z.string().optional(),
  taskId: z.string().optional(),
  timelineRefs: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  metrics: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  assets: z.array(z.string()).default([]),
  status: ArtifactStatusSchema.default("active"),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ArtifactCreateInputSchema = ArtifactSchema.omit({
  source: true,
  status: true,
  createdAt: true,
  updatedAt: true,
}).partial({
  id: true,
  description: true,
  kind: true,
  entryFile: true,
  entryUrl: true,
  filePath: true,
  timelineRefs: true,
  tags: true,
  metrics: true,
  assets: true,
});

export type Artifact = z.infer<typeof ArtifactSchema>;
export type ArtifactCreateInput = z.infer<typeof ArtifactCreateInputSchema>;
