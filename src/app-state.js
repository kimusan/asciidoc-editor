// Shared renderer state. appState is a single mutable const object, so every
// module importing it sees the same instance; elements is populated once by
// createLayout() in main.js. The editor view lives in a holder object because
// ES module exports are read-only bindings - a bare `let` in one module
// cannot be reassigned from another.

export const appState = {
  openDocuments: [],
  activeDocumentId: null,
  nextDocumentId: 1,
  untitledSequence: 1,
  zoomLevel: 0,
  diagnostics: [],
  diagnosticsCursor: 0,
  currentProjectPath: null,
  currentProjectName: null,
  workspacePath: null,
  openFilePath: null,
  recentFiles: [],
  recentProjects: [],
  projectSessions: {},
  previewStylesheetPath: null,
  pdfStylesheetPath: null,
  previewFontFamily: "serif",
  previewColorScheme: "auto",
  editorFontSize: "default",
  pdfPaperSize: "A4",
  autoCheckUpdates: true,
  // Latest update event pushed from the main process; shape:
  // { status: "checking"|"available"|"up-to-date"|"error"|"downloading"|"ready",
  //   version?, mode?, releaseUrl?, percent?, message? }
  updateStatus: null,
  theme: "nord",
  distractionFree: false,
  workspaceCollapsed: false,
  outlineCollapsed: false,
  workspaceQuery: "",
  workspaceContentSearchOpen: false,
  workspaceContentQuery: "",
  workspaceContentCaseSensitive: false,
  workspaceContentWholeWord: false,
  workspaceContentRegex: false,
  workspaceContentResults: [],
  workspaceContentSummary: "Search across the current workspace.",
  workspaceContentBusy: false,
  outlineEntries: [],
  editorSearchOpen: false,
  editorSearchQuery: "",
  editorReplaceOpen: false,
  editorReplaceQuery: "",
  editorReplaceAllOpenFiles: false,
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
  autoSaveTimer: null,
  renderTimer: null,
  syncTimer: null,
  outlineTimer: null,
  metricsTimer: null,
  lastPreviewDocument: null,
  expandedPreviewStale: true,
  // Guards two-way scroll sync against feedback loops: the side currently
  // driving scrolling owns the lock until "until" (ms epoch); the other
  // side must not scroll while the lock is live.
  scrollSyncLock: { owner: null, until: 0 },
  directoryCache: new Map()
};

export const elements = {};

export const editorRef = { view: null };
