import test from "node:test";
import assert from "node:assert/strict";
import { buildPaletteItems, fuzzyScore } from "../src/command-palette.js";
import { KEBAB_LAYOUT, MENU_LAYOUT } from "../src/app-menu.js";

test("fuzzyScore rejects non-matching queries", () => {
  assert.equal(fuzzyScore("xyz", "Save document"), -1);
  assert.equal(fuzzyScore("savez", "Save"), -1);
});

test("fuzzyScore matches case-insensitively and ranks word starts higher", () => {
  assert.ok(fuzzyScore("save", "Save document") > 0);
  // "sd" hits the word starts of "Save document" and must beat a
  // subsequence spread across random positions in a longer label.
  assert.ok(fuzzyScore("sd", "Save document") > fuzzyScore("sd", "search workspace directories"));
});

test("fuzzyScore gives the empty query a neutral positive score", () => {
  assert.ok(fuzzyScore("", "Anything") > 0);
});

test("buildPaletteItems filters, ranks, and caps candidates", () => {
  const candidates = [
    { label: "New document" },
    { label: "Open settings" },
    { label: "Save document" },
    { label: "Search workspace contents" },
    { label: "Go to tab — notes.adoc" }
  ];

  // "se" is a subsequence of three labels; word-start matches and the
  // length penalty decide the order. "New document" and the notes tab
  // do not contain the subsequence at all.
  const items = buildPaletteItems("se", candidates);
  assert.deepEqual(items.map((item) => item.label), [
    "Open settings",
    "Search workspace contents",
    "Save document"
  ]);

  // "sw" matches only the workspace entry.
  const workspace = buildPaletteItems("sw", candidates);
  assert.deepEqual(workspace.map((item) => item.label), ["Search workspace contents"]);

  // The cap keeps huge candidate lists renderable.
  const many = Array.from({ length: 100 }, (_, index) => ({ label: `Action ${index}` }));
  assert.ok(buildPaletteItems("", many).length <= 40);
});

test("every kebab entry exists in the shared menu layout", () => {
  const menuIds = new Set();
  for (const section of MENU_LAYOUT) {
    for (const item of section.items) {
      if (item !== "separator") {
        menuIds.add(item);
      }
    }
  }

  for (const entry of KEBAB_LAYOUT) {
    if (entry !== "separator") {
      assert.ok(menuIds.has(entry), `kebab entry "${entry}" is missing from the native menu`);
    }
  }
});
