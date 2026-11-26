// Single source of truth for the app's action menu structure. The same ids
// drive the kebab popover, the command palette, and the native menu bar
// (pushed to the main process over IPC and rebuilt there), so the three
// surfaces can never drift apart.
//
// "separator" marks a divider. Every other entry is an action id that
// main.js resolves through getAppActions().

export const MENU_LAYOUT = [
  {
    label: "File",
    items: [
      "newDocument",
      "openFile",
      "openProject",
      "separator",
      "saveFile",
      "saveFileAs",
      "closeDocument",
      "saveProject",
      "separator",
      "exportDocument"
    ]
  },
  {
    label: "View",
    items: [
      "toggleOutline",
      "openReference",
      "separator",
      "findInDocument",
      "searchWorkspace",
      "formatTable",
      "separator",
      "toggleFocusMode",
      "expandPreview",
      "commandPalette"
    ]
  },
  {
    label: "Help",
    items: ["openHelp", "openSettings", "separator", "about"]
  }
];

// The kebab popover shows the actions that have no dedicated strip button.
// High-frequency verbs (Save, New, Outline, Reference, Settings) stay in the
// tab strip itself; this list carries the rest.
export const KEBAB_LAYOUT = [
  "openFile",
  "openProject",
  "separator",
  "saveFileAs",
  "closeDocument",
  "saveProject",
  "exportDocument",
  "separator",
  "findInDocument",
  "searchWorkspace",
  "formatTable",
  "separator",
  "toggleFocusMode",
  "expandPreview",
  "separator",
  "openHelp",
  "about"
];
