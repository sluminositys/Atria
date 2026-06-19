import type { Actor } from "@atria/schema";

export interface SemanticDocumentInput {
  id: string;
  title: string;
  body: string;
  language?: string;
  createdBy?: Actor;
  tags?: string[];
}

export interface ParsedSemanticDocument {
  id?: string;
  title: string;
  body: string;
  language: string;
  createdBy?: Actor;
  tags: string[];
}

const DOCUMENT_ID_META = "atria:document-id";
const ACTOR_ID_META = "atria:actor-id";
const ACTOR_LABEL_META = "atria:actor-label";
const ACTOR_KIND_META = "atria:actor-kind";
const ACTOR_TOOL_META = "atria:actor-tool";
const ACTOR_MODEL_META = "atria:actor-model";
const ACTOR_RUN_META = "atria:actor-run-id";
const TAGS_META = "atria:tags";

export function normalizeHtmlText(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u200B/g, "")
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/g, ""))
    .join("\n")
    .trim();
}

export function serializeSemanticDocument(input: SemanticDocumentInput): string {
  const language = normalizeLanguage(input.language);
  const body = normalizeHtmlText(input.body) || "<p></p>";
  const id = escapeAttribute(input.id);
  const title = escapeText(input.title.trim() || "Untitled");
  const ownedMetadata = [
    input.createdBy && metaTag(ACTOR_ID_META, input.createdBy.id),
    input.createdBy && metaTag(ACTOR_LABEL_META, input.createdBy.label),
    input.createdBy && metaTag(ACTOR_KIND_META, input.createdBy.kind),
    input.createdBy?.tool && metaTag(ACTOR_TOOL_META, input.createdBy.tool),
    input.createdBy?.model && metaTag(ACTOR_MODEL_META, input.createdBy.model),
    input.createdBy?.runId && metaTag(ACTOR_RUN_META, input.createdBy.runId),
    input.tags?.length && metaTag(TAGS_META, JSON.stringify(input.tags)),
  ].filter((value): value is string => typeof value === "string");

  return [
    "<!doctype html>",
    `<html lang="${language}">`,
    "<head>",
    "  <meta charset=\"utf-8\">",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    `  <meta name="${DOCUMENT_ID_META}" content="${id}">`,
    ...ownedMetadata,
    `  <title>${title}</title>`,
    "</head>",
    `<body data-atria-document="${id}">`,
    body,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

export function parseSemanticDocument(value: string): ParsedSemanticDocument {
  const html = normalizeHtmlText(value);
  const language = decodeEntities(matchFirst(html, /<html\b[^>]*\blang=["']([^"']+)["'][^>]*>/i) ?? "en");
  const id = matchFirst(
    html,
    new RegExp(`<meta\\b[^>]*\\bname=["']${escapeRegExp(DOCUMENT_ID_META)}["'][^>]*\\bcontent=["']([^"']+)["'][^>]*>`, "i"),
  );
  const title = decodeEntities(matchFirst(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i) ?? "Untitled").trim();
  const body = matchFirst(html, /<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const actorKind = metaContent(html, ACTOR_KIND_META);
  const actorId = metaContent(html, ACTOR_ID_META);
  const actorLabel = metaContent(html, ACTOR_LABEL_META);
  const createdBy = actorId && actorLabel && (actorKind === "human" || actorKind === "agent" || actorKind === "system")
    ? {
        id: actorId,
        label: actorLabel,
        kind: actorKind,
        ...(metaContent(html, ACTOR_TOOL_META) ? { tool: metaContent(html, ACTOR_TOOL_META) } : {}),
        ...(metaContent(html, ACTOR_MODEL_META) ? { model: metaContent(html, ACTOR_MODEL_META) } : {}),
        ...(metaContent(html, ACTOR_RUN_META) ? { runId: metaContent(html, ACTOR_RUN_META) } : {}),
      } satisfies Actor
    : undefined;
  const tags = parseTags(metaContent(html, TAGS_META));

  return {
    id: id ? decodeEntities(id) : undefined,
    title: title || "Untitled",
    body: normalizeHtmlText(body ?? html) || "<p></p>",
    language: normalizeLanguage(language),
    createdBy,
    tags,
  };
}

function metaTag(name: string, content: string): string {
  return `  <meta name="${name}" content="${escapeAttribute(content)}">`;
}

function metaContent(html: string, name: string): string | undefined {
  const value = matchFirst(
    html,
    new RegExp(`<meta\\b[^>]*\\bname=["']${escapeRegExp(name)}["'][^>]*\\bcontent=["']([^"']*)["'][^>]*>`, "i"),
  );
  return value === undefined ? undefined : decodeEntities(value);
}

function parseTags(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const tags = JSON.parse(value);
    return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

export function isSemanticDocument(value: string): boolean {
  return new RegExp(`<meta\\b[^>]*\\bname=["']${escapeRegExp(DOCUMENT_ID_META)}["']`, "i").test(value);
}

function matchFirst(value: string, pattern: RegExp): string | undefined {
  return pattern.exec(value)?.[1];
}

function normalizeLanguage(value: string | undefined): string {
  const language = (value ?? "en").trim().toLowerCase();
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(language) ? language : "en";
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/'/g, "&#39;");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
