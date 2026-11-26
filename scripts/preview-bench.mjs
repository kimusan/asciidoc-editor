// Renderer-side preview benchmark (the morphdom gate experiment).
//
// Measures, inside the REAL app renderer with the REAL preview iframe and
// the REAL render IPC, where preview update time goes on documents of
// several sizes:
//   - worker render (IPC + Asciidoctor + highlight.js)  [cannot be improved by morphdom]
//   - innerHTML set alone                               [morphdom target]
//   - innerHTML set + forced relayout                   [morphdom target]
//   - style-host textContent swap + relayout            [style-skip candidate]
//   - sync-point stamping (querySelectorAll + dataset)  [unrelated]
// And the small-edit scenario: one changed word in the middle of the doc,
// full-root innerHTML replacement vs a keyed top-level block patch
// (morphdom's core win at block granularity).
//
// Run from the repo root: node scripts/preview-bench.mjs

import { _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PROJECT_ROOT = process.cwd();

function syntheticDoc(targetBytes) {
  const parts = ["= Benchmark Document\n\n:doctype: book\n\n"];
  let size = parts[0].length;
  let section = 0;
  while (size < targetBytes) {
    section += 1;
    const block = [
      `== Section ${section}\n\n`,
      `Paragraph ${section}.a. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.\n\n`,
      `Paragraph ${section}.b. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident.\n\n`,
      `[NOTE]\n====\nA short admonition for section ${section} to vary the block mix.\n====\n\n`,
      `[source,js]\n----\nfunction example${section}() {\n  return ${section} + 1; // a comment line\n}\n----\n\n`,
      `[cols="2,1"]\n|===\n|Name ${section} |Value\n|alpha |${section}\n|===\n\n`
    ].join("");
    parts.push(block);
    size += block.length;
  }
  return parts.join("");
}

async function benchOnce(label, content, docPath) {
  const docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-bench-docs-"));
  const docFile = path.join(docsDir, "bench.adoc");
  await fs.writeFile(docFile, content, "utf8");

  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-bench-profile-"));
  const app = await electron.launch({ args: [PROJECT_ROOT, docFile, `--user-data-dir=${profileDir}`] });
  const win = await app.firstWindow();
  await win.locator(".cm-content").waitFor({ timeout: 30_000 });
  // Let the first preview render settle.
  await win.waitForTimeout(2_000);

  const result = await win.evaluate(async ({ content, filePath, baseDir }) => {
    const frame = document.querySelector("#preview-frame");
    const fdoc = frame.contentDocument;
    const root = fdoc.getElementById("preview-root");
    const styleHost = fdoc.getElementById("preview-style-host");
    const payload = {
      content, filePath, baseDir,
      stylesheetPath: null, previewFontFamily: "serif", pdfPaperSize: "A4",
      previewColorScheme: "light"
    };

    const runs = 7;
    const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    const now = () => performance.now();
    const forceLayout = () => { void fdoc.scrollingElement.scrollHeight; };

    let preview = await window.desktop.renderPreview(payload); // warm-up

    // 1. Worker render (IPC + asciidoctor worker): outside morphdom's reach.
    const workerTimes = [];
    for (let i = 0; i < runs; i += 1) {
      const t0 = now();
      preview = await window.desktop.renderPreview(payload);
      workerTimes.push(now() - t0);
    }

    // 2. innerHTML set alone.
    const innerTimes = [];
    for (let i = 0; i < runs; i += 1) {
      const t0 = now();
      root.innerHTML = preview.body;
      innerTimes.push(now() - t0);
    }

    // 3. innerHTML set + forced relayout (the real apply cost).
    const applyTimes = [];
    for (let i = 0; i < runs; i += 1) {
      const t0 = now();
      root.innerHTML = preview.body;
      forceLayout();
      applyTimes.push(now() - t0);
    }

    // 4. Style-host swap + relayout (restyle of the whole frame).
    const styleTimes = [];
    for (let i = 0; i < runs; i += 1) {
      const t0 = now();
      styleHost.textContent = preview.styles;
      forceLayout();
      styleTimes.push(now() - t0);
    }

    // 5. Sync-point stamping.
    const syncTimes = [];
    for (let i = 0; i < runs; i += 1) {
      const t0 = now();
      for (const el of fdoc.querySelectorAll('[class*="src-line-"]')) {
        const cls = typeof el.className === "string" ? el.className : "";
        const m = cls.match(/(?:^|\s)src-line-(\d+)(?=\s|$)/);
        if (m) el.dataset.sourceLine = m[1];
      }
      syncTimes.push(now() - t0);
    }

    const elements = fdoc.querySelectorAll("#preview-root *").length;
    const anchors = fdoc.querySelectorAll("[data-source-line]").length;
    const bodyKb = (preview.body.length / 1024).toFixed(1);

    // 6. Small-edit scenario: change ONE word mid-document, re-render, and
    // compare full-root replacement vs a keyed top-level block patch.
    const midIndex = Math.floor(content.length / 2);
    // Insert one character mid-document: deterministic and robust (always
    // lands inside exactly one rendered block, whatever the markup mix).
    const edited = content.slice(0, midIndex) + "X" + content.slice(midIndex);
    const editedPreview = await window.desktop.renderPreview({ ...payload, content: edited });

    // 6a. Full innerHTML replacement + layout (what the app does today).
    const fullReplaceTimes = [];
    for (let i = 0; i < runs; i += 1) {
      const t0 = now();
      root.innerHTML = editedPreview.body;
      forceLayout();
      fullReplaceTimes.push(now() - t0);
    }

    // 6b. Keyed patch: only top-level blocks whose outerHTML changed are
    // replaced; untouched blocks keep their DOM (and layout) as-is.
    // Top-level blocks arrive in document order, so an index-wise compare
    // is the key match for the single-block-edit scenario.
    const keyedPatchTimes = [];
    let patchedBlocks = 0;
    for (let i = 0; i < runs; i += 1) {
      const template = fdoc.createElement("template");
      template.innerHTML = editedPreview.body;
      const newChildren = [...template.content.children];
      const oldChildren = [...root.children];
      const t0 = now();
      let changed = 0;
      const max = Math.max(newChildren.length, oldChildren.length);
      for (let i2 = 0; i2 < max; i2 += 1) {
        const nc = newChildren[i2];
        const oc = oldChildren[i2];
        if (nc && oc && nc.outerHTML === oc.outerHTML) continue;
        changed += 1;
        if (nc && oc) root.replaceChild(nc, oc);
        else if (nc) root.appendChild(nc);
        else if (oc) root.removeChild(oc);
      }
      forceLayout();
      keyedPatchTimes.push(now() - t0);
      patchedBlocks = changed;
      // Restore full state for the next run.
      root.innerHTML = preview.body;
      forceLayout();
    }

    return {
      bodyKb, elements, anchors,
      workerMs: median(workerTimes),
      innerHtmlSetMs: median(innerTimes),
      innerHtmlApplyMs: median(applyTimes),
      styleSwapMs: median(styleTimes),
      syncPointsMs: median(syncTimes),
      smallEdit: {
        fullReplaceMs: median(fullReplaceTimes),
        keyedPatchMs: median(keyedPatchTimes),
        patchedBlocks
      }
    };
  }, { content, filePath: docFile, baseDir: docsDir }).catch((e) => ({ error: String(e) }));

  await app.close().catch(() => {});
  return { label, ...result };
}

const realDoc = await fs.readFile("/mnt/c/Users/kschulz/Documents/testdoc.adoc", "utf8").catch(() => null);
const docs = [
  realDoc ? { label: "user testdoc (13.7KB)", content: realDoc } : null,
  { label: "synthetic 100KB", content: syntheticDoc(100 * 1024) },
  { label: "synthetic 300KB", content: syntheticDoc(300 * 1024) },
  { label: "synthetic 800KB", content: syntheticDoc(800 * 1024) }
].filter(Boolean);

console.log("label | body | elements | workerMs | innerSet | apply+layout | styleSwap | syncPts | smallEdit: full vs keyed");
for (const doc of docs) {
  const r = await benchOnce(doc.label, doc.content);
  if (r.error) { console.log(`${r.label} | ERROR: ${r.error.slice(0, 200)}`); continue; }
  console.log(
    `${r.label} | ${r.bodyKb}KB | ${r.elements} | ` +
    `${r.workerMs.toFixed(1)} | ${r.innerHtmlSetMs.toFixed(1)} | ${r.innerHtmlApplyMs.toFixed(1)} | ` +
    `${r.styleSwapMs.toFixed(1)} | ${r.syncPointsMs.toFixed(1)} | ` +
    `${r.smallEdit.fullReplaceMs.toFixed(1)} vs ${r.smallEdit.keyedPatchMs.toFixed(1)} (${r.smallEdit.patchedBlocks} blocks touched)`
  );
}
process.exit(0);
