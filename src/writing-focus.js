// Typewriter scrolling and paragraph-focus dimming, the two "writing focus"
// editor behaviors. Both are plain CodeMirror extensions configured through
// a Compartment in src/main.js (writingFocusCompartment), driven by the
// persisted settings typewriterScrolling and paragraphFocusDimming.
//
// The pure helpers are exported for unit tests and must not touch window
// or the DOM.

import { ViewPlugin, Decoration } from "@codemirror/view";

// Where the typing line sits inside the editor viewport: one third from
// the top, the classic typewriter position.
export const TYPEWRITER_CURSOR_FRACTION = 1 / 3;

// Pure: the scroll position that puts cursorTop (content coordinates,
// unaffected by the current scroll) at fraction of the viewport height.
export function computeTypewriterScrollTop(cursorTop, viewportHeight, fraction = TYPEWRITER_CURSOR_FRACTION) {
  return Math.max(0, cursorTop - viewportHeight * fraction);
}

// Pure: the paragraph (maximal run of non-blank lines) containing the given
// 1-based line number. Returns { startLine, endLine } inclusive, or null
// when the line is blank or out of range.
export function findParagraphRange(doc, lineNumber) {
  if (typeof doc !== "object" || doc === null || !Number.isInteger(lineNumber) || lineNumber < 1 || lineNumber > doc.lines) {
    return null;
  }

  if (doc.line(lineNumber).text.trim() === "") {
    return null;
  }

  let startLine = lineNumber;
  while (startLine > 1 && doc.line(startLine - 1).text.trim() !== "") {
    startLine -= 1;
  }

  let endLine = lineNumber;
  while (endLine < doc.lines && doc.line(endLine + 1).text.trim() !== "") {
    endLine += 1;
  }

  return { startLine, endLine };
}

export function typewriterScrolling() {
  return ViewPlugin.fromClass(class {
    // Never scroll on construction: state swaps (tab switches, document
    // application) recreate the plugin and must not yank the viewport.
    constructor() {}

    update(update) {
      if (!update.docChanged) {
        return;
      }

      const view = update.view;
      const pos = view.state.selection.main.head;
      let block;
      try {
        block = view.lineBlockAt(pos);
      } catch {
        return;
      }

      const scroller = view.scrollDOM;
      const nextScrollTop = computeTypewriterScrollTop(block.top, scroller.clientHeight);
      if (Math.abs(scroller.scrollTop - nextScrollTop) > 1) {
        scroller.scrollTop = nextScrollTop;
      }
    }
  });
}

export function paragraphFocusDimming() {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = this.build(view);
    }

    update(update) {
      if (!update.docChanged && !update.selectionSet && !update.viewportChanged) {
        return;
      }
      this.decorations = this.build(update.view);
    }

    build(view) {
      const state = view.state;
      const cursorLine = state.doc.lineAt(state.selection.main.head).number;
      const activeRange = findParagraphRange(state.doc, cursorLine);

      const builder = [];
      for (const { from, to } of view.visibleRanges) {
        let lineNumber = state.doc.lineAt(from).number;
        const lastLine = state.doc.lineAt(to).number;
        for (; lineNumber <= lastLine; lineNumber++) {
          if (activeRange && lineNumber >= activeRange.startLine && lineNumber <= activeRange.endLine) {
            continue;
          }
          const line = state.doc.line(lineNumber);
          if (line.text.trim() === "") {
            continue;
          }
          builder.push(Decoration.line({ class: "cm-paragraph-dim" }).range(line.from));
        }
      }

      this.decorations = Decoration.set(builder, true);
      return this.decorations;
    }
  }, {
    decorations: (instance) => instance.decorations
  });
}
