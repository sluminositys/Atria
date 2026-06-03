import { WorkspaceService, createBlock } from "@atria/core";
import {
  ArtifactRegisterInputSchema,
  PageAppendBlockInputSchema,
  PageCreateToolInputSchema,
  WorkspaceSearchInputSchema,
} from "@atria/schema";
import { z } from "zod";

export interface AtriaMcpTool {
  name: string;
  description: string;
  inputSchema: z.AnyZodObject;
  handler(input: unknown): Promise<unknown>;
}

function defineTool<Schema extends z.AnyZodObject>(
  name: string,
  description: string,
  inputSchema: Schema,
  handler: (input: z.infer<Schema>) => Promise<unknown>,
): AtriaMcpTool {
  return {
    name,
    description,
    inputSchema,
    handler: (input) => handler(inputSchema.parse(input)),
  };
}

export function createAtriaMcpTools(service: WorkspaceService): AtriaMcpTool[] {
  return [
    defineTool(
      "workspace_get_tree",
      "Read the current Atria workspace tree, pages, artifacts, timeline, and projects.",
      z.object({}),
      async () => service.getSnapshot(),
    ),
    defineTool(
      "workspace_search",
      "Search Atria pages and HTML artifacts by title, tags, description, or id.",
      WorkspaceSearchInputSchema,
      async (input) => service.search(input.query, input.limit),
    ),
    defineTool(
      "artifact_register",
      "Register an AI-created HTML artifact in the Atria workspace.",
      ArtifactRegisterInputSchema,
      async (input) =>
        service.registerArtifact({
          id: input.id,
          title: input.title,
          description: input.description,
          entryFile: input.entryFile,
          projectId: input.projectId,
          tags: input.tags,
        }),
    ),
    defineTool(
      "artifact_list",
      "List registered Atria artifacts.",
      z.object({}),
      async () => (await service.getSnapshot()).artifacts,
    ),
    defineTool(
      "artifact_get",
      "Read one Atria artifact metadata record.",
      z.object({ artifactId: z.string() }),
      async ({ artifactId }) =>
        (await service.getSnapshot()).artifacts.find((item) => item.id === artifactId),
    ),
    defineTool(
      "artifact_delete",
      "Soft-delete an Atria artifact from the workspace index.",
      z.object({ artifactId: z.string() }),
      async ({ artifactId }) => {
        await service.deleteArtifact(artifactId);
        return { ok: true };
      },
    ),
    defineTool(
      "page_create",
      "Create a human-readable Atria page with block content.",
      PageCreateToolInputSchema,
      async (input) => service.createPage(input),
    ),
    defineTool(
      "page_list",
      "List Atria pages.",
      z.object({}),
      async () => (await service.getSnapshot()).pages,
    ),
    defineTool(
      "page_get",
      "Read one Atria page.",
      z.object({ pageId: z.string() }),
      async ({ pageId }) => (await service.getSnapshot()).pages.find((item) => item.id === pageId),
    ),
    defineTool(
      "page_append_block",
      "Append a block to an existing Atria page.",
      PageAppendBlockInputSchema,
      async (input) => service.appendBlock(input.pageId, input.block),
    ),
    defineTool(
      "page_replace_blocks",
      "Replace all blocks in an Atria page.",
      z.object({ pageId: z.string(), blocks: z.array(PageAppendBlockInputSchema.shape.block) }),
      async ({ pageId, blocks }) => service.replaceBlocks(pageId, blocks),
    ),
    defineTool(
      "page_delete",
      "Delete a human-created Atria page.",
      z.object({ pageId: z.string() }),
      async ({ pageId }) => {
        await service.deletePage(pageId);
        return { ok: true };
      },
    ),
    defineTool(
      "block_append",
      "Append a simple block to a page by block type.",
      z.object({
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
      async ({ pageId, type }) => service.appendBlock(pageId, createBlock(type)),
    ),
    defineTool(
      "timeline_create_daily_summary",
      "Create a daily Atria timeline summary.",
      z.object({ date: z.string(), title: z.string().optional() }),
      async ({ date, title }) => service.createTimelineSummary("daily", date, title),
    ),
    defineTool(
      "timeline_create_weekly_summary",
      "Create a weekly Atria timeline summary.",
      z.object({ week: z.string(), title: z.string().optional() }),
      async ({ week, title }) => service.createTimelineSummary("weekly", week, title),
    ),
    defineTool(
      "timeline_create_monthly_summary",
      "Create a monthly Atria timeline summary.",
      z.object({ month: z.string(), title: z.string().optional() }),
      async ({ month, title }) => service.createTimelineSummary("monthly", month, title),
    ),
    defineTool(
      "timeline_get_recent",
      "Read recent Atria timeline summaries.",
      z.object({ limit: z.number().int().min(1).max(30).default(10) }),
      async ({ limit }) => (await service.getSnapshot()).timeline.slice(0, limit),
    ),
    defineTool(
      "project_get_state",
      "Read one Atria project state.",
      z.object({ projectId: z.string() }),
      async ({ projectId }) =>
        (await service.getSnapshot()).projects.find((item) => item.id === projectId),
    ),
    defineTool(
      "project_update_state",
      "Reserved semantic project update entrypoint.",
      z.object({ projectId: z.string(), status: z.enum(["active", "paused", "archived"]) }),
      async ({ projectId, status }) => ({ projectId, status, ok: true }),
    ),
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
