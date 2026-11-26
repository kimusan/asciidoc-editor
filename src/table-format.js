// Pipe-table reformatting for the editor: pads every cell to its column's
// widest content so a ragged table snaps into alignment. Pure string logic,
// unit-tested; the editor command maps the result back onto the document.

const TABLE_DELIMITER = /^\s*\|={3,}\s*$/;

function isTableBoundary(line) {
  return TABLE_DELIMITER.test(line ?? "");
}

function displayWidth(value) {
  return [...String(value)].length;
}

// A pipe-table row starts with a cell pipe; each cell runs to the next
// pipe. Cells are trimmed. The trailing pipe is optional in AsciiDoc, so a
// trailing empty cell (split artifact) is dropped. Returns null for lines
// that are not rows. (Escaped pipes inside cells are not unescaped here -
// a formatter pass that splits on the raw pipe is what the writer sees
// anyway.)
function splitCells(line) {
  const match = /^\s*\|(.*)$/.exec(line ?? "");
  if (!match) {
    return null;
  }

  const cells = match[1].split("|").map((cell) => cell.trim());
  if (cells.length > 1 && cells[cells.length - 1] === "") {
    cells.pop();
  }

  return cells;
}

// Locates the |=== ... |=== region around `activeIndex` (0-based line
// index). Returns { startIndex, endIndex } inclusive, or null when the
// cursor is not inside a fenced table.
export function findTableRange(lines, activeIndex) {
  if (!Array.isArray(lines) || !Number.isInteger(activeIndex) || activeIndex < 0 || activeIndex >= lines.length) {
    return null;
  }

  // A cursor on a fence line formats the table it encloses. Prefer the
  // table above (the cursor is on its closing fence) unless that region
  // would be empty, then the table below.
  if (isTableBoundary(lines[activeIndex])) {
    for (let index = activeIndex - 1; index >= 0; index--) {
      if (isTableBoundary(lines[index])) {
        if (activeIndex - index > 1) {
          return { startIndex: index, endIndex: activeIndex };
        }
        break;
      }
    }

    for (let index = activeIndex + 1; index < lines.length; index++) {
      if (isTableBoundary(lines[index])) {
        return { startIndex: activeIndex, endIndex: index };
      }
    }

    return null;
  }

  let startIndex = -1;
  for (let index = activeIndex; index >= 0; index--) {
    if (isTableBoundary(lines[index])) {
      startIndex = index;
      break;
    }
  }

  if (startIndex === -1) {
    return null;
  }

  let endIndex = -1;
  for (let index = activeIndex + 1; index < lines.length; index++) {
    if (isTableBoundary(lines[index])) {
      endIndex = index;
      break;
    }
  }

  if (endIndex === -1) {
    return null;
  }

  return { startIndex, endIndex };
}

// Realigns the multi-cell rows between the fences: every column is padded
// to its widest cell and cells rejoin as "| a | b". Rows that are not
// multi-cell pipe rows (blank lines, single-cell rows) pass through
// untouched. Column widths come only from rows sharing the modal cell
// count, so one stray row cannot stretch or shrink the layout. Returns
// { startIndex, endIndex, lines } (replacement for the whole region), or
// null when there is nothing to align.
export function formatAsciiDocTable(lines, activeIndex) {
  const range = findTableRange(lines, activeIndex);
  if (!range) {
    return null;
  }

  const cellRows = [];
  for (let index = range.startIndex + 1; index < range.endIndex; index++) {
    const line = lines[index] ?? "";
    const cells = splitCells(line);
    if (cells && cells.length >= 2) {
      cellRows.push({ index, cells, indent: /^\s*/.exec(line)[0] });
    }
  }

  if (cellRows.length === 0) {
    return null;
  }

  const arityCounts = new Map();
  for (const row of cellRows) {
    arityCounts.set(row.cells.length, (arityCounts.get(row.cells.length) ?? 0) + 1);
  }
  const modalArity = [...arityCounts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];

  const widths = new Array(modalArity).fill(0);
  for (const row of cellRows) {
    if (row.cells.length !== modalArity) {
      continue;
    }

    row.cells.forEach((cell, column) => {
      widths[column] = Math.max(widths[column], displayWidth(cell));
    });
  }

  const formatted = new Map();
  for (const row of cellRows) {
    if (row.cells.length !== modalArity) {
      continue;
    }

    // Every column pads to its width except the last: trailing padding
    // would only add dirty-diff whitespace on every row.
    const padded = row.cells.map((cell, column) =>
      column === row.cells.length - 1 ? cell : cell.padEnd(widths[column], " "));
    formatted.set(row.index, `${row.indent}| ${padded.join(" | ")}`);
  }

  const replacementLines = [];
  for (let index = range.startIndex; index <= range.endIndex; index++) {
    replacementLines.push(formatted.get(index) ?? lines[index]);
  }

  return { ...range, lines: replacementLines };
}
