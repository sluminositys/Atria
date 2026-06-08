export interface SemanticDocumentInput {
  id: string;
  title: string;
  body: string;
  language?: string;
}

export interface ParsedSemanticDocument {
  id?: string;
  title: string;
  body: string;
  language: string;
}

const DOCUMENT_ID_META = "atria:document-id";

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

  return [
    "<!doctype html>",
    `<html lang="${language}">`,
    "<head>",
    "  <meta charset=\"utf-8\">",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    `  <meta name="${DOCUMENT_ID_META}" content="${id}">`,
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

  return {
    id: id ? decodeEntities(id) : undefined,
    title: title || "Untitled",
    body: normalizeHtmlText(body ?? html) || "<p></p>",
    language: normalizeLanguage(language),
  };
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
