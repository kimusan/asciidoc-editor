import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function launchApp(profileDir, env, extraArgs = []) {
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
      ...extraArgs,
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

test("tabs are keyboard-navigable and closable", async () => {
  const { app, window } = await launchApp();

  try {
    await expect(window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });

    // Two extra tabs on top of the restored session's documents.
    const before = await window.locator(".document-tab").count();
    await window.keyboard.press("Control+n");
    await window.keyboard.press("Control+n");
    await expect(window.locator(".document-tab")).toHaveCount(before + 2);

    // The tab strip is a real tablist: focus the active tab, walk with
    // arrows, activate with Enter.
    await window.evaluate(() => document.querySelector(".document-tab.is-active")?.focus());
    await window.keyboard.press("ArrowLeft");
    await window.keyboard.press("ArrowRight");
    await window.keyboard.press("ArrowLeft");
    const focusedIsTab = await window.evaluate(() => Boolean(document.activeElement?.closest?.("#document-tabs")));
    expect(focusedIsTab).toBe(true);

    // Delete closes the focused tab; Ctrl+W closes the active one.
    await window.keyboard.press("Delete");
    await expect(window.locator(".document-tab")).toHaveCount(before + 1);
    await window.keyboard.press("Control+w");
    await expect(window.locator(".document-tab")).toHaveCount(before);

    // Ctrl+Tab cycles between the remaining documents without closing
    // anything.
    if (before >= 2) {
      const activeBefore = await window.evaluate(() => document.querySelector(".document-tab.is-active")?.dataset.documentId);
      await window.keyboard.press("Control+Tab");
      const activeAfter = await window.evaluate(() => document.querySelector(".document-tab.is-active")?.dataset.documentId);
      expect(activeAfter).not.toBe(activeBefore);
    }
  } finally {
    await stopApp(app);
  }
});

test("Escape closes only the topmost surface and exits focus mode", async () => {
  const { app, window } = await launchApp();

  try {
    await expect(window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });

    // Settings open, palette on top: one Esc must close only the palette.
    await window.keyboard.press("Control+,");
    await expect(window.locator("#settings-overlay")).toBeVisible();
    await window.keyboard.press("Control+k");
    await expect(window.locator(".command-palette-overlay").first()).toBeVisible();
    await window.keyboard.press("Escape");
    await expect(window.locator(".command-palette-overlay").first()).toBeHidden();
    await expect(window.locator("#settings-overlay")).toBeVisible();

    // Second Esc closes the settings; nothing else was open.
    await window.keyboard.press("Escape");
    await expect(window.locator("#settings-overlay")).toBeHidden();

    // Focus mode: enter with the accelerator, leave with Esc.
    await window.keyboard.press("Control+Shift+F11");
    await expect(window.locator(".shell")).toHaveClass(/focus-mode/);
    await window.keyboard.press("Escape");
    await expect(window.locator(".shell")).not.toHaveClass(/focus-mode/);
  } finally {
    await stopApp(app);
  }
});

test("zoom and editor text size work and persist", async () => {
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-zoom-"));

  const first = await launchApp(profileDir);
  try {
    await expect(first.window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });

    // Baseline: default zoom level 0 and a 14px editor.
    expect(await first.window.evaluate(() => window.desktop.getZoomLevel())).toBe(0);

    // Ctrl+= twice zooms in one level; Ctrl+0 resets.
    await first.window.keyboard.press("Control+=");
    await first.window.keyboard.press("Control+=");
    expect(await first.window.evaluate(() => window.desktop.getZoomLevel())).toBe(1);
    await first.window.keyboard.press("Control+-");
    expect(await first.window.evaluate(() => window.desktop.getZoomLevel())).toBe(0.5);

    // Editor text size: Extra large must land on the scroller.
    await first.window.locator("#open-settings").click();
    await first.window.locator("#settings-overlay").waitFor();
    await first.window.locator("#settings-editor-font-size").selectOption("x-large");
    await first.window.locator("#close-settings").click();
    await expect(first.window.locator(".cm-scroller")).toHaveCSS("font-size", "18px");

    // Quit through the real window-close path so state.json is written.
    await first.window.close();
    await first.app.close().catch(() => {});
  } finally {
    await stopApp(first.app);
  }

  // Both survive the restart.
  const second = await launchApp(profileDir);
  try {
    await expect(second.window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });
    await expect(second.window.locator(".cm-scroller")).toHaveCSS("font-size", "18px");
    expect(await second.window.evaluate(() => window.desktop.getZoomLevel())).toBe(0.5);
  } finally {
    await stopApp(second.app);
  }
});

test("overlays trap Tab and restore focus on close", async () => {
  const { app, window } = await launchApp();

  try {
    await expect(window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });

    await window.locator("#open-settings").click();
    await expect(window.locator("#settings-overlay")).toBeVisible();
    await expect(window.locator("#settings-app-theme")).toBeFocused();

    // Tab from the dialog's last focusable wraps to its first (the Close
    // button in the header precedes the settings grid).
    await window.evaluate(() => {
      const dialog = document.querySelector("#settings-overlay .reference-dialog");
      const focusables = [...dialog.querySelectorAll("button, input, select, textarea")]
        .filter((element) => element.offsetParent !== null && !element.disabled);
      focusables[focusables.length - 1].focus();
    });
    await window.keyboard.press("Tab");
    await expect(window.locator("#close-settings")).toBeFocused();

    // Shift+Tab from the first wraps back to the last.
    await window.keyboard.press("Shift+Tab");
    const wrappedBack = await window.evaluate(() => {
      const dialog = document.querySelector("#settings-overlay .reference-dialog");
      const focusables = [...dialog.querySelectorAll("button, input, select, textarea")]
        .filter((element) => element.offsetParent !== null && !element.disabled);
      return focusables[focusables.length - 1] === document.activeElement;
    });
    expect(wrappedBack).toBe(true);

    // Esc closes and hands focus back to the invoking strip button.
    await window.keyboard.press("Escape");
    await expect(window.locator("#settings-overlay")).toBeHidden();
    await expect(window.locator("#open-settings")).toBeFocused();
  } finally {
    await stopApp(app);
  }
});

test("recent files surface in the native menu, palette, and kebab", async () => {
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-recent-profile-"));
  const docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-recent-docs-"));
  const seededPath = path.join(docsDir, "seeded.adoc");
  const thirdPath = path.join(docsDir, "third.adoc");
  const openedPath = path.join(docsDir, "opened.adoc");
  await fs.writeFile(seededPath, "= Seeded\n\nSeeded body.\n");
  await fs.writeFile(thirdPath, "= Third\n\nThird body.\n");
  await fs.writeFile(openedPath, "= Opened\n\nOpened body.\n");
  await fs.writeFile(path.join(profileDir, "state.json"), JSON.stringify({
    schemaVersion: 1,
    recentFiles: [seededPath, thirdPath]
  }));

  const { app, window } = await launchApp(profileDir, null, [openedPath]);

  try {
    // The command-line file opened as a tab...
    await expect(window.locator(".document-tab.is-active")).toContainText("opened.adoc", { timeout: 20_000 });

    // ...and landed in the native File > Open Recent submenu, alongside the
    // two seeded entries (the evaluate argument is the electron module).
    const recentLabels = await app.evaluate((electron) => {
      const menu = electron.Menu.getApplicationMenu();
      const fileMenu = menu?.items.find((item) => item.label === "File");
      const recentMenu = fileMenu?.submenu?.items.find((item) => item.label === "Open Recent");
      return (recentMenu?.submenu?.items ?? []).map((item) => item.label);
    });
    expect(recentLabels).toEqual(["opened.adoc", "seeded.adoc", "third.adoc"]);

    // The palette lists recents and opens them by path.
    await window.keyboard.press("Control+k");
    await window.locator(".command-palette-input").fill("third");
    await window.keyboard.press("Enter");
    await expect(window.locator(".document-tab.is-active")).toContainText("third.adoc");
    await expect(window.locator(".document-tab")).toHaveCount(2);

    // The kebab shows the same list and opens from it too.
    await window.locator("#open-kebab").click();
    const seededItem = window.locator(`[data-recent-path="${seededPath}"]`);
    await expect(seededItem).toBeVisible();
    await seededItem.click();
    await expect(window.locator(".document-tab.is-active")).toContainText("seeded.adoc");
    await expect(window.locator(".document-tab")).toHaveCount(3);
  } finally {
    await stopApp(app);
  }
});

test("pasting an image imports it into images/ and inserts the snippet", async () => {
  const docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-paste-docs-"));
  const docPath = path.join(docsDir, "pasted.adoc");
  await fs.writeFile(docPath, "= Paste Target\n\nBody text.\n");

  // Playwright's electron shim cannot write a real image clipboard; the
  // ASCIIDOC_TEST_CLIPBOARD_IMAGE hook lets this PNG stand in for it.
  const pngPath = path.join(docsDir, "source-image.png");
  await fs.writeFile(pngPath, Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  ));

  const { app, window } = await launchApp(null, { ASCIIDOC_TEST_CLIPBOARD_IMAGE: pngPath }, [docPath]);

  try {
    await expect(window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });

    // Image-only paste: intercepted, imported, snippet inserted.
    await window.evaluate(() => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([new Blob(["png-bytes"], { type: "image/png" })], "shot.png", { type: "image/png" }));
      document.querySelector(".cm-content").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dataTransfer }));
    });
    await expect(window.locator(".cm-content")).toContainText("image::images/pasted-image-", { timeout: 10_000 });

    // The image file was written into the workspace images/ folder.
    const imagesDir = path.join(docsDir, "images");
    const written = await fs.readdir(imagesDir);
    expect(written.some((name) => name.startsWith("pasted-image-") && name.endsWith(".png"))).toBe(true);

    // Text pastes fall through untouched: no import, no snippet.
    await window.evaluate(() => {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData("text/plain", "plain words");
      dataTransfer.items.add(new File([new Blob(["png-bytes"], { type: "image/png" })], "shot.png", { type: "image/png" }));
      document.querySelector(".cm-content").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dataTransfer }));
    });
    await window.waitForTimeout(400);
    const content = await window.evaluate(() => document.querySelector(".cm-content").textContent);
    expect(content).toContain("plain words");
    expect(content.match(/image::images\//g)?.length).toBe(1);
  } finally {
    await stopApp(app);
  }
});

test("Ctrl+click on an include reference opens the target document", async () => {
  const docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-nav-docs-"));
  await fs.writeFile(
    path.join(docsDir, "chapter.adoc"),
    "= Chapter\n\nSee <<setup>> below.\n\n[[setup]]\n== Setup\n\nDo the thing.\n"
  );
  await fs.writeFile(
    path.join(docsDir, "book.adoc"),
    "= Book\n\ninclude::chapter.adoc[]\n\nBack matter.\n"
  );

  const { app, window } = await launchApp(null, null, [path.join(docsDir, "book.adoc")]);

  try {
    await expect(window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });

    // Ctrl+click on the include line: the chapter opens as a new tab.
    // Playwright's mouse.click modifiers do not reach the Electron page
    // (the event arrives ctrl=false), so the test dispatches the mousedown
    // itself at the line's coordinates - the handler path (posAtCoords,
    // target extraction, resolution) is fully real.
    const includeLine = window.locator(".cm-line", { hasText: "include::chapter.adoc[]" }).first();
    await includeLine.waitFor();
    const box = await includeLine.boundingBox();
    expect(box).not.toBeNull();
    await window.evaluate(({ x, y }) => {
      document.querySelector(".cm-content").dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true, cancelable: true, ctrlKey: true, button: 0, clientX: x, clientY: y
      }));
    }, { x: box.x + 24, y: box.y + box.height / 2 });
    await expect(window.locator(".document-tab.is-active")).toContainText("chapter.adoc", { timeout: 10_000 });
    await expect(window.locator(".document-tab")).toHaveCount(2);

    // Ctrl+click on <<setup>> inside the chapter: an in-document anchor
    // jump, so no new tab opens and the cursor lands on [[setup]].
    // "<<setup>>" starts ~8 characters into "See <<setup>> below.".
    const xrefLine = window.locator(".cm-line", { hasText: "<<setup>>" }).first();
    const xrefBox = await xrefLine.boundingBox();
    await window.evaluate(({ x, y }) => {
      document.querySelector(".cm-content").dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true, cancelable: true, ctrlKey: true, button: 0, clientX: x, clientY: y
      }));
    }, { x: xrefBox.x + 70, y: xrefBox.y + xrefBox.height / 2 });
    await expect(window.locator(".cm-activeLine")).toContainText("[[setup]]", { timeout: 5_000 });
    await expect(window.locator(".document-tab")).toHaveCount(2);

    // A plain (unmodified) click on a reference must NOT navigate.
    await window.locator(".cm-line", { hasText: "<<setup>>" }).first().click();
    await window.waitForTimeout(300);
    await expect(window.locator(".document-tab.is-active")).toContainText("chapter.adoc");
  } finally {
    await stopApp(app);
  }
});

test("converter diagnostics surface in the statusbar and jump to the source line", async () => {
  const docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-diag-docs-"));
  const docPath = path.join(docsDir, "broken.adoc");
  await fs.writeFile(docPath, "= Broken\n\ninclude::no-such-file.adoc[]\n\nFine text.\n");

  const { app, window } = await launchApp(null, null, [docPath]);

  try {
    await expect(window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });

    // The missing include surfaces as a statusbar diagnostics chip.
    const chip = window.locator("#statusbar-diagnostics");
    await expect(chip).toBeVisible({ timeout: 15_000 });
    await expect(chip).toContainText("1 error");

    // Clicking it jumps the cursor to the offending line.
    await chip.click();
    await expect(window.locator(".cm-activeLine")).toContainText("include::no-such-file.adoc[]", { timeout: 5_000 });
  } finally {
    await stopApp(app);
  }
});

test("reformat table aligns pipe columns and undoes as one step", async () => {
  const docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-table-docs-"));
  const docPath = path.join(docsDir, "table.adoc");
  await fs.writeFile(
    docPath,
    "= Table\n\n|===\n| Name | Qty |\n| Widget | 2 |\n| Gadget with a long name | 42 |\n|===\n\nTrailing text.\n"
  );

  const { app, window } = await launchApp(null, null, [docPath]);

  try {
    await expect(window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });

    // Cursor starts at the top; put it inside the table (line 5).
    await window.locator(".cm-line", { hasText: "| Widget" }).click();
    await window.keyboard.press("Shift+Alt+f");
    await expect(window.locator(".cm-line", { hasText: "| Name" })).toHaveText(
      "| Name                    | Qty", { timeout: 5_000 }
    );
    await expect(window.locator(".cm-line", { hasText: "| Widget" })).toHaveText(
      "| Widget                  | 2"
    );
    // The last column is never padded (no dirty-diff whitespace).
    await expect(window.locator(".cm-line", { hasText: "long name" })).toHaveText(
      "| Gadget with a long name | 42"
    );

    // One undo step reverts the whole reformat.
    await window.keyboard.press("Control+z");
    await expect(window.locator(".cm-line", { hasText: "| Widget" })).toHaveText("| Widget | 2 |");

    // The command also runs from the palette by name.
    await window.keyboard.press("Control+k");
    await window.locator(".command-palette-input").fill("reformat table");
    await window.keyboard.press("Enter");
    await expect(window.locator(".cm-line", { hasText: "| Widget" })).toHaveText(
      "| Widget                  | 2"
    );

    // Outside a table the shortcut reports instead of editing.
    await window.keyboard.press("Control+z");
    await window.keyboard.press("Control+End");
    await window.keyboard.press("Shift+Alt+f");
    await expect(window.locator("#statusbar-sync")).toContainText("not inside a table");
  } finally {
    await stopApp(app);
  }
});

test("Replace All across open files keeps every tab's undo history", async () => {
  const docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-replace-docs-"));
  await fs.writeFile(path.join(docsDir, "first.adoc"), "= First\n\nalpha content\n");
  await fs.writeFile(path.join(docsDir, "second.adoc"), "= Second\n\nalpha words\n");

  const { app, window } = await launchApp(null, null, [path.join(docsDir, "first.adoc")]);

  try {
    await expect(window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });

    // Open the second document through the palette's workspace file search
    // (debounced async - wait for the result before committing).
    await window.keyboard.press("Control+k");
    await window.locator(".command-palette-input").fill("second");
    await window.locator(".command-palette-item", { hasText: "second.adoc" }).waitFor({ timeout: 5_000 });
    await window.keyboard.press("Enter");
    await expect(window.locator(".document-tab.is-active")).toContainText("second.adoc", { timeout: 10_000 });
    await expect(window.locator(".document-tab")).toHaveCount(2);
    // Let the palette finish closing before the next keyboard shortcut:
    // the window-level Ctrl+H handler stays inert while it is still open.
    await window.waitForTimeout(300);

    // Replace All with the "All open files" scope.
    await window.keyboard.press("Control+h");
    await expect(window.locator("#editor-replace-row")).toBeVisible();
    await window.locator("#editor-search-input").fill("alpha");
    await window.locator("#editor-replace-input").fill("omega");
    await window.locator("#editor-replace-scope-open-files").check();
    await window.locator("#editor-replace-all").click();

    await expect(window.locator(".cm-content")).toContainText("omega words");
    await expect(window.locator("#editor-search-status")).toContainText("Replaced 2 in 2 files");

    // Switch back to the first (background) tab: the replacement applied,
    // and Ctrl+Z there must revert it - a fresh EditorState would have
    // wiped that tab's undo history (the pre-fix behavior).
    await window.locator(".document-tab", { hasText: "first.adoc" }).click();
    await expect(window.locator(".cm-content")).toContainText("omega content");
    // The tab click left focus on the tab button; CodeMirror must have
    // focus to receive the undo.
    await window.locator(".cm-content").click();
    await window.keyboard.press("Control+z");
    await expect(window.locator(".cm-content")).toContainText("alpha content");
    await expect(window.locator(".cm-content")).not.toContainText("omega content");
  } finally {
    await stopApp(app);
  }
});

test("statusbar metrics show the selection and revert on collapse", async () => {
  const { app, window } = await launchApp();

  try {
    await expect(window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });

    // Whole-document counts: no "selected" marker.
    const metrics = window.locator(".statusbar-metrics");
    await expect(metrics.locator("#metrics-selection")).toBeHidden();

    // Ctrl+A selects the document: the metrics switch to selection mode.
    await window.locator(".cm-content").click();
    await window.keyboard.press("Control+a");
    await expect(metrics.locator("#metrics-selection")).toBeVisible({ timeout: 5_000 });
    await expect(metrics).toContainText("selected");

    // Collapsing the selection returns the whole-document counts.
    await window.keyboard.press("ArrowRight");
    await window.waitForTimeout(600);
    await expect(metrics.locator("#metrics-selection")).toBeHidden();
  } finally {
    await stopApp(app);
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

test("spell check underlines misspellings, fixes them from the context menu, and toggles off", async () => {
  const docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-spell-docs-"));
  const docPath = path.join(docsDir, "spell.adoc");
  await fs.writeFile(
    docPath,
    "= Spell Check\n\nI can spell teh word.\n\n[source,js]\n----\nconst teh = 1;\n----\n"
  );

  const { app, window } = await launchApp(null, null, [docPath]);

  try {
    await expect(window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });

    // The prose misspelling is underlined once the dictionary batch lands.
    await expect(window.locator(".cm-spell-error", { hasText: "teh" }).first()).toBeVisible({ timeout: 10_000 });

    // The same word inside a code block is never checked.
    await expect(window.locator(".cm-line", { hasText: "const teh" }).locator(".cm-spell-error")).toHaveCount(0);

    // Right-click the misspelling for suggestions; the first one replaces it.
    await window.locator(".cm-spell-error", { hasText: "teh" }).first().click({ button: "right" });
    const menu = window.locator(".spell-menu");
    await expect(menu).toBeVisible();
    const suggestions = menu.locator(".spell-menu-suggestions .spell-menu-item:not(:disabled)");
    await expect(suggestions.first()).toBeVisible({ timeout: 10_000 });
    await suggestions.first().click();
    await expect(window.locator(".cm-line", { hasText: "I can spell" })).not.toContainText("teh");
    await expect(window.locator(".cm-spell-error")).toHaveCount(0);

    // Right-clicking a correct word never opens the menu.
    await window.locator(".cm-line", { hasText: "I can spell" }).click();
    await window.locator(".cm-content").click({ button: "right" });
    await expect(window.locator(".spell-menu")).toHaveCount(0);

    // Reintroduce a misspelling, then disable the setting: marks must clear.
    await window.locator(".cm-content").click();
    await window.keyboard.press("Control+End");
    await window.keyboard.type("\nteh again");
    await expect(window.locator(".cm-spell-error", { hasText: "teh" })).toBeVisible({ timeout: 10_000 });
    await window.locator("#open-settings").click();
    await window.locator("#settings-spell-check").uncheck();
    await expect(window.locator(".cm-spell-error")).toHaveCount(0);
  } finally {
    await stopApp(app);
  }
});

test("a command-line document still opens when a project session restores tabs", async () => {
  const docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-launch-docs-"));
  const projectPath = path.join(docsDir, "launch.adp");
  const sessionDocPath = path.join(docsDir, "previous.adoc");
  const launchDocPath = path.join(docsDir, "testdoc.adoc");
  await fs.writeFile(sessionDocPath, "= Previous Session\n\nfrom the restored project session\n");
  await fs.writeFile(launchDocPath, "= Launch Doc\n\nopened from the command line\n");
  await fs.writeFile(projectPath, JSON.stringify({ name: "Launch Project", workspace: "." }));

  // Seed a profile whose project session restores previous.adoc, then launch
  // with testdoc.adoc on the command line: the launch document must still
  // land in an active tab instead of being dropped by the session restore.
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-launch-profile-"));
  await fs.writeFile(path.join(profileDir, "state.json"), JSON.stringify({
    currentProjectPath: projectPath,
    projectSessions: {
      [projectPath]: {
        openDocuments: [{ id: "doc-1", path: sessionDocPath, isDirty: false }],
        activeDocumentId: "doc-1",
        nextDocumentId: 2,
        untitledSequence: 1
      }
    }
  }));

  const { app, window } = await launchApp(profileDir, null, [launchDocPath]);

  try {
    await expect(window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });

    // Both documents are open as tabs.
    await expect(window.locator(".document-tab")).toHaveCount(2, { timeout: 10_000 });
    await expect(window.locator(".document-tab", { hasText: "previous.adoc" })).toBeVisible();
    await expect(window.locator(".document-tab", { hasText: "testdoc.adoc" })).toBeVisible();

    // The command-line document is the active one.
    await expect(window.locator(".cm-content")).toContainText("opened from the command line");
  } finally {
    await stopApp(app);
  }
});

test("spell check language switch re-checks the document and persists across restart", async () => {
  const docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-spell-lang-docs-"));
  const docPath = path.join(docsDir, "languages.adoc");
  // "hej" is a correct Danish word but misspelled English; "mispeled" is
  // wrong in both. The fake Danish dictionary below contains only "hej".
  await fs.writeFile(docPath, "= Languages\n\nhej mispeled\n");

  // Offline stand-in for the CDN download (CI must not depend on jsdelivr).
  const dictionaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-spell-dicts-"));
  await fs.mkdir(path.join(dictionaryDir, "da"), { recursive: true });
  await fs.writeFile(path.join(dictionaryDir, "da", "index.aff"), "SET UTF-8\n");
  await fs.writeFile(path.join(dictionaryDir, "da", "index.dic"), "1\nhej\n");

  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-spell-lang-profile-"));
  const launch = async () => launchApp(profileDir, { ASCIIDOC_TEST_SPELL_LANG_DIR: dictionaryDir }, [docPath]);

  const first = await launch();
  try {
    await expect(first.window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });

    // English (US): both words are misspelled.
    await expect(first.window.locator(".cm-spell-error", { hasText: "hej" })).toBeVisible({ timeout: 10_000 });
    await expect(first.window.locator(".cm-spell-error", { hasText: "mispeled" })).toBeVisible();

    // Switch to Danish through Settings.
    await first.window.locator("#open-settings").click();
    await first.window.locator("#settings-spell-language").selectOption("da");
    await expect(first.window.locator("#spell-language-status")).toContainText("Danish dictionary ready", { timeout: 10_000 });

    // The Danish verdicts replace the English ones: "hej" clears, the real
    // typo stays underlined.
    await expect(first.window.locator(".cm-spell-error", { hasText: "mispeled" })).toBeVisible({ timeout: 10_000 });
    await expect(first.window.locator(".cm-spell-error", { hasText: "hej" })).toHaveCount(0);
    await expect(first.window.locator("#settings-spell-language")).toHaveValue("da");
  } finally {
    await stopApp(first.app);
  }

  // Restart with the same profile: the language choice survives boot.
  const second = await launch();
  try {
    await expect(second.window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });
    await expect(second.window.locator("#settings-spell-language")).toHaveValue("da", { timeout: 10_000 });
    await expect(second.window.locator(".cm-spell-error", { hasText: "mispeled" })).toBeVisible({ timeout: 10_000 });
    await expect(second.window.locator(".cm-spell-error", { hasText: "hej" })).toHaveCount(0);
  } finally {
    await stopApp(second.app);
  }
});

test("a dirty session snapshot yields to a file that changed on disk", async () => {
  const docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-stale-docs-"));
  const docPath = path.join(docsDir, "conflict.adoc");
  await fs.writeFile(docPath, "= From Disk\n\nnewer disk content survives\n");

  // The file on disk was last touched an hour ago; the snapshot was
  // recorded two hours ago, so the disk file is newer than the snapshot.
  const hourAgo = new Date(Date.now() - 3_600_000);
  const twoHoursAgo = Date.now() - 7_200_000;
  await fs.utimes(docPath, hourAgo, hourAgo);

  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-stale-profile-"));
  await fs.writeFile(path.join(profileDir, "state.json"), JSON.stringify({
    openDocuments: [{
      id: "doc-1",
      path: docPath,
      name: "conflict.adoc",
      isDirty: true,
      content: "= Stale Snapshot\n\nold unsaved buffer\n",
      lastModifiedMs: twoHoursAgo
    }],
    activeDocumentId: "doc-1",
    nextDocumentId: 2,
    untitledSequence: 1
  }));

  const { app, window } = await launchApp(profileDir);

  try {
    await expect(window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });

    // The newer disk file wins; the snapshot is not restored as unsaved.
    await expect(window.locator(".cm-content")).toContainText("newer disk content survives");
    await expect(window.locator(".cm-content")).not.toContainText("old unsaved buffer");
    await expect(window.locator(".document-tab-dirty")).toHaveCount(0);
  } finally {
    await stopApp(app);
  }
});

test("an unsaved buffer survives restart while its file is unchanged", async () => {
  const docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-unsaved-docs-"));
  const docPath = path.join(docsDir, "unsaved.adoc");
  await fs.writeFile(docPath, "= On Disk\n\ndisk content\n");

  // The app read the file an hour ago (lastModifiedMs); the file has not
  // changed since, so the dirty snapshot is genuine unsaved work.
  const hourAgo = new Date(Date.now() - 3_600_000);
  await fs.utimes(docPath, hourAgo, hourAgo);

  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-unsaved-profile-"));
  await fs.writeFile(path.join(profileDir, "state.json"), JSON.stringify({
    openDocuments: [{
      id: "doc-1",
      path: docPath,
      name: "unsaved.adoc",
      isDirty: true,
      content: "= Unsaved Work\n\nedits not yet on disk\n",
      lastModifiedMs: Date.now() - 3_600_000
    }],
    activeDocumentId: "doc-1",
    nextDocumentId: 2,
    untitledSequence: 1
  }));

  const { app, window } = await launchApp(profileDir);

  try {
    await expect(window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });

    // The unsaved buffer is restored and still marked dirty.
    await expect(window.locator(".cm-content")).toContainText("edits not yet on disk");
    await expect(window.locator(".cm-content")).not.toContainText("disk content");
    await expect(window.locator(".document-tab-dirty")).toHaveCount(1);
  } finally {
    await stopApp(app);
  }
});

test("writing focus settings dim other paragraphs, pin typing, and persist", async () => {
  const docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-focus-docs-"));
  const docPath = path.join(docsDir, "focus.adoc");
  const paragraphs = Array.from({ length: 40 }, (_, index) =>
    `Paragraph ${index + 1} line for the writing focus test.`
  );
  await fs.writeFile(docPath, `= Focus\n\n${paragraphs.join("\n\n")}\n`);

  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-focus-profile-"));
  const launch = async () => launchApp(profileDir, null, [docPath]);

  const first = await launch();
  try {
    await expect(first.window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });

    // Enable both Writing Focus settings.
    await first.window.locator("#open-settings").click();
    await first.window.locator("#settings-paragraph-dimming").check();
    await first.window.locator("#settings-typewriter-scrolling").check();
    await first.window.locator("#close-settings").click();

    // Put the cursor in a mid-document paragraph: every other paragraph
    // line dims, the cursor's paragraph stays full strength.
    await first.window.locator(".cm-line", { hasText: "Paragraph 20" }).click();
    await expect(first.window.locator(".cm-paragraph-dim", { hasText: "Paragraph 19" })).toHaveCount(1, { timeout: 5_000 });
    await expect(first.window.locator(".cm-line", { hasText: "Paragraph 20" }).locator(".cm-paragraph-dim")).toHaveCount(0);

    // Typewriter scrolling: typing mid-document pins the cursor line one
    // third from the top instead of letting it sit wherever the click was.
    await first.window.keyboard.type("x");
    const pinned = await first.window.evaluate(() => {
      const scroller = document.querySelector(".cm-scroller");
      const content = document.querySelector(".cm-content");
      const active = document.querySelector(".cm-activeLine");
      if (!scroller || !content || !active) {
        return null;
      }
      const activeTop = active.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      return { scrollTop: scroller.scrollTop, viewport: scroller.clientHeight, activeTop };
    });
    expect(pinned).not.toBeNull();
    expect(pinned.scrollTop).toBeGreaterThan(200);
    expect(Math.abs(pinned.activeTop - pinned.viewport / 3)).toBeLessThan(12);
  } finally {
    await stopApp(first.app);
  }

  // The toggles persist across a restart.
  const second = await launch();
  try {
    await expect(second.window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });
    await second.window.locator("#open-settings").click();
    await expect(second.window.locator("#settings-typewriter-scrolling")).toBeChecked();
    await expect(second.window.locator("#settings-paragraph-dimming")).toBeChecked();
    await second.window.locator("#close-settings").click();
    // And dimming is live again after the restart. The restored editor
    // reopens scrolled where the typing happened, so return to the top
    // before reaching for a specific paragraph (CM only renders what is
    // near the viewport).
    await second.window.locator(".cm-content").click();
    await second.window.keyboard.press("Control+Home");
    await second.window.locator(".cm-line", { hasText: "Paragraph 10" }).click();
    await expect(second.window.locator(".cm-paragraph-dim", { hasText: "Paragraph 9" })).toHaveCount(1, { timeout: 5_000 });
  } finally {
    await stopApp(second.app);
  }
});

test("a command-line launch merges into the restored session without losing content", async () => {
  const docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-bootmerge-docs-"));
  const docPath = path.join(docsDir, "bootmerge.adoc");
  await fs.writeFile(docPath, "= Boot Merge\n\nreal document content from disk\n");

  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), "adoc-e2e-bootmerge-profile-"));
  const launch = () => launchApp(profileDir, null, [docPath]);

  // First launch opens the document from the command line.
  const first = await launch();
  try {
    await expect(first.window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });
    await expect(first.window.locator(".cm-content")).toContainText("real document content from disk");
  } finally {
    await stopApp(first.app);
  }

  // Second launch passes the same path again while the persisted session
  // already contains that document: the tab must activate with the real
  // content, not the boot editor's default state.
  const second = await launch();
  try {
    await expect(second.window.locator(".cm-content")).toBeVisible({ timeout: 20_000 });
    await expect(second.window.locator(".cm-content")).toContainText("real document content from disk");
    await expect(second.window.locator(".cm-content")).not.toContainText("Start writing...");
  } finally {
    await stopApp(second.app);
  }
});
