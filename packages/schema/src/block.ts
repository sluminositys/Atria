import { z } from "zod";

export const BlockSourceSchema = z.enum(["human", "ai"]);

const BlockBaseSchema = z.object({
  id: z.string(),
  source: BlockSourceSchema.default("human"),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const HeadingBlockSchema = BlockBaseSchema.extend({
  type: z.literal("heading"),
  level: z.number().int().min(1).max(4).default(2),
  text: z.string().default(""),
});

export const TextBlockSchema = BlockBaseSchema.extend({
  type: z.literal("text"),
  richText: z.string().default(""),
  markdown: z.string().optional(),
});

export const CalloutBlockSchema = BlockBaseSchema.extend({
  type: z.literal("callout"),
  tone: z.enum(["info", "success", "warning", "danger", "note"]).default("info"),
  title: z.string().default(""),
  text: z.string().default(""),
});

export const TodoBlockSchema = BlockBaseSchema.extend({
  type: z.literal("todo"),
  checked: z.boolean().default(false),
  text: z.string().default(""),
});

export const CardBlockSchema = BlockBaseSchema.extend({
  type: z.literal("card"),
  title: z.string().default(""),
  text: z.string().default(""),
});

export const CodeBlockSchema = BlockBaseSchema.extend({
  type: z.literal("code"),
  language: z.string().default("text"),
  code: z.string().default(""),
});

export const ImageBlockSchema = BlockBaseSchema.extend({
  type: z.literal("image"),
  src: z.string().default(""),
  caption: z.string().default(""),
});

export const ArtifactEmbedBlockSchema = BlockBaseSchema.extend({
  type: z.literal("artifact"),
  artifactId: z.string(),
  note: z.string().default(""),
  height: z.number().int().min(180).max(1200).default(420),
  collapsed: z.boolean().default(false),
});

export const DividerBlockSchema = BlockBaseSchema.extend({
  type: z.literal("divider"),
});

export const QuoteBlockSchema = BlockBaseSchema.extend({
  type: z.literal("quote"),
  text: z.string().default(""),
});

export const TableBlockSchema = BlockBaseSchema.extend({
  type: z.literal("table"),
  columns: z.array(z.string()).default([]),
  rows: z.array(z.array(z.string())).default([]),
});

export const ChartBlockSchema = BlockBaseSchema.extend({
  type: z.literal("chart"),
  chartType: z.enum(["line", "bar", "area", "pie"]).default("line"),
  series: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).default([]),
});

export const CanvasBlockSchema = BlockBaseSchema.extend({
  type: z.literal("canvas"),
  elements: z.array(z.record(z.string(), z.unknown())).default([]),
});

export const MermaidBlockSchema = BlockBaseSchema.extend({
  type: z.literal("mermaid"),
  code: z.string().default("graph TD\n  A[Atria] --> B[Artifact]\n"),
});

export const LatexBlockSchema = BlockBaseSchema.extend({
  type: z.literal("latex"),
  formula: z.string().default(""),
  display: z.boolean().default(true),
});

export const InteractiveBlockSchema = BlockBaseSchema.extend({
  type: z.literal("interactive"),
  runtime: z.enum(["html", "iframe"]).default("html"),
  props: z.record(z.string(), z.unknown()).default({}),
});

export const CustomHtmlBlockSchema = BlockBaseSchema.extend({
  type: z.literal("custom-html"),
  html: z.string().default(""),
  sandbox: z.boolean().default(true),
});

export const TimelineBlockSchema = BlockBaseSchema.extend({
  type: z.literal("timeline"),
  items: z
    .array(
      z.object({
        at: z.string(),
        title: z.string(),
        detail: z.string().default(""),
      }),
    )
    .default([]),
});

export const MetricCardBlockSchema = BlockBaseSchema.extend({
  type: z.literal("metric-card"),
  label: z.string().default("Metric"),
  value: z.string().default(""),
  delta: z.string().default(""),
});

export const GalleryBlockSchema = BlockBaseSchema.extend({
  type: z.literal("gallery"),
  images: z.array(ImageBlockSchema.omit({ type: true })).default([]),
});

export const AtriaBlockSchema = z.discriminatedUnion("type", [
  HeadingBlockSchema,
  TextBlockSchema,
  CalloutBlockSchema,
  TodoBlockSchema,
  CardBlockSchema,
  CodeBlockSchema,
  ImageBlockSchema,
  ArtifactEmbedBlockSchema,
  DividerBlockSchema,
  QuoteBlockSchema,
  TableBlockSchema,
  ChartBlockSchema,
  CanvasBlockSchema,
  MermaidBlockSchema,
  LatexBlockSchema,
  InteractiveBlockSchema,
  CustomHtmlBlockSchema,
  TimelineBlockSchema,
  MetricCardBlockSchema,
  GalleryBlockSchema,
]);

export const AtriaBlockTypeSchema = AtriaBlockSchema.options.map((schema) => schema.shape.type.value);

export type BlockSource = z.infer<typeof BlockSourceSchema>;
export type AtriaBlock = z.infer<typeof AtriaBlockSchema>;
export type AtriaBlockType = AtriaBlock["type"];

