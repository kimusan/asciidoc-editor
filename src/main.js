import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { autocompletion } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { asciidocLanguage } from "./syntax/asciidoc-language.js";
import "./styles.css";

const themeCompartment = new Compartment();
const editorThemeCompartment = new Compartment();

const THEME_STYLES = {
  dark: {
    editor: EditorView.theme({
      "&": {
        height: "100%",
        backgroundColor: "#12161b",
        color: "#edf0f3"
      },
      ".cm-scroller": {
        fontFamily: "\"IBM Plex Mono\", \"Cascadia Code\", monospace",
        lineHeight: "1.6",
        fontSize: "14px"
      },
      ".cm-gutters": {
        backgroundColor: "#161b21",
        color: "#677383",
        borderRight: "1px solid rgba(255, 255, 255, 0.08)"
      },
      ".cm-activeLine": {
        backgroundColor: "rgba(248, 191, 93, 0.08)"
      },
      ".cm-activeLineGutter": {
        backgroundColor: "rgba(248, 191, 93, 0.12)"
      },
      ".cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: "rgba(120, 183, 255, 0.32)"
      }
    }),
    syntax: syntaxHighlighting(HighlightStyle.define([
      { tag: tags.heading, color: "#f8bf5d", fontWeight: "700" },
      { tag: tags.comment, color: "#6b7684", fontStyle: "italic" },
      { tag: [tags.keyword, tags.modifier], color: "#ff8f70" },
      { tag: [tags.string, tags.special(tags.string)], color: "#a8d18d" },
      { tag: tags.attributeName, color: "#9bc3ff" },
      { tag: tags.url, color: "#7dd3fc", textDecoration: "underline" },
      { tag: tags.literal, color: "#f6d58e" },
      { tag: tags.quote, color: "#c6b4ff" },
      { tag: tags.emphasis, fontStyle: "italic", color: "#e6edf5" },
      { tag: tags.strong, fontWeight: "700", color: "#ffffff" }
    ]))
  },
  light: {
    editor: EditorView.theme({
      "&": {
        height: "100%",
        backgroundColor: "#faf6ee",
        color: "#1f2430"
      },
      ".cm-scroller": {
        fontFamily: "\"IBM Plex Mono\", \"Cascadia Code\", monospace",
        lineHeight: "1.6",
        fontSize: "14px"
      },
      ".cm-gutters": {
        backgroundColor: "#f3ece0",
        color: "#7a6a55",
        borderRight: "1px solid rgba(52, 37, 15, 0.12)"
      },
      ".cm-activeLine": {
        backgroundColor: "rgba(127, 63, 0, 0.08)"
      },
      ".cm-activeLineGutter": {
        backgroundColor: "rgba(127, 63, 0, 0.12)"
      },
      ".cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: "rgba(107, 169, 255, 0.3)"
      }
    }),
    syntax: syntaxHighlighting(HighlightStyle.define([
      { tag: tags.heading, color: "#7f3f00", fontWeight: "700" },
      { tag: tags.comment, color: "#7b7d84", fontStyle: "italic" },
      { tag: [tags.keyword, tags.modifier], color: "#b54729" },
      { tag: [tags.string, tags.special(tags.string)], color: "#46724f" },
      { tag: tags.attributeName, color: "#2d63b8" },
      { tag: tags.url, color: "#155e75", textDecoration: "underline" },
      { tag: tags.literal, color: "#6a4f0d" },
      { tag: tags.quote, color: "#7856aa" },
      { tag: tags.emphasis, fontStyle: "italic", color: "#293243" },
      { tag: tags.strong, fontWeight: "700", color: "#111827" }
    ]))
  }
};

const ICONS = {
  brand: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h8.379a2 2 0 0 1 1.414.586l3.12 3.12A2 2 0 0 1 19 9.121V18.5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 18.5z" fill="currentColor" opacity=".18"/><path d="M8 11.5h8M8 15h5M14 4v4h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h3.586a2 2 0 0 1 1.414.586l1.12 1.121A2 2 0 0 0 13.035 9H18.5A1.5 1.5 0 0 1 20 10.5v7A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  open: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18.5A1.5 1.5 0 0 1 4.5 17V7A1.5 1.5 0 0 1 6 5.5h4l1.5 2H18A1.5 1.5 0 0 1 19.5 9v8A1.5 1.5 0 0 1 18 18.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 12h6m-3-3 3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  save: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h9.879a2 2 0 0 1 1.414.586l.621.621A2 2 0 0 1 19 7.621V17.5A1.5 1.5 0 0 1 17.5 19h-11A1.5 1.5 0 0 1 5 17.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 5v5h7V5M8 19v-5h8v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  export: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v9m0 0 3.5-3.5M12 13 8.5 9.5M6 16.5v1A1.5 1.5 0 0 0 7.5 19h9a1.5 1.5 0 0 0 1.5-1.5v-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  spark: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM18.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8zM6 15.5l.9 2.6 2.6.9-2.6.9L6 22.5l-.9-2.6-2.6-.9 2.6-.9z" fill="currentColor"/></svg>`,
  reference: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 5h8A1.5 1.5 0 0 1 17 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 6 17.5v-11A1.5 1.5 0 0 1 7.5 5Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 9h5m-5 3h6m-6 3h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  focus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4.5H5.5A1.5 1.5 0 0 0 4 6v2.5M16 4.5h2.5A1.5 1.5 0 0 1 20 6v2.5M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  preview: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12s3-5.5 8.5-5.5S20.5 12 20.5 12 17.5 17.5 12 17.5 3.5 12 3.5 12Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`
};

const MARKUP_REFERENCE = [
  { title: "Document Title", syntax: "= Project Notes", detail: "Top-level document title. Use this once at the top of the file.", tags: ["header", "title", "document"] },
  { title: "Section Heading", syntax: "== Implementation Notes", detail: "Create sections with repeated equals signs. More equals means deeper nesting.", tags: ["heading", "sections", "outline"] },
  { title: "Attribute", syntax: ":toc: left", detail: "Define document attributes for features such as tables of contents, icons, or custom values.", tags: ["attributes", "toc", "settings"] },
  { title: "Bold and Italic", syntax: "*bold* and _italic_", detail: "Inline emphasis for strong or subtle emphasis.", tags: ["inline", "formatting", "emphasis"] },
  { title: "Code Block", syntax: "[source,js]\n----\nconsole.log('hello')\n----", detail: "Add fenced source blocks with an optional language for syntax highlighting.", tags: ["code", "listing", "source"] },
  { title: "Admonition", syntax: "NOTE: Remember to save before export.", detail: "Create note, tip, warning, caution, and important callouts.", tags: ["note", "warning", "admonition"] },
  { title: "Link", syntax: "https://docs.asciidoctor.org[Docs]", detail: "External links open in the default browser from preview.", tags: ["link", "url", "external"] },
  { title: "Cross Reference", syntax: "xref:chapter-two.adoc#tables[Tables chapter]", detail: "Link to sections in the same document or another AsciiDoc file.", tags: ["xref", "reference", "anchors"] },
  { title: "Image", syntax: "image::diagrams/flow.png[Flow, width=640]", detail: "Embed local or remote images with alt text and attributes.", tags: ["image", "media", "figures"] },
  { title: "Table", syntax: "|===\n|Name |Role\n|Kim |Editor\n|===", detail: "Pipe-delimited tables support formatting, widths, and nested content.", tags: ["table", "grid", "columns"] },
  { title: "Include", syntax: "include::partials/header.adoc[]", detail: "Reuse content from other files. The editor preview resolves includes relative to the current document.", tags: ["include", "imports", "reuse"] },
  { title: "Conditional", syntax: "ifdef::backend-html5[]\nOnly for HTML\nendif::[]", detail: "Conditionally render blocks based on attributes or backend.", tags: ["ifdef", "ifndef", "conditions"] },
  { title: "Passthrough", syntax: "++++\n<div class=\"custom\">HTML</div>\n++++", detail: "Pass raw HTML or other markup through unchanged.", tags: ["passthrough", "raw", "html"] },
  { title: "Footnote", syntax: "Footnote examplefootnote:[This note appears at the bottom.]", detail: "Add inline footnotes that render automatically in preview and export.", tags: ["footnote", "notes", "references"] }
];

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const appState = {
  workspacePath: null,
  openFilePath: null,
  recentFiles: [],
  previewStylesheetPath: null,
  previewTheme: "paper",
  theme: "dark",
  distractionFree: false,
  currentContent: "= Untitled\n\nStart writing...",
  currentFileName: "Untitled.adoc",
  isDirty: false,
  previewInSync: true,
  isApplyingDocument: false,
  pendingPreviewAnchor: null,
  referenceQuery: "",
  referenceOpen: false,
  splitRatio: 0.5,
  renderTimer: null,
  directoryCache: new Map()
};

const elements = {};
let editorView;

function createLayout() {
  const app = document.querySelector("#app");
  app.innerHTML = `
    <div class="shell" data-theme="dark">
      <header class="topbar">
        <div class="topbar-brand">
          <div class="brand-mark">${ICONS.brand}</div>
          <div>
            <p class="eyebrow">2026 Writing Studio</p>
            <h1>AsciiDoc Editor</h1>
          </div>
        </div>
        <div class="topbar-actions">
          <button id="open-folder" class="toolbar-button ghost-button"><span class="button-icon">${ICONS.folder}</span><span>Workspace</span></button>
          <button id="open-file" class="toolbar-button"><span class="button-icon">${ICONS.open}</span><span>Open</span></button>
          <button id="save-file" class="toolbar-button"><span class="button-icon">${ICONS.save}</span><span>Save</span></button>
          <button id="save-file-as" class="toolbar-button ghost-button"><span class="button-icon">${ICONS.export}</span><span>Save As</span></button>
        </div>
      </header>
      <main class="layout-grid">
        <aside class="workspace-panel">
          <div class="workspace-header">
            <div>
              <p class="eyebrow">Current Space</p>
              <div id="workspace-label" class="workspace-label">No folder selected</div>
            </div>
          </div>
          <div class="workspace-note">Open a folder to browse source files and jump between chapters, includes, and references.</div>
          <div id="file-tree" class="file-tree"></div>
        </aside>
        <section class="editor-stage panel">
          <div class="editor-stage-header">
            <div class="editor-title-stack">
              <div class="document-kicker">Active Draft</div>
              <div id="document-name" class="document-name">Untitled.adoc</div>
              <div id="document-status" class="document-status">Preview synced</div>
            </div>
          </div>
          <div class="editor-commandbar">
            <div class="command-group">
              <label class="select-shell">
                <span>Editor</span>
                <select id="editor-theme">
                  <option value="dark">Nocturne</option>
                  <option value="light">Porcelain</option>
                </select>
              </label>
              <label class="select-shell">
                <span>Preview</span>
                <select id="preview-theme">
                  <option value="paper">Paper</option>
                  <option value="slate">Slate</option>
                </select>
              </label>
              <button id="choose-stylesheet" class="toolbar-button ghost-button"><span class="button-icon">${ICONS.preview}</span><span>Preview CSS</span></button>
              <button id="open-reference" class="toolbar-button ghost-button"><span class="button-icon">${ICONS.reference}</span><span>Reference</span></button>
            </div>
            <div class="command-group">
              <button id="toggle-focus" class="toolbar-button focus-button"><span class="button-icon">${ICONS.focus}</span><span id="focus-button-label">Enter Focus</span></button>
              <button id="export-html" class="toolbar-button ghost-button"><span class="button-icon">${ICONS.export}</span><span>HTML</span></button>
              <button id="export-pdf" class="toolbar-button ghost-button"><span class="button-icon">${ICONS.export}</span><span>PDF</span></button>
              <button id="export-docbook" class="toolbar-button ghost-button"><span class="button-icon">${ICONS.export}</span><span>DocBook</span></button>
            </div>
          </div>
          <div class="editor-surface">
            <div class="editor-surface-meta">
              <span id="stylesheet-chip" class="panel-chip">No custom preview CSS</span>
              <div class="document-metrics">
                <div class="metric-pill">
                  <span class="metric-label">Words</span>
                  <strong id="word-count">0</strong>
                </div>
                <div class="metric-pill">
                  <span class="metric-label">Lines</span>
                  <strong id="line-count">1</strong>
                </div>
              </div>
            </div>
            <div id="split-layout" class="split-layout">
              <section class="split-panel split-panel-editor">
                <div class="split-panel-header">
                  <div class="panel-header-main">
                    <span class="panel-icon">${ICONS.brand}</span>
                    <div>
                      <div class="panel-title">Editor</div>
                      <div class="panel-subtitle">Write with live syntax highlighting and keyboard-first editing.</div>
                    </div>
                  </div>
                </div>
                <div id="editor-root" class="editor-root"></div>
              </section>
              <div id="splitter" class="splitter" role="separator" aria-orientation="vertical" aria-label="Resize editor and preview"></div>
              <section class="split-panel split-panel-preview">
                <div class="split-panel-header">
                  <div class="panel-header-main">
                    <span class="panel-icon">${ICONS.preview}</span>
                    <div>
                      <div class="panel-title">Live Preview</div>
                      <div class="panel-subtitle">Follow xrefs, inspect final structure, and validate output as you write.</div>
                    </div>
                  </div>
                </div>
                <iframe id="preview-frame" class="preview-frame" title="AsciiDoc preview"></iframe>
              </section>
            </div>
          </div>
        </section>
      </main>
      <div id="reference-overlay" class="reference-overlay" hidden>
        <div id="reference-backdrop" class="reference-backdrop"></div>
        <section class="reference-dialog panel" role="dialog" aria-modal="true" aria-labelledby="reference-title">
          <div class="panel-header">
            <div class="panel-header-main">
              <span class="panel-icon">${ICONS.reference}</span>
              <div>
                <div id="reference-title" class="panel-title">Markup Reference</div>
                <div class="panel-subtitle">Search snippets, patterns, and common AsciiDoc structures.</div>
              </div>
            </div>
            <button id="close-reference" class="toolbar-button ghost-button"><span>Close</span></button>
          </div>
          <label class="reference-search-shell">
            <span class="button-icon">${ICONS.search}</span>
            <input id="reference-search" class="reference-search" type="search" placeholder="Search links, tables, attributes, passthrough..." />
          </label>
          <div id="reference-results" class="reference-results"></div>
        </section>
      </div>
    </div>
  `;

  elements.shell = document.querySelector(".shell");
  elements.fileTree = document.querySelector("#file-tree");
  elements.workspaceLabel = document.querySelector("#workspace-label");
  elements.documentName = document.querySelector("#document-name");
  elements.documentStatus = document.querySelector("#document-status");
  elements.previewFrame = document.querySelector("#preview-frame");
  elements.editorTheme = document.querySelector("#editor-theme");
  elements.previewTheme = document.querySelector("#preview-theme");
  elements.stylesheetChip = document.querySelector("#stylesheet-chip");
  elements.splitLayout = document.querySelector("#split-layout");
  elements.splitter = document.querySelector("#splitter");
  elements.wordCount = document.querySelector("#word-count");
  elements.lineCount = document.querySelector("#line-count");
  elements.focusButtonLabel = document.querySelector("#focus-button-label");
  elements.referenceOverlay = document.querySelector("#reference-overlay");
  elements.referenceBackdrop = document.querySelector("#reference-backdrop");
  elements.openReference = document.querySelector("#open-reference");
  elements.closeReference = document.querySelector("#close-reference");
  elements.referenceSearch = document.querySelector("#reference-search");
  elements.referenceResults = document.querySelector("#reference-results");
}

function renderReferenceGuide() {
  const query = appState.referenceQuery.trim().toLowerCase();
  const visibleEntries = MARKUP_REFERENCE.filter((entry) => {
    if (!query) {
      return true;
    }

    return [entry.title, entry.syntax, entry.detail, entry.tags.join(" ")]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  elements.referenceResults.innerHTML = visibleEntries.length > 0
    ? visibleEntries.map((entry) => `
      <article class="reference-card">
        <div class="reference-card-header">
          <h3>${escapeHtml(entry.title)}</h3>
          <div class="reference-tags">${entry.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
        </div>
        <pre>${escapeHtml(entry.syntax)}</pre>
        <p>${escapeHtml(entry.detail)}</p>
      </article>
    `).join("")
    : `<div class="reference-empty">No reference entries match that search. Try “xref”, “table”, “ifdef”, or “attributes”.</div>`;
}

function createEditor() {
  const baseExtensions = [
    lineNumbers(),
    history(),
    drawSelection(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    autocompletion(),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      {
        key: "Mod-s",
        run: () => {
          void saveCurrentDocument();
          return true;
        }
      }
    ]),
    asciidocLanguage(),
    themeCompartment.of(THEME_STYLES.dark.syntax),
    editorThemeCompartment.of(THEME_STYLES.dark.editor),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) {
        return;
      }

      appState.currentContent = update.state.doc.toString();
      if (appState.isApplyingDocument) {
        return;
      }

      appState.isDirty = true;
      appState.previewInSync = false;
      updateDocumentChrome();
      schedulePreviewRender();
    })
  ];

  editorView = new EditorView({
    state: EditorState.create({
      doc: appState.currentContent,
      extensions: baseExtensions
    }),
    parent: document.querySelector("#editor-root")
  });
}

function updateDocumentChrome() {
  const fileName = appState.openFilePath?.split(/[\\/]/).pop() ?? appState.currentFileName;
  const trimmedContent = appState.currentContent.trim();
  const wordCount = trimmedContent ? trimmedContent.split(/\s+/).length : 0;
  const lineCount = appState.currentContent.split("\n").length;

  elements.documentName.textContent = appState.isDirty ? `${fileName} *` : fileName;
  if (appState.isDirty) {
    elements.documentStatus.textContent = appState.previewInSync ? "Unsaved changes" : "Preview updating";
  } else {
    elements.documentStatus.textContent = appState.previewInSync ? "Preview synced" : "Rendering preview";
  }
  elements.workspaceLabel.textContent = appState.workspacePath ?? "No folder selected";
  elements.stylesheetChip.textContent = appState.previewStylesheetPath
    ? `Preview CSS: ${appState.previewStylesheetPath.split(/[\\/]/).pop()}`
    : "No custom preview CSS";
  elements.wordCount.textContent = String(wordCount);
  elements.lineCount.textContent = String(lineCount);
  elements.focusButtonLabel.textContent = appState.distractionFree ? "Exit Focus" : "Enter Focus";
  elements.shell.dataset.theme = appState.theme;
  elements.shell.classList.toggle("focus-mode", appState.distractionFree);
  elements.shell.style.setProperty("--split-ratio", String(appState.splitRatio));
  elements.editorTheme.value = appState.theme;
  elements.previewTheme.value = appState.previewTheme;
  elements.referenceOverlay.hidden = !appState.referenceOpen;
  elements.referenceOverlay.classList.toggle("is-open", appState.referenceOpen);
}

function setSplitRatio(nextRatio) {
  appState.splitRatio = Math.min(0.75, Math.max(0.25, nextRatio));
  elements.shell.style.setProperty("--split-ratio", String(appState.splitRatio));
}

function openReferenceOverlay() {
  appState.referenceOpen = true;
  updateDocumentChrome();
  requestAnimationFrame(() => {
    elements.referenceSearch.focus();
    elements.referenceSearch.select();
  });
}

function closeReferenceOverlay() {
  appState.referenceOpen = false;
  updateDocumentChrome();
}

function bindSplitter() {
  const handlePointerMove = (event) => {
    if (!elements.splitLayout) {
      return;
    }

    const bounds = elements.splitLayout.getBoundingClientRect();
    if (bounds.width <= 0) {
      return;
    }

    setSplitRatio((event.clientX - bounds.left) / bounds.width);
  };

  const handlePointerUp = () => {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    elements.shell.classList.remove("is-resizing");
  };

  elements.splitter.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(max-width: 1100px)").matches) {
      return;
    }

    event.preventDefault();
    elements.shell.classList.add("is-resizing");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  });
}

function applyEditorTheme(theme) {
  const themeConfig = THEME_STYLES[theme] ?? THEME_STYLES.dark;
  editorView.dispatch({
    effects: [
      themeCompartment.reconfigure(themeConfig.syntax),
      editorThemeCompartment.reconfigure(themeConfig.editor)
    ]
  });
}

function setEditorContent(content) {
  appState.isApplyingDocument = true;
  editorView.dispatch({
    changes: {
      from: 0,
      to: editorView.state.doc.length,
      insert: content
    }
  });
  appState.isApplyingDocument = false;
  appState.currentContent = content;
  appState.isDirty = false;
  appState.previewInSync = false;
  updateDocumentChrome();
}

async function openDocument(document) {
  appState.openFilePath = document.path;
  appState.workspacePath = document.workspacePath;
  appState.currentFileName = document.name;
  setEditorContent(document.content);
  await renderPreviewNow();
  await refreshFileTree();
}

function buildPreviewPayload() {
  return {
    content: appState.currentContent,
    filePath: appState.openFilePath,
    stylesheetPath: appState.previewStylesheetPath,
    previewTheme: appState.previewTheme
  };
}

async function renderPreviewNow() {
  appState.previewInSync = false;
  updateDocumentChrome();

  try {
    const html = await window.desktop.renderPreview(buildPreviewPayload());
    elements.previewFrame.srcdoc = html;
    appState.previewInSync = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    elements.previewFrame.srcdoc = `<!doctype html><html><body style="font-family: sans-serif; padding: 24px;"><h2>Preview failed</h2><pre>${message}</pre></body></html>`;
    appState.previewInSync = false;
  }

  updateDocumentChrome();
}

function scrollPreviewToAnchor(anchorId) {
  if (!anchorId) {
    return;
  }

  const previewDocument = elements.previewFrame.contentDocument;
  const target = previewDocument?.getElementById(anchorId);
  if (!target) {
    return;
  }

  target.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

async function handlePreviewLinkClick(event) {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const anchor = target?.closest("a[href]");
  if (!anchor) {
    return;
  }

  event.preventDefault();

  const href = anchor.getAttribute("href");
  const result = await window.desktop.followPreviewLink({
    href,
    currentFilePath: appState.openFilePath
  });

  if (result.type === "document" && result.document) {
    appState.pendingPreviewAnchor = result.anchorId ?? null;
    await openDocument(result.document);
    return;
  }

  if (result.type === "anchor") {
    scrollPreviewToAnchor(result.anchorId);
    return;
  }

  if (result.type === "missing") {
    elements.documentStatus.textContent = result.message;
  }
}

function installPreviewInteractions() {
  const previewDocument = elements.previewFrame.contentDocument;
  if (!previewDocument?.body || previewDocument.body.dataset.previewBound === "true") {
    if (appState.pendingPreviewAnchor) {
      scrollPreviewToAnchor(appState.pendingPreviewAnchor);
      appState.pendingPreviewAnchor = null;
    }
    return;
  }

  previewDocument.addEventListener("click", (event) => {
    void handlePreviewLinkClick(event);
  });
  previewDocument.body.dataset.previewBound = "true";

  if (appState.pendingPreviewAnchor) {
    scrollPreviewToAnchor(appState.pendingPreviewAnchor);
    appState.pendingPreviewAnchor = null;
  }
}

function schedulePreviewRender() {
  clearTimeout(appState.renderTimer);
  appState.renderTimer = setTimeout(() => {
    void renderPreviewNow();
  }, 220);
}

function renderTreeNodes(items, depth = 0) {
  return items.map((item) => {
    if (item.type === "directory") {
      const isOpen = appState.directoryCache.get(item.path)?.open ?? depth < 1;
      return `
        <details class="tree-node" data-path="${item.path}" ${isOpen ? "open" : ""}>
          <summary class="tree-entry tree-entry-directory" data-path="${item.path}" data-type="directory">${item.name}</summary>
          <div class="tree-children"></div>
        </details>
      `;
    }

    const isActive = item.path === appState.openFilePath;
    const fileClass = /\.(adoc|asciidoc|asc)$/i.test(item.name) ? "is-asciidoc" : "";
    return `
      <button class="tree-entry tree-entry-file ${fileClass} ${isActive ? "is-active" : ""}" data-path="${item.path}" data-type="file">
        ${item.name}
      </button>
    `;
  }).join("");
}

async function ensureDirectoryLoaded(dirPath) {
  if (appState.directoryCache.get(dirPath)?.children) {
    return appState.directoryCache.get(dirPath).children;
  }

  const children = await window.desktop.listDirectory(dirPath);
  appState.directoryCache.set(dirPath, {
    ...(appState.directoryCache.get(dirPath) ?? {}),
    children,
    open: true
  });
  return children;
}

async function fillDetailsNode(detailsNode, depth) {
  const dirPath = detailsNode.dataset.path;
  const container = detailsNode.querySelector(".tree-children");
  const children = await ensureDirectoryLoaded(dirPath);
  container.innerHTML = renderTreeNodes(children, depth + 1);

  const nestedDetails = Array.from(container.querySelectorAll(":scope > details[open]"));
  await Promise.all(nestedDetails.map((nestedNode) => fillDetailsNode(nestedNode, depth + 1)));
}

async function refreshFileTree() {
  if (!appState.workspacePath) {
    elements.fileTree.innerHTML = `<p class="empty-state">Choose a folder to browse your AsciiDoc documents.</p>`;
    return;
  }

  const rootChildren = await ensureDirectoryLoaded(appState.workspacePath);
  elements.fileTree.innerHTML = renderTreeNodes(rootChildren);

  const rootDetails = Array.from(elements.fileTree.querySelectorAll(":scope > details"));
  await Promise.all(rootDetails.map((node) => fillDetailsNode(node, 0)));
}

async function saveCurrentDocument() {
  let filePath = appState.openFilePath;
  if (!filePath) {
    filePath = await window.desktop.saveDialog(pathWithExtension(appState.currentFileName || "Untitled.adoc"));
  }

  if (!filePath) {
    return;
  }

  const savedDocument = await window.desktop.saveDocument({
    filePath,
    content: appState.currentContent
  });
  if (savedDocument) {
    appState.isDirty = false;
    await openDocument(savedDocument);
  }
}

function pathWithExtension(name) {
  return /\.(adoc|asciidoc|asc)$/i.test(name) ? name : `${name}.adoc`;
}

async function saveAsCurrentDocument() {
  const targetPath = await window.desktop.saveDialog(
    appState.openFilePath ?? pathWithExtension(appState.currentFileName || "Untitled.adoc")
  );

  if (!targetPath) {
    return;
  }

  const savedDocument = await window.desktop.saveDocument({
    filePath: targetPath,
    content: appState.currentContent
  });
  if (savedDocument) {
    appState.isDirty = false;
    await openDocument(savedDocument);
  }
}

async function exportCurrentDocument(format) {
  const extensionMap = {
    html: "html",
    pdf: "pdf",
    docbook: "xml"
  };
  const destinationPath = await window.desktop.saveDialog(
    (appState.openFilePath ?? pathWithExtension(appState.currentFileName || "Untitled.adoc"))
      .replace(/\.(adoc|asciidoc|asc)$/i, `.${extensionMap[format]}`)
  );

  if (!destinationPath) {
    return;
  }

  await window.desktop.exportDocument({
    source: appState.currentContent,
    filePath: appState.openFilePath,
    destinationPath,
    format,
    stylesheetPath: appState.previewStylesheetPath,
    previewTheme: appState.previewTheme
  });
  appState.previewInSync = true;
  elements.documentStatus.textContent = `Exported ${format.toUpperCase()}`;
}

async function bindEvents() {
  document.querySelector("#open-file").addEventListener("click", async () => {
    const documentPayload = await window.desktop.openFile();
    if (documentPayload) {
      await openDocument(documentPayload);
    }
  });

  document.querySelector("#open-folder").addEventListener("click", async () => {
    const selectedFolder = await window.desktop.openFolder();
    if (selectedFolder) {
      appState.workspacePath = selectedFolder;
      appState.directoryCache.clear();
      await refreshFileTree();
      updateDocumentChrome();
    }
  });

  document.querySelector("#save-file").addEventListener("click", () => {
    void saveCurrentDocument();
  });

  document.querySelector("#save-file-as").addEventListener("click", () => {
    void saveAsCurrentDocument();
  });

  document.querySelector("#toggle-focus").addEventListener("click", async () => {
    appState.distractionFree = !appState.distractionFree;
    updateDocumentChrome();
    await window.desktop.updateState({ distractionFree: appState.distractionFree });
  });

  document.querySelector("#editor-theme").addEventListener("change", async (event) => {
    appState.theme = event.target.value;
    applyEditorTheme(appState.theme);
    updateDocumentChrome();
    await window.desktop.updateState({ theme: appState.theme });
  });

  document.querySelector("#preview-theme").addEventListener("change", async (event) => {
    appState.previewTheme = event.target.value;
    updateDocumentChrome();
    await renderPreviewNow();
    await window.desktop.updateState({ previewTheme: appState.previewTheme });
  });

  document.querySelector("#choose-stylesheet").addEventListener("click", async () => {
    const selectedStylesheet = await window.desktop.chooseStylesheet();
    if (!selectedStylesheet) {
      return;
    }

    appState.previewStylesheetPath = selectedStylesheet;
    updateDocumentChrome();
    await renderPreviewNow();
  });

  document.querySelector("#export-html").addEventListener("click", () => {
    void exportCurrentDocument("html");
  });
  document.querySelector("#export-pdf").addEventListener("click", () => {
    void exportCurrentDocument("pdf");
  });
  document.querySelector("#export-docbook").addEventListener("click", () => {
    void exportCurrentDocument("docbook");
  });

  elements.openReference.addEventListener("click", () => {
    openReferenceOverlay();
  });

  elements.closeReference.addEventListener("click", () => {
    closeReferenceOverlay();
  });

  elements.referenceBackdrop.addEventListener("click", () => {
    closeReferenceOverlay();
  });

  elements.referenceSearch.addEventListener("input", (event) => {
    appState.referenceQuery = event.target.value;
    renderReferenceGuide();
  });

  elements.previewFrame.addEventListener("load", () => {
    installPreviewInteractions();
  });

  elements.fileTree.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-type='file']");
    if (!target) {
      return;
    }

    const documentPayload = await window.desktop.readDocument(target.dataset.path);
    if (documentPayload) {
      await openDocument(documentPayload);
    }
  });

  elements.fileTree.addEventListener("toggle", async (event) => {
    const detailsNode = event.target;
    if (!(detailsNode instanceof HTMLDetailsElement) || !detailsNode.dataset.path) {
      return;
    }

    appState.directoryCache.set(detailsNode.dataset.path, {
      ...(appState.directoryCache.get(detailsNode.dataset.path) ?? {}),
      open: detailsNode.open
    });

    if (detailsNode.open) {
      await fillDetailsNode(detailsNode, 0);
    }
  }, true);

  window.addEventListener("beforeunload", async () => {
    await window.desktop.updateState({
      workspacePath: appState.workspacePath,
      openFilePath: appState.openFilePath,
      theme: appState.theme,
      previewTheme: appState.previewTheme,
      distractionFree: appState.distractionFree,
      previewStylesheetPath: appState.previewStylesheetPath
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && appState.referenceOpen) {
      closeReferenceOverlay();
    }

    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openReferenceOverlay();
    }
  });

  bindSplitter();
}

function registerBootSequence() {
  window.desktop.onBoot(async ({ state, initialDocument }) => {
    Object.assign(appState, state);
    applyEditorTheme(appState.theme);
    updateDocumentChrome();

    if (initialDocument) {
      await openDocument(initialDocument);
    } else {
      await renderPreviewNow();
      await refreshFileTree();
    }
  });
}

createLayout();
createEditor();
bindEvents();
registerBootSequence();
renderReferenceGuide();
updateDocumentChrome();
void renderPreviewNow();
