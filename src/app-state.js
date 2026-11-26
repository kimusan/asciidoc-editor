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
  appVersion: "",
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
  spellCheckEnabled: true,
  spellCheckLanguage: "en-US",
  typewriterScrolling: false,
  paragraphFocusDimming: false,
  // User-defined snippets merged from the global snippets.json and the
  // current project (.adp). Runtime cache, never persisted in state.json:
  // the files on disk are the source of truth. Entries carry scope:
  // "project" | "global"; project entries sort first.
  snippets: [],
  // Latest update event pushed from the main process; shape:
  // { status: "checking"|"available"|"up-to-date"|"error"|"downloading"|"ready",
  //   version?, mode?, releaseUrl?, percent?, message? }
  updateStatus: null,
  theme: "nord",
  distractionFree: false,
  workspaceCollapsed: false,
  workspaceWidth: 280,
  diffOverlayOpen: false,
  commitOverlayOpen: false,
  gitAuthorName: null,
  gitAuthorEmail: null,
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
  directoryCache: new Map(),
  // Wave 5: git status for the workspace tree. Shape mirrors the git:status
  // IPC payload; { isRepo: false } when the workspace is not a repository.
  gitStatus: { isRepo: false, repoRoot: null, files: [] }
};

export const elements = {};

export const editorRef = { view: null };
