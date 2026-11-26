// Pure Mermaid substitution helpers, shared by the main-process renderer
// (electron/mermaid-renderer.js) and unit tests. No Electron or node
// imports: the caller supplies the render function.
//
// The AsciiDoc worker emits placeholder divs for [mermaid] blocks:
//   <div class="imageblock mermaid-block" data-mermaid-source="<uri-encoded>"></div>
// After the worker render, the main process replaces each placeholder's
// content with the rendered SVG (or an error admonition) while preserving
// the opening tag verbatim — scroll-sync roles and data attributes ride on
// that tag and must survive.

const MERMAID_PLACEHOLDER_PATTERN = /<div class="imageblock mermaid-block"([^>]*)><\/div>/g;
const MERMAID_SOURCE_ATTRIBUTE_PATTERN = /data-mermaid-source="([^"]*)"/;

export function mermaidThemeForColorScheme(colorScheme) {
  return colorScheme === "dark" ? "dark" : "default";
}

// Unique encoded diagram sources in document order. The values stay
// URI-encoded exactly as they appear in the placeholder attribute; the
// renderer decodes them.
export function extractMermaidSources(html) {
  const sources = [];
  const seen = new Set();
  for (const match of html.matchAll(MERMAID_PLACEHOLDER_PATTERN)) {
    const source = MERMAID_SOURCE_ATTRIBUTE_PATTERN.exec(match[1])?.[1] ?? null;
    if (source === null || seen.has(source)) {
      continue;
    }
    seen.add(source);
    sources.push(source);
  }
  return sources;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function buildMermaidErrorHtml(message) {
  return `<div class="admonitionblock warning mermaid-error"><table><tbody><tr><td class="icon"><div class="title">!</div></td><td class="content"><div class="title">Mermaid render failed</div><pre>${escapeHtml(message)}</pre></td></tr></tbody></table></div>`;
}

// Replaces every placeholder using the results map (encoded source ->
// { svg } | { error }). Placeholders without a result are left untouched
// so a partial failure never strips a diagram from the document.
export function applyMermaidDiagrams(html, results) {
  return html.replace(MERMAID_PLACEHOLDER_PATTERN, (fullMatch, attributes) => {
    const source = MERMAID_SOURCE_ATTRIBUTE_PATTERN.exec(attributes)?.[1] ?? null;
    const result = source === null ? undefined : results.get(source);
    if (!result) {
      return fullMatch;
    }

    const inner = result.error
      ? buildMermaidErrorHtml(result.error)
      : `<div class="content">${result.svg}</div>`;
    return `<div class="imageblock mermaid-block"${attributes}>${inner}</div>`;
  });
}
