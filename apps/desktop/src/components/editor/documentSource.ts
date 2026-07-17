export function validateDocumentBodySource(source: string): string | null {
  if (/<\s*(?:!doctype|html|head|body)\b/i.test(source)) {
    return "Edit the document body only. The document wrapper is managed by Atria.";
  }
  const executableTag = /<\s*(script|style|iframe|object|embed|base|link|meta)\b/i.exec(source)?.[1];
  if (executableTag) {
    return `Use an HTML block for <${executableTag}> content.`;
  }
  return null;
}
