import { z } from "zod";
import { ArtifactSchema } from "./artifact";
import { DocumentRecordSchema } from "./document";
import { PageSchema } from "./page";
import { ProjectSchema } from "./project";
import { AtriaSettingsSchema } from "./settings";
import { TimelineSummarySchema } from "./timeline";

export const WorkspaceNodeTypeSchema = z.enum(["folder", "page", "artifact", "asset", "timeline"]);

export const WorkspaceAssetKindSchema = z.enum(["image", "pdf", "text", "document", "other"]);

export const WorkspaceAssetSchema = z.object({
  id: z.string(),
  title: z.string(),
  filePath: z.string(),
  kind: WorkspaceAssetKindSchema,
  extension: z.string().default(""),
  mimeType: z.string().optional(),
  size: z.number().nonnegative().default(0),
  updatedAt: z.string().optional(),
});

export const WorkspaceFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string().optional(),
  parentId: z.string().nullable().default(null),
  order: z.number().default(0),
  expanded: z.boolean().default(true),
});

export const WorkspaceTreeItemSchema = z.object({
  id: z.string(),
  type: WorkspaceNodeTypeSchema,
  parentId: z.string().nullable().default(null),
  filePath: z.string().optional(),
  order: z.number().default(0),
});

export const WorkspaceSnapshotSchema = z.object({
  id: z.string().default("local"),
  title: z.string().default("My Workspace"),
  folders: z.array(WorkspaceFolderSchema).default([]),
  tree: z.array(WorkspaceTreeItemSchema).default([]),
  pages: z.array(PageSchema).default([]),
  artifacts: z.array(ArtifactSchema).default([]),
  assets: z.array(WorkspaceAssetSchema).default([]),
  documents: z.array(DocumentRecordSchema).default([]),
  timeline: z.array(TimelineSummarySchema).default([]),
  projects: z.array(ProjectSchema).default([]),
  settings: AtriaSettingsSchema.default({}),
  updatedAt: z.string(),
});

export type WorkspaceFolder = z.infer<typeof WorkspaceFolderSchema>;
export type WorkspaceAsset = z.infer<typeof WorkspaceAssetSchema>;
export type WorkspaceAssetKind = z.infer<typeof WorkspaceAssetKindSchema>;
export type WorkspaceTreeItem = z.infer<typeof WorkspaceTreeItemSchema>;
export type WorkspaceSnapshot = z.infer<typeof WorkspaceSnapshotSchema>;
export type WorkspaceNodeType = z.infer<typeof WorkspaceNodeTypeSchema>;
