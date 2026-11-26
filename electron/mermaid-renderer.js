// Mermaid diagram renderer: a hidden, sandboxed BrowserWindow that loads
// the vendored shim page (electron/vendor/mermaid-render.html) and renders
// diagram sources to SVG strings.
//
// Mermaid needs a real DOM with text measurement (getBBox/getComputedStyle)
// for layout, which neither the worker's linkedom nor any pure-JS DOM can
// provide — hence the hidden window on the main process. The window is
// created lazily on the first diagram and destroyed after an idle period:
// a window kept alive forever would keep window-all-closed from firing,
// stranding the app process after the user closes the last editor window.

import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  extractMermaidSources,
  applyMermaidDiagrams,
  mermaidThemeForColorScheme
} from "./mermaid-html.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHIM_PAGE_PATH = path.join(__dirname, "vendor", "mermaid-render.html");
const WINDOW_IDLE_DESTROY_MS = 90_000;
const RENDER_TIMEOUT_MS = 10_000;

let renderWindow = null;
let renderWindowReady = null;
let idleTimer = null;
const svgCache = new Map();

function scheduleIdleDestroy() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (renderWindow && !renderWindow.isDestroyed()) {
      renderWindow.destroy();
    }
    renderWindow = null;
    renderWindowReady = null;
  }, WINDOW_IDLE_DESTROY_MS);
  // Never hold the app open just for the render window.
  idleTimer.unref?.();
}

// Creates (once) and returns the shim page promise. Consecutive callers
// share the same load; a crashed or destroyed window resets it.
async function getRenderWindow() {
  if (renderWindowReady) {
    return renderWindowReady;
  }

  const { BrowserWindow } = await import("electron");
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      // No node access, no remote content: the page only ever runs the
      // vendored mermaid bundle against document text.
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });
  renderWindow = window;

  renderWindowReady = (async () => {
    await window.loadFile(SHIM_PAGE_PATH);
    return window;
  })().catch((error) => {
    if (renderWindow === window) {
      renderWindow = null;
      renderWindowReady = null;
    }
    window.destroy();
    throw error;
  });

  return renderWindowReady;
}

async function renderSvgInWindow(window, encodedSource, theme) {
  const source = decodeURIComponent(encodedSource);
  const script = `window.__renderMermaid(${JSON.stringify(source)}, ${JSON.stringify(theme)})`;
  const result = await Promise.race([
    window.webContents.executeJavaScript(script, false),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Mermaid render timed out")), RENDER_TIMEOUT_MS).unref?.();
    })
  ]);

  if (!result || typeof result !== "object") {
    throw new Error("Mermaid renderer returned no result");
  }
  if (result.error) {
    throw new Error(result.error);
  }
  if (typeof result.svg !== "string" || !result.svg.includes("<svg")) {
    throw new Error("Mermaid renderer returned no SVG");
  }
  return result.svg;
}

async function renderMermaidSvg(encodedSource, theme) {
  const cacheKey = crypto.createHash("sha256")
    .update(theme)
    .update("\0")
    .update(encodedSource)
    .digest("hex");
  if (svgCache.has(cacheKey)) {
    return svgCache.get(cacheKey);
  }

  const window = await getRenderWindow();
  const svg = await renderSvgInWindow(window, encodedSource, theme);
  svgCache.set(cacheKey, svg);
  scheduleIdleDestroy();
  return svg;
}

// Replaces every [mermaid] placeholder in `html` with its rendered SVG.
// Failures are per-diagram: a broken diagram becomes a warning admonition
// while the rest of the document renders normally, and a renderer that
// cannot start at all leaves the placeholders untouched (the preview shows
// empty blocks rather than losing the surrounding document).
export async function substituteMermaidDiagrams(html, { colorScheme = "light" } = {}) {
  const sources = extractMermaidSources(html);
  if (sources.length === 0) {
    return html;
  }

  const theme = mermaidThemeForColorScheme(colorScheme);
  const results = new Map();
  for (const source of sources) {
    try {
      results.set(source, { svg: await renderMermaidSvg(source, theme) });
    } catch (error) {
      results.set(source, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  scheduleIdleDestroy();
  return applyMermaidDiagrams(html, results);
}

// Test/shutdown hook: destroys the hidden window immediately.
export function disposeMermaidRenderer() {
  clearTimeout(idleTimer);
  if (renderWindow && !renderWindow.isDestroyed()) {
    renderWindow.destroy();
  }
  renderWindow = null;
  renderWindowReady = null;
}
