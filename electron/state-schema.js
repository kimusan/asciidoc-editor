// Schema for the persisted app state (state.json). The main process is the
// only writer and uses this to validate everything the renderer sends through
// the state:update channel: unknown keys and type-mismatched values are
// dropped instead of being merged into the persisted state.

const STATE_SCHEMA = {
  currentProjectPath: "string?",
  workspacePath: "string?",
  openFilePath: "string?",
  openDocuments: "array",
  activeDocumentId: "string?",
  nextDocumentId: "number",
  untitledSequence: "number",
  zoomLevel: "number",
  recentFiles: "array",
  recentProjects: "array",
  projectSessions: "object",
  theme: "string",
  previewFontFamily: "string",
  previewColorScheme: "string",
  editorFontSize: "string",
  pdfPaperSize: "string",
  autoCheckUpdates: "boolean",
  distractionFree: "boolean",
  workspaceCollapsed: "boolean",
  outlineCollapsed: "boolean",
  previewStylesheetPath: "string?",
  pdfStylesheetPath: "string?"
};

export function sanitizePartialState(partialState) {
  if (!partialState || typeof partialState !== "object" || Array.isArray(partialState)) {
    return {};
  }

  const sanitized = {};
  for (const [key, kind] of Object.entries(STATE_SCHEMA)) {
    if (!(key in partialState)) {
      continue;
    }

    const value = partialState[key];
    if (value === null) {
      if (kind.endsWith("?")) {
        sanitized[key] = null;
      }
      continue;
    }

    const expected = kind.replace("?", "");
    const actual = Array.isArray(value) ? "array" : typeof value;
    if (actual === expected) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
