import test from "node:test";
import assert from "node:assert/strict";
import {
  findCompletionContext,
  buildBlockAttributeOptions,
  buildSourceLanguageOptions,
  buildDocumentAttributeOptions,
  buildSectionLevelOptions,
  buildMacroOptions,
  buildAttributeReferenceOptions,
  collectDocumentAttributeNames
} from "../src/asciidoc-completion.js";

test("findCompletionContext recognizes block attribute lists", () => {
  const match = findCompletionContext("[sou");
  assert.equal(match.type, "blockAttribute");
  assert.equal(match.from, 0);
  assert.ok(match.options.some((option) => option.label === "[source]"));

  // Nested [[anchor]] syntax must not trigger block attribute options.
  assert.equal(findCompletionContext("[["), null);
  assert.equal(findCompletionContext("[[block-id"), null);
});

test("findCompletionContext offers languages after [source,", () => {
  const match = findCompletionContext("[source,js");
  assert.equal(match.type, "sourceLanguage");
  assert.equal(match.from, "[source,".length);
  assert.ok(match.options.some((option) => option.label === "javascript"));

  const empty = findCompletionContext("[listing,");
  assert.equal(empty.type, "sourceLanguage");
  assert.equal(empty.from, "[listing,".length);
});

test("findCompletionContext recognizes document attribute entries", () => {
  const match = findCompletionContext(":toc");
  assert.equal(match.type, "documentAttribute");
  assert.equal(match.from, 0);
  assert.ok(match.options.some((option) => option.label === ":toc:"));

  // A completed entry or a value on the line stops the popup.
  assert.equal(findCompletionContext(":toc:"), null);
  assert.equal(findCompletionContext(":lang: en"), null);
});

test("findCompletionContext recognizes section level markers", () => {
  const match = findCompletionContext("==");
  assert.equal(match.type, "sectionLevel");
  assert.equal(match.from, 0);
  assert.ok(match.options.some((option) => option.label === "== "));

  // A heading with a title typed already must not trigger.
  assert.equal(findCompletionContext("== Section"), null);
});

test("findCompletionContext recognizes attribute references", () => {
  const match = findCompletionContext("See {url-dev");
  assert.equal(match.type, "attributeReference");
  assert.equal(match.from, "See ".length);

  const atStart = findCompletionContext("{");
  assert.equal(atStart.type, "attributeReference");
  assert.equal(atStart.from, 0);
});

test("findCompletionContext recognizes known macros after the colon", () => {
  const inline = findCompletionContext("see xref:");
  assert.equal(inline.type, "macro");
  assert.equal(inline.from, "see ".length);
  assert.ok(inline.options.some((option) => option.label === "xref:[]"));

  const block = findCompletionContext("include:");
  assert.equal(block.type, "macro");
  assert.equal(block.from, 0);

  // Block macros only complete at the line start.
  assert.equal(findCompletionContext("text include:"), null);
  // Prose colons never trigger.
  assert.equal(findCompletionContext("Note:"), null);
  assert.equal(findCompletionContext("At 12:30"), null);
});

test("findCompletionContext ignores normal prose", () => {
  assert.equal(findCompletionContext("The Wolpertingers roam Antwerp."), null);
  assert.equal(findCompletionContext("A [bracket] mid-sentence"), null);
  assert.equal(findCompletionContext("= equals in prose"), null);
});

test("block attribute options carry fenced templates with body cursor", () => {
  const source = buildBlockAttributeOptions().find((option) => option.label === "[source]");
  assert.equal(source.insert, "[source]\n----\n\n----");
  // Cursor sits on the empty line between the fences.
  assert.equal(
    source.cursorOffset,
    "[source]\n----\n".length
  );
});

test("source language options close the attribute list", () => {
  const js = buildSourceLanguageOptions().find((option) => option.label === "javascript");
  assert.equal(js.insert, "javascript]");
});

test("document attribute and section options are self-contained", () => {
  const toc = buildDocumentAttributeOptions().find((option) => option.label === ":toc:");
  assert.equal(toc.insert, ":toc:");
  const level = buildSectionLevelOptions().find((option) => option.label === "=== ");
  assert.equal(level.insert, "=== ");
});

test("macro options place the cursor before the closing bracket", () => {
  const include = buildMacroOptions().find((option) => option.label.startsWith("include::"));
  assert.equal(include.insert, "include::[]");
  assert.equal(include.cursorOffset, include.insert.length - 1);
  const xref = buildMacroOptions().find((option) => option.label.startsWith("xref:"));
  assert.equal(xref.insert, "xref:[]");
  assert.equal(xref.cursorOffset, xref.insert.length - 1);
});

test("attribute references complete document-defined and builtin attributes", () => {
  const names = collectDocumentAttributeNames([
    ":url-devoxx: https://devoxx.be",
    ":doctype: book",
    "prose line",
    ":toc:"
  ]);
  assert.ok(names.includes("url-devoxx"));
  assert.ok(names.includes("doctype"));
  assert.ok(names.includes("toc"));
  assert.ok(names.includes("docname"));

  const options = buildAttributeReferenceOptions(names);
  const urlOption = options.find((option) => option.label === "{url-devoxx}");
  assert.equal(urlOption.insert, "{url-devoxx}");
});
