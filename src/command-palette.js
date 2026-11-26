// Ctrl+K command palette. Lists every app action, the open tabs, the active
// document's outline headings, recently opened files/projects, and (when a
// workspace is open) matching workspace files, fuzzy-filtered as you type.
//
// fuzzyScore and buildPaletteItems are pure and unit-tested; everything DOM
// lives in initCommandPalette/close/open below.

const MAX_RESULTS = 40;
const FILE_SEARCH_DEBOUNCE_MS = 160;

// Subsequence fuzzy score. Returns -1 when query does not match, otherwise a
// positive score: +1 per matched char, streaks and word-start matches score
// higher, and a small penalty for long labels so "Save" beats
// "Save as a different file..." on equal matches.
export function fuzzyScore(query, text) {
  if (!query) {
    return 1;
  }

  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let score = 0;
  let qi = 0;
  let streak = 0;
  let lastMatch = -2;

  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] !== q[qi]) {
      continue;
    }

    streak = lastMatch === ti - 1 ? streak + 1 : 1;
    const wordStart = ti === 0 || /[\s/._-]/.test(t[ti - 1] ?? "");
    score += 1 + streak * 2 + (wordStart ? 4 : 0);
    lastMatch = ti;
    qi += 1;
  }

  if (qi !== q.length) {
    return -1;
  }

  return score - t.length * 0.01;
}

// candidates: [{ type, label, detail?, hint?, icon?, run }]
// Returns the candidates matching `query`, best first, capped.
export function buildPaletteItems(query, candidates) {
  const scored = [];
  for (const candidate of candidates) {
    const score = fuzzyScore(query, candidate.label);
    if (score >= 0) {
      scored.push({ candidate, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_RESULTS).map((entry) => entry.candidate);
}

const paletteState = {
  ready: false,
  open: false,
  overlay: null,
  input: null,
  results: null,
  items: [],
  selected: 0,
  restoreFocus: null,
  fileSearchToken: 0,
  fileSearchTimer: null,
  deps: null
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function baseCandidates() {
  const deps = paletteState.deps;
  const candidates = [...deps.getActions()];

  for (const tab of deps.getTabs()) {
    candidates.push({
      type: "tab",
      label: `Go to tab — ${tab.name}${tab.dirty ? " (unsaved)" : ""}`,
      hint: "",
      icon: tab.icon,
      run: () => deps.onTab(tab.id)
    });
  }

  for (const recent of deps.getRecents ? deps.getRecents() : []) {
    candidates.push({
      type: "recent",
      label: recent.kind === "project" ? `Open project — ${recent.name}` : `Open recent — ${recent.name}`,
      detail: recent.path,
      hint: "",
      icon: recent.icon,
      run: () => deps.onRecent(recent.path)
    });
  }

  for (const entry of deps.getOutline()) {
    candidates.push({
      type: "outline",
      label: `${"=".repeat(entry.level)} ${entry.title}`,
      detail: `Line ${entry.lineNumber}`,
      hint: "",
      icon: deps.outlineIcon,
      run: () => deps.onOutline(entry.lineNumber)
    });
  }

  return candidates;
}

function scheduleFileSearch(query) {
  clearTimeout(paletteState.fileSearchTimer);
  const token = paletteState.fileSearchToken + 1;
  paletteState.fileSearchToken = token;

  if (!query || !paletteState.deps.canSearchFiles()) {
    return;
  }

  paletteState.fileSearchTimer = setTimeout(async () => {
    const files = await paletteState.deps.searchFiles(query);
    // Stale results are dropped: the user kept typing.
    if (!paletteState.open || token !== paletteState.fileSearchToken) {
      return;
    }

    for (const file of files) {
      const score = fuzzyScore(query, file.name);
      if (score >= 0) {
        paletteState.fileItems.push({ file, score });
      }
    }

    paletteState.fileItems.sort((a, b) => b.score - a.score);
    renderResults(paletteState.input.value);
  }, FILE_SEARCH_DEBOUNCE_MS);
}

function currentFileCandidates() {
  return paletteState.fileItems
    .slice(0, 12)
    .map(({ file }) => ({
      type: "file",
      label: `Open ${file.name}`,
      detail: file.relativePath ?? file.path,
      hint: "",
      icon: file.icon,
      run: () => paletteState.deps.onFile(file.path)
    }));
}

// Keeps the combobox's aria-activedescendant pointing at the selected
// option so screen readers announce arrow-key moves inside the listbox.
function syncActiveDescendant() {
  const selectedNode = paletteState.results.querySelector(`[data-palette-index="${paletteState.selected}"]`);
  if (selectedNode instanceof HTMLElement) {
    paletteState.input.setAttribute("aria-activedescendant", selectedNode.id);
  } else {
    paletteState.input.removeAttribute("aria-activedescendant");
  }
}

function renderResults(query) {
  const candidates = [...baseCandidates(), ...currentFileCandidates()];
  paletteState.items = buildPaletteItems(query, candidates);
  paletteState.selected = Math.min(paletteState.selected, Math.max(paletteState.items.length - 1, 0));

  paletteState.results.innerHTML = paletteState.items.length === 0
    ? `<div class="command-palette-empty">No matching action, tab, heading, or file.</div>`
    : paletteState.items.map((item, index) => `
      <button
        id="command-palette-option-${index}"
        class="command-palette-item ${index === paletteState.selected ? "is-selected" : ""}"
        type="button"
        role="option"
        aria-selected="${index === paletteState.selected}"
        data-palette-index="${index}"
      >
        <span class="command-palette-item-icon">${item.icon ?? ""}</span>
        <span class="command-palette-item-label">${escapeHtml(item.label)}${item.detail ? ` <span class="command-palette-item-detail">${escapeHtml(item.detail)}</span>` : ""}</span>
        ${item.hint ? `<span class="command-palette-shortcut">${escapeHtml(item.hint)}</span>` : ""}
      </button>
    `).join("");
  syncActiveDescendant();
}

function moveSelection(delta) {
  if (paletteState.items.length === 0) {
    return;
  }

  paletteState.selected = (paletteState.selected + delta + paletteState.items.length) % paletteState.items.length;
  paletteState.results.querySelectorAll(".command-palette-item").forEach((node, index) => {
    const isSelected = index === paletteState.selected;
    node.classList.toggle("is-selected", isSelected);
    node.setAttribute("aria-selected", String(isSelected));
  });
  paletteState.results.querySelector(".command-palette-item.is-selected")?.scrollIntoView({ block: "nearest" });
  syncActiveDescendant();
}

function runSelected() {
  const item = paletteState.items[paletteState.selected];
  if (!item) {
    return;
  }

  closeCommandPalette();
  item.run();
}

function handleInputKeydown(event) {
  // The handler lives on the overlay, which stays in the DOM after close,
  // and focus is only restored on the next animation frame - a keydown in
  // that window must fall through to the window handler untouched, or the
  // closed palette swallows the next Escape (and the surface below never
  // hears it).
  if (!paletteState.open) {
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveSelection(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSelection(-1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    runSelected();
  } else if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeCommandPalette();
  } else if (event.key === "Tab") {
    // The palette is a listbox-style dialog: Tab is not a navigation key
    // here, it just cycles the selection like ArrowDown/ArrowUp.
    event.preventDefault();
    moveSelection(event.shiftKey ? -1 : 1);
  }
}

function handleInput(event) {
  paletteState.selected = 0;
  paletteState.fileItems = [];
  renderResults(event.target.value);
  scheduleFileSearch(event.target.value.trim());
}

export function initCommandPalette(deps) {
  if (paletteState.ready) {
    return;
  }

  paletteState.deps = deps;
  paletteState.overlay = document.createElement("div");
  paletteState.overlay.id = "command-palette-overlay";
  paletteState.overlay.className = "command-palette-overlay";
  paletteState.overlay.innerHTML = `
    <section class="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
      <div class="command-palette-input-row">
        <span class="command-palette-icon">${deps.paletteIcon}</span>
        <input id="command-palette-input" class="command-palette-input" type="text" placeholder="Type a command, tab, heading, or file…" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="command-palette-results" />
      </div>
      <div id="command-palette-results" class="command-palette-results" role="listbox" aria-label="Palette results"></div>
      <div class="command-palette-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
        <span><kbd>Enter</kbd> select</span>
        <span><kbd>Esc</kbd> close</span>
      </div>
    </section>
  `;
  // The overlay must live INSIDE .shell: every CSS custom property
  // (colors, theme overrides) is defined on .shell, so anything appended
  // to document.body silently loses them - backgrounds go transparent and
  // accent-dependent declarations drop.
  const host = document.querySelector(".shell") ?? document.body;
  host.appendChild(paletteState.overlay);

  paletteState.input = paletteState.overlay.querySelector("#command-palette-input");
  paletteState.results = paletteState.overlay.querySelector("#command-palette-results");

  // Keydown lives on the overlay, not the input: the arrows must work no
  // matter which element inside the dialog currently holds focus.
  paletteState.overlay.addEventListener("keydown", handleInputKeydown);
  paletteState.input.addEventListener("input", handleInput);
  paletteState.overlay.addEventListener("mousedown", (event) => {
    if (event.target === paletteState.overlay) {
      closeCommandPalette();
      return;
    }

    // Clicking any dead space inside the dialog returns focus to the input
    // so typing and arrow keys keep working.
    if (!(event.target instanceof Element && event.target.closest("button, input"))) {
      paletteState.input.focus();
    }
  });
  paletteState.results.addEventListener("click", (event) => {
    const item = event.target instanceof Element ? event.target.closest("[data-palette-index]") : null;
    if (!item) {
      return;
    }

    paletteState.selected = Number(item.dataset.paletteIndex);
    runSelected();
  });
  paletteState.results.addEventListener("mousemove", (event) => {
    const item = event.target instanceof Element ? event.target.closest("[data-palette-index]") : null;
    if (!item || item.classList.contains("is-selected")) {
      return;
    }

    paletteState.selected = Number(item.dataset.paletteIndex);
    paletteState.results.querySelectorAll(".command-palette-item").forEach((node, index) => {
      const isSelected = index === paletteState.selected;
      node.classList.toggle("is-selected", isSelected);
      node.setAttribute("aria-selected", String(isSelected));
    });
  });

  paletteState.ready = true;
}

export function openCommandPalette() {
  if (!paletteState.ready || paletteState.open) {
    return;
  }

  paletteState.open = true;
  paletteState.selected = 0;
  paletteState.fileItems = [];
  paletteState.fileSearchToken += 1;
  paletteState.restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  paletteState.overlay.classList.add("is-open");
  paletteState.input.value = "";
  renderResults("");
  paletteState.input.focus();
}

export function closeCommandPalette() {
  if (!paletteState.ready || !paletteState.open) {
    return;
  }

  paletteState.open = false;
  clearTimeout(paletteState.fileSearchTimer);
  paletteState.fileSearchToken += 1;
  paletteState.overlay.classList.remove("is-open");
  const restore = paletteState.restoreFocus;
  paletteState.restoreFocus = null;
  if (restore && document.contains(restore)) {
    restore.focus();
  } else {
    paletteState.deps.onClosed();
  }
}

export function isCommandPaletteOpen() {
  return paletteState.open;
}
