import { z } from "zod";
import { AtriaBlockSchema } from "./block";

export const TimelineKindSchema = z.enum(["daily", "weekly", "monthly"]);

export const TimelineSummarySchema = z.object({
  id: z.string(),
  kind: TimelineKindSchema,
  title: z.string(),
  dateRef: z.string(),
  pageId: z.string().optional(),
  artifactIds: z.array(z.string()).default([]),
  pageIds: z.array(z.string()).default([]),
  blocks: z.array(AtriaBlockSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TimelineKind = z.infer<typeof TimelineKindSchema>;
export type TimelineSummary = z.infer<typeof TimelineSummarySchema>;

