// CodeMirror 6 spell check. Words are checked against the main-process
// hunspell dictionary (see electron/spell-service.js) and misspellings get
// a wavy cm-spell-error decoration. Only words inside the current viewport
// are checked, and ranges the AsciiDoc grammar flags as non-prose (code
// block bodies, comments, attribute lines, URLs, macros, inline code) are
// skipped, so source markup never lights up.
//
// The pure helpers (extractCheckableWords, findWordAt, overlapsSpan) are
// exported for unit tests and must not touch window or the DOM.

import { ViewPlugin, Decoration, EditorView } from "@codemirror/view";
import { StateEffect } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

// StreamLanguage token names from src/syntax/asciidoc-language.js whose
// ranges never contain prose: comments, code-block bodies ("string"),
// attribute lines, block delimiters, macro/marker keywords, inline code
// ("quote"), and URLs.
const SKIP_TOKENS = new Set([
  "comment",
  "attributeName",
  "keyword",
  "modifier",
  "string",
  "quote",
  "url"
]);

const WORD_CHARS = /[A-Za-z'’-]/;
const WORD_PATTERN = /[A-Za-z][A-Za-z'’-]*[A-Za-z]/g;
// Same shape without the /g flag: exec() on a shared global regex would
// inherit lastIndex from extractCheckableWords runs.
const WORD_MATCH = /[A-Za-z][A-Za-z'’-]*[A-Za-z]/;

// Dispatched after an async dictionary batch lands (or after a word is
// ignored/added) so the plugin rebuilds its decorations.
export const spellCheckRefreshEffect = StateEffect.define();

export function overlapsSpan(from, to, sortedSpans) {
  for (const span of sortedSpans) {
    if (span.from >= to) {
      return false;
    }
    if (from < span.to) {
      return true;
    }
  }
  return false;
}

// Every word in docText.slice(from, to) that does not overlap a skip span.
// sortedSpans must be sorted by span.from (collectSkipSpans guarantees it).
export function extractCheckableWords(docText, from, to, sortedSpans) {
  const words = [];
  const slice = docText.slice(from, to);
  WORD_PATTERN.lastIndex = 0;
  let match;
  while ((match = WORD_PATTERN.exec(slice))) {
    const wordFrom = from + match.index;
    const wordTo = wordFrom + match[0].length;
    if (!overlapsSpan(wordFrom, wordTo, sortedSpans)) {
      words.push({ word: match[0], from: wordFrom, to: wordTo });
    }
  }
  return words;
}

// The word (letters with internal apostrophes/hyphens) containing or
// touching `pos`, or null when there is none.
export function findWordAt(docText, pos) {
  if (pos < 0 || pos > docText.length) {
    return null;
  }

  let start = pos;
  let end = pos;
  while (start > 0 && WORD_CHARS.test(docText[start - 1])) {
    start -= 1;
  }
  while (end < docText.length && WORD_CHARS.test(docText[end])) {
    end += 1;
  }

  const candidate = docText.slice(start, end);
  const match = WORD_MATCH.exec(candidate);
  if (!match) {
    return null;
  }

  return {
    word: match[0],
    from: start + match.index,
    to: start + match.index + match[0].length
  };
}

function collectSkipSpans(state, view) {
  const spans = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (SKIP_TOKENS.has(node.name)) {
          spans.push({ from: node.from, to: node.to });
        }
      }
    });
  }
  spans.sort((a, b) => a.from - b.from);
  return spans;
}

// The wavy underline style lives in the theme palettes (src/themes.js
// createEditorTheme) so each theme picks its own error color.

let menuElement = null;

function closeSpellMenu() {
  if (menuElement) {
    menuElement.remove();
    menuElement = null;
    document.removeEventListener("mousedown", handleMenuDismiss, true);
  }
}

function handleMenuDismiss(event) {
  if (menuElement && !menuElement.contains(event.target)) {
    closeSpellMenu();
  }
}

function createMenuItem(label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "spell-menu-item";
  button.setAttribute("role", "menuitem");
  button.textContent = label;
  button.addEventListener("click", () => {
    void action();
  });
  return button;
}

export function isSpellMenuOpen() {
  return menuElement !== null;
}

function openSpellMenu(x, y, entry, view, options, cache) {
  closeSpellMenu();

  const menu = document.createElement("div");
  menu.className = "spell-menu";
  menu.setAttribute("role", "menu");
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeSpellMenu();
    }
  });

  const suggestionArea = document.createElement("div");
  suggestionArea.className = "spell-menu-suggestions";
  const loading = createMenuItem("Looking up suggestions…", () => {});
  loading.disabled = true;
  suggestionArea.appendChild(loading);
  menu.appendChild(suggestionArea);

  menu.appendChild(createMenuItem(`Add “${entry.word}” to dictionary`, async () => {
    closeSpellMenu();
    await options.addWord(entry.word);
    cache.set(entry.word, true);
    try {
      view.dispatch({ effects: spellCheckRefreshEffect.of(null) });
    } catch {
      // The view can be torn down while the menu handler runs.
    }
  }));

  menu.appendChild(createMenuItem("Ignore word", () => {
    closeSpellMenu();
    cache.set(entry.word, true);
    try {
      view.dispatch({ effects: spellCheckRefreshEffect.of(null) });
    } catch {
      // The view can be torn down while the menu handler runs.
    }
  }));

  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
  const top = y + rect.height + 12 > window.innerHeight
    ? Math.max(8, y - rect.height - 6)
    : y + 6;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menuElement = menu;
  document.addEventListener("mousedown", handleMenuDismiss, true);

  void options.suggest(entry.word).then((suggestions) => {
    if (menuElement !== menu) {
      return;
    }

    suggestionArea.replaceChildren();
    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      const none = createMenuItem("No suggestions", () => {});
      none.disabled = true;
      suggestionArea.appendChild(none);
    } else {
      for (const suggestion of suggestions) {
        suggestionArea.appendChild(createMenuItem(suggestion, () => {
          closeSpellMenu();
          try {
            view.dispatch({ changes: { from: entry.from, to: entry.to, insert: suggestion } });
          } catch {
            // The view can be torn down while the menu handler runs.
          }
        }));
      }
    }
    const firstItem = menu.querySelector(".spell-menu-item:not(:disabled)");
    firstItem?.focus();
  });
}

// options:
//   isEnabled: () => boolean       - gate from the persisted setting
//   checkWords: (words) => Promise<string[]>   - misspelled subset
//   suggest: (word) => Promise<string[]>
//   addWord: (word) => Promise
export function spellCheckExtension(options) {
  // word -> true (correct/ignored) | false (misspelled). Shared across every
  // open document so switching tabs never re-checks known words.
  const cache = new Map();
  const queued = new Set();
  let inflight = false;

  async function flushQueue(view) {
    inflight = true;
    try {
      while (queued.size > 0) {
        const batch = [...queued].slice(0, 500);
        for (const word of batch) {
          queued.delete(word);
        }
        const misspelled = new Set(await options.checkWords(batch));
        // cache semantics: true = correct/ignored, false = misspelled.
        for (const word of batch) {
          cache.set(word, !misspelled.has(word));
        }
      }
    } catch (error) {
      // Dictionary unavailable: mark the backlog as correct so unchecked
      // words are never underlined and the queue cannot grow unbounded.
      for (const word of queued) {
        cache.set(word, true);
      }
      queued.clear();
      console.warn("[spell-check] dictionary check failed:", error);
    } finally {
      inflight = false;
    }

    try {
      view.dispatch({ effects: spellCheckRefreshEffect.of(null) });
    } catch {
      // The view can be torn down while a batch is in flight.
    }
  }

  const plugin = ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = Decoration.none;
      this.schedule(view);
    }

    update(update) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.transactions.some((tr) => tr.effects.some((effect) => effect.is(spellCheckRefreshEffect)))
      ) {
        this.schedule(update.view);
      }
    }

    schedule(view) {
      if (!options.isEnabled()) {
        this.decorations = Decoration.none;
        return;
      }

      const state = view.state;
      const docText = state.doc.toString();
      const skipSpans = collectSkipSpans(state, view);
      const marks = [];
      const unknown = new Set();
      for (const { from, to } of view.visibleRanges) {
        for (const entry of extractCheckableWords(docText, from, to, skipSpans)) {
          if (!cache.has(entry.word)) {
            unknown.add(entry.word);
          } else if (cache.get(entry.word) === false) {
            marks.push(Decoration.mark({ class: "cm-spell-error" }).range(entry.from, entry.to));
          }
        }
      }

      marks.sort((a, b) => a.from - b.from);
      this.decorations = Decoration.set(marks);

      if (unknown.size > 0) {
        for (const word of unknown) {
          queued.add(word);
        }
        if (!inflight) {
          void flushQueue(view);
        }
      }
    }
  }, {
    decorations: (instance) => instance.decorations,
    eventHandlers: {
      contextmenu(event, view) {
        if (!options.isEnabled()) {
          return false;
        }

        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos == null) {
          return false;
        }

        const entry = findWordAt(view.state.doc.toString(), pos);
        if (!entry || cache.get(entry.word) !== false) {
          return false;
        }

        if (overlapsSpan(entry.from, entry.to, collectSkipSpans(view.state, view))) {
          return false;
        }

        event.preventDefault();
        openSpellMenu(event.clientX, event.clientY, entry, view, options, cache);
        return true;
      }
    }
  });

  return [plugin];
}
