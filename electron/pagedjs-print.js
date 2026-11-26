// Paginated PDF export: Paged.js chunks the print HTML into real pages
// (page numbers, running headers) inside a hidden OFFSCREEN BrowserWindow,
// then the page boxes are printed with printToPDF.
//
// The window must be offscreen: a merely hidden window throttles
// requestAnimationFrame to ~5fps, and Paged.js drives its layout queue on
// rAF — a 14-page document that paginates in under a second offscreen took
// 9+ seconds (and large documents effectively hang) without it. Offscreen
// rendering runs its own frame clock (setFrameRate), unaffected by
// visibility.

import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POLYFILL_PATH = path.join(__dirname, "vendor", "paged.polyfill.min.js");
const PAGINATION_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 100;

// Pure: injects the Paged.js runtime configuration and script tag into a
// finished print document. The polyfill defers until readyState
// "interactive", so head placement is safe. `done` on the window is the
// completion signal the main process polls for.
export function injectPagedPrintRuntime(html, scriptUrl) {
  const bootstrap = `<script>
window.PagedConfig = {
  auto: true,
  after: function (flow) {
    window.__pagedDone = { total: flow.total, pages: flow.pages.length };
  }
};
</script>
<script src="${scriptUrl}"></script>`;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${bootstrap}</head>`);
  }
  return `${bootstrap}${html}`;
}

async function waitForPagination(webContents) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < PAGINATION_TIMEOUT_MS) {
    const done = await webContents
      .executeJavaScript("window.__pagedDone || null", false)
      .catch(() => null);
    if (done && typeof done.total === "number" && done.total > 0) {
      return done;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error("Paged.js pagination timed out");
}

// Renders `html` (a complete print document) to a PDF buffer with real
// pagination. The HTML is written to a temporary file inside `baseDir` so
// relative image and asset paths resolve exactly as they do in preview;
// falls back to the OS temp directory when no base directory is known.
// Any failure rejects so the caller can fall back to plain printing.
export async function renderPaginatedPdf({ html, pdfPaperSize = "A4", baseDir = null }) {
  const { BrowserWindow } = await import("electron");

  const tempDir = baseDir && path.isAbsolute(baseDir) ? baseDir : os.tmpdir();
  const tempPath = path.join(tempDir, `.asciidoc-editor-print-${randomUUID()}.html`);
  const polyfillUrl = pathToFileURL(POLYFILL_PATH).href;

  await fs.writeFile(tempPath, injectPagedPrintRuntime(html, polyfillUrl), "utf8");

  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      // Offscreen + no throttling keeps Paged.js's rAF-driven layout queue
      // running at full speed (see module comment).
      offscreen: true,
      backgroundThrottling: false
    }
  });

  try {
    window.webContents.setFrameRate(60);
    await window.loadFile(tempPath);
    await waitForPagination(window.webContents);

    // The page boxes already carry the @page margins, so the print margins
    // must be zero; the paper size matches the CSS @page size.
    return await window.webContents.printToPDF({
      printBackground: true,
      pageSize: pdfPaperSize,
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });
  } finally {
    window.destroy();
    await fs.unlink(tempPath).catch(() => {});
  }
}
