import { z } from "zod";

export const AiSettingsSchema = z.object({
  provider: z.enum(["openai", "anthropic", "ollama", "custom"]).default("ollama"),
  model: z.string().default("llama3.1:8b"),
  endpoint: z.string().default("http://127.0.0.1:11434"),
  apiKeySet: z.boolean().default(false),
  defaultBehavior: z.enum(["summarize", "extract-conclusions", "draft-page"]).default("summarize"),
  language: z.enum(["zh", "en", "mixed"]).default("zh"),
});

export const RecentFileSchema = z.object({
  type: z.enum(["page", "artifact", "timeline"]),
  id: z.string(),
  title: z.string(),
  source: z.enum(["human", "ai"]),
  openedAt: z.string(),
});

export const AtriaSettingsSchema = z.object({
  workspacePath: z.string().default(""),
  recentFiles: z.array(RecentFileSchema).default([]),
  ai: AiSettingsSchema.default({}),
  mcp: z
    .object({
      enabled: z.boolean().default(true),
      host: z.literal("127.0.0.1").default("127.0.0.1"),
    })
    .default({}),
});

export type AiSettings = z.infer<typeof AiSettingsSchema>;
export type AtriaSettings = z.infer<typeof AtriaSettingsSchema>;
export type RecentFile = z.infer<typeof RecentFileSchema>;
