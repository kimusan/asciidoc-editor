import assert from "node:assert";
import { test } from "node:test";
import { findTableRange, formatAsciiDocTable } from "../src/table-format.js";

test("formatAsciiDocTable pads ragged cells to aligned columns", () => {
  const lines = [
    "= Doc",
    "",
    "|===",
    "| Name | Qty |",
    "| Widget | 2 |",
    "| Gadget with a long name | 42 |",
    "|===",
    ""
  ];

  const result = formatAsciiDocTable(lines, 4);
  assert.deepEqual(result.lines, [
    "|===",
    "| Name                    | Qty",
    "| Widget                  | 2",
    "| Gadget with a long name | 42",
    "|==="
  ]);
  assert.deepEqual({ startIndex: result.startIndex, endIndex: result.endIndex }, { startIndex: 2, endIndex: 6 });
});

test("formatAsciiDocTable passes blank and single-cell lines through untouched", () => {
  const lines = [
    "|===",
    "| only cell",
    "",
    "| a | b |",
    "|===",
    "after"
  ];

  const result = formatAsciiDocTable(lines, 3);
  assert.equal(result.lines[1], "| only cell");
  assert.equal(result.lines[2], "");
  assert.equal(result.lines[3], "| a | b");
});

test("formatAsciiDocTable ignores a stray row with a different cell count", () => {
  const lines = [
    "|===",
    "| a | b |",
    "| lone |",
    "| longer cell | b |",
    "|==="
  ];

  const result = formatAsciiDocTable(lines, 2);
  // The modal arity is 2; the single-cell row is real content and passes
  // through unchanged rather than being forced into the column grid.
  assert.equal(result.lines[2], "| lone |");
  assert.equal(result.lines[1], "| a           | b");
  assert.equal(result.lines[3], "| longer cell | b");
});

test("formatAsciiDocTable preserves row indentation", () => {
  const lines = [
    "|===",
    "  | a | bb |",
    "  | ccc | d |",
    "|==="
  ];

  const result = formatAsciiDocTable(lines, 1);
  assert.equal(result.lines[1], "  | a   | bb");
  assert.equal(result.lines[2], "  | ccc | d");
});

test("formatAsciiDocTable returns null outside a table or with nothing to align", () => {
  const lines = [
    "plain text",
    "| single cell, no fence",
    "|===",
    "| only |",
    "|==="
  ];

  assert.equal(formatAsciiDocTable(lines, 0), null);
  assert.equal(formatAsciiDocTable(lines, 1), null);
  assert.equal(formatAsciiDocTable(lines, 3), null);
  assert.equal(formatAsciiDocTable(["|=== never closed", "| a | b |"], 1), null);
  assert.equal(formatAsciiDocTable([], 0), null);
  assert.equal(formatAsciiDocTable(["|===", "| a | b |", "|==="], 5), null);
});

test("findTableRange locates the enclosing fences", () => {
  const lines = ["|===", "| a |", "|===", "|===", "| b |", "|==="];
  assert.deepEqual(findTableRange(lines, 1), { startIndex: 0, endIndex: 2 });
  assert.deepEqual(findTableRange(lines, 4), { startIndex: 3, endIndex: 5 });
  // A cursor on a fence formats the table it encloses: the opening fence
  // takes the table below, the closing fence the table above.
  assert.deepEqual(findTableRange(lines, 0), { startIndex: 0, endIndex: 2 });
  assert.deepEqual(findTableRange(lines, 2), { startIndex: 0, endIndex: 2 });
  assert.deepEqual(findTableRange(lines, 5), { startIndex: 3, endIndex: 5 });
  // Adjacent fences: the empty region above loses to the table below.
  assert.deepEqual(findTableRange(lines, 3), { startIndex: 3, endIndex: 5 });
  assert.equal(findTableRange(["|=== alone", "text"], 0), null);
});
