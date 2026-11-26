import path from "node:path";
import fs from "node:fs/promises";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";

// The CPU-heavy parts of the pipeline (Asciidoctor parse/convert, mscgen SVG
// rendering, highlight.js) live in electron/asciidoc-worker.cjs and run on a
// worker thread so large documents cannot stall the main process event loop.
// This module keeps the file IO, style composition and the PDF printing path
// (which needs BrowserWindow and therefore must stay on the main thread).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, "asciidoc-worker.cjs");
const WORKER_IDLE_REAP_MS = 120_000;

const DOCUMENT_THEMES = {
  light: `
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
`,
  dark: `
  :root {
    color-scheme: dark;
    --adoc-bg: #14181f;
    --adoc-surface: #1a2029;
    --adoc-text: #e6edf3;
    --adoc-subtle: #9aa7b5;
    --adoc-border: rgba(230, 237, 243, 0.16);
    --adoc-link: #7dd3fc;
    --adoc-accent: #27d1c1;
    --adoc-code-bg: #21262f;
  }
`
};

const PREVIEW_FONT_STACKS = {
  serif: "\"Iowan Old Style\", \"Palatino Linotype\", \"Book Antiqua\", Palatino, \"Noto Serif\", serif",
  sans: "\"Aptos\", \"Segoe UI Variable Text\", \"Inter\", \"Noto Sans\", sans-serif",
  mono: "\"IBM Plex Mono\", \"Cascadia Code\", \"SFMono-Regular\", Consolas, monospace"
};

const HIGHLIGHT_THEME_PATHS = {
  light: path.join(__dirname, "..", "node_modules", "highlight.js", "styles", "github.css"),
  dark: path.join(__dirname, "..", "node_modules", "highlight.js", "styles", "github-dark.css")
};

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
    color: var(--adoc-subtle);
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
    border: 0 solid var(--adoc-border);
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
    background: color-mix(in srgb, var(--adoc-code-bg) 55%, transparent);
  }

  th.halign-left, td.halign-left { text-align: left; }
  th.halign-right, td.halign-right { text-align: right; }
  th.halign-center, td.halign-center { text-align: center; }
  th.valign-top, td.valign-top { vertical-align: top; }
  th.valign-middle, td.valign-middle { vertical-align: middle; }
  th.valign-bottom, td.valign-bottom { vertical-align: bottom; }

  dl {
    margin: 1.4em 0;
  }

  dl > dt {
    font-weight: 600;
    margin-top: 0.8em;
  }

  dl > dt:first-child,
  dl > dt + dt {
    margin-top: 0;
  }

  dl > dd {
    margin: 0.15em 0 0 1.4em;
  }

  dl > dd > p:first-child {
    margin-top: 0;
  }

  dl > dd > p:last-child {
    margin-bottom: 0;
  }
`;

const BASE_PREVIEW_STYLES = `
  :root {
    font-family: var(--adoc-font-family);
    line-height: 1.65;
    font-size: 16px;
  }

  html, body {
    margin: 0;
    min-height: 100%;
    background: var(--adoc-bg);
    color: var(--adoc-text);
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
    background: var(--adoc-code-bg);
    border: 1px solid var(--adoc-border);
    border-radius: 8px;
    padding: 16px 18px;
    overflow-x: auto;
  }

  code {
    background: var(--adoc-code-bg);
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
    border-radius: 0;
    border: 1px solid var(--adoc-border);
  }

  th, td {
    padding: 0.75em 0.85em;
    border-bottom: 1px solid var(--adoc-border);
    text-align: left;
    vertical-align: top;
  }

  th {
    background: var(--adoc-surface);
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

const cachedHighlightThemeCss = {};

async function loadHighlightThemeCss(scheme = "light") {
  if (cachedHighlightThemeCss[scheme] !== undefined) {
    return cachedHighlightThemeCss[scheme];
  }

  try {
    cachedHighlightThemeCss[scheme] = await fs.readFile(
      HIGHLIGHT_THEME_PATHS[scheme] ?? HIGHLIGHT_THEME_PATHS.light,
      "utf8"
    );
  } catch {
    // Do not cache the failure; retry on a later render instead of
    // silently losing highlight colors for the whole process.
    return "";
  }

  return cachedHighlightThemeCss[scheme];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

let renderWorker = null;
let nextJobId = 1;
const pendingJobs = new Map();
let workerReapTimer = null;

// A pathological document (or an Asciidoctor bug) can leave a render job
// hung with its IPC promise never settling. Without a timeout the worker
// stays wedged forever - the reaper refuses to run while jobs are pending -
// so one bad document would kill the preview until the app restarts. Time
// the job out, terminate the worker, and let the next render respawn it.
// The env override exists so tests can exercise the path in milliseconds.
function renderJobTimeoutMs() {
  const parsed = Number.parseInt(process.env.ASCIIDOC_RENDER_JOB_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 25_000;
}

function clearJobTimer(job) {
  if (job.timer) {
    clearTimeout(job.timer);
    job.timer = null;
  }
}

// Reject every pending job owned by `worker` (or all jobs when worker is
// null). Filtering matters: a terminated worker's exit event can land
// AFTER a fresh worker already took over the pendingJobs map, and the
// dead worker must not reject the new worker's in-flight jobs.
function failPendingJobs(error, worker = null) {
  for (const [id, job] of pendingJobs) {
    if (worker && job.worker !== worker) {
      continue;
    }

    pendingJobs.delete(id);
    clearJobTimer(job);
    job.reject(error);
  }
}

function getRenderWorker() {
  if (renderWorker) {
    return renderWorker;
  }

  const worker = new Worker(WORKER_PATH);
  // The worker must never keep the app process alive on its own.
  worker.unref();
  renderWorker = worker;

  worker.on("message", ({ id, result, error }) => {
    const job = pendingJobs.get(id);
    if (!job) {
      return;
    }

    pendingJobs.delete(id);
    clearJobTimer(job);
    if (error) {
      job.reject(new Error(error.message));
    } else {
      job.resolve(result);
    }
    scheduleWorkerReap();
  });

  worker.on("error", (error) => {
    if (renderWorker === worker) {
      renderWorker = null;
    }
    failPendingJobs(error instanceof Error ? error : new Error(String(error)), worker);
  });

  worker.on("exit", () => {
    if (renderWorker === worker) {
      renderWorker = null;
    }
    failPendingJobs(new Error("AsciiDoc render worker exited unexpectedly"), worker);
  });

  return worker;
}

function scheduleWorkerReap() {
  clearTimeout(workerReapTimer);
  if (pendingJobs.size > 0) {
    return;
  }

  workerReapTimer = setTimeout(() => {
    if (renderWorker && pendingJobs.size === 0) {
      const worker = renderWorker;
      renderWorker = null;
      void worker.terminate();
    }
  }, WORKER_IDLE_REAP_MS);
  workerReapTimer.unref?.();
}

function runRenderJob(op, ...args) {
  const worker = getRenderWorker();
  const id = nextJobId++;

  return new Promise((resolve, reject) => {
    const job = { resolve, reject, timer: null, worker };
    pendingJobs.set(id, job);

    job.timer = setTimeout(() => {
      if (pendingJobs.get(id) !== job) {
        return;
      }

      // Every other in-flight job on this worker is hung too: fail them
      // all, drop the worker reference, and terminate it. The exit
      // handler is a no-op backstop (failPendingJobs already ran).
      pendingJobs.delete(id);
      const stalledWorker = renderWorker;
      renderWorker = null;
      const timeoutMs = renderJobTimeoutMs();
      failPendingJobs(new Error("AsciiDoc render worker timed out"), stalledWorker);
      void stalledWorker?.terminate().catch(() => {});
      reject(new Error(`AsciiDoc render job "${op}" timed out after ${timeoutMs / 1000}s`));
    }, renderJobTimeoutMs());
    // Never let a timeout timer hold the process open on its own.
    job.timer.unref?.();

    worker.postMessage({ id, op, args });
  });
}

// Test-only backdoor for the job-timeout path: posts an arbitrary
// operation to the live worker. The worker only hangs on ops that never
// reply, which the ASCIIDOC_TEST_HANG guard in the worker provides.
export async function runRenderJobForTests(op, ...args) {
  return runRenderJob(op, ...args);
}

// Test/shutdown hook: an unref()ed worker still leaves a live MessagePort
// that can hold a host process open under node --test, so tests terminate
// the worker explicitly once they are done with the pipeline.
export async function disposeRenderWorker() {
  clearTimeout(workerReapTimer);
  const worker = renderWorker;
  renderWorker = null;
  if (worker) {
    await worker.terminate();
  }
}

export async function convertDocument(source, filePath, options = {}) {
  const { content } = await runRenderJob("renderDocument", source, filePath, options);
  return content;
}

export async function renderPreviewDocument(source, filePath, options = {}) {
  const { title, body, diagnostics } = await runRenderJob(
    "renderPreviewBody",
    source,
    filePath,
    {
      baseDir: options.baseDir,
      backend: "html5",
      standalone: true
    }
  );

  let customStyles = "";
  if (options.stylesheetPath) {
    try {
      customStyles = await fs.readFile(options.stylesheetPath, "utf8");
    } catch {
      customStyles = "";
    }
  }

  const documentMode = options.documentMode ?? "preview";
  // Printed/PDF output always stays light; only the live preview follows
  // the app theme.
  const colorScheme = documentMode === "print"
    ? "light"
    : (options.previewColorScheme === "dark" ? "dark" : "light");
  const highlightThemeCss = await loadHighlightThemeCss(colorScheme);
  const previewFontFamily = PREVIEW_FONT_STACKS[options.previewFontFamily] ?? PREVIEW_FONT_STACKS.serif;
  const baseStyles = documentMode === "print"
    ? buildPrintStyles(options.pdfPaperSize ?? "A4")
    : BASE_PREVIEW_STYLES;

  return {
    title,
    styles: `:root { --adoc-font-family: ${previewFontFamily}; }${DOCUMENT_THEMES[colorScheme]}${baseStyles}${highlightThemeCss}${customStyles}`,
    body,
    diagnostics: Array.isArray(diagnostics) ? diagnostics : []
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
    const docbook = await convertDocument(source, filePath, {
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
