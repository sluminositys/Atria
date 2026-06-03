import { WorkspaceService, createBlock } from "@atria/core";
import {
  ArtifactRegisterInputSchema,
  PageAppendBlockInputSchema,
  PageCreateToolInputSchema,
  WorkspaceSearchInputSchema,
} from "@atria/schema";
import { z } from "zod";

export interface AtriaMcpTool<Input> {
  name: string;
  description: string;
  inputSchema: z.ZodType<Input>;
  handler(input: Input): Promise<unknown>;
}

export function createAtriaMcpTools(service: WorkspaceService): AtriaMcpTool<unknown>[] {
  return [
    {
      name: "workspace_get_tree",
      description: "Read the current Atria workspace tree, pages, artifacts, timeline, and projects.",
      inputSchema: z.object({}),
      handler: async () => service.getSnapshot(),
    },
    {
      name: "workspace_search",
      description: "Search Atria pages and HTML artifacts by title, tags, description, or id.",
      inputSchema: WorkspaceSearchInputSchema,
      handler: async (input) => service.search(input.query, input.limit),
    },
    {
      name: "artifact_register",
      description: "Register an AI-created HTML artifact in the Atria workspace.",
      inputSchema: ArtifactRegisterInputSchema,
      handler: async (input) =>
        service.registerArtifact({
          id: input.id,
          title: input.title,
          description: input.description,
          entryFile: input.entryFile,
          projectId: input.projectId,
          tags: input.tags,
        }),
    },
    {
      name: "artifact_list",
      description: "List registered Atria artifacts.",
      inputSchema: z.object({}),
      handler: async () => (await service.getSnapshot()).artifacts,
    },
    {
      name: "artifact_get",
      description: "Read one Atria artifact metadata record.",
      inputSchema: z.object({ artifactId: z.string() }),
      handler: async ({ artifactId }) =>
        (await service.getSnapshot()).artifacts.find((item) => item.id === artifactId),
    },
    {
      name: "artifact_delete",
      description: "Soft-delete an Atria artifact from the workspace index.",
      inputSchema: z.object({ artifactId: z.string() }),
      handler: async ({ artifactId }) => {
        await service.deleteArtifact(artifactId);
        return { ok: true };
      },
    },
    {
      name: "page_create",
      description: "Create a human-readable Atria page with block content.",
      inputSchema: PageCreateToolInputSchema,
      handler: async (input) => service.createPage(input),
    },
    {
      name: "page_list",
      description: "List Atria pages.",
      inputSchema: z.object({}),
      handler: async () => (await service.getSnapshot()).pages,
    },
    {
      name: "page_get",
      description: "Read one Atria page.",
      inputSchema: z.object({ pageId: z.string() }),
      handler: async ({ pageId }) => (await service.getSnapshot()).pages.find((item) => item.id === pageId),
    },
    {
      name: "page_append_block",
      description: "Append a block to an existing Atria page.",
      inputSchema: PageAppendBlockInputSchema,
      handler: async (input) => service.appendBlock(input.pageId, input.block),
    },
    {
      name: "page_replace_blocks",
      description: "Replace all blocks in an Atria page.",
      inputSchema: z.object({ pageId: z.string(), blocks: z.array(PageAppendBlockInputSchema.shape.block) }),
      handler: async ({ pageId, blocks }) => service.replaceBlocks(pageId, blocks),
    },
    {
      name: "page_delete",
      description: "Delete a human-created Atria page.",
      inputSchema: z.object({ pageId: z.string() }),
      handler: async ({ pageId }) => {
        await service.deletePage(pageId);
        return { ok: true };
      },
    },
    {
      name: "block_append",
      description: "Append a simple block to a page by block type.",
      inputSchema: z.object({
        pageId: z.string(),
        type: z.enum([
          "heading",
          "text",
          "callout",
          "todo",
          "card",
          "code",
          "image",
          "artifact",
          "table",
          "chart",
          "mermaid",
          "latex",
          "custom-html",
        ]),
      }),
      handler: async ({ pageId, type }) => service.appendBlock(pageId, createBlock(type)),
    },
    {
      name: "timeline_create_daily_summary",
      description: "Create a daily Atria timeline summary.",
      inputSchema: z.object({ date: z.string(), title: z.string().optional() }),
      handler: async ({ date, title }) => service.createTimelineSummary("daily", date, title),
    },
    {
      name: "timeline_create_weekly_summary",
      description: "Create a weekly Atria timeline summary.",
      inputSchema: z.object({ week: z.string(), title: z.string().optional() }),
      handler: async ({ week, title }) => service.createTimelineSummary("weekly", week, title),
    },
    {
      name: "timeline_create_monthly_summary",
      description: "Create a monthly Atria timeline summary.",
      inputSchema: z.object({ month: z.string(), title: z.string().optional() }),
      handler: async ({ month, title }) => service.createTimelineSummary("monthly", month, title),
    },
    {
      name: "timeline_get_recent",
      description: "Read recent Atria timeline summaries.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(30).default(10) }),
      handler: async ({ limit }) => (await service.getSnapshot()).timeline.slice(0, limit),
    },
    {
      name: "project_get_state",
      description: "Read one Atria project state.",
      inputSchema: z.object({ projectId: z.string() }),
      handler: async ({ projectId }) =>
        (await service.getSnapshot()).projects.find((item) => item.id === projectId),
    },
    {
      name: "project_update_state",
      description: "Reserved semantic project update entrypoint.",
      inputSchema: z.object({ projectId: z.string(), status: z.enum(["active", "paused", "archived"]) }),
      handler: async ({ projectId, status }) => ({ projectId, status, ok: true }),
    },
  ];
}

export const atriaResources = [
  "atria://workspace/tree",
  "atria://artifact/{artifact_id}",
  "atria://page/{page_id}",
  "atria://timeline/daily/{date}",
  "atria://timeline/weekly/{week}",
  "atria://timeline/monthly/{month}",
  "atria://project/{project_id}",
];

export const atriaPrompts = [
  "record_experiment_result",
  "summarize_daily_work",
  "create_result_review_page",
  "extract_next_actions",
  "generate_html_report",
];

