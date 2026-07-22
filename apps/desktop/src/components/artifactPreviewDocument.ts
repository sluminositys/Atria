export interface ArtifactPreviewResourceResolver {
  readText(relativePath: string): Promise<string>;
  toUrl(relativePath: string): string;
}

export interface ArtifactPreviewDocument {
  html: string;
  warnings: string[];
}

const urlAttributes = ["src", "href", "poster", "data", "action"] as const;

export async function buildArtifactPreviewDocument(
  source: string,
  documentPath: string,
  resolver: ArtifactPreviewResourceResolver,
): Promise<ArtifactPreviewDocument> {
  const parsed = new DOMParser().parseFromString(source, "text/html");
  const warnings: string[] = [];

  for (const link of Array.from(parsed.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]'))) {
    const reference = resolveWorkspaceReference(documentPath, link.getAttribute("href") ?? "");
    if (!reference) continue;
    try {
      const css = await resolver.readText(reference.path);
      const style = parsed.createElement("style");
      if (link.media) style.media = link.media;
      style.textContent = rewriteCssResourceUrls(css, reference.path, resolver.toUrl);
      link.replaceWith(style);
    } catch {
      warnings.push(`Could not load local stylesheet ${workspaceFileName(reference.path)}.`);
      link.remove();
    }
  }

  for (const style of Array.from(parsed.querySelectorAll<HTMLStyleElement>("style"))) {
    style.textContent = rewriteCssResourceUrls(style.textContent ?? "", documentPath, resolver.toUrl);
  }
  for (const element of Array.from(parsed.querySelectorAll<HTMLElement>("[style]"))) {
    element.setAttribute(
      "style",
      rewriteCssResourceUrls(element.getAttribute("style") ?? "", documentPath, resolver.toUrl),
    );
  }

  for (const element of Array.from(parsed.querySelectorAll<HTMLElement>("*"))) {
    for (const attribute of urlAttributes) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      const reference = resolveWorkspaceReference(documentPath, value);
      if (!reference) continue;
      element.setAttribute(attribute, `${resolver.toUrl(reference.path)}${reference.suffix}`);
    }
    const srcset = element.getAttribute("srcset");
    if (srcset && !srcset.includes("data:")) {
      element.setAttribute("srcset", rewriteSrcset(srcset, documentPath, resolver.toUrl));
    }
  }

  const doctype = parsed.doctype?.name ? `<!doctype ${parsed.doctype.name}>\n` : "<!doctype html>\n";
  return { html: `${doctype}${parsed.documentElement.outerHTML}`, warnings };
}

export function resolveWorkspaceReference(
  ownerPath: string,
  reference: string,
): { path: string; suffix: string } | undefined {
  const value = reference.trim();
  if (!value || value.startsWith("#") || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return undefined;
  const suffixIndex = value.search(/[?#]/);
  const pathPart = (suffixIndex >= 0 ? value.slice(0, suffixIndex) : value).replace(/\\/g, "/");
  const suffix = suffixIndex >= 0 ? value.slice(suffixIndex) : "";
  if (!pathPart) return { path: ownerPath.replace(/\\/g, "/"), suffix };

  const segments = pathPart.startsWith("/")
    ? []
    : ownerPath.replace(/\\/g, "/").split("/").slice(0, -1).filter(Boolean);
  for (const segment of pathPart.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!segments.length) return undefined;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.length ? { path: segments.join("/"), suffix } : undefined;
}

export function rewriteCssResourceUrls(
  css: string,
  ownerPath: string,
  toUrl: (relativePath: string) => string,
): string {
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (match, quote: string, value: string) => {
    const reference = resolveWorkspaceReference(ownerPath, value);
    if (!reference) return match;
    const next = `${toUrl(reference.path)}${reference.suffix}`;
    return `url(${quote}${next}${quote})`;
  });
}

function rewriteSrcset(
  srcset: string,
  ownerPath: string,
  toUrl: (relativePath: string) => string,
): string {
  return srcset.split(",").map((candidate) => {
    const match = candidate.trim().match(/^(\S+)(\s+.*)?$/);
    if (!match) return candidate.trim();
    const reference = resolveWorkspaceReference(ownerPath, match[1] ?? "");
    if (!reference) return candidate.trim();
    return `${toUrl(reference.path)}${reference.suffix}${match[2] ?? ""}`;
  }).join(", ");
}

function workspaceFileName(relativePath: string): string {
  return relativePath.split("/").at(-1) ?? relativePath;
}
