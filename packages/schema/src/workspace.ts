import { z } from "zod";
import { ArtifactSchema } from "./artifact";
import { PageSchema } from "./page";
import { ProjectSchema } from "./project";
import { AtriaSettingsSchema } from "./settings";
import { TimelineSummarySchema } from "./timeline";

export const WorkspaceNodeTypeSchema = z.enum(["folder", "page", "artifact", "timeline"]);

export const WorkspaceFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable().default(null),
  order: z.number().default(0),
  expanded: z.boolean().default(true),
});

export const WorkspaceTreeItemSchema = z.object({
  id: z.string(),
  type: WorkspaceNodeTypeSchema,
  parentId: z.string().nullable().default(null),
  order: z.number().default(0),
});

export const WorkspaceSnapshotSchema = z.object({
  id: z.string().default("local"),
  title: z.string().default("My Workspace"),
  folders: z.array(WorkspaceFolderSchema).default([]),
  tree: z.array(WorkspaceTreeItemSchema).default([]),
  pages: z.array(PageSchema).default([]),
  artifacts: z.array(ArtifactSchema).default([]),
  timeline: z.array(TimelineSummarySchema).default([]),
  projects: z.array(ProjectSchema).default([]),
  settings: AtriaSettingsSchema.default({}),
  updatedAt: z.string(),
});

export type WorkspaceFolder = z.infer<typeof WorkspaceFolderSchema>;
export type WorkspaceTreeItem = z.infer<typeof WorkspaceTreeItemSchema>;
export type WorkspaceSnapshot = z.infer<typeof WorkspaceSnapshotSchema>;
export type WorkspaceNodeType = z.infer<typeof WorkspaceNodeTypeSchema>;

