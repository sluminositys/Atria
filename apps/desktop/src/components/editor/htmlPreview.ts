export const defaultHtmlSource = [
  '<main style="box-sizing:border-box;padding:24px;font:14px/1.6 system-ui,sans-serif;color:#252525">',
  "  <h2 style=\"margin:0 0 8px\">Untitled</h2>",
  "  <p style=\"margin:0;color:#666\"></p>",
  "</main>",
].join("\n");

const previewHead = [
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: blob: http://asset.localhost https://asset.localhost; media-src data: blob: http://asset.localhost https://asset.localhost; style-src \'unsafe-inline\'; script-src \'unsafe-inline\' \'unsafe-eval\' blob:; font-src data:; connect-src \'none\'; form-action \'none\'; base-uri \'none\'">',
  "<style>html{color-scheme:light;background:#fff}body{margin:0;overflow-wrap:anywhere}</style>",
].join("");

export function buildHtmlPreviewDocument(source: string): string {
  const content = source.trim() || defaultHtmlSource;
  if (/<html(?:\s|>)/i.test(content)) {
    if (/<head(?:\s|>)/i.test(content)) {
      return content.replace(/<head([^>]*)>/i, (match) => `${match}${previewHead}`);
    }
    return content.replace(/<html([^>]*)>/i, (match) => `${match}<head>${previewHead}</head>`);
  }
  return `<!doctype html><html><head>${previewHead}</head><body>${content}</body></html>`;
}
