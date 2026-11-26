import test from "node:test";
import assert from "node:assert/strict";
import {
  SNIPPET_CURSOR_MARKER,
  STARTER_SNIPPETS,
  normalizeSnippets,
  splitSnippetBody,
  matchSnippetWord,
  buildSnippetCompletionOptions
} from "../electron/snippets.js";

test("normalizeSnippets keeps valid entries and trims names", () => {
  const snippets = normalizeSnippets([
    { name: "  note  ", body: "[NOTE]\n" },
    { name: "tip", body: "[TIP]\n", detail: "  a tip  " }
  ]);
  assert.deepEqual(snippets, [
    { name: "note", body: "[NOTE]\n", detail: null },
    { name: "tip", body: "[TIP]\n", detail: "a tip" }
  ]);
});

test("normalizeSnippets drops junk without throwing", () => {
  assert.deepEqual(normalizeSnippets(null), []);
  assert.deepEqual(normalizeSnippets("nope"), []);
  assert.deepEqual(normalizeSnippets([
    null,
    42,
    "string",
    { name: "", body: "x" },
    { name: "no-body" },
    { name: "ok", body: "fine" },
    { name: ["array", "name"], body: "x" }
  ]), [{ name: "ok", body: "fine", detail: null }]);
});

test("normalizeSnippets keeps the first of duplicate names", () => {
  const snippets = normalizeSnippets([
    { name: "sig", body: "first" },
    { name: "sig", body: "second" }
  ]);
  assert.equal(snippets.length, 1);
  assert.equal(snippets[0].body, "first");
});

test("splitSnippetBody places the cursor on the marker and strips it", () => {
  const body = `[NOTE]\n====\n${SNIPPET_CURSOR_MARKER}\n====\n`;
  const { insert, cursorOffset } = splitSnippetBody(body);
  assert.equal(insert, "[NOTE]\n====\n\n====\n");
  assert.equal(insert.slice(cursorOffset, cursorOffset + 1), "\n");
  assert.equal(cursorOffset, "[NOTE]\n====\n".length);
});

test("splitSnippetBody without a marker puts the cursor at the end", () => {
  const { insert, cursorOffset } = splitSnippetBody("[TIP]\n");
  assert.equal(insert, "[TIP]\n");
  assert.equal(cursorOffset, insert.length);
});

test("matchSnippetWord reads the trailing word", () => {
  assert.equal(matchSnippetWord("hello si"), "si");
  assert.equal(matchSnippetWord("sig-nature_2"), "sig-nature_2");
  assert.equal(matchSnippetWord("plain text "), "");
  assert.equal(matchSnippetWord(""), "");
});

test("buildSnippetCompletionOptions filters by prefix case-insensitively", () => {
  const snippets = [
    { name: "Changelog", body: "= Changelog\n", detail: "release notes", scope: "global" },
    { name: "note", body: "[NOTE]\n", scope: "project" },
    { name: "tip", body: "[TIP]\n", scope: "global" }
  ];
  const options = buildSnippetCompletionOptions(snippets, "chan");
  assert.equal(options.length, 1);
  assert.equal(options[0].label, "Changelog");
  assert.equal(options[0].detail, "release notes · snippet");

  const all = buildSnippetCompletionOptions(snippets, "");
  assert.equal(all.length, 3);
  assert.equal(all[1].detail, "project snippet");

  assert.deepEqual(buildSnippetCompletionOptions(snippets, "zzz"), []);
});

test("buildSnippetCompletionOptions carries the cursor placement", () => {
  const options = buildSnippetCompletionOptions(
    [{ name: "note", body: `====\n${SNIPPET_CURSOR_MARKER}\n====`, scope: "global" }],
    "note"
  );
  assert.equal(options[0].insert, "====\n\n====");
  assert.equal(options[0].cursorOffset, "====\n".length);
});

test("STARTER_SNIPPETS is valid and uses the marker", () => {
  assert.ok(STARTER_SNIPPETS.length >= 2);
  for (const snippet of normalizeSnippets(STARTER_SNIPPETS)) {
    assert.ok(snippet.body.includes(SNIPPET_CURSOR_MARKER));
  }
  // The starter must survive its own normalization untouched.
  assert.deepEqual(normalizeSnippets(STARTER_SNIPPETS), STARTER_SNIPPETS);
});
