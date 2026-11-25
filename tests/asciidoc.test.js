import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  convertDocument,
  disposeRenderWorker,
  exportDocument,
  renderPreview,
  renderPreviewDocument,
  runRenderJobForTests
} from "../electron/asciidoc.js";

test.after(() => disposeRenderWorker());

test("convertDocument resolves include directives from the source directory", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-editor-"));
  const partialPath = path.join(tempRoot, "partial.adoc");
  await fs.writeFile(partialPath, "Included paragraph.", "utf8");

  const source = "= Demo\n\ninclude::partial.adoc[]";
  const html = await convertDocument(source, path.join(tempRoot, "main.adoc"));

  assert.match(html, /Included paragraph\./);
});

test("renderPreview injects preview chrome and custom theme variables", async () => {
  const html = await renderPreview("= Demo\n\nA paragraph.");

  assert.match(html, /<main>/);
  assert.match(html, /--adoc-bg/);
  assert.match(html, />Demo</);
  assert.match(html, /A paragraph\./);
  assert.doesNotMatch(html, /border-radius: 24px/);
  assert.doesNotMatch(html, /box-shadow: 0 24px 60px/);
});

test("renderPreview includes the document header title", async () => {
  const html = await renderPreview("= Title\n\n== Section\n\nText");

  assert.match(html, /<title>Title<\/title>/);
  assert.match(html, /<h1[^>]*>Title<\/h1>/);
  assert.match(html, /<h2[^>]*>Section<\/h2>/);
});

test("preview body carries source-mapped line roles for scroll sync", async () => {
  const { renderPreviewDocument } = await import("../electron/asciidoc.js");
  const result = await renderPreviewDocument(
    "= Title\n\npara one\n\npara two\n\n== S1\n\npara three\n",
    null,
    {}
  );

  // sourcemap: true must stay in the Asciidoctor load options; without it
  // every block loses its source location and preview scroll sync dies.
  // The renderer consumes the stamped src-line-N roles straight from the
  // rendered DOM (the old syncPoints payload was dead weight - shipped on
  // every render, never read outside this test's ancestor). The doctitle
  // is the one exception: the implicit header section's role does not
  // land on the rendered #header div, so preview-sync anchors it via the
  // dedicated "#header h1" selector instead.
  const lineNumbers = [...result.body.matchAll(/src-line-(\d+)/g)].map((match) => Number(match[1]));
  assert.deepEqual(lineNumbers, [3, 5, 7, 9]);
});

test("source highlighting preserves callout markers as conum elements", async () => {
  const html = await renderPreview([
    "[,ruby]",
    "----",
    "require \"prawn\" # <1>",
    "text \"hi\" # <2>",
    "----",
    "<1> Imports Prawn.",
    "<2> Writes text."
  ].join("\n"));

  // Callouts must survive as real elements, not escape into visible HTML.
  // The app sets :icons: font, so Asciidoctor emits the composite form.
  assert.match(html, /<i class="conum" data-value="1"><\/i><b>\(1\)<\/b>/);
  assert.match(html, /<i class="conum" data-value="2"><\/i><b>\(2\)<\/b>/);
  assert.doesNotMatch(html, /&lt;i class="conum"/);
  assert.doesNotMatch(html, /&lt;b class="conum"/);
  assert.doesNotMatch(html, /&lt;b&gt;\(\d+\)/);
  // The highlighting itself still runs alongside the restored callouts.
  assert.match(html, /hljs-string/);
});

test("rendered preview HTML carries exact src-line roles and DocBook stays clean", async () => {  const { renderPreviewDocument } = await import("../electron/asciidoc.js");
  // [abstract] renders as a .quoteblock while its AST context is "open";
  // the role must land on the actual rendered element at its true line.
  const source = [
    "= Demo",
    ":doctype: book",
    "",
    "[%notitle]",
    "--",
    "[abstract]",
    "Abstract body.",
    "--",
    "",
    "== Section",
    "",
    "Paragraph."
  ].join("\n");
  const result = await renderPreviewDocument(source, null, {});

  assert.match(result.body, /class="quoteblock abstract src-line-7"/);
  assert.match(result.body, /src-line-12"/);
  assert.match(result.body, /class="sect1 src-line-10"/);

  const docbook = await convertDocument(source, null, { backend: "docbook5", standalone: false });
  assert.doesNotMatch(docbook, /src-line-/);
});

test("renderPreview resolves relative image paths from an explicit base directory for unsaved project documents", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-editor-images-"));
  const imagePath = path.join(tempRoot, "images", "cover.png");
  await fs.mkdir(path.dirname(imagePath), { recursive: true });
  await fs.writeFile(imagePath, "png-placeholder", "utf8");

  const html = await renderPreview("= Demo\n\nimage::images/cover.png[Cover]", null, {
    baseDir: tempRoot
  });

  assert.match(html, /src="images\/cover\.png"/);
});

test("renderPreview supports configurable font families", async () => {
  const html = await renderPreview("= Demo\n\nA paragraph.", null, {
    previewFontFamily: "sans"
  });

  assert.match(html, /--adoc-link: #0f3d8a;/);
  assert.match(html, /--adoc-font-family: "Aptos", "Segoe UI Variable Text", "Inter", "Noto Sans", sans-serif;/);
});

test("renderPreview applies syntax highlighting when a supported source language is provided", async () => {
  const html = await renderPreview("= Demo\n\n[source,js]\n----\nconst total = 1;\n----");

  assert.match(html, /hljs-keyword/);
  assert.match(html, /\.hljs/);
});

test("renderPreview renders msc blocks to inline svg", async () => {
  const html = await renderPreview("= Demo\n\n[msc]\n----\nmsc {\n  a,b;\n  a=>b[label=\"hello\"];\n}\n----");

  assert.match(html, /mscgen-block/);
  assert.match(html, /<svg\b/);
  assert.match(html, /hello/);
});

test("renderPreview can render a print-friendly document without preview chrome", async () => {
  const html = await renderPreview("= Demo\n\nA paragraph.", null, {
    documentMode: "print",
    pdfPaperSize: "Letter"
  });

  assert.match(html, /@page\s*\{/);
  assert.match(html, /size: Letter;/);
  assert.match(html, /--adoc-bg: #ffffff;/);
  assert.match(html, /table-layout: fixed;/);
  assert.doesNotMatch(html, /box-shadow: 0 24px 60px/);
  assert.doesNotMatch(html, /border-radius: 24px/);
});

test("renderPreview supports a dark color scheme driven by the app theme", async () => {
  const lightHtml = await renderPreview("= Demo\n\nA paragraph.", null, {
    previewColorScheme: "light"
  });
  const darkHtml = await renderPreview("= Demo\n\nA paragraph.", null, {
    previewColorScheme: "dark"
  });

  assert.match(lightHtml, /--adoc-bg: #ffffff;/);
  assert.match(lightHtml, /color-scheme: light;/);
  assert.match(darkHtml, /--adoc-bg: #14181f;/);
  assert.match(darkHtml, /color-scheme: dark;/);

  // The highlight theme follows the scheme so code blocks stay readable.
  assert.match(lightHtml, /\.hljs \{/);
  assert.match(darkHtml, /\.hljs \{/);
  assert.notEqual(lightHtml, darkHtml);
});

test("renderPreview keeps print output light even in dark mode", async () => {
  const html = await renderPreview("= Demo\n\nA paragraph.", null, {
    documentMode: "print",
    previewColorScheme: "dark"
  });

  assert.match(html, /--adoc-bg: #ffffff;/);
});

test("convertDocument keeps msc blocks valid for the DocBook backend", async () => {
  const docbook = await convertDocument("= Demo\n\n[msc]\n----\nmsc {\n  a,b;\n  a=>b[label=\"hello\"];\n}\n----", null, {
    backend: "docbook5",
    standalone: true
  });

  assert.doesNotMatch(docbook, /<svg\b/);
  assert.doesNotMatch(docbook, /mscgen-block/);
  assert.match(docbook, /<literallayout/);
  assert.match(docbook, /a=&gt;b/);
});

test("exportDocument writes a standalone HTML document", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-editor-export-"));
  const destinationPath = path.join(tempRoot, "out.html");

  await exportDocument({
    source: "= Demo\n\nA paragraph.",
    destinationPath,
    format: "html"
  });

  const html = await fs.readFile(destinationPath, "utf8");
  assert.match(html, /<title>Demo<\/title>/);
  assert.match(html, /A paragraph\./);
});

test("a hung render job times out and the worker recovers on the next render", async () => {
  // Drop any worker earlier tests spawned so the probe runs against a
  // fresh worker that picked up the test-only hang op. The hang op is
  // registered at worker load, so ASCIIDOC_TEST_HANG must be set before
  // the warmup - but the shortened job timeout must NOT: on CI the cold
  // worker spawn alone takes ~270ms, so only the probe pays the 250ms
  // timeout and the warmup/recovery renders keep the real default.
  await disposeRenderWorker();
  process.env.ASCIIDOC_TEST_HANG = "1";

  try {
    await renderPreviewDocument("= Warmup\n\nparagraph.", null, {});

    process.env.ASCIIDOC_RENDER_JOB_TIMEOUT_MS = "250";
    const outcome = await runRenderJobForTests("__testHang").then(
      () => null,
      (error) => error
    );
    delete process.env.ASCIIDOC_RENDER_JOB_TIMEOUT_MS;

    assert.ok(outcome instanceof Error, "the hung job must reject, not hang forever");
    assert.match(outcome.message, /timed out/);

    // The stalled worker was terminated; the next render must respawn a
    // healthy one and succeed.
    const recovered = await renderPreviewDocument("= Recovered\n\nparagraph.", null, {});
    assert.match(recovered.body, /Recovered/);
  } finally {
    await disposeRenderWorker();
    delete process.env.ASCIIDOC_TEST_HANG;
    delete process.env.ASCIIDOC_RENDER_JOB_TIMEOUT_MS;
  }
});
