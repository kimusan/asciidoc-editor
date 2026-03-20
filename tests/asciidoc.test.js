import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { convertDocument, renderPreview } from "../electron/asciidoc.js";

test("convertDocument resolves include directives from the source directory", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-editor-"));
  const partialPath = path.join(tempRoot, "partial.adoc");
  await fs.writeFile(partialPath, "Included paragraph.", "utf8");

  const source = "= Demo\n\ninclude::partial.adoc[]";
  const html = convertDocument(source, path.join(tempRoot, "main.adoc"));

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

  assert.match(html, /<h1[^>]*>Title<\/h1>/);
  assert.match(html, /<h2[^>]*>Section<\/h2>/);
});

test("renderPreview supports extended preview themes and font families", async () => {
  const html = await renderPreview("= Demo\n\nA paragraph.", null, {
    previewTheme: "nord",
    previewFontFamily: "sans"
  });

  assert.match(html, /--adoc-link: #88c0d0;/);
  assert.match(html, /--adoc-font-family: "Aptos", "Segoe UI Variable Text", "Inter", "Noto Sans", sans-serif;/);
});

test("renderPreview applies syntax highlighting when a supported source language is provided", async () => {
  const html = await renderPreview("= Demo\n\n[source,js]\n----\nconst total = 1;\n----");

  assert.match(html, /hljs-keyword/);
  assert.match(html, /\.hljs/);
});

test("renderPreview can render a print-friendly document without preview chrome", async () => {
  const html = await renderPreview("= Demo\n\nA paragraph.", null, {
    previewTheme: "darcula",
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
