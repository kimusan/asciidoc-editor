"use strict";

// CPU-bound AsciiDoc pipeline core. Runs inside a worker thread so large
// documents cannot block the Electron main process event loop (IPC handling,
// window management, state persistence). Must stay CommonJS: it is loaded
// with worker_threads from inside the packaged asar archive.

const path = require("node:path");
const crypto = require("node:crypto");
const { parentPort } = require("node:worker_threads");

const Asciidoctor = require("@asciidoctor/core");
const docbookConverter = require("@asciidoctor/docbook-converter");
const hljs = require("highlight.js/lib/common");
const { parseHTML } = require("linkedom");
const mscgenjs = require("mscgenjs");

const asciidoctor = Asciidoctor();
// Asciidoctor.js 3.x ships the DocBook converter as a separate package; the
// DocBook export is broken without registering it.
docbookConverter.register();

// Collect converter diagnostics (missing includes, invalid references) so
// the editor can surface them instead of rendering silently broken output.
// The MemoryLogger must be built with Opal's $new(): the JS `new` skips
// initialize, leaving @messages nil - the first logged error then throws
// "undefined method `<<' for nil" from deep inside the include resolution.
// A fresh logger per render (the JS wrapper exposes no clear()) doubles as
// contamination protection: no message can leak across renders.
const DIAGNOSTIC_SEVERITIES = new Set(["WARN", "ERROR", "FATAL"]);
const MAX_DIAGNOSTICS = 50;

// Drains the render's logger into a plain serializable list. INFO messages
// (e.g. "possible invalid reference") are too noisy for the statusbar chip.
function collectDiagnostics(logger) {
  const diagnostics = [];
  for (const entry of logger.getMessages()) {
    const severity = String(entry.getSeverity());
    if (!DIAGNOSTIC_SEVERITIES.has(severity)) {
      continue;
    }

    const location = entry.getSourceLocation();
    diagnostics.push({
      severity,
      message: String(entry.getText()),
      sourceLine: location ? Number(location.lineno ?? 0) || null : null
    });
    if (diagnostics.length >= MAX_DIAGNOSTICS) {
      break;
    }
  }

  return diagnostics;
}

const mscSvgCache = new Map();
let mscExtensionsRegistered = false;

function resolveBaseDir(filePath, baseDir = null) {
  if (baseDir) {
    return baseDir;
  }

  if (!filePath) {
    return process.cwd();
  }

  return path.dirname(filePath);
}

function buildAttributes() {
  // Custom stylesheets are inlined by the callers themselves; the
  // stylesheet/linkcss attributes only ever produced a <head> link that both
  // the preview and the HTML export discard, and safe mode ignores them.
  return {
    "source-highlighter": "highlight.js",
    "icons": "font"
  };
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

  // mscgenjs renders SVG through a browser-style DOM. linkedom provides the
  // small API surface it needs (createElement(NS), getElementById,
  // setAttribute, appendChild, innerHTML serialization) at ~1MB; neither it
  // nor jsdom before it can do text layout, so mscgenjs already falls back
  // to its fixed-size bbox estimation either way.
  const dom = parseHTML("<div id=\"mscgen-root\"></div>");
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;

  globalThis.window = dom;
  globalThis.document = dom.document;

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
          : dom.document.getElementById("mscgen-root")?.innerHTML ?? "";
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
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
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

        // The MSC renderer emits raw HTML/SVG. The extension registry is
        // global, so without this gate DocBook exports would embed invalid
        // HTML; fall back to a literal block for non-HTML backends.
        if (parent.getDocument().getBackend() !== "html5") {
          return self.createBlock(parent, "literal", source);
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
    // "server" keeps include:: resolution relative to base_dir while blocking
    // absolute and parent-escaping paths, so an untrusted document cannot read
    // arbitrary files from disk. Passthrough scripts are additionally blocked
    // by the sandboxed preview iframe in the renderer.
    safe: "server",
    base_dir: resolveBaseDir(filePath, options.baseDir),
    standalone: options.standalone ?? true,
    backend: options.backend ?? "html5",
    // Track line numbers on every block so the renderer can tag preview
    // elements with data-source-line for editor<->preview scroll sync.
    sourcemap: true,
    attributes: buildAttributes()
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

// Asciidoctor renders callout markers as inline conum elements inside the
// <code> block: a plain <b class="conum">(1)</b>, or with :icons: font a
// composite <i class="conum" data-value="1"></i><b>(1)</b>. The highlighting
// pass below decodes and re-escapes the code text, which would turn those
// elements into visible raw HTML, so they are swapped for sentinels first
// and restored afterwards.
const CONUM_ELEMENT_PATTERN = /<i class="conum"[^>]*><\/i><b>(?:\(\d+\)|\d+)<\/b>|<b class="conum">\(\d+\)<\/b>/g;

function highlightCodeBlocks(html) {
  return html.replace(
    /<code([^>]*)data-lang="([^"]+)"([^>]*)>([\s\S]*?)<\/code>/g,
    (_, beforeAttrs, language, afterAttrs, code) => {
      const callouts = [];
      const source = decodeHtmlEntities(
        code.replace(CONUM_ELEMENT_PATTERN, (match) => {
          callouts.push(match);
          // A word-char marker lexes as a single identifier token in any
          // grammar, so hljs passes it through verbatim (private-use
          // unicode sentinels get stripped instead).
          return `ConUmPlAcEhOlDeR${callouts.length - 1}eNdMaRkEr`;
        })
      );

      let highlighted;
      try {
        highlighted = hljs.highlight(source, { language }).value;
      } catch {
        highlighted = hljs.highlightAuto(source).value;
      }

      highlighted = highlighted.replaceAll(
        /ConUmPlAcEhOlDeR(\d+)eNdMaRkEr/g,
        (_, index) => callouts[Number(index)] ?? ""
      );

      return `<code${beforeAttrs}data-lang="${language}"${afterAttrs}>${highlighted}</code>`;
    }
  );
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

const SYNC_BLOCK_CONTEXTS = new Set([
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

// findBy() includes the Document node itself; its line is represented by
// the implicit header section, so skip the duplicate to avoid two sync
// points competing for the document title element.
function collectSyncNodes(document) {
  return (document.findBy?.(() => true) ?? [])
    .filter((node) => node !== document)
    .map((node) => ({
      node,
      context: node.getContext?.(),
      lineNumber: getNodeLineNumber(node)
    }))
    .filter((entry) => entry.context && entry.lineNumber && SYNC_BLOCK_CONTEXTS.has(entry.context));
}

// Stamp each block's source line as a role so the rendered HTML carries the
// line number wherever the block actually renders. The renderer then reads
// src-line-N classes directly instead of guessing which DOM element maps to
// which AST block — context-based matching breaks whenever a block style
// renders into a different element (e.g. [abstract] -> .quoteblock), which
// derailed the whole anchor assignment on real documents.
function annotateSourceLineRoles(syncNodes) {
  for (const { node, lineNumber } of syncNodes) {
    node.addRole?.(`src-line-${lineNumber}`);
  }
}

function renderDocument(source, filePath, options = {}) {
  const diagnosticsLogger = asciidoctor.MemoryLogger.$new();
  asciidoctor.LoggerManager.setLogger(diagnosticsLogger);
  // Load once and convert the parsed document; calling asciidoctor.convert
  // as well would parse the whole source a second time on every render.
  const document = asciidoctor.load(source, buildLoadOptions(filePath, options));
  // The roles exist only for preview scroll sync; DocBook exports must not
  // carry them. This is the single AST traversal for sync data: the
  // renderer consumes the stamped src-line-N roles straight from the DOM.
  if ((options.backend ?? "html5") === "html5") {
    annotateSourceLineRoles(collectSyncNodes(document));
  }
  return {
    title: resolveDocumentTitle(document, filePath),
    content: document.convert(),
    diagnostics: collectDiagnostics(diagnosticsLogger)
  };
}

const operations = {
  renderDocument: (source, filePath, options) => renderDocument(source, filePath, options),
  renderPreviewBody: (source, filePath, options) => {
    const { title, content, diagnostics } = renderDocument(source, filePath, {
      ...options,
      standalone: true
    });
    return {
      title,
      body: highlightCodeBlocks(extractBodyContents(content)),
      diagnostics
    };
  }
};

// Test-only (ASCIIDOC_TEST_HANG=1): blocks the worker thread without
// spinning CPU so the main process's job timeout can be exercised end to
// end. Never registered in production.
if (process.env.ASCIIDOC_TEST_HANG === "1") {
  operations.__testHang = () => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60_000);
    return {};
  };
}

parentPort.on("message", (job) => {
  try {
    const operation = operations[job?.op];
    if (!operation) {
      throw new Error(`Unknown worker operation: ${job?.op}`);
    }

    parentPort.postMessage({ id: job.id, result: operation(...job.args) });
  } catch (error) {
    parentPort.postMessage({
      id: job?.id,
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }
    });
  }
});
