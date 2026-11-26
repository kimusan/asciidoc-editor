import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import {
  TYPEWRITER_CURSOR_FRACTION,
  computeTypewriterScrollTop,
  findParagraphRange
} from "../src/writing-focus.js";

test("computeTypewriterScrollTop pins the cursor line at the fraction", () => {
  // 600px viewport, cursor block at 900px: one third from the top = 200px
  // scroll so the line lands at 700px.
  assert.equal(computeTypewriterScrollTop(900, 600), 900 - 600 / 3);
  assert.equal(TYPEWRITER_CURSOR_FRACTION, 1 / 3);
});

test("computeTypewriterScrollTop never scrolls above the top", () => {
  assert.equal(computeTypewriterScrollTop(100, 900), 0);
  assert.equal(computeTypewriterScrollTop(0, 600), 0);
});

test("findParagraphRange expands across contiguous non-blank lines", () => {
  const doc = EditorState.create({
    doc: "one\ntwo\n\nthree\n\n\nfour\nfive\nsix"
  }).doc;
  assert.deepEqual(findParagraphRange(doc, 1), { startLine: 1, endLine: 2 });
  assert.deepEqual(findParagraphRange(doc, 2), { startLine: 1, endLine: 2 });
  assert.deepEqual(findParagraphRange(doc, 4), { startLine: 4, endLine: 4 });
  assert.deepEqual(findParagraphRange(doc, 7), { startLine: 7, endLine: 9 });
  assert.deepEqual(findParagraphRange(doc, 9), { startLine: 7, endLine: 9 });
});

test("findParagraphRange treats whitespace-only lines as separators", () => {
  const doc = EditorState.create({ doc: "a\n   \nb" }).doc;
  assert.deepEqual(findParagraphRange(doc, 1), { startLine: 1, endLine: 1 });
  assert.equal(findParagraphRange(doc, 2), null);
  assert.deepEqual(findParagraphRange(doc, 3), { startLine: 3, endLine: 3 });
});

test("findParagraphRange rejects blank and out-of-range lines", () => {
  const doc = EditorState.create({ doc: "\n\nhello" }).doc;
  assert.equal(findParagraphRange(doc, 1), null);
  assert.equal(findParagraphRange(doc, 0), null);
  assert.equal(findParagraphRange(doc, 4), null);
  assert.equal(findParagraphRange(doc, -1), null);
  assert.deepEqual(findParagraphRange(doc, 3), { startLine: 3, endLine: 3 });
});
