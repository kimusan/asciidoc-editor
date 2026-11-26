// README screenshot staging (verified recipe, see the memory notes):
// launch with the demo document via argv, isolate the profile with
// --user-data-dir (an ad-hoc launch without it pollutes the real
// ~/.config profile), resize via BrowserWindow.setBounds (the
// --window-size flag is overridden by the app's BrowserWindow options),
// remove the #chrome-hint before its timer fires, jump the cursor with
// the in-editor search so both panels show mid-document content, then
// capture the full window content.
//
// Usage: node scripts/readme-shots.mjs
// Requires a fresh renderer build (npx vite build).

import { _electron as electron } from "@playwright/test";
import fsp from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import git from "isomorphic-git";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS_DIR = path.join(PROJECT_ROOT, "assets");
const DEMO_DIR = "/tmp/asciidoc-demo";
const AUTHOR = { name: "Kim Schulz", email: "kim@schulz.dk" };

const GETTING_STARTED = `= AsciiDoc Editor
Kim Schulz <kim@schulz.dk>
:description: A short tour of the editor and its live preview
:icons: font

An AsciiDoc document with the pieces writers reach for most, rendered
live while you type.

== Text and admonitions

NOTE: The preview follows the cursor -- scroll sync keeps the rendered
section in view while you write.

TIP: Press Ctrl+K to open the command palette.

== Source with callouts

[source, javascript]
----
const editor = await loadEditor();  // <1>
editor.setSpellCheck("en-US");      // <2>
----

<1> Everything is local -- no cloud, no telemetry.
<2> Spell check ships with downloadable language packs.

== Tables

|===
| Feature | Status | Notes

| Live preview | Ready | Two-way scroll sync
| Spell check | Ready | Multi-language packs
| Git status | Ready | Badges in the workspace tree
|===

== Diagrams

[mermaid]
....
graph LR
  Write --> Preview --> Export
  Preview --> Sync
....

== Wrap-up

Export to HTML, PDF, or DocBook when the draft is done.
`;

const RELEASE_NOTES_ORIGINAL = `= Release Notes
Kim Schulz <kim@schulz.dk>

== 0.9.0

First public notes draft.

* Live preview
* Command palette
* Themes
`;

const RELEASE_NOTES_MODIFIED = `= Release Notes
Kim Schulz <kim+schulz.dk>

== 1.0.0

First stable release.

* Git integration: status badges, diff view, and a commit panel
* Spell checking with downloadable language packs
* Snippets, Mermaid diagrams, and paginated PDF export
* Typewriter scrolling and writing-focus modes
`;

async function stageDemoWorkspace() {
  await fsp.rm(DEMO_DIR, { recursive: true, force: true });
  await fsp.mkdir(path.join(DEMO_DIR, "drafts"), { recursive: true });

  await fsp.writeFile(path.join(DEMO_DIR, "getting-started.adoc"), GETTING_STARTED);
  await fsp.writeFile(path.join(DEMO_DIR, "release-notes.adoc"), RELEASE_NOTES_ORIGINAL);
  await fsp.writeFile(path.join(DEMO_DIR, ".gitignore"), "build/\n");

  await git.init({ fs, dir: DEMO_DIR });
  for (const name of ["getting-started.adoc", "release-notes.adoc", ".gitignore"]) {
    await git.add({ fs, dir: DEMO_DIR, filepath: name });
  }
  await git.commit({ fs, dir: DEMO_DIR, message: "Initial demo content", author: AUTHOR });

  // Post-commit state for the tree badges and the commit/diff shots:
  // a modified + staged file (M, Staged section), and an untracked file
  // under drafts/ (U badge + dirty-folder dot).
  await fsp.writeFile(path.join(DEMO_DIR, "release-notes.adoc"), RELEASE_NOTES_MODIFIED);
  await fsp.writeFile(path.join(DEMO_DIR, "drafts", "ideas.adoc"), "= Ideas\n\n* Blame view\n* Branch switcher\n");
  await git.add({ fs, dir: DEMO_DIR, filepath: "release-notes.adoc" });
}

async function launchDemo(profileDir, stateSeed, documentPath) {
  await fsp.mkdir(profileDir, { recursive: true });
  if (stateSeed) {
    await fsp.writeFile(path.join(profileDir, "state.json"), JSON.stringify(stateSeed));
  }

  const app = await electron.launch({
    args: [PROJECT_ROOT, documentPath, `--user-data-dir=${profileDir}`]
  });
  const window = await app.firstWindow();
  await window.waitForSelector(".cm-content", { timeout: 20_000 });

  // The chrome-hint toast fires a few seconds after boot; remove the
  // element before its timer can photobomb the shot.
  await window.evaluate(() => document.querySelector("#chrome-hint")?.remove());

  // A roomier window than the 1560x998 default reads better in the README.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setBounds({ width: 1680, height: 1020 });
  });
  await window.waitForTimeout(400);
  return { app, window };
}

async function waitForPreview(window, marker) {
  await window.waitForFunction(
    (text) => document.querySelector("#preview-frame")?.contentDocument?.body?.textContent?.includes(text),
    marker,
    { timeout: 20_000 }
  );
}

async function removeHintAgain(window) {
  await window.evaluate(() => document.querySelector("#chrome-hint")?.remove());
}

async function jumpCursorTo(window, searchTerm) {
  // In-editor search + Enter jumps the cursor to the first match, which
  // also scrolls the preview via the sync anchor. Escape closes the
  // search again so it stays out of the shot.
  await window.keyboard.press("Control+f");
  await window.keyboard.type(searchTerm, { delay: 20 });
  await window.waitForTimeout(300);
  await window.keyboard.press("Enter");
  await window.waitForTimeout(300);
  await window.keyboard.press("Escape");
  await window.waitForTimeout(700);
}

async function main() {
  await stageDemoWorkspace();
  await fsp.mkdir(ASSETS_DIR, { recursive: true });

  // 1. Hero: default (nocturne) theme, dense tree with git badges,
  //    cursor mid-document so the preview shows the table + diagram.
  {
    const profile = await fsp.mkdtemp(path.join(os.tmpdir(), "adoc-shots-hero-"));
    const { app, window } = await launchDemo(profile, { autoCheckUpdates: false }, path.join(DEMO_DIR, "getting-started.adoc"));
    await waitForPreview(window, "Wrap-up");
    await jumpCursorTo(window, "Tables");
    await removeHintAgain(window);
    await window.screenshot({ path: path.join(ASSETS_DIR, "screenshot.png") });
    await app.close();
  }

  // 2. Git: commit panel (staged + unstaged sections with badges), then
  //    the diff view against HEAD, from one instance.
  {
    const profile = await fsp.mkdtemp(path.join(os.tmpdir(), "adoc-shots-git-"));
    const { app, window } = await launchDemo(profile, { autoCheckUpdates: false }, path.join(DEMO_DIR, "release-notes.adoc"));
    await waitForPreview(window, "stable release");

    await window.keyboard.press("Control+Shift+G");
    await window.waitForSelector("#commit-overlay.is-open");
    await window.locator("#commit-message").fill("Release 1.0.0");
    await window.waitForTimeout(500);
    await removeHintAgain(window);
    await window.screenshot({ path: path.join(ASSETS_DIR, "screenshot-git-commit.png") });
    await window.keyboard.press("Escape");
    await window.waitForTimeout(400);

    await window.keyboard.press("Control+Shift+D");
    await window.waitForSelector("#diff-overlay.is-open");
    await window.waitForSelector(".diff-line.is-removed");
    await window.waitForTimeout(400);
    await removeHintAgain(window);
    await window.screenshot({ path: path.join(ASSETS_DIR, "screenshot-git-diff.png") });
    await app.close();
  }

  // 3. Porcelain (light) theme: the same document, showing the app does
  //    light themes too. The theme is seeded via the profile's state.json.
  {
    const profile = await fsp.mkdtemp(path.join(os.tmpdir(), "adoc-shots-theme-"));
    const { app, window } = await launchDemo(
      profile,
      { autoCheckUpdates: false, theme: "porcelain" },
      path.join(DEMO_DIR, "getting-started.adoc")
    );
    await waitForPreview(window, "Wrap-up");
    await jumpCursorTo(window, "Tables");
    await removeHintAgain(window);
    await window.screenshot({ path: path.join(ASSETS_DIR, "screenshot-theme-porcelain.png") });
    await app.close();
  }

  console.log("shots written to assets/:");
  for (const name of fs.readdirSync(ASSETS_DIR)) {
    console.log(`  ${name} (${fs.statSync(path.join(ASSETS_DIR, name)).size} bytes)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
