import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function launchApp(profileDir, env) {
  try {
    await fs.access(path.join(PROJECT_ROOT, "dist", "index.html"));
  } catch {
    throw new Error("dist/index.html not found - run `npm run build` before the e2e suite");
  }

  const profile = profileDir ?? (await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-chrome-profile-")));
  const packagedExecutable = process.env.ASCIIDOC_E2E_EXECUTABLE;
  const app = await electron.launch({
    ...(packagedExecutable ? { executablePath: packagedExecutable } : {}),
    args: [
      ...(packagedExecutable ? [] : [PROJECT_ROOT]),
      `--user-data-dir=${profile}`
    ],
    ...(env ? { env: { ...process.env, ...env } } : {})
  });
  const window = await app.firstWindow();
  return { app, window };
}

async function stopApp(app) {
  try {
    await app.evaluate(({ app }) => app.exit(0));
  } catch {
    // Process already gone.
  }
  await app.close().catch(() => {});
}

test("compact chrome keeps content near the top of the window", async () => {
  const { app, window } = await launchApp();

  try {
    await expect(window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });

    const geometry = await window.evaluate(() => {
      const rect = (selector) => {
        const el = document.querySelector(selector);
        return el ? el.getBoundingClientRect() : null;
      };
      return {
        stripHeight: Math.round(rect(".app-strip").height),
        statusbarHeight: Math.round(rect(".statusbar").height),
        contentTop: Math.round(rect("#split-layout").top),
        editorHeight: Math.round(rect(".editor-root").height),
        legacyTopbar: Boolean(document.querySelector(".topbar")),
        legacyPanelHeaders: Boolean(document.querySelector(".split-panel-header"))
      };
    });

    // The old chrome (topbar + stage header + tabs + panel headers) pushed
    // content down to y=234 on this window size; the strip + statusbar must
    // stay a small fraction of that.
    expect(geometry.legacyTopbar).toBe(false);
    expect(geometry.legacyPanelHeaders).toBe(false);
    expect(geometry.stripHeight).toBeLessThanOrEqual(44);
    expect(geometry.statusbarHeight).toBeLessThanOrEqual(28);
    expect(geometry.contentTop).toBeLessThanOrEqual(110);
    expect(geometry.editorHeight).toBeGreaterThan(600);

    // The statusbar carries the ambient info the deleted panel headers used
    // to show, and the strip's sync dot reflects preview state.
    await expect(window.locator("#statusbar-sync")).toHaveText(/Preview synced/);
    await expect(window.locator("#document-status")).toHaveAttribute("data-state", "synced");
    await expect(window.locator(".statusbar-metrics")).toContainText("words");
  } finally {
    await stopApp(app);
  }
});

test("kebab menu exposes relocated actions", async () => {
  const { app, window } = await launchApp();

  try {
    await expect(window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });

    await window.locator("#open-kebab").click();
    await expect(window.locator("#kebab-menu")).toBeVisible();

    // Focus lands on the first item for keyboard users.
    await expect(window.locator("#kebab-menu .kebab-item").first()).toBeFocused();

    // Arrow keys cycle through the menu.
    await window.keyboard.press("ArrowDown");
    const focusedId = await window.evaluate(() => document.activeElement?.dataset.actionId);
    expect(focusedId).toBe("openProject");

    // Escape closes and hands focus back.
    await window.keyboard.press("Escape");
    await expect(window.locator("#kebab-menu")).toBeHidden();
    expect(await window.evaluate(() => document.querySelector("#kebab-menu").hidden)).toBe(true);

    // Every kebab item dispatches through the shared action registry:
    // "Save as…" opens the save dialog, which we cancel from the main
    // process by just verifying no crash; instead run a harmless one —
    // the export overlay.
    await window.locator("#open-kebab").click();
    await window.locator('#kebab-menu [data-action-id="exportDocument"]').click();
    await expect(window.locator("#export-overlay")).toBeVisible();
    await window.keyboard.press("Escape");
  } finally {
    await stopApp(app);
  }
});

test("command palette finds and runs actions", async () => {
  const { app, window } = await launchApp();

  try {
    await expect(window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });

    // Ctrl+K opens the palette; Ctrl+Shift+P is the alias.
    await window.keyboard.press("Control+K");
    await expect(window.locator("#command-palette-overlay")).toHaveClass(/is-open/);
    await window.keyboard.press("Escape");
    await expect(window.locator("#command-palette-overlay")).not.toHaveClass(/is-open/);

    await window.keyboard.press("Control+Shift+P");
    await expect(window.locator("#command-palette-overlay")).toHaveClass(/is-open/);

    // Empty palette lists actions; typing filters fuzzily.
    const initialCount = await window.evaluate(() => document.querySelectorAll(".command-palette-item").length);
    expect(initialCount).toBeGreaterThan(5);
    await window.keyboard.insertText("mark ref");
    await expect(window.locator(".command-palette-item").first()).toContainText("Markup reference");
    expect(await window.evaluate(() => document.querySelectorAll(".command-palette-item").length)).toBeLessThan(initialCount);

    // Enter runs the selected action and closes the palette.
    await window.keyboard.press("Enter");
    await expect(window.locator("#reference-overlay")).toBeVisible();
    await expect(window.locator("#command-palette-overlay")).not.toHaveClass(/is-open/);
    await window.keyboard.press("Escape");

    // Outline headings are jumpable from the palette — with the keyboard
    // alone: type, ArrowDown to the second match, Enter jumps to it.
    await window.locator(".cm-content").click();
    await window.keyboard.press("ControlOrMeta+Home");
    await window.keyboard.insertText("= Top\n\nIntro\n\n== Deep Section\n\nMore text\n\n=== Deep Subsection\n\nTail");
    await window.waitForTimeout(1_500);
    await window.keyboard.press("Control+K");
    await expect(window.locator(".command-palette-footer")).toBeVisible();
    await window.keyboard.insertText("deep");
    await expect(window.locator(".command-palette-item").first()).toContainText("Deep Section");
    await window.keyboard.press("ArrowDown");
    await expect(window.locator(".command-palette-item.is-selected")).toContainText("Deep Subsection");
    await window.keyboard.press("Enter");
    const cursorLine = await window.evaluate(() => {
      const cm = document.querySelector(".cm-content");
      const line = cm.querySelector(".cm-activeLine");
      return line ? Array.from(cm.querySelectorAll(".cm-line")).indexOf(line) + 1 : -1;
    });
    // The cursor must sit on the "=== Deep Subsection" line, past the
    // "Deep Section" heading (line 5).
    expect(cursorLine).toBeGreaterThan(5);
  } finally {
    await stopApp(app);
  }
});

test("preview color scheme overrides the app theme and persists", async () => {
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-preview-scheme-"));
  let lightFromFirstRun = null;

  const first = await launchApp(profileDir);
  try {
    await expect(first.window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });

    // Default: the dark app theme drives a dark preview.
    const darkBg = await first.window.evaluate(() => {
      const doc = document.querySelector("#preview-frame").contentDocument;
      return doc.body ? getComputedStyle(doc.body).backgroundColor : null;
    });

    // Override: force a light preview from Settings.
    await first.window.locator("#open-settings").click();
    await first.window.locator("#settings-overlay").waitFor();
    await first.window.locator("#settings-preview-color-scheme").selectOption("light");
    await first.window.locator("#close-settings").click();
    await first.window.waitForTimeout(1_500);

    lightFromFirstRun = await first.window.evaluate(() => {
      const doc = document.querySelector("#preview-frame").contentDocument;
      return doc.body ? getComputedStyle(doc.body).backgroundColor : null;
    });

    expect(darkBg).toBeTruthy();
    expect(lightFromFirstRun).toBeTruthy();
    expect(lightFromFirstRun).not.toEqual(darkBg);

    // Quit through the real window-close path so state.json is written.
    await first.window.close();
    await first.app.close().catch(() => {});
  } finally {
    await stopApp(first.app);
  }

  // The override survives the restart: same setting selected, same light
  // preview background, even though the app chrome stays dark.
  const second = await launchApp(profileDir);
  try {
    await expect(second.window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });
    await expect(second.window.locator("#settings-preview-color-scheme")).toHaveValue("light", { timeout: 10_000 });

    await second.window.waitForTimeout(1_000);
    const bgAfterRestart = await second.window.evaluate(() => {
      const doc = document.querySelector("#preview-frame").contentDocument;
      return doc.body ? getComputedStyle(doc.body).backgroundColor : null;
    });
    expect(bgAfterRestart).toEqual(lightFromFirstRun);
  } finally {
    await stopApp(second.app);
  }
});

test("native menu bar is defined from the shared action registry", async () => {
  const { app, window } = await launchApp();

  try {
    await expect(window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });

    // The renderer pushes the menu structure to the main process; Alt
    // reveals it. Verify the application menu exists with the expected
    // top-level structure (the evaluate argument is the electron module).
    const labels = await app.evaluate((electron) => {
      const menu = electron.Menu.getApplicationMenu();
      return menu ? menu.items.map((item) => item.label) : [];
    });
    expect(labels).toEqual(["File", "Edit", "View", "Help"]);
  } finally {
    await stopApp(app);
  }
});
