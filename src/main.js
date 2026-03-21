import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { autocompletion } from "@codemirror/autocomplete";
import {
  search,
  searchKeymap,
  highlightSelectionMatches,
  SearchQuery,
  setSearchQuery,
  getSearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll
} from "@codemirror/search";
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
  }),
  material: createEditorTheme({
    bg: "#f7f2fa",
    text: "#1d1b20",
    gutter: "#efe7f3",
    gutterText: "#7a757f",
    gutterBorder: "rgba(73, 69, 79, 0.12)",
    activeLine: "rgba(103, 80, 164, 0.08)",
    activeLineGutter: "rgba(103, 80, 164, 0.12)",
    selection: "rgba(98, 91, 113, 0.24)",
    heading: "#6750a4",
    comment: "#7d7489",
    keyword: "#7f67be",
    string: "#2e7d32",
    attribute: "#00639b",
    url: "#0b57d0",
    literal: "#b3261e",
    quote: "#8e24aa",
    emphasis: "#49454f",
    strong: "#1d1b20"
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
  },
  material: {
    "--page-bg": "radial-gradient(circle at 12% 10%, rgba(103, 80, 164, 0.18), transparent 24%), radial-gradient(circle at 88% 12%, rgba(98, 91, 113, 0.16), transparent 22%), linear-gradient(180deg, #f8f4ff 0%, #f4eff8 48%, #ece6f0 100%)",
    "--panel-bg": "rgba(255, 251, 254, 0.82)",
    "--panel-bg-strong": "rgba(255, 251, 254, 0.96)",
    "--panel-border": "rgba(73, 69, 79, 0.08)",
    "--text-primary": "#1d1b20",
    "--text-secondary": "rgba(29, 27, 32, 0.7)",
    "--text-tertiary": "rgba(29, 27, 32, 0.48)",
    "--accent": "#6750a4",
    "--accent-strong": "#7f67be",
    "--focus-ring": "rgba(103, 80, 164, 0.42)",
    "--control-bg": "rgba(29, 27, 32, 0.04)",
    "--control-bg-hover": "rgba(29, 27, 32, 0.08)",
    "--control-border": "rgba(73, 69, 79, 0.1)",
    "--control-border-hover": "rgba(103, 80, 164, 0.28)",
    "--shadow": "0 24px 72px rgba(103, 80, 164, 0.12)"
  }
};

const PREVIEW_FONT_OPTIONS = [
  { value: "serif", label: "Serif" },
  { value: "sans", label: "Sans" },
  { value: "mono", label: "Mono" }
];

const PDF_PAPER_OPTIONS = [
  { value: "A4", label: "A4" },
  { value: "Letter", label: "Letter" },
  { value: "Legal", label: "Legal" },
  { value: "A3", label: "A3" },
  { value: "A5", label: "A5" },
  { value: "Tabloid", label: "Tabloid" }
];

const APP_THEME_OPTIONS = [
  { value: "nocturne", label: "Nocturne" },
  { value: "porcelain", label: "Porcelain" },
  { value: "nord", label: "Nord" },
  { value: "darcula", label: "Darcula" },
  { value: "solarized", label: "Solarized" },
  { value: "material", label: "Material Design" }
];

const DEFAULT_DOCUMENT_CONTENT = "= Untitled\n\nStart writing...";

const ICONS = {
  brand: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h8.379a2 2 0 0 1 1.414.586l3.12 3.12A2 2 0 0 1 19 9.121V18.5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 18.5z" fill="currentColor" opacity=".18"/><path d="M8 11.5h8M8 15h5M14 4v4h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h3.586a2 2 0 0 1 1.414.586l1.12 1.121A2 2 0 0 0 13.035 9H18.5A1.5 1.5 0 0 1 20 10.5v7A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  fileAsciiDoc: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.75A1.75 1.75 0 0 1 7.75 3h7.79a2 2 0 0 1 1.42.59l2.45 2.45a2 2 0 0 1 .59 1.42v10.79A1.75 1.75 0 0 1 18.25 20h-10.5A1.75 1.75 0 0 1 6 18.25Z" fill="currentColor" opacity=".14"/><path d="M8.5 9.25h7M8.5 12h7M8.5 14.75h4.5M15 3.5v3.5h3.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  fileCode: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 8-3.5 4 3.5 4M15 8l3.5 4-3.5 4M13 6l-2 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  fileImage: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="5.5" width="15" height="13" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="10" r="1.4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m6.5 16 3.5-3 2.5 2 2.5-2.5 2.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  filePdf: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.75A1.75 1.75 0 0 1 7.75 3h7.79a2 2 0 0 1 1.42.59l2.45 2.45a2 2 0 0 1 .59 1.42v10.79A1.75 1.75 0 0 1 18.25 20h-10.5A1.75 1.75 0 0 1 6 18.25Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8.25 15.25v-5h2.15a1.55 1.55 0 0 1 0 3.1H8.25M13 15.25v-5h1.7a2.5 2.5 0 1 1 0 5ZM15 3.5v3.5h3.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  fileStyle: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.25 5.25h11.5L16 18.75l-4-2-4 2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 9.25h6M9.5 12.25h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  fileText: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.75A1.75 1.75 0 0 1 7.75 3h7.79a2 2 0 0 1 1.42.59l2.45 2.45a2 2 0 0 1 .59 1.42v10.79A1.75 1.75 0 0 1 18.25 20h-10.5A1.75 1.75 0 0 1 6 18.25Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8.5 9.25h7M8.5 12h7M8.5 14.75h5M15 3.5v3.5h3.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  open: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18.5A1.5 1.5 0 0 1 4.5 17V7A1.5 1.5 0 0 1 6 5.5h4l1.5 2H18A1.5 1.5 0 0 1 19.5 9v8A1.5 1.5 0 0 1 18 18.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 12h6m-3-3 3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  save: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h9.879a2 2 0 0 1 1.414.586l.621.621A2 2 0 0 1 19 7.621V17.5A1.5 1.5 0 0 1 17.5 19h-11A1.5 1.5 0 0 1 5 17.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 5v5h7V5M8 19v-5h8v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  export: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v9m0 0 3.5-3.5M12 13 8.5 9.5M6 16.5v1A1.5 1.5 0 0 0 7.5 19h9a1.5 1.5 0 0 0 1.5-1.5v-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  reference: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 5h8A1.5 1.5 0 0 1 17 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 6 17.5v-11A1.5 1.5 0 0 1 7.5 5Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 9h5m-5 3h6m-6 3h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  shortcuts: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="6" width="17" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7.5 10h1.5M11 10h1.5M14.5 10H16M7.5 14h4M13 14h3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  info: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 10v5M12 7.5h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19 12a7.2 7.2 0 0 0-.08-1l1.86-1.45-1.75-3.03-2.25.72a7.55 7.55 0 0 0-1.72-.99L14.7 3h-3.4l-.36 2.25a7.55 7.55 0 0 0-1.72.99l-2.25-.72-1.75 3.03L5.08 11a7.2 7.2 0 0 0 0 2l-1.86 1.45 1.75 3.03 2.25-.72c.53.4 1.11.73 1.72.99L11.3 21h3.4l.36-2.25c.61-.26 1.19-.59 1.72-.99l2.25.72 1.75-3.03L18.92 13c.05-.33.08-.66.08-1Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  focus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4.5H5.5A1.5 1.5 0 0 0 4 6v2.5M16 4.5h2.5A1.5 1.5 0 0 1 20 6v2.5M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  expand: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4H20v5.5M20 4l-7 7M9.5 20H4v-5.5M4 20l7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  preview: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12s3-5.5 8.5-5.5S20.5 12 20.5 12 17.5 17.5 12 17.5 3.5 12 3.5 12Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  collapseSidebar: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v13H5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 5.5v13M13.5 9 10 12l3.5 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  expandSidebar: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v13H5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 5.5v13M10.5 9 14 12l-3.5 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
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
  { title: "MSC Diagram", syntax: "[msc]\n----\nmsc {\n  a,b;\n  a=>b[label=\"hello\"];\n}\n----", detail: "Render message sequence charts inline from MscGen syntax using the built-in MSC renderer.", tags: ["msc", "mscgen", "diagram", "sequence"] },
  { title: "Table", syntax: "|===\n|Name |Role\n|Kim |Editor\n|===", detail: "Pipe-delimited tables support formatting, widths, and nested content.", tags: ["table", "grid", "columns"] },
  { title: "Include", syntax: "include::partials/header.adoc[]", detail: "Reuse content from other files. The editor preview resolves includes relative to the current document.", tags: ["include", "imports", "reuse"] },
  { title: "Conditional", syntax: "ifdef::backend-html5[]\nOnly for HTML\nendif::[]", detail: "Conditionally render blocks based on attributes or backend.", tags: ["ifdef", "ifndef", "conditions"] },
  { title: "Passthrough", syntax: "++++\n<div class=\"custom\">HTML</div>\n++++", detail: "Pass raw HTML or other markup through unchanged.", tags: ["passthrough", "raw", "html"] },
  { title: "Footnote", syntax: "Footnote examplefootnote:[This note appears at the bottom.]", detail: "Add inline footnotes that render automatically in preview and export.", tags: ["footnote", "notes", "references"] }
];

const SHORTCUT_SECTIONS = [
  {
    title: "Document",
    items: [
      {
        title: "Save current document",
        detail: "Write changes to the open file or prompt for a destination when needed.",
        shortcuts: [["Ctrl", "S"], ["Cmd", "S"]]
      },
      {
        title: "Open keyboard help",
        detail: "Show this shortcuts guide from anywhere in the app.",
        shortcuts: [["F1"], ["Ctrl", "/"], ["Cmd", "/"]]
      },
      {
        title: "Close active panel",
        detail: "Dismiss the current overlay or the in-editor search bar.",
        shortcuts: [["Esc"]]
      }
    ]
  },
  {
    title: "Search and Replace",
    items: [
      {
        title: "Find in document",
        detail: "Open the editor search bar and prefill from the current selection when possible.",
        shortcuts: [["Ctrl", "F"], ["Cmd", "F"]]
      },
      {
        title: "Replace in document",
        detail: "Open the search bar with replace controls visible.",
        shortcuts: [["Ctrl", "H"], ["Cmd", "H"]]
      },
      {
        title: "Next match",
        detail: "Jump to the next search hit in the current document.",
        shortcuts: [["F3"], ["Enter"]]
      },
      {
        title: "Previous match",
        detail: "Jump to the previous search hit.",
        shortcuts: [["Shift", "F3"], ["Shift", "Enter"]]
      },
      {
        title: "Replace current match",
        detail: "When the replace field is focused, replace the current match and move on.",
        shortcuts: [["Enter"]]
      }
    ]
  },
  {
    title: "Panels",
    items: [
      {
        title: "Open settings",
        detail: "Adjust theme, preview typography, PDF settings, and custom stylesheets.",
        shortcuts: [["Ctrl", ","], ["Cmd", ","]]
      },
      {
        title: "Open markup reference",
        detail: "Browse searchable AsciiDoc examples and snippets.",
        shortcuts: [["Ctrl", "Shift", "K"], ["Cmd", "Shift", "K"]]
      }
    ]
  }
];

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function renderOptionMarkup(options) {
  return options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("");
}

function renderShortcutSequence(sequence) {
  return `
    <span class="shortcut-sequence">
      ${sequence.map((part) => `<kbd class="shortcut-key">${escapeHtml(part)}</kbd>`).join('<span class="shortcut-plus">+</span>')}
    </span>
  `;
}

function renderShortcutSections() {
  return SHORTCUT_SECTIONS.map((section) => `
    <article class="shortcut-card">
      <div class="shortcut-card-header">
        <h3>${escapeHtml(section.title)}</h3>
      </div>
      <div class="shortcut-list">
        ${section.items.map((item) => `
          <div class="shortcut-row">
            <div class="shortcut-copy">
              <strong>${escapeHtml(item.title)}</strong>
              <p>${escapeHtml(item.detail)}</p>
            </div>
            <div class="shortcut-keyset">
              ${item.shortcuts.map((sequence) => renderShortcutSequence(sequence)).join('<span class="shortcut-or">or</span>')}
            </div>
          </div>
        `).join("")}
      </div>
    </article>
  `).join("");
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

function normalizePreviewFontValue(value) {
  const allowed = new Set(PREVIEW_FONT_OPTIONS.map((option) => option.value));
  return allowed.has(value) ? value : "serif";
}

function normalizePdfPaperSize(value) {
  const allowed = new Set(PDF_PAPER_OPTIONS.map((option) => option.value));
  return allowed.has(value) ? value : "A4";
}

function isAsciiDocFileName(name = "") {
  return /\.(adoc|asciidoc|asc)$/i.test(name);
}

function canPreviewFileName(name = "") {
  return isAsciiDocFileName(name);
}

function getFileTypeMeta(name) {
  if (/\.(adoc|asciidoc|asc)$/i.test(name)) {
    return { icon: ICONS.fileAsciiDoc, kind: "asciidoc" };
  }

  if (/\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(name)) {
    return { icon: ICONS.fileImage, kind: "image" };
  }

  if (/\.(css|scss|sass|less)$/i.test(name)) {
    return { icon: ICONS.fileStyle, kind: "style" };
  }

  if (/\.(pdf)$/i.test(name)) {
    return { icon: ICONS.filePdf, kind: "pdf" };
  }

  if (/\.(js|mjs|cjs|ts|tsx|jsx|json|yml|yaml|xml|html|htm|sh|ps1|bat)$/i.test(name)) {
    return { icon: ICONS.fileCode, kind: "code" };
  }

  return { icon: ICONS.fileText, kind: "text" };
}

function nextUntitledName() {
  const sequence = appState.untitledSequence++;
  return sequence === 1 ? "Untitled.adoc" : `Untitled ${sequence}.adoc`;
}

function createDocumentSession(document = {}) {
  return {
    id: `doc-${appState.nextDocumentId++}`,
    path: document.path ?? null,
    workspacePath: document.workspacePath ?? appState.workspacePath ?? null,
    name: document.name ?? nextUntitledName(),
    content: document.content ?? DEFAULT_DOCUMENT_CONTENT,
    editorState: document.editorState ?? null,
    lastModifiedMs: document.lastModifiedMs ?? null,
    isDirty: Boolean(document.isDirty),
    previewInSync: document.previewInSync ?? !document.isDirty
  };
}

function getDocumentSession(documentId = appState.activeDocumentId) {
  return appState.openDocuments.find((document) => document.id === documentId) ?? null;
}

function getDocumentSessionByPath(filePath) {
  if (!filePath) {
    return null;
  }

  return appState.openDocuments.find((document) => document.path === filePath) ?? null;
}

function syncMirrorStateFromDocument(document) {
  if (!document) {
    appState.activeDocumentId = null;
    appState.openFilePath = null;
    appState.currentFileName = "Untitled.adoc";
    appState.currentContent = DEFAULT_DOCUMENT_CONTENT;
    appState.isDirty = false;
    appState.previewInSync = true;
    return;
  }

  appState.activeDocumentId = document.id;
  appState.openFilePath = document.path;
  appState.currentFileName = document.name;
  appState.currentContent = document.content;
  appState.isDirty = document.isDirty;
  appState.previewInSync = document.previewInSync;
  if (document.workspacePath) {
    appState.workspacePath = document.workspacePath;
  }
}

const appState = {
  openDocuments: [],
  activeDocumentId: null,
  nextDocumentId: 1,
  untitledSequence: 1,
  workspacePath: null,
  openFilePath: null,
  recentFiles: [],
  previewStylesheetPath: null,
  pdfStylesheetPath: null,
  previewFontFamily: "serif",
  pdfPaperSize: "A4",
  theme: "nord",
  distractionFree: false,
  workspaceCollapsed: false,
  workspaceQuery: "",
  editorSearchOpen: false,
  editorSearchQuery: "",
  editorReplaceOpen: false,
  editorReplaceQuery: "",
  editorSearchCaseSensitive: false,
  editorSearchWholeWord: false,
  editorSearchRegex: false,
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
  helpOpen: false,
  aboutOpen: false,
  splitRatio: 0.5,
  previewRenderVersion: 0,
  isHandlingCloseRequest: false,
  renderTimer: null,
  syncTimer: null,
  directoryCache: new Map()
};

const elements = {};
let editorView;
let editorExtensions = [];

const PREVIEW_SHELL_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AsciiDoc Preview</title>
    <style id="preview-style-host">
      html, body {
        margin: 0;
        min-height: 100%;
        background: #ffffff;
      }

      body {
        min-height: 100vh;
      }
    </style>
  </head>
  <body data-preview-shell="true">
    <main id="preview-root"></main>
  </body>
</html>`;

const PREVIEW_SYNC_SELECTOR = [
  "#content h1",
  "#content h2",
  "#content h3",
  "#content h4",
  "#content h5",
  "#content h6",
  "#content .paragraph",
  "#content .listingblock",
  "#content .literalblock",
  "#content .ulist",
  "#content .olist",
  "#content .dlist",
  "#content .imageblock",
  "#content .tableblock",
  "#content .admonitionblock",
  "#content .quoteblock",
  "#content .verseblock",
  "#content .sidebarblock",
  "#content .exampleblock",
  "#content .openblock",
  "#content .stemblock"
].join(", ");

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
          <button id="open-help" class="toolbar-button ghost-button" aria-label="Keyboard shortcuts"><span class="button-icon">${ICONS.shortcuts}</span><span>Help</span></button>
          <button id="open-about" class="toolbar-button ghost-button info-button" aria-label="About AsciiDoc Editor"><span class="button-icon">${ICONS.info}</span></button>
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
            <button id="collapse-workspace" class="toolbar-button ghost-button workspace-toggle" aria-label="Collapse file manager">
              <span class="button-icon">${ICONS.collapseSidebar}</span>
            </button>
          </div>
          <div class="workspace-controls">
            <button id="open-folder" class="toolbar-button ghost-button workspace-button" title="Choose a workspace folder to browse, search, and open files.">
              <span class="button-icon">${ICONS.folder}</span><span>Workspace</span>
            </button>
            <label class="workspace-search-shell">
              <span class="button-icon">${ICONS.search}</span>
              <input id="workspace-search" class="workspace-search" type="search" placeholder="Find files in workspace..." />
            </label>
          </div>
          <div id="file-tree" class="file-tree"></div>
        </aside>
        <button id="expand-workspace" class="workspace-rail" aria-label="Expand file manager" title="Show file manager">
          <span class="button-icon">${ICONS.expandSidebar}</span>
        </button>
        <section class="editor-stage panel">
          <div class="editor-stage-header">
            <button id="exit-focus-mode" class="toolbar-button ghost-button focus-exit-button" type="button" aria-label="Exit focus mode">
              <span class="button-icon">${ICONS.close}</span>
            </button>
            <div class="editor-stage-bar">
              <div class="editor-title-stack">
                <div class="document-meta-row">
                  <div class="document-kicker">Active Draft</div>
                  <div id="document-status" class="document-status">Preview synced</div>
                </div>
                <div id="document-name" class="document-name">Untitled.adoc</div>
              </div>
              <div class="editor-commandbar">
                <div class="command-group">
                  <button id="open-reference" class="toolbar-button ghost-button"><span class="button-icon">${ICONS.reference}</span><span>Reference</span></button>
                </div>
                <div class="command-group">
                  <button id="open-export" class="toolbar-button ghost-button"><span class="button-icon">${ICONS.export}</span><span>Export</span></button>
                </div>
              </div>
            </div>
            <div id="document-tabs" class="document-tabs" role="tablist" aria-label="Open documents"></div>
          </div>
          <div class="editor-surface">
            <div id="split-layout" class="split-layout">
              <section class="split-panel split-panel-editor">
                <div class="split-panel-header">
                  <div class="panel-header-main panel-header-compact">
                    <span class="panel-icon">${ICONS.brand}</span>
                    <div class="panel-title">Editor</div>
                  </div>
                  <div class="editor-panel-meta">
                    <span id="stylesheet-chip" class="panel-chip panel-chip-compact">No custom preview CSS</span>
                    <div class="document-metrics document-metrics-compact">
                      <div class="metric-pill metric-pill-compact">
                        <span class="metric-label">Words</span>
                        <strong id="word-count">0</strong>
                      </div>
                      <div class="metric-pill metric-pill-compact">
                        <span class="metric-label">Lines</span>
                        <strong id="line-count">1</strong>
                      </div>
                    </div>
                  </div>
                </div>
                <div id="editor-searchbar" class="editor-searchbar" hidden>
                  <div class="editor-search-row">
                    <label class="editor-search-shell">
                      <span class="button-icon">${ICONS.search}</span>
                      <input id="editor-search-input" class="editor-search-input" type="search" placeholder="Find in document..." />
                    </label>
                    <div id="editor-search-status" class="editor-search-status">0 matches</div>
                    <div class="editor-search-actions">
                      <button id="editor-search-show-replace" class="toolbar-button ghost-button search-toggle" type="button">Replace</button>
                      <button id="editor-search-case" class="toolbar-button ghost-button search-toggle" type="button">Aa</button>
                      <button id="editor-search-word" class="toolbar-button ghost-button search-toggle" type="button">Word</button>
                      <button id="editor-search-regex" class="toolbar-button ghost-button search-toggle" type="button">.*</button>
                      <button id="editor-search-prev" class="toolbar-button ghost-button" type="button">Prev</button>
                      <button id="editor-search-next" class="toolbar-button ghost-button" type="button">Next</button>
                      <button id="editor-search-close" class="toolbar-button ghost-button" type="button">Close</button>
                    </div>
                  </div>
                  <div id="editor-replace-row" class="editor-search-row editor-replace-row" hidden>
                    <label class="editor-search-shell editor-replace-shell">
                      <span class="editor-search-label">Replace</span>
                      <input id="editor-replace-input" class="editor-search-input" type="text" placeholder="Replace with..." />
                    </label>
                    <div class="editor-search-actions">
                      <button id="editor-replace-next" class="toolbar-button ghost-button" type="button">Replace</button>
                      <button id="editor-replace-all" class="toolbar-button ghost-button" type="button">Replace All</button>
                    </div>
                  </div>
                </div>
                <div id="editor-root" class="editor-root"></div>
              </section>
              <div id="splitter" class="splitter" role="separator" aria-orientation="vertical" aria-label="Resize editor and preview"></div>
              <section class="split-panel split-panel-preview">
                <div class="split-panel-header">
                  <div class="panel-header-main panel-header-compact">
                    <span class="panel-icon">${ICONS.preview}</span>
                  <div class="panel-title">Live Preview</div>
                  </div>
                  <div class="split-panel-actions">
                    <button id="toggle-focus" class="toolbar-button ghost-button focus-button"><span class="button-icon">${ICONS.focus}</span><span id="focus-button-label">Enter Focus</span></button>
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
              <span id="export-pdf-description">Clean print-friendly document export.</span>
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
                <p>Configure preview reading typography.</p>
              </div>
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
            <article class="settings-card">
              <div class="settings-card-header">
                <h3>PDF Export</h3>
                <p>Select the default paper format and optional print stylesheet used for PDF generation.</p>
              </div>
              <label class="settings-field">
                <span>Paper format</span>
                <select id="settings-pdf-paper-size">
                  ${renderOptionMarkup(PDF_PAPER_OPTIONS)}
                </select>
              </label>
              <div class="settings-css-row">
                <div id="settings-pdf-stylesheet-status" class="settings-note">No custom PDF CSS selected.</div>
                <div class="command-group">
                  <button id="choose-pdf-stylesheet" class="toolbar-button ghost-button"><span class="button-icon">${ICONS.export}</span><span>Choose CSS</span></button>
                  <button id="clear-pdf-stylesheet" class="toolbar-button ghost-button"><span>Clear</span></button>
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
      <div id="help-overlay" class="reference-overlay" hidden>
        <div id="help-backdrop" class="reference-backdrop"></div>
        <section class="reference-dialog shortcuts-dialog panel" role="dialog" aria-modal="true" aria-labelledby="help-title">
          <div class="panel-header">
            <div class="panel-header-main">
              <span class="panel-icon">${ICONS.shortcuts}</span>
              <div>
                <div id="help-title" class="panel-title">Keyboard Shortcuts</div>
                <div class="panel-subtitle">Fast access to document, search, and workspace actions.</div>
              </div>
            </div>
            <button id="close-help" class="toolbar-button ghost-button"><span>Close</span></button>
          </div>
          <div class="shortcuts-content">
            <p class="shortcuts-note">Use <strong>Ctrl</strong> on Windows and Linux. The same shortcuts use <strong>Cmd</strong> on macOS where shown.</p>
            <div class="shortcut-grid">
              ${renderShortcutSections()}
            </div>
          </div>
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
  elements.settingsPreviewFont = document.querySelector("#settings-preview-font");
  elements.settingsPdfPaperSize = document.querySelector("#settings-pdf-paper-size");
  elements.settingsStylesheetStatus = document.querySelector("#settings-stylesheet-status");
  elements.chooseStylesheet = document.querySelector("#choose-stylesheet");
  elements.clearStylesheet = document.querySelector("#clear-stylesheet");
  elements.settingsPdfStylesheetStatus = document.querySelector("#settings-pdf-stylesheet-status");
  elements.choosePdfStylesheet = document.querySelector("#choose-pdf-stylesheet");
  elements.clearPdfStylesheet = document.querySelector("#clear-pdf-stylesheet");
  elements.openHelp = document.querySelector("#open-help");
  elements.helpOverlay = document.querySelector("#help-overlay");
  elements.helpBackdrop = document.querySelector("#help-backdrop");
  elements.closeHelp = document.querySelector("#close-help");
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
  elements.exportPdfDescription = document.querySelector("#export-pdf-description");
  elements.fileTree = document.querySelector("#file-tree");
  elements.openFolder = document.querySelector("#open-folder");
  elements.collapseWorkspace = document.querySelector("#collapse-workspace");
  elements.expandWorkspace = document.querySelector("#expand-workspace");
  elements.documentTabs = document.querySelector("#document-tabs");
  elements.workspaceSearch = document.querySelector("#workspace-search");
  elements.workspaceLabel = document.querySelector("#workspace-label");
  elements.exitFocusMode = document.querySelector("#exit-focus-mode");
  elements.documentName = document.querySelector("#document-name");
  elements.documentStatus = document.querySelector("#document-status");
  elements.previewFrame = document.querySelector("#preview-frame");
  elements.stylesheetChip = document.querySelector("#stylesheet-chip");
  elements.editorSearchBar = document.querySelector("#editor-searchbar");
  elements.editorSearchInput = document.querySelector("#editor-search-input");
  elements.editorSearchShowReplace = document.querySelector("#editor-search-show-replace");
  elements.editorReplaceRow = document.querySelector("#editor-replace-row");
  elements.editorReplaceInput = document.querySelector("#editor-replace-input");
  elements.editorReplaceNext = document.querySelector("#editor-replace-next");
  elements.editorReplaceAll = document.querySelector("#editor-replace-all");
  elements.editorSearchStatus = document.querySelector("#editor-search-status");
  elements.editorSearchCase = document.querySelector("#editor-search-case");
  elements.editorSearchWord = document.querySelector("#editor-search-word");
  elements.editorSearchRegex = document.querySelector("#editor-search-regex");
  elements.editorSearchPrev = document.querySelector("#editor-search-prev");
  elements.editorSearchNext = document.querySelector("#editor-search-next");
  elements.editorSearchClose = document.querySelector("#editor-search-close");
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
  elements.previewFrame.srcdoc = PREVIEW_SHELL_HTML;
  elements.previewFrameExpanded.srcdoc = PREVIEW_SHELL_HTML;
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

function buildEditorSearchQuery() {
  return new SearchQuery({
    search: appState.editorSearchQuery,
    replace: appState.editorReplaceQuery,
    caseSensitive: appState.editorSearchCaseSensitive,
    wholeWord: appState.editorSearchWholeWord,
    regexp: appState.editorSearchRegex
  });
}

function updateEditorSearchStatus() {
  if (!editorView) {
    return;
  }

  const query = getSearchQuery(editorView.state);
  if (!query.search) {
    elements.editorSearchStatus.textContent = "0 matches";
    return;
  }

  if (!query.valid) {
    elements.editorSearchStatus.textContent = "Invalid pattern";
    return;
  }

  const cursor = query.getCursor(editorView.state.doc.toString());
  const selection = editorView.state.selection.main;
  let total = 0;
  let current = 0;

  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    total += 1;
    const { from, to } = next.value;
    if (
      (selection.from === from && selection.to === to)
      || (selection.head >= from && selection.head <= to)
    ) {
      current = total;
    }
  }

  elements.editorSearchStatus.textContent = total === 0
    ? "0 matches"
    : `${current || 1}/${total}`;
}

function syncEditorSearchQuery() {
  if (!editorView) {
    return;
  }

  editorView.dispatch({
    effects: setSearchQuery.of(buildEditorSearchQuery())
  });
  updateEditorSearchStatus();
}

function openEditorSearch({ prefillSelection = false, showReplace = false } = {}) {
  appState.editorSearchOpen = true;
  appState.editorReplaceOpen = showReplace || appState.editorReplaceOpen;

  if (prefillSelection) {
    const selection = editorView.state.selection.main;
    const selectedText = selection.empty ? "" : editorView.state.sliceDoc(selection.from, selection.to);
    if (selectedText) {
      appState.editorSearchQuery = selectedText;
    }
  }

  updateDocumentChrome();
  syncEditorSearchQuery();

  requestAnimationFrame(() => {
    elements.editorSearchInput.focus();
    elements.editorSearchInput.select();
  });
}

function closeEditorSearch() {
  appState.editorSearchOpen = false;
  appState.editorReplaceOpen = false;
  appState.editorSearchQuery = "";
  appState.editorReplaceQuery = "";
  updateDocumentChrome();
  syncEditorSearchQuery();
  editorView.focus();
}

function runEditorSearchNavigation(direction) {
  if (!appState.editorSearchOpen) {
    openEditorSearch({ prefillSelection: true });
  }

  syncEditorSearchQuery();
  if (!appState.editorSearchQuery.trim()) {
    return;
  }

  const command = direction === "previous" ? findPrevious : findNext;
  command(editorView);
  updateEditorSearchStatus();
}

function runEditorReplaceNext() {
  if (!appState.editorSearchOpen) {
    openEditorSearch({ prefillSelection: true, showReplace: true });
  }

  syncEditorSearchQuery();
  if (!appState.editorSearchQuery.trim()) {
    return;
  }

  replaceNext(editorView);
  updateEditorSearchStatus();
}

function runEditorReplaceAll() {
  if (!appState.editorSearchOpen) {
    openEditorSearch({ prefillSelection: true, showReplace: true });
  }

  syncEditorSearchQuery();
  if (!appState.editorSearchQuery.trim()) {
    return;
  }

  replaceAll(editorView);
  updateEditorSearchStatus();
}

function createEditorState(doc) {
  return EditorState.create({
    doc,
    extensions: editorExtensions
  });
}

function createEditor() {
  editorExtensions = [
    lineNumbers(),
    history(),
    drawSelection(),
    search(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    autocompletion(),
    keymap.of([
      {
        key: "Mod-f",
        run: () => {
          openEditorSearch({ prefillSelection: true });
          return true;
        }
      },
      {
        key: "Mod-h",
        run: () => {
          openEditorSearch({ prefillSelection: true, showReplace: true });
          return true;
        }
      },
      {
        key: "F3",
        run: () => {
          runEditorSearchNavigation("next");
          return true;
        }
      },
      {
        key: "Shift-F3",
        run: () => {
          runEditorSearchNavigation("previous");
          return true;
        }
      },
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
      const activeDocument = getDocumentSession();
      if (activeDocument) {
        activeDocument.editorState = update.state;
      }

      if (update.docChanged) {
        appState.currentContent = update.state.doc.toString();
        if (appState.isApplyingDocument) {
          return;
        }

        appState.isDirty = true;
        appState.previewInSync = false;
        if (activeDocument) {
          activeDocument.content = appState.currentContent;
          activeDocument.isDirty = true;
          activeDocument.previewInSync = false;
        }
        updateDocumentChrome();
        renderDocumentTabs();
        schedulePreviewRender();
      }

      if ((update.docChanged || update.selectionSet || update.viewportChanged) && !appState.isApplyingDocument) {
        schedulePreviewSync();
      }

      if (update.docChanged || update.selectionSet) {
        updateEditorSearchStatus();
      }
    })
  ];

  editorView = new EditorView({
    state: createEditorState(appState.currentContent),
    parent: document.querySelector("#editor-root")
  });
}

function updateDocumentChrome() {
  const fileName = getCurrentDocumentName();
  const trimmedContent = appState.currentContent.trim();
  const wordCount = trimmedContent ? trimmedContent.split(/\s+/).length : 0;
  const lineCount = appState.currentContent.split("\n").length;

  elements.documentName.textContent = appState.isDirty ? `${fileName} *` : fileName;
  if (!currentDocumentHasPreview()) {
    elements.documentStatus.textContent = "No preview available";
  } else if (appState.isDirty) {
    elements.documentStatus.textContent = appState.previewInSync ? "Unsaved changes" : "Preview updating";
  } else {
    elements.documentStatus.textContent = appState.previewInSync ? "Preview synced" : "Rendering preview";
  }
  const workspacePath = appState.workspacePath ?? "No folder selected";
  elements.workspaceLabel.textContent = workspacePath;
  elements.workspaceLabel.title = appState.workspacePath ?? "";
  elements.openFolder.title = appState.workspacePath
    ? `Current workspace: ${appState.workspacePath}`
    : "Choose a workspace folder to browse, search, and open files.";
  elements.stylesheetChip.textContent = appState.previewStylesheetPath
    ? `Preview CSS: ${appState.previewStylesheetPath.split(/[\\/]/).pop()}`
    : "No custom preview CSS";
  elements.settingsStylesheetStatus.textContent = appState.previewStylesheetPath
    ? appState.previewStylesheetPath.split(/[\\/]/).pop()
    : "No custom preview CSS selected.";
  elements.settingsPdfStylesheetStatus.textContent = appState.pdfStylesheetPath
    ? appState.pdfStylesheetPath.split(/[\\/]/).pop()
    : "No custom PDF CSS selected.";
  elements.wordCount.textContent = String(wordCount);
  elements.lineCount.textContent = String(lineCount);
  elements.focusButtonLabel.textContent = appState.distractionFree ? "Exit Focus" : "Enter Focus";
  elements.shell.classList.toggle("focus-mode", appState.distractionFree);
  elements.shell.classList.toggle("workspace-collapsed", appState.workspaceCollapsed);
  elements.expandWorkspace.hidden = !appState.workspaceCollapsed;
  elements.expandWorkspace.setAttribute("aria-hidden", String(!appState.workspaceCollapsed));
  elements.collapseWorkspace.setAttribute("aria-label", appState.workspaceCollapsed ? "Expand file manager" : "Collapse file manager");
  elements.shell.style.setProperty("--split-ratio", String(appState.splitRatio));
  applyShellTheme(appState.theme);
  elements.settingsAppTheme.value = appState.theme;
  elements.settingsPreviewFont.value = appState.previewFontFamily;
  elements.settingsPdfPaperSize.value = appState.pdfPaperSize;
  elements.editorSearchBar.hidden = !appState.editorSearchOpen;
  elements.editorReplaceRow.hidden = !appState.editorReplaceOpen;
  elements.editorSearchInput.value = appState.editorSearchQuery;
  elements.editorReplaceInput.value = appState.editorReplaceQuery;
  elements.editorSearchShowReplace.classList.toggle("is-active", appState.editorReplaceOpen);
  elements.editorSearchCase.classList.toggle("is-active", appState.editorSearchCaseSensitive);
  elements.editorSearchWord.classList.toggle("is-active", appState.editorSearchWholeWord);
  elements.editorSearchRegex.classList.toggle("is-active", appState.editorSearchRegex);
  const pdfCssSuffix = appState.pdfStylesheetPath ? " with custom PDF CSS." : ".";
  elements.exportPdfDescription.textContent = `Clean print-friendly document export (${appState.pdfPaperSize})${pdfCssSuffix}`;
  elements.settingsOverlay.hidden = !appState.settingsOpen;
  elements.settingsOverlay.classList.toggle("is-open", appState.settingsOpen);
  elements.previewOverlay.hidden = !appState.previewOverlayOpen;
  elements.previewOverlay.classList.toggle("is-open", appState.previewOverlayOpen);
  elements.exportOverlay.hidden = !appState.exportOverlayOpen;
  elements.exportOverlay.classList.toggle("is-open", appState.exportOverlayOpen);
  elements.referenceOverlay.hidden = !appState.referenceOpen;
  elements.referenceOverlay.classList.toggle("is-open", appState.referenceOpen);
  elements.helpOverlay.hidden = !appState.helpOpen;
  elements.helpOverlay.classList.toggle("is-open", appState.helpOpen);
  elements.aboutOverlay.hidden = !appState.aboutOpen;
  elements.aboutOverlay.classList.toggle("is-open", appState.aboutOpen);
  renderDocumentTabs();
}

function setSplitRatio(nextRatio) {
  appState.splitRatio = Math.min(0.75, Math.max(0.25, nextRatio));
  elements.shell.style.setProperty("--split-ratio", String(appState.splitRatio));
}

async function setWorkspaceCollapsed(nextValue) {
  appState.workspaceCollapsed = nextValue;
  updateDocumentChrome();
  await window.desktop.updateState({ workspaceCollapsed: appState.workspaceCollapsed });
}

async function setDistractionFree(nextValue) {
  appState.distractionFree = nextValue;
  updateDocumentChrome();
  await window.desktop.updateState({ distractionFree: appState.distractionFree });
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

function openHelpOverlay() {
  appState.helpOpen = true;
  updateDocumentChrome();
  requestAnimationFrame(() => {
    elements.closeHelp.focus();
  });
}

function closeHelpOverlay() {
  appState.helpOpen = false;
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
  document.documentElement.style.colorScheme = theme === "porcelain" || theme === "solarized" || theme === "material" ? "light" : "dark";
}

function renderDocumentTabs() {
  elements.documentTabs.innerHTML = appState.openDocuments.map((document) => `
    <button
      class="document-tab ${document.id === appState.activeDocumentId ? "is-active" : ""}"
      type="button"
      role="tab"
      aria-selected="${document.id === appState.activeDocumentId}"
      data-document-id="${document.id}"
      title="${escapeHtml(document.path ?? document.name)}"
    >
      <span class="document-tab-label">${escapeHtml(document.name)}</span>
      ${document.isDirty ? `<span class="document-tab-dirty" aria-label="Unsaved changes"></span>` : ""}
      <span class="document-tab-close" data-close-document="${document.id}" aria-label="Close ${escapeHtml(document.name)}">${ICONS.close}</span>
    </button>
  `).join("");
}

async function activateDocument(documentId, options = {}) {
  const document = getDocumentSession(documentId);
  if (!document) {
    return false;
  }

  syncMirrorStateFromDocument(document);
  appState.isApplyingDocument = true;
  editorView.setState(document.editorState ?? createEditorState(document.content));
  appState.isApplyingDocument = false;
  document.editorState = editorView.state;
  appState.currentContent = editorView.state.doc.toString();
  appState.isDirty = document.isDirty;
  appState.previewInSync = document.previewInSync;
  appState.editorSearchOpen = false;
  appState.editorReplaceOpen = false;
  appState.editorSearchQuery = "";
  appState.editorReplaceQuery = "";
  renderDocumentTabs();
  updateDocumentChrome();
  await renderPreviewNow();
  if (options.refreshTree !== false) {
    await refreshFileTree();
  }
  return true;
}

async function openDocument(document) {
  const existingDocument = getDocumentSessionByPath(document.path);
  if (existingDocument) {
    await activateDocument(existingDocument.id);
    return existingDocument;
  }

  const session = createDocumentSession(document);
  appState.openDocuments.push(session);
  if (session.workspacePath) {
    appState.workspacePath = session.workspacePath;
  }
  await activateDocument(session.id);
  return session;
}

function scrollPreviewToTop(frame = elements.previewFrame) {
  frame.contentWindow?.scrollTo({
    top: 0,
    behavior: "auto"
  });
}

function getCurrentDocumentName() {
  return appState.openFilePath?.split(/[\\/]/).pop() ?? appState.currentFileName;
}

function currentDocumentHasPreview() {
  return canPreviewFileName(getCurrentDocumentName());
}

function buildPreviewPayload() {
  return {
    content: appState.currentContent,
    filePath: appState.openFilePath,
    stylesheetPath: appState.previewStylesheetPath,
    previewFontFamily: appState.previewFontFamily,
    pdfPaperSize: appState.pdfPaperSize
  };
}

function waitForPreviewFrameReady(frame) {
  if (frame.contentDocument?.body?.dataset.previewShell === "true") {
    return Promise.resolve(frame.contentDocument);
  }

  return new Promise((resolve) => {
    frame.addEventListener("load", () => {
      resolve(frame.contentDocument);
    }, { once: true });
  });
}

function applyPreviewDocument(frame, previewDocument) {
  const frameDocument = frame.contentDocument;
  const styleHost = frameDocument?.getElementById("preview-style-host");
  const root = frameDocument?.getElementById("preview-root");
  if (!styleHost || !root) {
    return false;
  }

  frameDocument.title = previewDocument.title ?? "AsciiDoc Preview";
  styleHost.textContent = previewDocument.styles ?? "";
  root.innerHTML = previewDocument.body ?? "";
  return true;
}

function buildUnavailablePreviewDocument() {
  const fileName = getCurrentDocumentName();
  const extension = fileName.includes(".")
    ? fileName.split(".").pop()?.toUpperCase()
    : "this";
  const label = extension ? `${extension} files` : "this file type";

  return {
    title: "Preview unavailable",
    styles: `
      html, body {
        margin: 0;
        min-height: 100%;
        background: #ffffff;
        color: #18212b;
        font-family: "Aptos", "Segoe UI Variable Text", "Noto Sans", sans-serif;
      }

      body {
        min-height: 100vh;
      }

      main {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 32px;
      }

      .preview-unavailable {
        width: min(560px, 100%);
        text-align: center;
      }

      .preview-unavailable h2 {
        margin: 0 0 0.65rem;
        font-size: 1.35rem;
        letter-spacing: -0.03em;
      }

      .preview-unavailable p {
        margin: 0;
        color: #5f6975;
        line-height: 1.65;
      }
    `,
    body: `
      <div class="preview-unavailable">
        <h2>No preview available</h2>
        <p>${escapeHtml(label)} can be edited here, but only AsciiDoc documents render in the preview pane.</p>
      </div>
    `,
    syncPoints: []
  };
}

function elementMatchesSyncPoint(element, syncPoint) {
  const tagName = element.tagName;

  switch (syncPoint.context) {
    case "document":
      return tagName === "H1";
    case "section":
      return /^H[1-6]$/.test(tagName);
    case "paragraph":
      return element.classList.contains("paragraph");
    case "listing":
      return element.classList.contains("listingblock");
    case "literal":
      return element.classList.contains("literalblock");
    case "ulist":
      return element.classList.contains("ulist");
    case "olist":
      return element.classList.contains("olist");
    case "dlist":
      return element.classList.contains("dlist");
    case "image":
      return element.classList.contains("imageblock");
    case "table":
      return element.classList.contains("tableblock");
    case "admonition":
      return element.classList.contains("admonitionblock");
    case "quote":
      return element.classList.contains("quoteblock");
    case "verse":
      return element.classList.contains("verseblock");
    case "sidebar":
      return element.classList.contains("sidebarblock");
    case "example":
      return element.classList.contains("exampleblock");
    case "open":
      return element.classList.contains("openblock");
    case "stem":
      return element.classList.contains("stemblock");
    default:
      return false;
  }
}

function applyPreviewSyncPoints(frame, syncPoints = []) {
  const frameDocument = frame.contentDocument;
  if (!frameDocument) {
    return;
  }

  const candidates = Array.from(frameDocument.querySelectorAll(PREVIEW_SYNC_SELECTOR));
  let candidateIndex = 0;

  for (const syncPoint of syncPoints) {
    for (; candidateIndex < candidates.length; candidateIndex += 1) {
      const candidate = candidates[candidateIndex];
      if (!elementMatchesSyncPoint(candidate, syncPoint)) {
        continue;
      }

      candidate.dataset.sourceLine = String(syncPoint.lineNumber);
      candidateIndex += 1;
      break;
    }
  }
}

async function renderPreviewNow() {
  const renderVersion = ++appState.previewRenderVersion;
  appState.previewInSync = false;
  updateDocumentChrome();

  try {
    await Promise.all([
      waitForPreviewFrameReady(elements.previewFrame),
      waitForPreviewFrameReady(elements.previewFrameExpanded)
    ]);

    const previewDocument = currentDocumentHasPreview()
      ? await window.desktop.renderPreview(buildPreviewPayload())
      : buildUnavailablePreviewDocument();
    if (renderVersion !== appState.previewRenderVersion) {
      return;
    }

    applyPreviewDocument(elements.previewFrame, previewDocument);
    applyPreviewDocument(elements.previewFrameExpanded, previewDocument);
    applyPreviewSyncPoints(elements.previewFrame, previewDocument.syncPoints);
    applyPreviewSyncPoints(elements.previewFrameExpanded, previewDocument.syncPoints);
    installPreviewInteractions(elements.previewFrame);
    installPreviewInteractions(elements.previewFrameExpanded);
    appState.previewInSync = true;
    const activeDocument = getDocumentSession();
    if (activeDocument) {
      activeDocument.previewInSync = true;
    }
  } catch (error) {
    if (renderVersion !== appState.previewRenderVersion) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    const fallbackPreviewDocument = {
      title: "Preview failed",
      styles: `
        html, body {
          margin: 0;
          min-height: 100%;
          background: #ffffff;
          color: #171717;
          font-family: "Aptos", "Segoe UI", sans-serif;
        }

        body {
          min-height: 100vh;
          padding: 24px 28px;
        }

        pre {
          white-space: pre-wrap;
          background: #f4f4f4;
          border: 1px solid rgba(23, 23, 23, 0.12);
          border-radius: 12px;
          padding: 14px 16px;
        }
      `,
      body: `<h2>Preview failed</h2><pre>${escapeHtml(message)}</pre>`
    };
    applyPreviewDocument(elements.previewFrame, fallbackPreviewDocument);
    applyPreviewDocument(elements.previewFrameExpanded, fallbackPreviewDocument);
    installPreviewInteractions(elements.previewFrame);
    installPreviewInteractions(elements.previewFrameExpanded);
    appState.previewInSync = false;
    const activeDocument = getDocumentSession();
    if (activeDocument) {
      activeDocument.previewInSync = false;
    }
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

function getSourceSections() {
  return appState.currentContent
    .split("\n")
    .map((line, index) => {
      const match = line.match(/^(={2,6})\s+(.+)$/);
      if (!match) {
        return null;
      }

      return {
        lineNumber: index + 1,
        level: match[1].length,
        title: match[2].trim()
      };
    })
    .filter(Boolean);
}

function getPreviewSectionHeadings(frame = elements.previewFrame) {
  return Array.from(
    frame.contentDocument?.querySelectorAll("#content h2, #content h3, #content h4, #content h5, #content h6") ?? []
  );
}

function getPreviewSyncAnchors(frame = elements.previewFrame) {
  return Array.from(frame.contentDocument?.querySelectorAll("[data-source-line]") ?? [])
    .map((element) => ({
      element,
      lineNumber: Number.parseInt(element.dataset.sourceLine ?? "", 10)
    }))
    .filter((anchor) => Number.isFinite(anchor.lineNumber))
    .sort((left, right) => left.lineNumber - right.lineNumber);
}

function findNearestSectionIndex(lineNumber) {
  const sections = getSourceSections();
  let sectionIndex = -1;

  for (let index = 0; index < sections.length; index += 1) {
    if (sections[index].lineNumber <= lineNumber) {
      sectionIndex = index;
    } else {
      break;
    }
  }

  return sectionIndex;
}

function getLineRatio(lineNumber, startLine, endLine) {
  if (endLine <= startLine) {
    return 0;
  }

  return Math.max(0, Math.min(1, (lineNumber - startLine) / (endLine - startLine)));
}

function getEditorSectionSyncPosition() {
  const lineNumber = getEditorSyncLineNumber();
  const sections = getSourceSections();
  const totalLines = editorView.state.doc.lines;

  if (sections.length === 0) {
    return {
      sectionIndex: -1,
      ratio: getLineRatio(lineNumber, 1, totalLines)
    };
  }

  const sectionIndex = findNearestSectionIndex(lineNumber);
  if (sectionIndex < 0) {
    return {
      sectionIndex,
      ratio: getLineRatio(lineNumber, 1, Math.max(1, sections[0].lineNumber - 1))
    };
  }

  const startLine = sections[sectionIndex].lineNumber;
  const endLine = sectionIndex + 1 < sections.length
    ? Math.max(startLine, sections[sectionIndex + 1].lineNumber - 1)
    : totalLines;

  return {
    sectionIndex,
    ratio: getLineRatio(lineNumber, startLine, endLine)
  };
}

function getEditorSyncLineNumber() {
  const selectionLine = editorView.state.doc.lineAt(editorView.state.selection.main.head).number;
  const viewportStartLine = editorView.state.doc.lineAt(editorView.viewport.from).number;
  const viewportEndLine = editorView.state.doc.lineAt(editorView.viewport.to).number;

  if (selectionLine >= viewportStartLine && selectionLine <= viewportEndLine) {
    return selectionLine;
  }

  return viewportStartLine;
}

function getPreviewViewportHeight(frame) {
  return frame.clientHeight
    || frame.getBoundingClientRect().height
    || frame.contentWindow?.innerHeight
    || 0;
}

function getPreviewScrollMetrics(frame, frameDocument) {
  const scrollingElement = frameDocument.scrollingElement
    || frameDocument.documentElement
    || frameDocument.body;
  const viewportHeight = getPreviewViewportHeight(frame)
    || scrollingElement?.clientHeight
    || 0;
  const documentHeight = Math.max(
    scrollingElement?.scrollHeight ?? 0,
    frameDocument.documentElement?.scrollHeight ?? 0,
    frameDocument.body?.scrollHeight ?? 0
  );

  return {
    scrollingElement,
    viewportHeight,
    maxScrollTop: Math.max(0, documentHeight - viewportHeight)
  };
}

function getElementDocumentTop(element, scrollingElement) {
  if (!element || !scrollingElement) {
    return 0;
  }

  const elementRect = element.getBoundingClientRect();
  return elementRect.top + scrollingElement.scrollTop;
}

function scrollPreviewToSyncPosition(syncPosition, frame = elements.previewFrame, behavior = "auto") {
  const frameWindow = frame.contentWindow;
  const frameDocument = frame.contentDocument;
  if (!frameWindow || !frameDocument) {
    return;
  }

  const headings = getPreviewSectionHeadings(frame);
  const { scrollingElement, viewportHeight, maxScrollTop } = getPreviewScrollMetrics(frame, frameDocument);
  let startTop = 0;
  let endTop = maxScrollTop;

  if (headings.length > 0) {
    if (syncPosition.sectionIndex < 0) {
      endTop = getElementDocumentTop(headings[0], scrollingElement);
    } else {
      const currentHeading = headings[syncPosition.sectionIndex];
      if (!currentHeading) {
        return;
      }

      startTop = getElementDocumentTop(currentHeading, scrollingElement);
      endTop = headings[syncPosition.sectionIndex + 1]
        ? getElementDocumentTop(headings[syncPosition.sectionIndex + 1], scrollingElement)
        : maxScrollTop;
    }
  }

  const targetOffset = startTop + ((endTop - startTop) * syncPosition.ratio);
  const centeredTargetTop = targetOffset - (viewportHeight * 0.5);
  const targetTop = Math.max(0, Math.min(maxScrollTop, centeredTargetTop));

  frameWindow.scrollTo({
    top: targetTop,
    behavior
  });
}

function scrollPreviewToLineNumber(lineNumber, frame = elements.previewFrame, behavior = "auto") {
  const frameWindow = frame.contentWindow;
  const frameDocument = frame.contentDocument;
  if (!frameWindow || !frameDocument) {
    return;
  }

  const anchors = getPreviewSyncAnchors(frame);
  if (anchors.length === 0) {
    const fallbackSyncPosition = getEditorSectionSyncPosition();
    scrollPreviewToSyncPosition(fallbackSyncPosition, frame, behavior);
    return;
  }

  const { scrollingElement, viewportHeight, maxScrollTop } = getPreviewScrollMetrics(frame, frameDocument);
  const totalLines = editorView.state.doc.lines;
  let previousAnchor = null;
  let nextAnchor = null;

  for (const anchor of anchors) {
    if (anchor.lineNumber <= lineNumber) {
      previousAnchor = anchor;
      continue;
    }

    nextAnchor = anchor;
    break;
  }

  const startLine = previousAnchor?.lineNumber ?? 1;
  const endLine = nextAnchor?.lineNumber ?? totalLines;
  const startTop = previousAnchor?.element
    ? getElementDocumentTop(previousAnchor.element, scrollingElement)
    : 0;
  const endTop = nextAnchor?.element
    ? getElementDocumentTop(nextAnchor.element, scrollingElement)
    : maxScrollTop;
  const ratio = getLineRatio(lineNumber, startLine, endLine);
  const targetOffset = startTop + ((endTop - startTop) * ratio);
  const centeredTargetTop = targetOffset - (viewportHeight * 0.5);
  const targetTop = Math.max(0, Math.min(maxScrollTop, centeredTargetTop));

  frameWindow.scrollTo({
    top: targetTop,
    behavior
  });
}

function syncPreviewToEditorPosition() {
  if (!editorView || appState.pendingPreviewAnchor || !currentDocumentHasPreview()) {
    return;
  }

  const syncLine = getEditorSyncLineNumber();
  scrollPreviewToLineNumber(syncLine, elements.previewFrame, "auto");
  scrollPreviewToLineNumber(syncLine, elements.previewFrameExpanded, "auto");
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
          <summary class="tree-entry tree-entry-directory" data-path="${escapeHtml(item.path)}" data-type="directory">
            <span class="tree-entry-content">
              <span class="tree-entry-icon">${ICONS.folder}</span>
              <span class="tree-entry-label">${escapeHtml(item.name)}</span>
            </span>
          </summary>
          <div class="tree-children"></div>
        </details>
      `;
    }

    const isActive = item.path === appState.openFilePath;
    const fileType = getFileTypeMeta(item.name);
    return `
      <button class="tree-entry tree-entry-file is-${fileType.kind} ${isActive ? "is-active" : ""}" data-path="${escapeHtml(item.path)}" data-type="file">
        <span class="tree-entry-content">
          <span class="tree-entry-icon">${fileType.icon}</span>
          <span class="tree-entry-label">${escapeHtml(item.name)}</span>
        </span>
      </button>
    `;
  }).join("");
}

function renderSearchResults(items) {
  return items.map((item) => {
    const isActive = item.path === appState.openFilePath;
    const fileType = getFileTypeMeta(item.name);
    return `
      <button class="tree-entry tree-entry-file tree-entry-search is-${fileType.kind} ${isActive ? "is-active" : ""}" data-path="${escapeHtml(item.path)}" data-type="file">
        <span class="tree-entry-content">
          <span class="tree-entry-icon">${fileType.icon}</span>
          <span class="tree-entry-search-copy">
            <span class="tree-entry-label">${escapeHtml(item.name)}</span>
            <span class="tree-entry-path">${escapeHtml(item.relativePath ?? item.name)}</span>
          </span>
        </span>
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

  if (appState.workspaceQuery.trim()) {
    const results = await window.desktop.searchWorkspace({
      rootPath: appState.workspacePath,
      query: appState.workspaceQuery,
      limit: 200
    });
    elements.fileTree.innerHTML = results.length > 0
      ? renderSearchResults(results)
      : `<p class="empty-state">No AsciiDoc or CSS files match “${escapeHtml(appState.workspaceQuery)}”.</p>`;
    return;
  }

  const rootChildren = await ensureDirectoryLoaded(appState.workspacePath);
  elements.fileTree.innerHTML = renderTreeNodes(rootChildren);

  const rootDetails = Array.from(elements.fileTree.querySelectorAll(":scope > details"));
  await Promise.all(rootDetails.map((node) => fillDetailsNode(node, 0)));
}

function pathWithExtension(name) {
  return /\.(adoc|asciidoc|asc)$/i.test(name) ? name : `${name}.adoc`;
}

async function saveDocumentSession(document, options = {}) {
  if (!document) {
    return false;
  }

  let targetPath = options.saveAs ? null : document.path;
  if (!targetPath) {
    targetPath = await window.desktop.saveDialog({
      defaultPath: pathWithExtension(document.name || "Untitled.adoc"),
      kind: "document"
    });
  }

  if (!targetPath) {
    return false;
  }

  const content = document.id === appState.activeDocumentId ? appState.currentContent : document.content;
  const savedDocument = await window.desktop.saveDocument({
    filePath: targetPath,
    content
  });

  if (!savedDocument) {
    return false;
  }

  document.path = savedDocument.path;
  document.name = savedDocument.name;
  document.workspacePath = savedDocument.workspacePath;
  document.content = savedDocument.content;
  document.lastModifiedMs = savedDocument.lastModifiedMs;
  document.isDirty = false;
  if (document.id === appState.activeDocumentId) {
    syncMirrorStateFromDocument(document);
  }

  await refreshFileTree();
  updateDocumentChrome();
  return true;
}

async function saveCurrentDocument() {
  return saveDocumentSession(getDocumentSession());
}

async function saveAsCurrentDocument() {
  return saveDocumentSession(getDocumentSession(), { saveAs: true });
}

async function confirmCloseDocument(document) {
  if (!document?.isDirty) {
    return true;
  }

  const decision = await window.desktop.confirmUnsaved({
    scope: "document",
    itemName: document.name
  });

  if (decision === "discard") {
    return true;
  }

  if (decision === "save") {
    return saveDocumentSession(document);
  }

  return false;
}

async function closeDocument(documentId) {
  const document = getDocumentSession(documentId);
  if (!document) {
    return false;
  }

  const canClose = await confirmCloseDocument(document);
  if (!canClose) {
    return false;
  }

  const closingIndex = appState.openDocuments.findIndex((item) => item.id === documentId);
  if (closingIndex < 0) {
    return false;
  }

  const wasActive = documentId === appState.activeDocumentId;
  appState.openDocuments.splice(closingIndex, 1);

  if (appState.openDocuments.length === 0) {
    const untitled = createDocumentSession();
    appState.openDocuments.push(untitled);
    await activateDocument(untitled.id);
    return true;
  }

  if (wasActive) {
    const nextDocument = appState.openDocuments[Math.max(0, closingIndex - 1)] ?? appState.openDocuments[0];
    await activateDocument(nextDocument.id);
  } else {
    updateDocumentChrome();
    await refreshFileTree();
  }

  return true;
}

async function confirmApplicationClose() {
  const unsavedDocuments = appState.openDocuments.filter((document) => document.isDirty);
  if (unsavedDocuments.length === 0) {
    return true;
  }

  const decision = await window.desktop.confirmUnsaved({
    scope: "app",
    count: unsavedDocuments.length
  });

  if (decision === "discard") {
    return true;
  }

  if (decision === "save") {
    for (const document of unsavedDocuments) {
      const saved = await saveDocumentSession(document);
      if (!saved) {
        return false;
      }
    }

    return true;
  }

  return false;
}

async function persistWindowState() {
  await window.desktop.updateState({
    workspacePath: appState.workspacePath,
    openFilePath: appState.openFilePath,
    theme: appState.theme,
    previewFontFamily: appState.previewFontFamily,
    pdfPaperSize: appState.pdfPaperSize,
    distractionFree: appState.distractionFree,
    workspaceCollapsed: appState.workspaceCollapsed,
    previewStylesheetPath: appState.previewStylesheetPath,
    pdfStylesheetPath: appState.pdfStylesheetPath
  });
}

async function exportCurrentDocument(format) {
  const extensionMap = {
    html: "html",
    pdf: "pdf",
    docbook: "xml"
  };
  const destinationPath = await window.desktop.saveDialog({
    defaultPath: (appState.openFilePath ?? pathWithExtension(appState.currentFileName || "Untitled.adoc"))
      .replace(/\.(adoc|asciidoc|asc)$/i, `.${extensionMap[format]}`),
    kind: format
  });

  if (!destinationPath) {
    return;
  }

  await window.desktop.exportDocument({
    source: appState.currentContent,
    filePath: appState.openFilePath,
    destinationPath,
    format,
    stylesheetPath: format === "pdf" ? appState.pdfStylesheetPath : appState.previewStylesheetPath,
    previewFontFamily: appState.previewFontFamily,
    pdfPaperSize: appState.pdfPaperSize
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
      appState.workspaceQuery = "";
      elements.workspaceSearch.value = "";
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

  elements.collapseWorkspace.addEventListener("click", () => {
    void setWorkspaceCollapsed(true);
  });

  elements.expandWorkspace.addEventListener("click", () => {
    void setWorkspaceCollapsed(false);
  });

  document.querySelector("#toggle-focus").addEventListener("click", async () => {
    await setDistractionFree(!appState.distractionFree);
  });

  elements.exitFocusMode.addEventListener("click", async () => {
    await setDistractionFree(false);
  });

  elements.openSettings.addEventListener("click", () => {
    openSettingsOverlay();
  });

  elements.openHelp.addEventListener("click", () => {
    openHelpOverlay();
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

  elements.settingsPreviewFont.addEventListener("change", async (event) => {
    appState.previewFontFamily = normalizePreviewFontValue(event.target.value);
    updateDocumentChrome();
    await renderPreviewNow();
    await window.desktop.updateState({ previewFontFamily: appState.previewFontFamily });
  });

  elements.settingsPdfPaperSize.addEventListener("change", async (event) => {
    appState.pdfPaperSize = normalizePdfPaperSize(event.target.value);
    updateDocumentChrome();
    await window.desktop.updateState({ pdfPaperSize: appState.pdfPaperSize });
  });

  elements.chooseStylesheet.addEventListener("click", async () => {
    const selectedStylesheet = await window.desktop.chooseStylesheet("preview");
    if (!selectedStylesheet) {
      return;
    }

    appState.previewStylesheetPath = selectedStylesheet;
    updateDocumentChrome();
    await renderPreviewNow();
    await window.desktop.updateState({ previewStylesheetPath: appState.previewStylesheetPath });
  });

  elements.clearStylesheet.addEventListener("click", async () => {
    appState.previewStylesheetPath = null;
    updateDocumentChrome();
    await renderPreviewNow();
    await window.desktop.updateState({ previewStylesheetPath: null });
  });

  elements.choosePdfStylesheet.addEventListener("click", async () => {
    const selectedStylesheet = await window.desktop.chooseStylesheet("pdf");
    if (!selectedStylesheet) {
      return;
    }

    appState.pdfStylesheetPath = selectedStylesheet;
    updateDocumentChrome();
    await window.desktop.updateState({ pdfStylesheetPath: appState.pdfStylesheetPath });
  });

  elements.clearPdfStylesheet.addEventListener("click", async () => {
    appState.pdfStylesheetPath = null;
    updateDocumentChrome();
    await window.desktop.updateState({ pdfStylesheetPath: null });
  });

  elements.editorSearchInput.addEventListener("input", () => {
    appState.editorSearchQuery = elements.editorSearchInput.value;
    syncEditorSearchQuery();
  });

  elements.editorSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runEditorSearchNavigation(event.shiftKey ? "previous" : "next");
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeEditorSearch();
    }
  });

  elements.editorSearchShowReplace.addEventListener("click", () => {
    appState.editorReplaceOpen = !appState.editorReplaceOpen;
    updateDocumentChrome();
    if (appState.editorReplaceOpen) {
      requestAnimationFrame(() => {
        elements.editorReplaceInput.focus();
      });
    } else {
      elements.editorSearchInput.focus();
    }
  });

  elements.editorReplaceInput.addEventListener("input", () => {
    appState.editorReplaceQuery = elements.editorReplaceInput.value;
    syncEditorSearchQuery();
  });

  elements.editorReplaceInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runEditorReplaceNext();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeEditorSearch();
    }
  });

  elements.editorSearchCase.addEventListener("click", () => {
    appState.editorSearchCaseSensitive = !appState.editorSearchCaseSensitive;
    updateDocumentChrome();
    syncEditorSearchQuery();
  });

  elements.editorSearchWord.addEventListener("click", () => {
    appState.editorSearchWholeWord = !appState.editorSearchWholeWord;
    updateDocumentChrome();
    syncEditorSearchQuery();
  });

  elements.editorSearchRegex.addEventListener("click", () => {
    appState.editorSearchRegex = !appState.editorSearchRegex;
    updateDocumentChrome();
    syncEditorSearchQuery();
  });

  elements.editorSearchPrev.addEventListener("click", () => {
    runEditorSearchNavigation("previous");
  });

  elements.editorSearchNext.addEventListener("click", () => {
    runEditorSearchNavigation("next");
  });

  elements.editorSearchClose.addEventListener("click", () => {
    closeEditorSearch();
  });

  elements.editorReplaceNext.addEventListener("click", () => {
    runEditorReplaceNext();
  });

  elements.editorReplaceAll.addEventListener("click", () => {
    runEditorReplaceAll();
  });

  elements.openReference.addEventListener("click", () => {
    openReferenceOverlay();
  });

  elements.openAbout.addEventListener("click", () => {
    openAboutOverlay();
  });

  elements.closeHelp.addEventListener("click", () => {
    closeHelpOverlay();
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

  elements.helpBackdrop.addEventListener("click", () => {
    closeHelpOverlay();
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

  elements.documentTabs.addEventListener("click", async (event) => {
    const closeButton = event.target.closest("[data-close-document]");
    if (closeButton) {
      event.preventDefault();
      event.stopPropagation();
      await closeDocument(closeButton.dataset.closeDocument);
      return;
    }

    const tab = event.target.closest("[data-document-id]");
    if (!tab || tab.dataset.documentId === appState.activeDocumentId) {
      return;
    }

    await activateDocument(tab.dataset.documentId);
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

  elements.workspaceSearch.addEventListener("input", () => {
    appState.workspaceQuery = elements.workspaceSearch.value;
    void refreshFileTree();
  });

  window.addEventListener("beforeunload", () => {
    void persistWindowState();
  });

  window.desktop.onAppCloseRequested(async ({ requestId }) => {
    if (appState.isHandlingCloseRequest) {
      await window.desktop.respondToAppCloseRequest({ requestId, allowClose: false });
      return;
    }

    appState.isHandlingCloseRequest = true;
    const allowClose = await confirmApplicationClose();
    if (allowClose) {
      await persistWindowState();
    }
    appState.isHandlingCloseRequest = false;
    await window.desktop.respondToAppCloseRequest({ requestId, allowClose });
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

      if (appState.helpOpen) {
        closeHelpOverlay();
      }

      if (appState.aboutOpen) {
        closeAboutOverlay();
      }

      if (appState.referenceOpen) {
        closeReferenceOverlay();
      }

      if (appState.editorSearchOpen) {
        closeEditorSearch();
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

    if (event.key === "F1" || ((event.metaKey || event.ctrlKey) && (event.key === "/" || event.code === "Slash"))) {
      event.preventDefault();
      openHelpOverlay();
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "h") {
      event.preventDefault();
      openEditorSearch({ prefillSelection: true, showReplace: true });
    }

    if (event.key === "F3") {
      event.preventDefault();
      runEditorSearchNavigation(event.shiftKey ? "previous" : "next");
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
      previewFontFamily: normalizePreviewFontValue(state?.previewFontFamily),
      pdfPaperSize: normalizePdfPaperSize(state?.pdfPaperSize),
      workspaceCollapsed: Boolean(state?.workspaceCollapsed)
    });
    applyEditorTheme(appState.theme);

    if (initialDocument) {
      await openDocument(initialDocument);
    } else {
      const untitled = createDocumentSession();
      appState.openDocuments.push(untitled);
      await activateDocument(untitled.id);
    }
  })();
}

createLayout();
createEditor();
bindEvents();
registerBootSequence();
renderReferenceGuide();
updateDocumentChrome();
