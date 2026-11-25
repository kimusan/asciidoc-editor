import { EditorView } from "@codemirror/view";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

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
      },
      ".cm-tooltip.cm-tooltip-autocomplete": {
        backgroundColor: palette.gutter,
        color: palette.text,
        border: `1px solid ${palette.gutterBorder}`,
        borderRadius: "10px",
        boxShadow: "0 12px 32px rgba(0, 0, 0, 0.3)",
        fontFamily: "\"IBM Plex Mono\", \"Cascadia Code\", monospace",
        fontSize: "13px"
      },
      ".cm-tooltip-autocomplete ul li[aria-selected]": {
        backgroundColor: palette.activeLine,
        color: palette.text
      },
      ".cm-tooltip-autocomplete .cm-completionDetail": {
        color: palette.gutterText,
        fontStyle: "normal"
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

export const THEME_STYLES = {
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

export const APP_THEME_VARS = {
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
    "--shadow": "0 24px 72px rgba(0, 0, 0, 0.22)",
    "--preview-shell-bg": "#14181f"
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
    "--shadow": "0 24px 72px rgba(67, 89, 117, 0.12)",
    "--preview-shell-bg": "#ffffff"
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
    "--shadow": "0 24px 72px rgba(7, 11, 17, 0.24)",
    "--preview-shell-bg": "#14181f"
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
    "--shadow": "0 24px 72px rgba(0, 0, 0, 0.28)",
    "--preview-shell-bg": "#14181f"
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
    "--shadow": "0 24px 72px rgba(88, 110, 117, 0.14)",
    "--preview-shell-bg": "#ffffff"
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
    "--shadow": "0 24px 72px rgba(103, 80, 164, 0.12)",
    "--preview-shell-bg": "#ffffff"
  }
};

export const PREVIEW_FONT_OPTIONS = [
  { value: "serif", label: "Serif" },
  { value: "sans", label: "Sans" },
  { value: "mono", label: "Mono" }
];

export const PDF_PAPER_OPTIONS = [
  { value: "A4", label: "A4" },
  { value: "Letter", label: "Letter" },
  { value: "Legal", label: "Legal" },
  { value: "A3", label: "A3" },
  { value: "A5", label: "A5" },
  { value: "Tabloid", label: "Tabloid" }
];

// "auto" follows the app theme (light app themes render a light preview,
// dark themes a dark one); the explicit values override it.
export const PREVIEW_COLOR_SCHEME_OPTIONS = [
  { value: "auto", label: "Match app theme" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" }
];

export const APP_THEME_OPTIONS = [
  { value: "nocturne", label: "Nocturne" },
  { value: "porcelain", label: "Porcelain" },
  { value: "nord", label: "Nord" },
  { value: "darcula", label: "Darcula" },
  { value: "solarized", label: "Solarized" },
  { value: "material", label: "Material Design" }
];

export function normalizeThemeValue(value) {
  if (value === "dark") {
    return "nocturne";
  }

  if (value === "light") {
    return "porcelain";
  }

  return THEME_STYLES[value] ? value : "nocturne";
}

export function normalizePreviewFontValue(value) {
  const allowed = new Set(PREVIEW_FONT_OPTIONS.map((option) => option.value));
  return allowed.has(value) ? value : "serif";
}

export function normalizePdfPaperSize(value) {
  const allowed = new Set(PDF_PAPER_OPTIONS.map((option) => option.value));
  return allowed.has(value) ? value : "A4";
}

export function normalizePreviewColorSchemeValue(value) {
  const allowed = new Set(PREVIEW_COLOR_SCHEME_OPTIONS.map((option) => option.value));
  return allowed.has(value) ? value : "auto";
}
