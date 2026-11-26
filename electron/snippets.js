// User-defined snippets, shared by the renderer (autocomplete, palette,
// Settings list) and the main process (file IO for snippets.json and the
// project .adp payload). Pure data and pure functions: no Electron or node
// imports so both sides can bundle it.
//
// A snippet is { name, body, detail? }. `body` may contain one ${cursor}
// marker; the caret lands on it and the marker is stripped on insert. The
// marker must keep its literal dollar-brace spelling — backticks here are
// comments, not templates.

export const SNIPPET_CURSOR_MARKER = "${cursor}";

// Written to snippets.json the first time the user opens the global
// snippets file, so the format documents itself.
export const STARTER_SNIPPETS = [
  {
    name: "note",
    detail: "NOTE admonition block",
    body: "[NOTE]\n====\n${cursor}\n====\n"
  },
  {
    name: "tip",
    detail: "TIP admonition block",
    body: "[TIP]\n====\n${cursor}\n====\n"
  }
];

// Accepts anything (parsed JSON, project payload fields, IPC input) and
// returns a clean array: objects with a non-empty trimmed name and a string
// body. Duplicate names keep the first occurrence; everything else is
// dropped rather than throwing, because these files are hand-edited.
export function normalizeSnippets(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set();
  const snippets = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!name || typeof entry.body !== "string") {
      continue;
    }
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    snippets.push({
      name,
      body: entry.body,
      detail: typeof entry.detail === "string" && entry.detail.trim() ? entry.detail.trim() : null
    });
  }
  return snippets;
}

// Splits a snippet body into the text to insert and where the caret should
// land afterwards: on the first ${cursor} marker (stripped) or at the end
// of the body when the body has no marker.
export function splitSnippetBody(body) {
  const markerIndex = body.indexOf(SNIPPET_CURSOR_MARKER);
  if (markerIndex === -1) {
    return { insert: body, cursorOffset: body.length };
  }
  return {
    insert: body.slice(0, markerIndex) + body.slice(markerIndex + SNIPPET_CURSOR_MARKER.length),
    cursorOffset: markerIndex
  };
}

// The word a snippet name is typed as, read from the end of the line
// prefix: letters, digits, hyphens, underscores. Empty at a word start.
export function matchSnippetWord(lineText) {
  const match = lineText.match(/([\w-]*)$/);
  return match ? match[1] : "";
}

// Autocomplete options for the user's snippets, filtered by the word being
// typed. `snippets` carries a scope ("project" | "global") set by the
// caller; project snippets are offered first. Prefix matching is
// case-insensitive so a snippet named "Changelog" completes from "chan".
export function buildSnippetCompletionOptions(snippets, word) {
  const needle = word.toLowerCase();
  return snippets
    .filter((snippet) => !needle || snippet.name.toLowerCase().startsWith(needle))
    .map((snippet) => {
      const { insert, cursorOffset } = splitSnippetBody(snippet.body);
      const scopeDetail = snippet.scope === "project" ? "project snippet" : "snippet";
      return {
        label: snippet.name,
        detail: snippet.detail ? `${snippet.detail} · ${scopeDetail}` : scopeDetail,
        insert,
        cursorOffset
      };
    });
}
