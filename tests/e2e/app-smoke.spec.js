import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function launchApp() {
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-profile-"));
  const app = await electron.launch({
    args: [PROJECT_ROOT, `--user-data-dir=${profileDir}`]
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
