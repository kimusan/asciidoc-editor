import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Asciidoctor from "@asciidoctor/core";
import hljs from "highlight.js/lib/common";
import { JSDOM } from "jsdom";
import mscgenjs from "mscgenjs";

const asciidoctor = Asciidoctor();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DOCUMENT_THEME = `
  :root {
    color-scheme: light;
    --adoc-bg: #ffffff;
    --adoc-surface: #ffffff;
    --adoc-text: #141414;
    --adoc-subtle: #4f4f4f;
    --adoc-border: rgba(20, 20, 20, 0.18);
    --adoc-link: #0f3d8a;
    --adoc-accent: #2f4f6f;
    --adoc-code-bg: #f4f4f4;
  }
`;

const PREVIEW_FONT_STACKS = {
  serif: "\"Iowan Old Style\", \"Palatino Linotype\", \"Book Antiqua\", Palatino, \"Noto Serif\", serif",
  sans: "\"Aptos\", \"Segoe UI Variable Text\", \"Inter\", \"Noto Sans\", sans-serif",
  mono: "\"IBM Plex Mono\", \"Cascadia Code\", \"SFMono-Regular\", Consolas, monospace"
};

const HIGHLIGHT_THEME_PATH = path.join(__dirname, "..", "node_modules", "highlight.js", "styles", "github.css");

const SHARED_DOCUMENT_STYLES = `
  .mscgen-block {
    margin: 1.5em 0;
  }

  .mscgen-block > .content {
    overflow-x: auto;
  }

  .mscgen-block svg {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 0 auto;
  }

  .mscgen-error pre {
    margin: 0.75rem 0 0;
  }

  .listingblock > .content {
    position: relative;
  }

  .listingblock pre.highlightjs {
    padding: 0;
  }

  .listingblock pre.highlightjs > code {
    display: block;
    padding: 1em;
    border-radius: inherit;
  }

  .listingblock code[data-lang]::before {
    display: none;
    content: attr(data-lang);
    position: absolute;
    top: 0.7rem;
    right: 0.85rem;
    font-size: 0.72rem;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(0, 0, 0, 0.45);
  }

  .listingblock:hover code[data-lang]::before {
    display: block;
  }

  p.tableblock:last-child {
    margin-bottom: 0;
  }

  td.tableblock > .content {
    margin-bottom: 1.25em;
    word-wrap: anywhere;
  }

  td.tableblock > .content > :last-child {
    margin-bottom: -1.25em;
  }

  table.tableblock, th.tableblock, td.tableblock {
    border: 0 solid rgba(23, 23, 23, 0.14);
  }

  table.grid-all > * > tr > * {
    border-width: 1px;
  }

  table.grid-cols > * > tr > * {
    border-width: 0 1px;
  }

  table.grid-rows > * > tr > * {
    border-width: 1px 0;
  }

  table.frame-all {
    border-width: 1px;
  }

  table.frame-ends {
    border-width: 1px 0;
  }

  table.frame-sides {
    border-width: 0 1px;
  }

  table.frame-none > colgroup + * > :first-child > *,
  table.frame-sides > colgroup + * > :first-child > * {
    border-top-width: 0;
  }

  table.frame-none > :last-child > :last-child > *,
  table.frame-sides > :last-child > :last-child > * {
    border-bottom-width: 0;
  }

  table.frame-none > * > tr > :first-child,
  table.frame-ends > * > tr > :first-child {
    border-left-width: 0;
  }

  table.frame-none > * > tr > :last-child,
  table.frame-ends > * > tr > :last-child {
    border-right-width: 0;
  }

  table.stripes-all > * > tr,
  table.stripes-odd > * > tr:nth-of-type(odd),
  table.stripes-even > * > tr:nth-of-type(even),
  table.stripes-hover > * > tr:hover {
    background: #f8f8f7;
  }

  th.halign-left, td.halign-left { text-align: left; }
  th.halign-right, td.halign-right { text-align: right; }
  th.halign-center, td.halign-center { text-align: center; }
  th.valign-top, td.valign-top { vertical-align: top; }
  th.valign-middle, td.valign-middle { vertical-align: middle; }
  th.valign-bottom, td.valign-bottom { vertical-align: bottom; }
`;

let cachedHighlightThemeCss;
const mscSvgCache = new Map();
let mscExtensionsRegistered = false;

const BASE_PREVIEW_STYLES = `
  :root {
    font-family: var(--adoc-font-family);
    line-height: 1.65;
    font-size: 16px;
  }

  html, body {
    margin: 0;
    min-height: 100%;
    background: #ffffff;
    color: #171717;
  }

  body {
    min-height: 100vh;
    padding: 24px 28px 48px;
  }

  main {
    max-width: 920px;
    margin: 0 auto;
    background: transparent;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    padding: 0;
  }

  a {
    color: var(--adoc-link);
  }

  h1, h2, h3, h4, h5, h6 {
    line-height: 1.2;
    letter-spacing: -0.02em;
    margin-top: 1.5em;
    margin-bottom: 0.6em;
  }

  h1 {
    font-size: 2.5rem;
    margin-top: 0;
    border-bottom: 2px solid var(--adoc-accent);
    padding-bottom: 0.4em;
  }

  pre, code {
    font-family: "IBM Plex Mono", "Cascadia Code", "SFMono-Regular", Consolas, monospace;
  }

  pre {
    background: #f4f4f4;
    border: 1px solid rgba(23, 23, 23, 0.14);
    border-radius: 8px;
    padding: 16px 18px;
    overflow-x: auto;
  }

  code {
    background: #f4f4f4;
    padding: 0.15em 0.35em;
    border-radius: 0.35em;
  }

  blockquote {
    margin: 1.4em 0;
    padding: 0.2em 0 0.2em 1.2em;
    border-left: 4px solid var(--adoc-accent);
    color: #5d5d5d;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1.5em 0;
    overflow: hidden;
    border-radius: 0;
    border: 1px solid rgba(23, 23, 23, 0.14);
  }

  th, td {
    padding: 0.75em 0.85em;
    border-bottom: 1px solid rgba(23, 23, 23, 0.14);
    text-align: left;
    vertical-align: top;
  }

  th {
    background: #f6f6f6;
  }

  img {
    max-width: 100%;
    border-radius: 0;
  }

  ${SHARED_DOCUMENT_STYLES}
`;

function buildPrintStyles(pageSize = "A4") {
  return `
    :root {
      font-family: var(--adoc-font-family);
      line-height: 1.6;
      font-size: 10.5pt;
    }

    @page {
      size: ${pageSize};
      margin: 18mm 12mm 20mm;
    }

    html, body {
      margin: 0;
      background: #ffffff;
      color: var(--adoc-text);
    }

    body {
      padding: 0;
    }

    main {
      margin: 0;
      padding: 0;
      background: transparent;
      border: 0;
      border-radius: 0;
      box-shadow: none;
      width: 100%;
      max-width: none;
    }

    a {
      color: var(--adoc-link);
      text-decoration: underline;
      overflow-wrap: anywhere;
    }

    h1, h2, h3, h4, h5, h6 {
      line-height: 1.2;
      letter-spacing: -0.01em;
      margin-top: 1.35em;
      margin-bottom: 0.55em;
      break-after: avoid-page;
    }

    h1 {
      font-size: 24pt;
      margin-top: 0;
      border-bottom: 1.5pt solid var(--adoc-accent);
      padding-bottom: 0.25em;
    }

    pre, code {
      font-family: "IBM Plex Mono", "Cascadia Code", "SFMono-Regular", Consolas, monospace;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    pre {
      background: var(--adoc-code-bg);
      border: 1px solid var(--adoc-border);
      border-radius: 8px;
      padding: 10pt 12pt;
      overflow-x: hidden;
      white-space: pre-wrap;
      break-inside: avoid-page;
    }

    code {
      background: color-mix(in srgb, var(--adoc-code-bg) 88%, #ffffff);
      padding: 0.1em 0.28em;
      border-radius: 0.25em;
    }

    blockquote {
      margin: 1.2em 0;
      padding: 0.1em 0 0.1em 1em;
      border-left: 3px solid var(--adoc-accent);
      color: var(--adoc-subtle);
    }

    table {
      width: 100%;
      max-width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      margin: 1.25em 0;
      border: 1px solid var(--adoc-border);
      break-inside: avoid-page;
    }

    th, td {
      padding: 0.55em 0.7em;
      border-bottom: 1px solid var(--adoc-border);
      text-align: left;
      vertical-align: top;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    th {
      background: color-mix(in srgb, var(--adoc-code-bg) 78%, #ffffff);
    }

    p, li, td.tableblock, p.tableblock {
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    img {
      max-width: 100%;
      border-radius: 0;
    }

    ${SHARED_DOCUMENT_STYLES}
  `;
}

function resolveBaseDir(filePath, baseDir = null) {
  if (baseDir) {
    return baseDir;
  }

  if (!filePath) {
    return process.cwd();
  }

  return path.dirname(filePath);
}

function buildAttributes(stylesheetPath) {
  const attributes = {
    "source-highlighter": "highlight.js",
    "icons": "font"
  };

  if (stylesheetPath) {
    attributes.stylesheet = stylesheetPath;
    attributes.linkcss = true;
  }

  return attributes;
}

function getMscCacheKey(source, options = {}) {
  return crypto.createHash("sha256")
    .update(JSON.stringify({
      source,
      inputType: options.inputType ?? "mscgen"
    }))
    .digest("hex");
}

function renderMscSvg(source, options = {}) {
  const cacheKey = getMscCacheKey(source, options);
  if (mscSvgCache.has(cacheKey)) {
    return mscSvgCache.get(cacheKey);
  }

  const dom = new JSDOM("<div id=\"mscgen-root\"></div>");
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;

  try {
    let renderedSvg;
    let renderError;

    mscgenjs.renderMsc(
      source,
      {
        elementId: "mscgen-root",
        inputType: options.inputType ?? "mscgen",
        includeSource: false
      },
      (error, svg) => {
        renderError = error;
        renderedSvg = typeof svg === "string"
          ? svg
          : dom.window.document.getElementById("mscgen-root")?.innerHTML ?? "";
      }
    );

    if (renderError) {
      throw renderError instanceof Error ? renderError : new Error(String(renderError));
    }

    if (!renderedSvg) {
      throw new Error("mscgen.js did not produce SVG output");
    }

    mscSvgCache.set(cacheKey, renderedSvg);
    return renderedSvg;
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }

    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }

    dom.window.close();
  }
}

function buildMscHtml(source, options = {}) {
  const svg = renderMscSvg(source, options);
  return `<div class="imageblock mscgen-block" data-msc-input="${escapeHtml(options.inputType ?? "mscgen")}"><div class="content">${svg}</div></div>`;
}

function ensureMscExtensionsRegistered() {
  if (mscExtensionsRegistered) {
    return;
  }

  const registerMscBlock = (registry, name, inputType) => {
    registry.block(function () {
      const self = this;
      self.named(name);
      self.onContext("listing");
      self.process(function (parent, reader) {
        const source = reader.getLines().join("\n").trim();
        if (!source) {
          return self.createBlock(parent, "pass", "");
        }

        try {
          return self.createBlock(parent, "pass", buildMscHtml(source, { inputType }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return self.createBlock(
            parent,
            "pass",
            `<div class="admonitionblock warning mscgen-error"><table><tbody><tr><td class="icon"><div class="title">!</div></td><td class="content"><div class="title">MSC render failed</div><pre>${escapeHtml(message)}</pre></td></tr></tbody></table></div>`
          );
        }
      });
    });
  };

  asciidoctor.Extensions.register(function () {
    registerMscBlock(this, "msc", "mscgen");
    registerMscBlock(this, "mscgen", "mscgen");
  });
  mscExtensionsRegistered = true;
}

function buildLoadOptions(filePath, options = {}) {
  ensureMscExtensionsRegistered();
  return {
    safe: "unsafe",
    base_dir: resolveBaseDir(filePath, options.baseDir),
    standalone: options.standalone ?? true,
    backend: options.backend ?? "html5",
    attributes: buildAttributes(options.stylesheetPath)
  };
}

function extractBodyContents(html) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return bodyMatch ? bodyMatch[1].trim() : html;
}

function decodeHtmlEntities(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

function highlightCodeBlocks(html) {
  return html.replace(
    /<code([^>]*)data-lang="([^"]+)"([^>]*)>([\s\S]*?)<\/code>/g,
    (_, beforeAttrs, language, afterAttrs, code) => {
      const source = decodeHtmlEntities(code);

      let highlighted;
      try {
        highlighted = hljs.highlight(source, { language }).value;
      } catch {
        highlighted = hljs.highlightAuto(source).value;
      }

      return `<code${beforeAttrs}data-lang="${language}"${afterAttrs}>${highlighted}</code>`;
    }
  );
}

async function loadHighlightThemeCss() {
  if (cachedHighlightThemeCss !== undefined) {
    return cachedHighlightThemeCss;
  }

  try {
    cachedHighlightThemeCss = await fs.readFile(HIGHLIGHT_THEME_PATH, "utf8");
  } catch {
    cachedHighlightThemeCss = "";
  }

  return cachedHighlightThemeCss;
}

function loadDocument(source, filePath, options = {}) {
  return asciidoctor.load(source, buildLoadOptions(filePath, options));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function resolveDocumentTitle(document, filePath) {
  const title = document.getDocumentTitle?.() ?? document.getDoctitle?.();
  if (title) {
    return title;
  }

  if (filePath) {
    return path.parse(filePath).name;
  }

  return "AsciiDoc Document";
}

function getNodeLineNumber(node) {
  const sourceLocation = node.getSourceLocation?.();
  if (!sourceLocation) {
    return null;
  }

  if (typeof sourceLocation.getLineNumber === "function") {
    return sourceLocation.getLineNumber();
  }

  return sourceLocation.lineno ?? null;
}

function extractSyncPoints(document) {
  const supportedContexts = new Set([
    "document",
    "section",
    "paragraph",
    "listing",
    "literal",
    "ulist",
    "olist",
    "dlist",
    "image",
    "table",
    "admonition",
    "quote",
    "verse",
    "sidebar",
    "example",
    "open",
    "stem"
  ]);

  const nodes = [
    document,
    ...(document.findBy?.(() => true) ?? [])
  ];

  return nodes
    .map((node) => {
      const context = node === document ? "document" : node.getContext?.();
      const lineNumber = getNodeLineNumber(node);
      if (!context || !lineNumber || !supportedContexts.has(context)) {
        return null;
      }

      return {
        context,
        lineNumber
      };
    })
    .filter(Boolean);
}

function renderDocument(source, filePath, options = {}) {
  const loadOptions = buildLoadOptions(filePath, options);
  const document = asciidoctor.load(source, loadOptions);
  return {
    title: resolveDocumentTitle(document, filePath),
    content: asciidoctor.convert(source, loadOptions),
    syncPoints: extractSyncPoints(document)
  };
}

function buildPreviewHtml({ title, styles, body }) {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(title)}</title>
      <style>${styles}</style>
    </head>
    <body>
      <main>
        ${body}
      </main>
    </body>
  </html>`;
}

export function convertDocument(source, filePath, options = {}) {
  return renderDocument(source, filePath, options).content;
}

export async function renderPreviewDocument(source, filePath, options = {}) {
  const { title, content, syncPoints } = renderDocument(source, filePath, {
    standalone: true,
    stylesheetPath: options.stylesheetPath
  });
  const rendered = highlightCodeBlocks(extractBodyContents(content));

  let customStyles = "";
  if (options.stylesheetPath) {
    try {
      customStyles = await fs.readFile(options.stylesheetPath, "utf8");
    } catch {
      customStyles = "";
    }
  }

  const highlightThemeCss = await loadHighlightThemeCss();
  const documentMode = options.documentMode ?? "preview";
  const previewFontFamily = PREVIEW_FONT_STACKS[options.previewFontFamily] ?? PREVIEW_FONT_STACKS.serif;
  const baseStyles = documentMode === "print"
    ? buildPrintStyles(options.pdfPaperSize ?? "A4")
    : BASE_PREVIEW_STYLES;

  return {
    title,
    styles: `:root { --adoc-font-family: ${previewFontFamily}; }${DOCUMENT_THEME}${baseStyles}${highlightThemeCss}${customStyles}`,
    body: rendered,
    syncPoints
  };
}

export async function renderPreview(source, filePath, options = {}) {
  const previewDocument = await renderPreviewDocument(source, filePath, options);
  return buildPreviewHtml(previewDocument);
}

export async function exportDocument({
  source,
  filePath,
  baseDir,
  destinationPath,
  format,
  stylesheetPath,
  previewFontFamily,
  pdfPaperSize
}) {
  if (format === "html") {
    const html = await renderPreview(source, filePath, {
      baseDir,
      stylesheetPath,
      previewFontFamily
    });
    await fs.writeFile(destinationPath, html, "utf8");
    return destinationPath;
  }

  if (format === "docbook") {
    const docbook = convertDocument(source, filePath, {
      baseDir,
      backend: "docbook5",
      standalone: true
    });
    await fs.writeFile(destinationPath, docbook, "utf8");
    return destinationPath;
  }

  if (format === "pdf") {
    const { BrowserWindow } = await import("electron");
    const html = await renderPreview(source, filePath, {
      baseDir,
      stylesheetPath,
      previewFontFamily,
      pdfPaperSize,
      documentMode: "print"
    });
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true
      }
    });

    try {
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const pdfBuffer = await printWindow.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        pageSize: pdfPaperSize ?? "A4"
      });
      await fs.writeFile(destinationPath, pdfBuffer);
      return destinationPath;
    } finally {
      printWindow.destroy();
    }
  }

  throw new Error(`Unsupported export format: ${format}`);
}
