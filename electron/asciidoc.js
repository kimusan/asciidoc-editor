import path from "node:path";
import fs from "node:fs/promises";
import Asciidoctor from "asciidoctor";

const asciidoctor = Asciidoctor();

const BUILTIN_PREVIEW_THEMES = {
  paper: `
    :root {
      color-scheme: light;
      --adoc-bg: #f7f4ec;
      --adoc-surface: #fffdf8;
      --adoc-text: #1d1b18;
      --adoc-subtle: #645c52;
      --adoc-border: rgba(45, 35, 24, 0.14);
      --adoc-link: #7f3f00;
      --adoc-accent: #dcb35c;
      --adoc-code-bg: #f0eadc;
    }
  `,
  slate: `
    :root {
      color-scheme: dark;
      --adoc-bg: #161a1f;
      --adoc-surface: #1d232b;
      --adoc-text: #e7e4dc;
      --adoc-subtle: #a5a098;
      --adoc-border: rgba(255, 255, 255, 0.11);
      --adoc-link: #f8bf5d;
      --adoc-accent: #78b7ff;
      --adoc-code-bg: #0f1318;
    }
  `,
  nord: `
    :root {
      color-scheme: dark;
      --adoc-bg: #262c37;
      --adoc-surface: #2f3744;
      --adoc-text: #e5edf6;
      --adoc-subtle: #b6c2d1;
      --adoc-border: rgba(216, 222, 233, 0.12);
      --adoc-link: #88c0d0;
      --adoc-accent: #81a1c1;
      --adoc-code-bg: #232933;
    }
  `,
  darcula: `
    :root {
      color-scheme: dark;
      --adoc-bg: #232427;
      --adoc-surface: #2b2d30;
      --adoc-text: #f0f0f0;
      --adoc-subtle: #b9b9b9;
      --adoc-border: rgba(255, 255, 255, 0.12);
      --adoc-link: #6897bb;
      --adoc-accent: #ffc66d;
      --adoc-code-bg: #1f2022;
    }
  `,
  solarized: `
    :root {
      color-scheme: light;
      --adoc-bg: #fdf6e3;
      --adoc-surface: #fffaf0;
      --adoc-text: #47565d;
      --adoc-subtle: #6c7a80;
      --adoc-border: rgba(88, 110, 117, 0.14);
      --adoc-link: #268bd2;
      --adoc-accent: #2aa198;
      --adoc-code-bg: #f4ecd8;
    }
  `
};

const PREVIEW_FONT_STACKS = {
  serif: "\"Iowan Old Style\", \"Palatino Linotype\", \"Book Antiqua\", Palatino, \"Noto Serif\", serif",
  sans: "\"Aptos\", \"Segoe UI Variable Text\", \"Inter\", \"Noto Sans\", sans-serif",
  mono: "\"IBM Plex Mono\", \"Cascadia Code\", \"SFMono-Regular\", Consolas, monospace"
};

const BASE_PREVIEW_STYLES = `
  :root {
    font-family: var(--adoc-font-family);
    line-height: 1.65;
    font-size: 16px;
  }

  html, body {
    margin: 0;
    min-height: 100%;
    background-color: var(--adoc-bg);
    background-image: linear-gradient(180deg, var(--adoc-bg) 0%, color-mix(in srgb, var(--adoc-bg) 72%, #000 8%) 100%);
    background-repeat: no-repeat;
    background-size: 100% 100%;
    color: var(--adoc-text);
  }

  body {
    min-height: 100vh;
    padding: 32px;
  }

  main {
    max-width: 920px;
    margin: 0 auto;
    background: var(--adoc-surface);
    border: 1px solid var(--adoc-border);
    border-radius: 24px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.18);
    padding: 40px 48px 64px;
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
    background: var(--adoc-code-bg);
    border: 1px solid var(--adoc-border);
    border-radius: 16px;
    padding: 16px 18px;
    overflow-x: auto;
  }

  code {
    background: color-mix(in srgb, var(--adoc-code-bg) 88%, var(--adoc-surface));
    padding: 0.15em 0.35em;
    border-radius: 0.35em;
  }

  blockquote {
    margin: 1.4em 0;
    padding: 0.2em 0 0.2em 1.2em;
    border-left: 4px solid var(--adoc-accent);
    color: var(--adoc-subtle);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1.5em 0;
    overflow: hidden;
    border-radius: 14px;
    border: 1px solid var(--adoc-border);
  }

  th, td {
    padding: 0.75em 0.85em;
    border-bottom: 1px solid var(--adoc-border);
    text-align: left;
    vertical-align: top;
  }

  th {
    background: color-mix(in srgb, var(--adoc-code-bg) 84%, var(--adoc-surface));
  }

  img {
    max-width: 100%;
    border-radius: 18px;
  }
`;

function resolveBaseDir(filePath) {
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

function buildLoadOptions(filePath, options = {}) {
  return {
    safe: "unsafe",
    base_dir: resolveBaseDir(filePath),
    standalone: options.standalone ?? true,
    backend: options.backend ?? "html5",
    attributes: buildAttributes(options.stylesheetPath)
  };
}

function extractBodyContents(html) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return bodyMatch ? bodyMatch[1].trim() : html;
}

function loadDocument(source, filePath, options = {}) {
  return asciidoctor.load(source, buildLoadOptions(filePath, options));
}

export function convertDocument(source, filePath, options = {}) {
  const document = loadDocument(source, filePath, options);
  return document.convert();
}

export async function renderPreview(source, filePath, options = {}) {
  const rendered = extractBodyContents(convertDocument(source, filePath, {
    standalone: true,
    stylesheetPath: options.stylesheetPath
  }));

  let customStyles = "";
  if (options.stylesheetPath) {
    try {
      customStyles = await fs.readFile(options.stylesheetPath, "utf8");
    } catch {
      customStyles = "";
    }
  }

  const previewTheme = BUILTIN_PREVIEW_THEMES[options.previewTheme] ?? BUILTIN_PREVIEW_THEMES.paper;
  const previewFontFamily = PREVIEW_FONT_STACKS[options.previewFontFamily] ?? PREVIEW_FONT_STACKS.serif;

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>:root { --adoc-font-family: ${previewFontFamily}; }${previewTheme}${BASE_PREVIEW_STYLES}${customStyles}</style>
    </head>
    <body>
      <main>
        ${rendered}
      </main>
    </body>
  </html>`;
}

export async function exportDocument({
  source,
  filePath,
  destinationPath,
  format,
  stylesheetPath,
  previewTheme,
  previewFontFamily
}) {
  if (format === "html") {
    const html = await renderPreview(source, filePath, {
      stylesheetPath,
      previewTheme,
      previewFontFamily
    });
    await fs.writeFile(destinationPath, html, "utf8");
    return destinationPath;
  }

  if (format === "docbook") {
    const docbook = convertDocument(source, filePath, {
      backend: "docbook5",
      standalone: true
    });
    await fs.writeFile(destinationPath, docbook, "utf8");
    return destinationPath;
  }

  if (format === "pdf") {
    const { BrowserWindow } = await import("electron");
    const html = await renderPreview(source, filePath, {
      stylesheetPath,
      previewTheme,
      previewFontFamily
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
        preferCSSPageSize: true
      });
      await fs.writeFile(destinationPath, pdfBuffer);
      return destinationPath;
    } finally {
      printWindow.destroy();
    }
  }

  throw new Error(`Unsupported export format: ${format}`);
}
