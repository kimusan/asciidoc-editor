import test from "node:test";
import assert from "node:assert/strict";
import { extractCheckableWords, findWordAt, overlapsSpan } from "../src/spell-check.js";

test("extractCheckableWords returns prose words with absolute positions", () => {
  const doc = "The qwick brwn fox";
  const words = extractCheckableWords(doc, 0, doc.length, []);
  assert.deepEqual(words.map((entry) => entry.word), ["The", "qwick", "brwn", "fox"]);
  assert.deepEqual(words[1], { word: "qwick", from: 4, to: 9 });
});

test("extractCheckableWords honors the slice offset", () => {
  const doc = "heading\n\nThe qwick fox";
  const words = extractCheckableWords(doc, 9, doc.length, []);
  assert.deepEqual(words.map((entry) => entry.word), ["The", "qwick", "fox"]);
  assert.equal(words[0].from, 9);
});

test("extractCheckableWords skips words inside skip spans", () => {
  const doc = "prose qwick [source,js] more prose";
  // "[source,js]" spans offsets 12..23 in the document.
  const spans = [{ from: 12, to: 23 }];
  const words = extractCheckableWords(doc, 0, doc.length, spans);
  assert.deepEqual(words.map((entry) => entry.word), ["prose", "qwick", "more", "prose"]);
});

test("extractCheckableWords keeps apostrophes and hyphens inside a word", () => {
  const doc = "don't mis-check it's";
  const words = extractCheckableWords(doc, 0, doc.length, []);
  assert.deepEqual(words.map((entry) => entry.word), ["don't", "mis-check", "it's"]);
});

test("extractCheckableWords ignores single letters and digit runs", () => {
  const doc = "a I 42 x2b end";
  const words = extractCheckableWords(doc, 0, doc.length, []);
  assert.deepEqual(words.map((entry) => entry.word), ["end"]);
});

test("overlapsSpan matches overlaps but not adjacent ranges", () => {
  const spans = [{ from: 10, to: 20 }, { from: 30, to: 40 }];
  assert.equal(overlapsSpan(5, 10, spans), false);
  assert.equal(overlapsSpan(5, 11, spans), true);
  assert.equal(overlapsSpan(15, 18, spans), true);
  assert.equal(overlapsSpan(20, 25, spans), false);
  assert.equal(overlapsSpan(35, 45, spans), true);
  assert.equal(overlapsSpan(45, 50, spans), false);
});

test("findWordAt finds the word touching a position", () => {
  const doc = "The qwick fox";
  assert.deepEqual(findWordAt(doc, 6), { word: "qwick", from: 4, to: 9 });
  assert.deepEqual(findWordAt(doc, 4), { word: "qwick", from: 4, to: 9 });
  assert.deepEqual(findWordAt(doc, 9), { word: "qwick", from: 4, to: 9 });
  assert.deepEqual(findWordAt(doc, 1), { word: "The", from: 0, to: 3 });
});

test("findWordAt spans apostrophes and returns null off words", () => {
  const doc = "it's, fine";
  assert.deepEqual(findWordAt(doc, 2), { word: "it's", from: 0, to: 4 });
  assert.equal(findWordAt(doc, 5), null);
  assert.deepEqual(findWordAt(doc, 7), { word: "fine", from: 6, to: 10 });
});
