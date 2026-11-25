import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function launchApp() {
  // The app loads dist/index.html; without a renderer build the window
  // comes up blank and every visibility assertion times out confusingly.
  try {
    await fs.access(path.join(PROJECT_ROOT, "dist", "index.html"));
  } catch {
    throw new Error("dist/index.html not found - run `npm run build` before the e2e suite");
  }

  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-profile-"));
  // ASCIIDOC_E2E_EXECUTABLE points the suite at a packaged binary
  // (e.g. release/linux-unpacked/asciidoc-editor) to verify the shipped
  // layout instead of the dev tree.
  const packagedExecutable = process.env.ASCIIDOC_E2E_EXECUTABLE;
  const app = await electron.launch({
    ...(packagedExecutable ? { executablePath: packagedExecutable } : {}),
    args: [
      ...(packagedExecutable ? [] : [PROJECT_ROOT]),
      `--user-data-dir=${profileDir}`
    ]
  });
  const window = await app.firstWindow();
  return { app, window };
}

// Exit via app.exit to bypass the unsaved-changes close handshake, whose
// confirm dialog lives in the main process where Playwright cannot reach it.
async function stopApp(app) {
  try {
    await app.evaluate(({ app }) => app.exit(0));
  } catch {
    // Process already gone.
  }
  await app.close().catch(() => {});
}

// The preview iframes are sandboxed (allow-same-origin, no allow-scripts), so
// Playwright cannot instrument them directly. Same-origin access from the
// parent page works and is exactly how the app itself injects the preview.
async function readPreviewText(window) {
  return window.evaluate(() => {
    const frame = document.querySelector("#preview-frame");
    return frame?.contentDocument?.getElementById("preview-root")?.innerText ?? "";
  });
}

test("boots with an untitled document and a live preview", async () => {
  const { app, window } = await launchApp();

  try {
    await expect(window.locator(".shell")).toBeVisible();
    await expect(window.locator(".cm-content")).toBeVisible();
    await expect(window.locator("#preview-frame")).toBeVisible();

    // The seed document must reach the preview through the render worker.
    await expect(async () => {
      expect(await readPreviewText(window)).toContain("Start writing");
    }).toPass({ timeout: 15_000 });

    // The default nord app theme is dark, so the preview document must
    // carry the dark scheme tokens rather than the light defaults.
    const previewScheme = await window.evaluate(() => {
      const styleHost = document.querySelector("#preview-frame")
        ?.contentDocument?.getElementById("preview-style-host");
      return styleHost?.textContent?.match(/color-scheme:\s*(\w+)/)?.[1] ?? "missing";
    });
    expect(previewScheme).toBe("dark");

    await expect(window.locator(".document-tab").first()).toContainText("Untitled");
  } finally {
    await stopApp(app);
  }
});

test("edits flow into the preview and the outline", async () => {
  const { app, window } = await launchApp();

  try {
    await expect(window.locator(".cm-content")).toBeVisible();
    await expect(async () => {
      expect(await readPreviewText(window)).toContain("Start writing");
    }).toPass({ timeout: 15_000 });

    await window.locator(".cm-content").click();
    await window.keyboard.press("ControlOrMeta+End");
    await window.keyboard.type("\n== Fresh Section\n\nHello from the smoke test.");

    await expect(async () => {
      expect(await readPreviewText(window)).toContain("Hello from the smoke test.");
    }).toPass({ timeout: 10_000 });

    await expect(window.locator(".outline-entry", { hasText: "Fresh Section" })).toBeVisible({ timeout: 10_000 });
  } finally {
    await stopApp(app);
  }
});

test("preview scroll sync tracks the editor cursor", async () => {
  const { app, window } = await launchApp();

  try {
    await expect(window.locator(".cm-content")).toBeVisible();

    // A long document so the preview has real scroll range. insertText is
    // atomic against CodeMirror (keyboard.type can drop characters here).
    let source = "";
    for (let i = 1; i <= 30; i += 1) {
      source += `== Section ${i}\n\nPara ${i} first lorem ipsum paragraph.\n\nPara ${i} second lorem ipsum paragraph.\n\n`;
    }
    await window.locator(".cm-content").click();
    await window.keyboard.press("ControlOrMeta+A");
    await window.keyboard.insertText(source);

    // The renderer tags preview blocks with data-source-line anchors built
    // from the Asciidoctor sourcemap; without them scroll sync is dead.
    await expect(async () => {
      const anchorCount = await window.evaluate(() => {
        const frame = document.querySelector("#preview-frame");
        return frame?.contentDocument?.querySelectorAll("[data-source-line]").length ?? 0;
      });
      expect(anchorCount).toBeGreaterThan(50);
    }).toPass({ timeout: 15_000 });

    // Anchors must be correctly aligned with the rendered blocks: in DOM
    // order their source lines never decrease. A misaligned anchor set pins
    // the preview to the wrong spot no matter where the cursor goes.
    const anchorLines = await window.evaluate(() =>
      Array.from(document.querySelector("#preview-frame")
        ?.contentDocument?.querySelectorAll("[data-source-line]") ?? [])
        .map((element) => Number.parseInt(element.dataset.sourceLine, 10))
    );
    expect(anchorLines.length).toBeGreaterThan(50);
    expect(anchorLines.every((line, index) => index === 0 || line >= anchorLines[index - 1])).toBe(true);

    const readScrollTop = () => window.evaluate(() => {
      const frame = document.querySelector("#preview-frame");
      return Math.round(frame?.contentDocument?.scrollingElement?.scrollTop ?? -1);
    });

    const maxScrollTop = await window.evaluate(() => {
      const frame = document.querySelector("#preview-frame");
      const el = frame?.contentDocument?.scrollingElement;
      return el ? el.scrollHeight - el.clientHeight : 0;
    });
    expect(maxScrollTop).toBeGreaterThan(500);

    // Cursor to the document end must scroll the preview near the bottom.
    await window.keyboard.press("ControlOrMeta+End");
    await expect(async () => {
      expect(await readScrollTop()).toBeGreaterThan(maxScrollTop * 0.6);
    }).toPass({ timeout: 5_000 });

    // And back to the top.
    await window.keyboard.press("ControlOrMeta+Home");
    await expect(async () => {
      expect(await readScrollTop()).toBeLessThan(maxScrollTop * 0.2);
    }).toPass({ timeout: 5_000 });
  } finally {
    await stopApp(app);
  }
});

test("autocomplete completes AsciiDoc syntax while typing", async () => {
  const { app, window } = await launchApp();

  try {
    await expect(window.locator(".cm-content")).toBeVisible();
    await window.locator(".cm-content").click();
    await window.keyboard.press("ControlOrMeta+End");

    // Block attributes: typing [sou offers fenced block templates.
    await window.keyboard.press("Enter");
    await window.keyboard.type("[sou", { delay: 60 });
    // The completion re-query debounces ~100ms after the last keystroke;
    // accepting inside that window falls through to a plain newline.
    await window.waitForTimeout(350);
    await expect(window.locator(".cm-tooltip-autocomplete")).toBeVisible();
    await expect(window.locator(".cm-tooltip-autocomplete li").first()).toContainText("[source]");
    await window.keyboard.press("Enter");
    // CodeMirror renders one .cm-line element per document line; rebuild
    // the text from them since textContent flattens line breaks away.
    await expect(async () => {
      const lines = await window.evaluate(() =>
        Array.from(document.querySelectorAll(".cm-line")).map((line) => line.textContent)
      );
      expect(lines).toContain("[source]");
      expect(lines.filter((line) => line === "----").length).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 5_000 });

    // Document attributes: :toc completes to :toc:.
    await window.keyboard.press("ArrowDown");
    await window.keyboard.press("Enter");
    await window.keyboard.type(":toc", { delay: 60 });
    await window.waitForTimeout(350);
    await expect(window.locator(".cm-tooltip-autocomplete")).toBeVisible();
    await expect(window.locator(".cm-tooltip-autocomplete li").first()).toContainText(":toc:");
    await window.keyboard.press("Enter");
    const withAttr = await window.evaluate(() => document.querySelector(".cm-content").textContent);
    expect(withAttr).toContain(":toc:");

    // Prose must never open the completion popup.
    await window.keyboard.press("Enter");
    await window.keyboard.type("Plain prose with a colon: nothing", { delay: 30 });
    await window.waitForTimeout(400);
    await expect(window.locator(".cm-tooltip-autocomplete")).toHaveCount(0);
  } finally {
    await stopApp(app);
  }
});

test("editor follows preview scrolling", async () => {
  const { app, window } = await launchApp();

  try {
    await expect(window.locator(".cm-content")).toBeVisible();

    let source = "";
    for (let i = 1; i <= 30; i += 1) {
      source += `== Section ${i}\n\nPara ${i} first lorem ipsum paragraph.\n\nPara ${i} second lorem ipsum paragraph.\n\n`;
    }
    await window.locator(".cm-content").click();
    await window.keyboard.press("ControlOrMeta+A");
    await window.keyboard.insertText(source);

    await expect(async () => {
      const anchorCount = await window.evaluate(() => {
        const frame = document.querySelector("#preview-frame");
        return frame?.contentDocument?.querySelectorAll("[data-source-line]").length ?? 0;
      });
      expect(anchorCount).toBeGreaterThan(50);
    }).toPass({ timeout: 15_000 });

    const readState = () => window.evaluate(() => {
      const frame = document.querySelector("#preview-frame");
      const scroller = frame.contentDocument.scrollingElement;
      return {
        editorTop: Math.round(document.querySelector(".cm-scroller").scrollTop),
        previewTop: Math.round(scroller.scrollTop),
        previewMax: Math.round(scroller.scrollHeight - scroller.clientHeight)
      };
    });
    const scrollPreviewTo = (top) => window.evaluate((target) => {
      document.querySelector("#preview-frame").contentWindow.scrollTo(0, target);
    }, top);

    // The cursor sits at the document end, so both panes start at the
    // bottom. Scrolling the preview to the top must pull the editor up.
    // Wait out the forward-sync lock first: scrolling the preview within
    // the echo-suppression window after the typing-driven sync is — by
    // design — ignored, so the test would race the lock.
    await window.waitForTimeout(700);
    await scrollPreviewTo(0);
    await expect(async () => {
      expect((await readState()).editorTop).toBeLessThan(150);
    }).toPass({ timeout: 5_000 });

    // Scrolling partway down must move the editor down with it.
    const { previewMax } = await readState();
    const midTarget = Math.round(previewMax * 0.65);
    await scrollPreviewTo(midTarget);
    await expect(async () => {
      expect((await readState()).editorTop).toBeGreaterThan(400);
    }).toPass({ timeout: 5_000 });

    // Stability: after the sync settles, the preview must still be where
    // the user left it — the forward sync must not drag it back to the
    // (off-screen) cursor position.
    await window.waitForTimeout(1_200);
    const settled = await readState();
    expect(Math.abs(settled.previewTop - midTarget)).toBeLessThan(150);
  } finally {
    await stopApp(app);
  }
});

test("render worker handles source highlighting and msc diagrams", async () => {
  const { app, window } = await launchApp();

  try {
    await expect(window.locator(".cm-content")).toBeVisible();

    // These block types exercise the worker's heaviest dependencies:
    // highlight.js for the source block, jsdom + mscgenjs for the
    // diagram. They must resolve in both the dev tree and the packaged
    // asar layout. insertText is used instead of keyboard.type because
    // per-key events can drop characters against CodeMirror here.
    await window.locator(".cm-content").click();
    await window.keyboard.press("ControlOrMeta+End");
    await window.keyboard.insertText(
      "\n[source,js]\n----\nconst total = 1;\n----\n\n[msc]\n----\nmsc {\n  a,b;\n  a=>b[label=\"hello\"];\n}\n----"
    );

    await expect(async () => {
      const previewHtml = await window.evaluate(() => {
        const frame = document.querySelector("#preview-frame");
        return frame?.contentDocument?.getElementById("preview-root")?.innerHTML ?? "";
      });
      expect(previewHtml).toContain("<svg");
      expect(previewHtml).toContain("hljs");
    }).toPass({ timeout: 15_000 });
  } finally {
    await stopApp(app);
  }
});

test("settings and help overlays render their option lists", async () => {
  const { app, window } = await launchApp();

  try {
    await expect(window.locator(".cm-content")).toBeVisible();

    // Settings overlay: theme/font/paper selects are built from the
    // extracted option tables via renderOptionMarkup.
    await window.keyboard.press("ControlOrMeta+,");
    await expect(window.locator("#settings-overlay")).toBeVisible({ timeout: 5_000 });
    await expect(window.locator("select#settings-app-theme option")).toHaveCount(6, { timeout: 5_000 });
    await expect(window.locator("select#settings-preview-font option")).toHaveCount(3);

    // Keyboard help overlay: shortcut cards come from SHORTCUT_SECTIONS.
    await window.keyboard.press("Escape");
    await window.keyboard.press("F1");
    await expect(window.locator(".shortcut-card").first()).toBeVisible({ timeout: 5_000 });
    await expect(window.locator(".shortcut-card h3").first()).toContainText(/Document|Search|Panels/);
  } finally {
    await stopApp(app);
  }
});
