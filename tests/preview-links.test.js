import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolvePreviewLinkTarget } from "../electron/preview-links.js";

test("resolvePreviewLinkTarget maps rendered xref html links back to AsciiDoc source files", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-preview-links-"));
  const currentPath = path.join(tempRoot, "main.adoc");
  const targetPath = path.join(tempRoot, "other.adoc");

  await fs.writeFile(currentPath, "= Main", "utf8");
  await fs.writeFile(targetPath, "= Other", "utf8");

  const result = await resolvePreviewLinkTarget("other.html#topic", currentPath);

  assert.equal(result.type, "document");
  assert.equal(result.filePath, targetPath);
  assert.equal(result.anchorId, "topic");
});

test("resolvePreviewLinkTarget keeps same-document anchors inside the current preview", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-preview-links-"));
  const currentPath = path.join(tempRoot, "main.adoc");
  await fs.writeFile(currentPath, "= Main", "utf8");

  const result = await resolvePreviewLinkTarget("main.html#section", currentPath);

  assert.equal(result.type, "anchor");
  assert.equal(result.anchorId, "section");
});
