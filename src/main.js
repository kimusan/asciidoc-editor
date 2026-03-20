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

function createEditorTheme(palette) {
  return {
    editor: EditorView.theme({
      "&": {
        height: "100%",
        backgroundColor: palette.bg,
        color: palette.text
      },
      ".cm-scroller": {
        fontFamily: "\"IBM Plex Mono\", \"Cascadia Code\", monospace",
        lineHeight: "1.6",
        fontSize: "14px"
      },
      ".cm-gutters": {
        backgroundColor: palette.gutter,
        color: palette.gutterText,
        borderRight: `1px solid ${palette.gutterBorder}`
      },
      ".cm-activeLine": {
        backgroundColor: palette.activeLine
      },
      ".cm-activeLineGutter": {
        backgroundColor: palette.activeLineGutter
      },
      ".cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: palette.selection
      }
    }),
    syntax: syntaxHighlighting(HighlightStyle.define([
      { tag: tags.heading, color: palette.heading, fontWeight: "700" },
      { tag: tags.comment, color: palette.comment, fontStyle: "italic" },
      { tag: [tags.keyword, tags.modifier], color: palette.keyword },
      { tag: [tags.string, tags.special(tags.string)], color: palette.string },
      { tag: tags.attributeName, color: palette.attribute },
      { tag: tags.url, color: palette.url, textDecoration: "underline" },
      { tag: tags.literal, color: palette.literal },
      { tag: tags.quote, color: palette.quote },
      { tag: tags.emphasis, fontStyle: "italic", color: palette.emphasis },
      { tag: tags.strong, fontWeight: "700", color: palette.strong }
    ]))
  };
}

const THEME_STYLES = {
  nocturne: createEditorTheme({
    bg: "#12161b",
    text: "#edf0f3",
    gutter: "#161b21",
    gutterText: "#677383",
    gutterBorder: "rgba(255, 255, 255, 0.08)",
    activeLine: "rgba(248, 191, 93, 0.08)",
    activeLineGutter: "rgba(248, 191, 93, 0.12)",
    selection: "rgba(120, 183, 255, 0.32)",
    heading: "#f8bf5d",
    comment: "#6b7684",
    keyword: "#ff8f70",
    string: "#a8d18d",
    attribute: "#9bc3ff",
    url: "#7dd3fc",
    literal: "#f6d58e",
    quote: "#c6b4ff",
    emphasis: "#e6edf5",
    strong: "#ffffff"
  }),
  porcelain: createEditorTheme({
    bg: "#faf6ee",
    text: "#1f2430",
    gutter: "#f3ece0",
    gutterText: "#7a6a55",
    gutterBorder: "rgba(52, 37, 15, 0.12)",
    activeLine: "rgba(127, 63, 0, 0.08)",
    activeLineGutter: "rgba(127, 63, 0, 0.12)",
    selection: "rgba(107, 169, 255, 0.3)",
    heading: "#7f3f00",
    comment: "#7b7d84",
    keyword: "#b54729",
    string: "#46724f",
    attribute: "#2d63b8",
    url: "#155e75",
    literal: "#6a4f0d",
    quote: "#7856aa",
    emphasis: "#293243",
    strong: "#111827"
  }),
  nord: createEditorTheme({
    bg: "#2b313d",
    text: "#e5edf6",
    gutter: "#313847",
    gutterText: "#8d9aac",
    gutterBorder: "rgba(216, 222, 233, 0.08)",
    activeLine: "rgba(136, 192, 208, 0.12)",
    activeLineGutter: "rgba(136, 192, 208, 0.18)",
    selection: "rgba(129, 161, 193, 0.34)",
    heading: "#88c0d0",
    comment: "#7d8898",
    keyword: "#bf92d7",
    string: "#a3be8c",
    attribute: "#81a1c1",
    url: "#8fbcbb",
    literal: "#ebcb8b",
    quote: "#d08770",
    emphasis: "#e5edf6",
    strong: "#ffffff"
  }),
  darcula: createEditorTheme({
    bg: "#2b2b2b",
    text: "#f0f0f0",
    gutter: "#313335",
    gutterText: "#909090",
    gutterBorder: "rgba(255, 255, 255, 0.08)",
    activeLine: "rgba(104, 151, 187, 0.14)",
    activeLineGutter: "rgba(104, 151, 187, 0.18)",
    selection: "rgba(98, 151, 186, 0.34)",
    heading: "#ffc66d",
    comment: "#7f8c7a",
    keyword: "#cc7832",
    string: "#6a8759",
    attribute: "#9876aa",
    url: "#6897bb",
    literal: "#bbb529",
    quote: "#a9b7c6",
    emphasis: "#e6e6e6",
    strong: "#ffffff"
  }),
  solarized: createEditorTheme({
    bg: "#fdf6e3",
    text: "#4f5b57",
    gutter: "#f5edd7",
    gutterText: "#8c8b7f",
    gutterBorder: "rgba(88, 110, 117, 0.12)",
    activeLine: "rgba(38, 139, 210, 0.08)",
    activeLineGutter: "rgba(38, 139, 210, 0.12)",
    selection: "rgba(147, 161, 161, 0.32)",
    heading: "#cb4b16",
    comment: "#93a1a1",
    keyword: "#d33682",
    string: "#859900",
    attribute: "#268bd2",
    url: "#2aa198",
    literal: "#b58900",
    quote: "#6c71c4",
    emphasis: "#586e75",
    strong: "#073642"
  })
};

const APP_THEME_VARS = {
  nocturne: {
    "--page-bg": "radial-gradient(circle at 14% 12%, rgba(39, 209, 193, 0.24), transparent 24%), radial-gradient(circle at 82% 14%, rgba(255, 136, 73, 0.18), transparent 22%), linear-gradient(180deg, #081016 0%, #101723 48%, #111521 100%)",
    "--panel-bg": "rgba(10, 16, 23, 0.72)",
    "--panel-bg-strong": "rgba(12, 19, 28, 0.92)",
    "--panel-border": "rgba(255, 255, 255, 0.08)",
    "--text-primary": "#eef4ff",
    "--text-secondary": "rgba(238, 244, 255, 0.68)",
    "--text-tertiary": "rgba(238, 244, 255, 0.46)",
    "--accent": "#27d1c1",
    "--accent-strong": "#7cf2d8",
    "--focus-ring": "rgba(124, 242, 216, 0.85)",
    "--control-bg": "rgba(255, 255, 255, 0.05)",
    "--control-bg-hover": "rgba(255, 255, 255, 0.09)",
    "--control-border": "rgba(255, 255, 255, 0.1)",
    "--control-border-hover": "rgba(124, 242, 216, 0.38)",
    "--shadow": "0 24px 72px rgba(0, 0, 0, 0.22)"
  },
  porcelain: {
    "--page-bg": "radial-gradient(circle at 12% 10%, rgba(59, 145, 255, 0.14), transparent 25%), radial-gradient(circle at 84% 8%, rgba(255, 132, 64, 0.16), transparent 18%), linear-gradient(180deg, #eef4fb 0%, #f7f3ea 52%, #efe7db 100%)",
    "--panel-bg": "rgba(255, 255, 255, 0.78)",
    "--panel-bg-strong": "rgba(255, 255, 255, 0.95)",
    "--panel-border": "rgba(32, 45, 61, 0.08)",
    "--text-primary": "#16202c",
    "--text-secondary": "rgba(22, 32, 44, 0.7)",
    "--text-tertiary": "rgba(22, 32, 44, 0.46)",
    "--accent": "#1f79ff",
    "--accent-strong": "#0ea5a3",
    "--focus-ring": "rgba(31, 121, 255, 0.55)",
    "--control-bg": "rgba(22, 32, 44, 0.04)",
    "--control-bg-hover": "rgba(22, 32, 44, 0.08)",
    "--control-border": "rgba(22, 32, 44, 0.09)",
    "--control-border-hover": "rgba(31, 121, 255, 0.28)",
    "--shadow": "0 24px 72px rgba(67, 89, 117, 0.12)"
  },
  nord: {
    "--page-bg": "radial-gradient(circle at 10% 8%, rgba(136, 192, 208, 0.18), transparent 24%), radial-gradient(circle at 88% 10%, rgba(191, 97, 106, 0.14), transparent 22%), linear-gradient(180deg, #242933 0%, #2c3440 52%, #20262f 100%)",
    "--panel-bg": "rgba(39, 46, 58, 0.78)",
    "--panel-bg-strong": "rgba(42, 50, 62, 0.96)",
    "--panel-border": "rgba(216, 222, 233, 0.08)",
    "--text-primary": "#e5edf6",
    "--text-secondary": "rgba(229, 237, 246, 0.7)",
    "--text-tertiary": "rgba(229, 237, 246, 0.46)",
    "--accent": "#88c0d0",
    "--accent-strong": "#8fbcbb",
    "--focus-ring": "rgba(136, 192, 208, 0.6)",
    "--control-bg": "rgba(255, 255, 255, 0.05)",
    "--control-bg-hover": "rgba(255, 255, 255, 0.09)",
    "--control-border": "rgba(216, 222, 233, 0.1)",
    "--control-border-hover": "rgba(136, 192, 208, 0.36)",
    "--shadow": "0 24px 72px rgba(7, 11, 17, 0.24)"
  },
  darcula: {
    "--page-bg": "radial-gradient(circle at 12% 12%, rgba(104, 151, 187, 0.18), transparent 22%), radial-gradient(circle at 86% 10%, rgba(204, 120, 50, 0.14), transparent 20%), linear-gradient(180deg, #1f2124 0%, #282a2d 52%, #212325 100%)",
    "--panel-bg": "rgba(38, 40, 43, 0.82)",
    "--panel-bg-strong": "rgba(43, 45, 48, 0.96)",
    "--panel-border": "rgba(255, 255, 255, 0.08)",
    "--text-primary": "#f0f0f0",
    "--text-secondary": "rgba(240, 240, 240, 0.68)",
    "--text-tertiary": "rgba(240, 240, 240, 0.44)",
    "--accent": "#6897bb",
    "--accent-strong": "#ffc66d",
    "--focus-ring": "rgba(104, 151, 187, 0.62)",
    "--control-bg": "rgba(255, 255, 255, 0.04)",
    "--control-bg-hover": "rgba(255, 255, 255, 0.08)",
    "--control-border": "rgba(255, 255, 255, 0.1)",
    "--control-border-hover": "rgba(104, 151, 187, 0.34)",
    "--shadow": "0 24px 72px rgba(0, 0, 0, 0.28)"
  },
  solarized: {
    "--page-bg": "radial-gradient(circle at 10% 10%, rgba(42, 161, 152, 0.16), transparent 24%), radial-gradient(circle at 90% 10%, rgba(203, 75, 22, 0.14), transparent 20%), linear-gradient(180deg, #fdf6e3 0%, #f7f0dd 52%, #efe7d1 100%)",
    "--panel-bg": "rgba(255, 251, 239, 0.8)",
    "--panel-bg-strong": "rgba(255, 252, 242, 0.95)",
    "--panel-border": "rgba(88, 110, 117, 0.1)",
    "--text-primary": "#41505b",
    "--text-secondary": "rgba(65, 80, 91, 0.68)",
    "--text-tertiary": "rgba(65, 80, 91, 0.46)",
    "--accent": "#268bd2",
    "--accent-strong": "#2aa198",
    "--focus-ring": "rgba(38, 139, 210, 0.45)",
    "--control-bg": "rgba(88, 110, 117, 0.04)",
    "--control-bg-hover": "rgba(88, 110, 117, 0.08)",
    "--control-border": "rgba(88, 110, 117, 0.1)",
    "--control-border-hover": "rgba(38, 139, 210, 0.28)",
    "--shadow": "0 24px 72px rgba(88, 110, 117, 0.14)"
  }
};

const PREVIEW_FONT_OPTIONS = [
  { value: "serif", label: "Serif" },
  { value: "sans", label: "Sans" },
  { value: "mono", label: "Mono" }
];

const APP_THEME_OPTIONS = [
  { value: "nocturne", label: "Nocturne" },
  { value: "porcelain", label: "Porcelain" },
  { value: "nord", label: "Nord" },
  { value: "darcula", label: "Darcula" },
  { value: "solarized", label: "Solarized" }
];

const PREVIEW_THEME_OPTIONS = [
  { value: "paper", label: "Paper" },
  { value: "slate", label: "Slate" },
  { value: "nord", label: "Nord" },
  { value: "darcula", label: "Darcula" },
  { value: "solarized", label: "Solarized" }
];

const ICONS = {
  brand: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h8.379a2 2 0 0 1 1.414.586l3.12 3.12A2 2 0 0 1 19 9.121V18.5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 18.5z" fill="currentColor" opacity=".18"/><path d="M8 11.5h8M8 15h5M14 4v4h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h3.586a2 2 0 0 1 1.414.586l1.12 1.121A2 2 0 0 0 13.035 9H18.5A1.5 1.5 0 0 1 20 10.5v7A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  open: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18.5A1.5 1.5 0 0 1 4.5 17V7A1.5 1.5 0 0 1 6 5.5h4l1.5 2H18A1.5 1.5 0 0 1 19.5 9v8A1.5 1.5 0 0 1 18 18.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 12h6m-3-3 3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  save: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h9.879a2 2 0 0 1 1.414.586l.621.621A2 2 0 0 1 19 7.621V17.5A1.5 1.5 0 0 1 17.5 19h-11A1.5 1.5 0 0 1 5 17.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 5v5h7V5M8 19v-5h8v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  export: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v9m0 0 3.5-3.5M12 13 8.5 9.5M6 16.5v1A1.5 1.5 0 0 0 7.5 19h9a1.5 1.5 0 0 0 1.5-1.5v-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  reference: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 5h8A1.5 1.5 0 0 1 17 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 6 17.5v-11A1.5 1.5 0 0 1 7.5 5Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 9h5m-5 3h6m-6 3h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  info: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 10v5M12 7.5h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19 12a7.2 7.2 0 0 0-.08-1l1.86-1.45-1.75-3.03-2.25.72a7.55 7.55 0 0 0-1.72-.99L14.7 3h-3.4l-.36 2.25a7.55 7.55 0 0 0-1.72.99l-2.25-.72-1.75 3.03L5.08 11a7.2 7.2 0 0 0 0 2l-1.86 1.45 1.75 3.03 2.25-.72c.53.4 1.11.73 1.72.99L11.3 21h3.4l.36-2.25c.61-.26 1.19-.59 1.72-.99l2.25.72 1.75-3.03L18.92 13c.05-.33.08-.66.08-1Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  focus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4.5H5.5A1.5 1.5 0 0 0 4 6v2.5M16 4.5h2.5A1.5 1.5 0 0 1 20 6v2.5M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  expand: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4H20v5.5M20 4l-7 7M9.5 20H4v-5.5M4 20l7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
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

function renderOptionMarkup(options) {
  return options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("");
}

function normalizeThemeValue(value) {
  if (value === "dark") {
    return "nocturne";
  }

  if (value === "light") {
    return "porcelain";
  }

  return THEME_STYLES[value] ? value : "nocturne";
}

function normalizePreviewThemeValue(value) {
  const allowed = new Set(PREVIEW_THEME_OPTIONS.map((option) => option.value));
  return allowed.has(value) ? value : "paper";
}

function normalizePreviewFontValue(value) {
  const allowed = new Set(PREVIEW_FONT_OPTIONS.map((option) => option.value));
  return allowed.has(value) ? value : "serif";
}

const appState = {
  workspacePath: null,
  openFilePath: null,
  recentFiles: [],
  previewStylesheetPath: null,
  previewTheme: "paper",
  previewFontFamily: "serif",
  theme: "nocturne",
  distractionFree: false,
  currentContent: "= Untitled\n\nStart writing...",
  currentFileName: "Untitled.adoc",
  isDirty: false,
  previewInSync: true,
  isApplyingDocument: false,
  pendingPreviewAnchor: null,
  previewOverlayOpen: false,
  exportOverlayOpen: false,
  referenceQuery: "",
  referenceOpen: false,
  settingsOpen: false,
  aboutOpen: false,
  splitRatio: 0.5,
  renderTimer: null,
  syncTimer: null,
  directoryCache: new Map()
};

const elements = {};
let editorView;

function createLayout() {
  const app = document.querySelector("#app");
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="topbar-brand">
          <div class="brand-mark">${ICONS.brand}</div>
          <div>
            <p class="eyebrow">2026 Writing Studio</p>
            <h1>AsciiDoc Editor</h1>
          </div>
        </div>
        <div class="topbar-actions">
          <button id="open-settings" class="toolbar-button ghost-button" aria-label="Settings"><span class="button-icon">${ICONS.settings}</span><span>Settings</span></button>
          <button id="open-about" class="toolbar-button ghost-button info-button" aria-label="About AsciiDoc Editor"><span class="button-icon">${ICONS.info}</span></button>
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
              <div class="document-meta-row">
                <div class="document-kicker">Active Draft</div>
                <div id="document-status" class="document-status">Preview synced</div>
              </div>
              <div id="document-name" class="document-name">Untitled.adoc</div>
            </div>
          </div>
          <div class="editor-commandbar">
            <div class="command-group">
              <button id="open-reference" class="toolbar-button ghost-button"><span class="button-icon">${ICONS.reference}</span><span>Reference</span></button>
            </div>
            <div class="command-group">
              <button id="toggle-focus" class="toolbar-button focus-button"><span class="button-icon">${ICONS.focus}</span><span id="focus-button-label">Enter Focus</span></button>
              <button id="open-export" class="toolbar-button ghost-button"><span class="button-icon">${ICONS.export}</span><span>Export</span></button>
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
                  <div class="split-panel-actions">
                    <button id="open-preview-overlay" class="toolbar-button ghost-button"><span class="button-icon">${ICONS.expand}</span><span>Expand</span></button>
                  </div>
                </div>
                <iframe id="preview-frame" class="preview-frame" title="AsciiDoc preview"></iframe>
              </section>
            </div>
          </div>
        </section>
      </main>
      <div id="preview-overlay" class="reference-overlay" hidden>
        <div id="preview-backdrop" class="reference-backdrop"></div>
        <section class="reference-dialog preview-dialog panel" role="dialog" aria-modal="true" aria-labelledby="preview-dialog-title">
          <div class="panel-header">
            <div class="panel-header-main">
              <span class="panel-icon">${ICONS.preview}</span>
              <div>
                <div id="preview-dialog-title" class="panel-title">Expanded Preview</div>
                <div class="panel-subtitle">Read the document in a larger print-like view without leaving the editor.</div>
              </div>
            </div>
            <button id="close-preview-overlay" class="toolbar-button ghost-button"><span>Close</span></button>
          </div>
          <iframe id="preview-frame-expanded" class="preview-frame preview-frame-expanded" title="Expanded AsciiDoc preview"></iframe>
        </section>
      </div>
      <div id="export-overlay" class="reference-overlay" hidden>
        <div id="export-backdrop" class="reference-backdrop"></div>
        <section class="reference-dialog export-dialog panel" role="dialog" aria-modal="true" aria-labelledby="export-title">
          <div class="panel-header">
            <div class="panel-header-main">
              <span class="panel-icon">${ICONS.export}</span>
              <div>
                <div id="export-title" class="panel-title">Export Document</div>
                <div class="panel-subtitle">Choose the output format for the current document.</div>
              </div>
            </div>
            <button id="close-export" class="toolbar-button ghost-button"><span>Close</span></button>
          </div>
          <div class="format-grid">
            <button class="format-card" data-export-format="html">
              <strong>HTML</strong>
              <span>Styled HTML document for sharing or publishing.</span>
            </button>
            <button class="format-card" data-export-format="pdf">
              <strong>PDF</strong>
              <span>Clean print-friendly document export.</span>
            </button>
            <button class="format-card" data-export-format="docbook">
              <strong>DocBook 5</strong>
              <span>Structured XML export for downstream processing.</span>
            </button>
          </div>
        </section>
      </div>
      <div id="settings-overlay" class="reference-overlay" hidden>
        <div id="settings-backdrop" class="reference-backdrop"></div>
        <section class="reference-dialog settings-dialog panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <div class="panel-header">
            <div class="panel-header-main">
              <span class="panel-icon">${ICONS.settings}</span>
              <div>
                <div id="settings-title" class="panel-title">Settings</div>
                <div class="panel-subtitle">Tune the workspace shell, preview presentation, and stylesheet overrides.</div>
              </div>
            </div>
            <button id="close-settings" class="toolbar-button ghost-button"><span>Close</span></button>
          </div>
          <div class="settings-grid">
            <article class="settings-card">
              <div class="settings-card-header">
                <h3>Workspace Theme</h3>
                <p>Choose the app chrome and editor color system.</p>
              </div>
              <label class="settings-field">
                <span>App theme</span>
                <select id="settings-app-theme">
                  ${renderOptionMarkup(APP_THEME_OPTIONS)}
                </select>
              </label>
            </article>
            <article class="settings-card">
              <div class="settings-card-header">
                <h3>Preview Style</h3>
                <p>Configure the preview palette and reading typography.</p>
              </div>
              <label class="settings-field">
                <span>Preview theme</span>
                <select id="settings-preview-theme">
                  ${renderOptionMarkup(PREVIEW_THEME_OPTIONS)}
                </select>
              </label>
              <label class="settings-field">
                <span>Preview font</span>
                <select id="settings-preview-font">
                  ${renderOptionMarkup(PREVIEW_FONT_OPTIONS)}
                </select>
              </label>
            </article>
            <article class="settings-card settings-card-wide">
              <div class="settings-card-header">
                <h3>Preview Stylesheet</h3>
                <p>Layer a custom CSS file on top of the built-in preview theme when you need a house style.</p>
              </div>
              <div class="settings-css-row">
                <div id="settings-stylesheet-status" class="settings-note">No custom preview CSS selected.</div>
                <div class="command-group">
                  <button id="choose-stylesheet" class="toolbar-button ghost-button"><span class="button-icon">${ICONS.preview}</span><span>Choose CSS</span></button>
                  <button id="clear-stylesheet" class="toolbar-button ghost-button"><span>Clear</span></button>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>
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
      <div id="about-overlay" class="reference-overlay" hidden>
        <div id="about-backdrop" class="reference-backdrop"></div>
        <section class="reference-dialog about-dialog panel" role="dialog" aria-modal="true" aria-labelledby="about-title">
          <div class="panel-header">
            <div class="panel-header-main">
              <span class="panel-icon">${ICONS.info}</span>
              <div>
                <div id="about-title" class="panel-title">About AsciiDoc Editor</div>
                <div class="panel-subtitle">Portable AsciiDoc editing with live preview and export.</div>
              </div>
            </div>
            <button id="close-about" class="toolbar-button ghost-button"><span>Close</span></button>
          </div>
          <div class="about-content">
            <div class="about-hero">
              <div class="brand-mark about-mark">${ICONS.brand}</div>
              <div>
                <h2>AsciiDoc Editor</h2>
                <p>Standalone cross-platform AsciiDoc editing with preview, references, and export.</p>
              </div>
            </div>
            <div class="about-grid">
              <article class="about-card">
                <h3>Author</h3>
                <p>Kim Schulz</p>
              </article>
              <article class="about-card">
                <h3>License</h3>
                <p>MIT License</p>
              </article>
              <article class="about-card">
                <h3>GitHub</h3>
                <p><a href="https://github.com/kimusan/asciidoc-editor" data-external-link>github.com/kimusan/asciidoc-editor</a></p>
              </article>
              <article class="about-card">
                <h3>Website</h3>
                <p><a href="https://schulz.dk" data-external-link>schulz.dk</a></p>
              </article>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;

  elements.shell = document.querySelector(".shell");
  elements.openSettings = document.querySelector("#open-settings");
  elements.settingsOverlay = document.querySelector("#settings-overlay");
  elements.settingsBackdrop = document.querySelector("#settings-backdrop");
  elements.closeSettings = document.querySelector("#close-settings");
  elements.settingsAppTheme = document.querySelector("#settings-app-theme");
  elements.settingsPreviewTheme = document.querySelector("#settings-preview-theme");
  elements.settingsPreviewFont = document.querySelector("#settings-preview-font");
  elements.settingsStylesheetStatus = document.querySelector("#settings-stylesheet-status");
  elements.chooseStylesheet = document.querySelector("#choose-stylesheet");
  elements.clearStylesheet = document.querySelector("#clear-stylesheet");
  elements.openAbout = document.querySelector("#open-about");
  elements.aboutOverlay = document.querySelector("#about-overlay");
  elements.aboutBackdrop = document.querySelector("#about-backdrop");
  elements.closeAbout = document.querySelector("#close-about");
  elements.previewOverlay = document.querySelector("#preview-overlay");
  elements.previewBackdrop = document.querySelector("#preview-backdrop");
  elements.openPreviewOverlay = document.querySelector("#open-preview-overlay");
  elements.closePreviewOverlay = document.querySelector("#close-preview-overlay");
  elements.previewFrameExpanded = document.querySelector("#preview-frame-expanded");
  elements.exportOverlay = document.querySelector("#export-overlay");
  elements.exportBackdrop = document.querySelector("#export-backdrop");
  elements.openExport = document.querySelector("#open-export");
  elements.closeExport = document.querySelector("#close-export");
  elements.exportFormats = Array.from(document.querySelectorAll("[data-export-format]"));
  elements.fileTree = document.querySelector("#file-tree");
  elements.workspaceLabel = document.querySelector("#workspace-label");
  elements.documentName = document.querySelector("#document-name");
  elements.documentStatus = document.querySelector("#document-status");
  elements.previewFrame = document.querySelector("#preview-frame");
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
    themeCompartment.of(THEME_STYLES.nocturne.syntax),
    editorThemeCompartment.of(THEME_STYLES.nocturne.editor),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        appState.currentContent = update.state.doc.toString();
        if (appState.isApplyingDocument) {
          return;
        }

        appState.isDirty = true;
        appState.previewInSync = false;
        updateDocumentChrome();
        schedulePreviewRender();
      }

      if ((update.docChanged || update.selectionSet || update.viewportChanged) && !appState.isApplyingDocument) {
        schedulePreviewSync();
      }
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
  elements.settingsStylesheetStatus.textContent = appState.previewStylesheetPath
    ? appState.previewStylesheetPath.split(/[\\/]/).pop()
    : "No custom preview CSS selected.";
  elements.wordCount.textContent = String(wordCount);
  elements.lineCount.textContent = String(lineCount);
  elements.focusButtonLabel.textContent = appState.distractionFree ? "Exit Focus" : "Enter Focus";
  elements.shell.classList.toggle("focus-mode", appState.distractionFree);
  elements.shell.style.setProperty("--split-ratio", String(appState.splitRatio));
  applyShellTheme(appState.theme);
  elements.settingsAppTheme.value = appState.theme;
  elements.settingsPreviewTheme.value = appState.previewTheme;
  elements.settingsPreviewFont.value = appState.previewFontFamily;
  elements.settingsOverlay.hidden = !appState.settingsOpen;
  elements.settingsOverlay.classList.toggle("is-open", appState.settingsOpen);
  elements.previewOverlay.hidden = !appState.previewOverlayOpen;
  elements.previewOverlay.classList.toggle("is-open", appState.previewOverlayOpen);
  elements.exportOverlay.hidden = !appState.exportOverlayOpen;
  elements.exportOverlay.classList.toggle("is-open", appState.exportOverlayOpen);
  elements.referenceOverlay.hidden = !appState.referenceOpen;
  elements.referenceOverlay.classList.toggle("is-open", appState.referenceOpen);
  elements.aboutOverlay.hidden = !appState.aboutOpen;
  elements.aboutOverlay.classList.toggle("is-open", appState.aboutOpen);
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

function openPreviewOverlay() {
  appState.previewOverlayOpen = true;
  updateDocumentChrome();
}

function closePreviewOverlay() {
  appState.previewOverlayOpen = false;
  updateDocumentChrome();
}

function openExportOverlay() {
  appState.exportOverlayOpen = true;
  updateDocumentChrome();
}

function closeExportOverlay() {
  appState.exportOverlayOpen = false;
  updateDocumentChrome();
}

function openSettingsOverlay() {
  appState.settingsOpen = true;
  updateDocumentChrome();
  requestAnimationFrame(() => {
    elements.settingsAppTheme.focus();
  });
}

function closeSettingsOverlay() {
  appState.settingsOpen = false;
  updateDocumentChrome();
}

function openAboutOverlay() {
  appState.aboutOpen = true;
  updateDocumentChrome();
}

function closeAboutOverlay() {
  appState.aboutOpen = false;
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
  const themeConfig = THEME_STYLES[theme] ?? THEME_STYLES.nocturne;
  editorView.dispatch({
    effects: [
      themeCompartment.reconfigure(themeConfig.syntax),
      editorThemeCompartment.reconfigure(themeConfig.editor)
    ]
  });
}

function applyShellTheme(theme) {
  const themeVars = APP_THEME_VARS[theme] ?? APP_THEME_VARS.nocturne;
  Object.entries(themeVars).forEach(([name, value]) => {
    elements.shell.style.setProperty(name, value);
  });
  document.documentElement.style.colorScheme = theme === "porcelain" || theme === "solarized" ? "light" : "dark";
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

function scrollPreviewToTop(frame = elements.previewFrame) {
  frame.contentWindow?.scrollTo({
    top: 0,
    behavior: "auto"
  });
}

function buildPreviewPayload() {
  return {
    content: appState.currentContent,
    filePath: appState.openFilePath,
    stylesheetPath: appState.previewStylesheetPath,
    previewTheme: appState.previewTheme,
    previewFontFamily: appState.previewFontFamily
  };
}

async function renderPreviewNow() {
  appState.previewInSync = false;
  updateDocumentChrome();

  try {
    const html = await window.desktop.renderPreview(buildPreviewPayload());
    elements.previewFrame.srcdoc = html;
    elements.previewFrameExpanded.srcdoc = html;
    appState.previewInSync = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallbackHtml = `<!doctype html><html><body style="font-family: sans-serif; padding: 24px;"><h2>Preview failed</h2><pre>${message}</pre></body></html>`;
    elements.previewFrame.srcdoc = fallbackHtml;
    elements.previewFrameExpanded.srcdoc = fallbackHtml;
    appState.previewInSync = false;
  }

  updateDocumentChrome();
}

function scrollPreviewToAnchor(anchorId, frame = elements.previewFrame, behavior = "smooth") {
  if (!anchorId) {
    return;
  }

  const previewDocument = frame.contentDocument;
  const target = previewDocument?.getElementById(anchorId);
  if (!target) {
    return;
  }

  target.scrollIntoView({
    behavior,
    block: "start"
  });
}

function toAsciidoctorId(title) {
  const normalized = title
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll(/&[a-z0-9#]+;/gi, "")
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "");

  return normalized ? `_${normalized}` : null;
}

function findNearestSectionAnchor(lineNumber) {
  const lines = appState.currentContent.split("\n");
  let anchorId = null;

  for (let index = 0; index < Math.min(lineNumber, lines.length); index += 1) {
    const match = lines[index].match(/^={2,6}\s+(.+)$/);
    if (!match) {
      continue;
    }

    anchorId = toAsciidoctorId(match[1].trim());
  }

  return anchorId;
}

function syncPreviewToEditorPosition() {
  if (!editorView || appState.pendingPreviewAnchor) {
    return;
  }

  const syncLine = editorView.state.doc.lineAt(editorView.viewport.from).number;
  const anchorId = findNearestSectionAnchor(syncLine);

  if (!anchorId) {
    scrollPreviewToTop(elements.previewFrame);
    scrollPreviewToTop(elements.previewFrameExpanded);
    return;
  }

  scrollPreviewToAnchor(anchorId, elements.previewFrame, "auto");
  scrollPreviewToAnchor(anchorId, elements.previewFrameExpanded, "auto");
}

function schedulePreviewSync() {
  clearTimeout(appState.syncTimer);
  appState.syncTimer = setTimeout(() => {
    syncPreviewToEditorPosition();
  }, 90);
}

function findClosestLink(event) {
  const path = typeof event.composedPath === "function"
    ? event.composedPath()
    : [event.target];

  for (const candidate of path) {
    if (candidate && typeof candidate.closest === "function") {
      const anchor = candidate.closest("a[href]");
      if (anchor) {
        return anchor;
      }
    }
  }

  return null;
}

async function handlePreviewLinkClick(event, frame) {
  const anchor = findClosestLink(event);
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
    scrollPreviewToAnchor(result.anchorId, frame, "smooth");
    return;
  }

  if (result.type === "missing") {
    elements.documentStatus.textContent = result.message;
  }
}

function installPreviewInteractions(frame) {
  const previewDocument = frame.contentDocument;
  if (!previewDocument?.body || previewDocument.body.dataset.previewBound === "true") {
    if (appState.pendingPreviewAnchor) {
      scrollPreviewToAnchor(appState.pendingPreviewAnchor, elements.previewFrame, "auto");
      scrollPreviewToAnchor(appState.pendingPreviewAnchor, elements.previewFrameExpanded, "auto");
      appState.pendingPreviewAnchor = null;
    } else {
      syncPreviewToEditorPosition();
    }
    return;
  }

  previewDocument.addEventListener("click", (event) => {
    void handlePreviewLinkClick(event, frame);
  });
  previewDocument.body.dataset.previewBound = "true";

  if (appState.pendingPreviewAnchor) {
    scrollPreviewToAnchor(appState.pendingPreviewAnchor, elements.previewFrame, "auto");
    scrollPreviewToAnchor(appState.pendingPreviewAnchor, elements.previewFrameExpanded, "auto");
    appState.pendingPreviewAnchor = null;
  } else {
    syncPreviewToEditorPosition();
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
    previewTheme: appState.previewTheme,
    previewFontFamily: appState.previewFontFamily
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

  elements.openSettings.addEventListener("click", () => {
    openSettingsOverlay();
  });

  elements.openPreviewOverlay.addEventListener("click", () => {
    openPreviewOverlay();
  });

  elements.closePreviewOverlay.addEventListener("click", () => {
    closePreviewOverlay();
  });

  elements.previewBackdrop.addEventListener("click", () => {
    closePreviewOverlay();
  });

  elements.openExport.addEventListener("click", () => {
    openExportOverlay();
  });

  elements.closeExport.addEventListener("click", () => {
    closeExportOverlay();
  });

  elements.exportBackdrop.addEventListener("click", () => {
    closeExportOverlay();
  });

  elements.exportFormats.forEach((button) => {
    button.addEventListener("click", () => {
      closeExportOverlay();
      void exportCurrentDocument(button.dataset.exportFormat);
    });
  });

  elements.closeSettings.addEventListener("click", () => {
    closeSettingsOverlay();
  });

  elements.settingsBackdrop.addEventListener("click", () => {
    closeSettingsOverlay();
  });

  elements.settingsAppTheme.addEventListener("change", async (event) => {
    appState.theme = normalizeThemeValue(event.target.value);
    applyEditorTheme(appState.theme);
    updateDocumentChrome();
    await window.desktop.updateState({ theme: appState.theme });
  });

  elements.settingsPreviewTheme.addEventListener("change", async (event) => {
    appState.previewTheme = normalizePreviewThemeValue(event.target.value);
    updateDocumentChrome();
    await renderPreviewNow();
    await window.desktop.updateState({ previewTheme: appState.previewTheme });
  });

  elements.settingsPreviewFont.addEventListener("change", async (event) => {
    appState.previewFontFamily = normalizePreviewFontValue(event.target.value);
    updateDocumentChrome();
    await renderPreviewNow();
    await window.desktop.updateState({ previewFontFamily: appState.previewFontFamily });
  });

  elements.chooseStylesheet.addEventListener("click", async () => {
    const selectedStylesheet = await window.desktop.chooseStylesheet();
    if (!selectedStylesheet) {
      return;
    }

    appState.previewStylesheetPath = selectedStylesheet;
    updateDocumentChrome();
    await renderPreviewNow();
  });

  elements.clearStylesheet.addEventListener("click", async () => {
    appState.previewStylesheetPath = null;
    updateDocumentChrome();
    await renderPreviewNow();
    await window.desktop.updateState({ previewStylesheetPath: null });
  });

  elements.openReference.addEventListener("click", () => {
    openReferenceOverlay();
  });

  elements.openAbout.addEventListener("click", () => {
    openAboutOverlay();
  });

  elements.closeReference.addEventListener("click", () => {
    closeReferenceOverlay();
  });

  elements.closeAbout.addEventListener("click", () => {
    closeAboutOverlay();
  });

  elements.referenceBackdrop.addEventListener("click", () => {
    closeReferenceOverlay();
  });

  elements.aboutBackdrop.addEventListener("click", () => {
    closeAboutOverlay();
  });

  elements.referenceSearch.addEventListener("input", (event) => {
    appState.referenceQuery = event.target.value;
    renderReferenceGuide();
  });

  elements.previewFrame.addEventListener("load", () => {
    installPreviewInteractions(elements.previewFrame);
  });

  elements.previewFrameExpanded.addEventListener("load", () => {
    installPreviewInteractions(elements.previewFrameExpanded);
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
      previewFontFamily: appState.previewFontFamily,
      distractionFree: appState.distractionFree,
      previewStylesheetPath: appState.previewStylesheetPath
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (appState.exportOverlayOpen) {
        closeExportOverlay();
      }

      if (appState.previewOverlayOpen) {
        closePreviewOverlay();
      }

      if (appState.settingsOpen) {
        closeSettingsOverlay();
      }

      if (appState.aboutOpen) {
        closeAboutOverlay();
      }

      if (appState.referenceOpen) {
        closeReferenceOverlay();
      }
    }

    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openReferenceOverlay();
    }

    if ((event.metaKey || event.ctrlKey) && event.key === ",") {
      event.preventDefault();
      openSettingsOverlay();
    }
  });

  document.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest("[data-external-link]") : null;
    if (!link) {
      return;
    }

    event.preventDefault();
    void window.desktop.openExternal(link.getAttribute("href"));
  });

  bindSplitter();
}

function registerBootSequence() {
  void (async () => {
    const { state, initialDocument } = await window.desktop.getBootPayload();
    Object.assign(appState, state, {
      theme: normalizeThemeValue(state?.theme),
      previewTheme: normalizePreviewThemeValue(state?.previewTheme),
      previewFontFamily: normalizePreviewFontValue(state?.previewFontFamily)
    });
    applyEditorTheme(appState.theme);
    updateDocumentChrome();

    if (initialDocument) {
      await openDocument(initialDocument);
    } else {
      await renderPreviewNow();
      await refreshFileTree();
    }
  })();
}

createLayout();
createEditor();
bindEvents();
registerBootSequence();
renderReferenceGuide();
updateDocumentChrome();
void renderPreviewNow();
