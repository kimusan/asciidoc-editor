import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
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
import { asciidocLanguage } from "./syntax/asciidoc-language.js";
import { asciidocCompletion, startCompletion } from "./asciidoc-completion.js";
import {
  APP_THEME_OPTIONS,
  APP_THEME_VARS,
  normalizePdfPaperSize,
  normalizePreviewFontValue,
  normalizeThemeValue,
  PDF_PAPER_OPTIONS,
  PREVIEW_FONT_OPTIONS,
  THEME_STYLES
} from "./themes.js";
import { getFileTypeMeta, ICONS } from "./icons.js";
import {
  MARKUP_REFERENCE,
  renderOptionMarkup,
  renderShortcutSections,
  SHORTCUT_SECTIONS
} from "./help-content.js";
import { appState, editorRef, elements } from "./app-state.js";
import {
  acquireScrollSyncLock,
  applyPreviewDocument,
  applyPreviewSyncPoints,
  getEditorSyncLineNumber,
  installReversePreviewSync,
  isScrollSyncLockedBy,
  scrollPreviewToAnchor,
  scrollPreviewToLineNumber,
  waitForPreviewFrameReady
} from "./preview-sync.js";
import {
  canOpenFileInEditor,
  canPreviewFileName,
  escapeHtml,
  getBaseName,
  getParentPath,
  isAsciiDocFileName,
  joinPath,
  setInputElementValue,
  stripExtension
} from "./utils.js";
import { KEBAB_LAYOUT, MENU_LAYOUT } from "./app-menu.js";
import {
  closeCommandPalette,
  initCommandPalette,
  isCommandPaletteOpen,
  openCommandPalette
} from "./command-palette.js";
import "./styles.css";

const themeCompartment = new Compartment();
const editorThemeCompartment = new Compartment();


const DEFAULT_DOCUMENT_CONTENT = "= Untitled\n\nStart writing...";


function nextUntitledName() {
  const sequence = appState.untitledSequence++;
  return sequence === 1 ? "Untitled.adoc" : `Untitled ${sequence}.adoc`;
}


function suggestProjectName() {
  const suggestedName = [
    appState.currentProjectName,
    stripExtension(getBaseName(appState.currentProjectPath || "")),
    stripExtension(getCurrentDocumentName())
  ].find((value) => typeof value === "string" && value.trim());

  return suggestedName || "AsciiDoc Project";
}

function suggestProjectPath() {
  if (appState.currentProjectPath) {
    return appState.currentProjectPath;
  }

  const preferredDirectory = appState.workspacePath || getParentPath(appState.openFilePath || "");
  const suggestedFileName = `${suggestProjectName()}.adp`;
  return joinPath(preferredDirectory, suggestedFileName);
}

function createDocumentSession(document = {}) {
  const documentId = document.id ?? `doc-${appState.nextDocumentId++}`;
  const numericId = Number.parseInt(String(documentId).replace(/^doc-/, ""), 10);
  if (Number.isFinite(numericId)) {
    appState.nextDocumentId = Math.max(appState.nextDocumentId, numericId + 1);
  }

  return {
    id: documentId,
    path: document.path ?? null,
    workspacePath: document.workspacePath ?? appState.workspacePath ?? null,
    name: document.name ?? nextUntitledName(),
    content: document.content ?? DEFAULT_DOCUMENT_CONTENT,
    editorState: document.editorState ?? null,
    lastModifiedMs: document.lastModifiedMs ?? null,
    externalChangePending: Boolean(document.externalChangePending),
    existsOnDisk: document.existsOnDisk ?? true,
    suppressWatchUntil: document.suppressWatchUntil ?? 0,
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

function serializeOpenDocuments() {
  return appState.openDocuments.map((document) => ({
    id: document.id,
    path: document.path,
    workspacePath: document.workspacePath,
    name: document.name,
    content: document.id === appState.activeDocumentId ? appState.currentContent : document.content,
    lastModifiedMs: document.lastModifiedMs ?? null,
    externalChangePending: Boolean(document.externalChangePending),
    existsOnDisk: document.existsOnDisk ?? true,
    isDirty: Boolean(document.isDirty),
    previewInSync: document.previewInSync ?? !document.isDirty
  }));
}

function buildSessionSnapshot() {
  return {
    workspacePath: appState.workspacePath,
    openFilePath: appState.openFilePath,
    openDocuments: serializeOpenDocuments(),
    activeDocumentId: appState.activeDocumentId,
    nextDocumentId: appState.nextDocumentId,
    untitledSequence: appState.untitledSequence
  };
}

function normalizeDocumentPayload(documentPayload) {
  if (!documentPayload) {
    return documentPayload;
  }

  return {
    ...documentPayload,
    workspacePath: appState.currentProjectPath
      ? (appState.workspacePath ?? documentPayload.workspacePath)
      : documentPayload.workspacePath
  };
}

function buildProjectPayload() {
  return {
    projectPath: appState.currentProjectPath,
    defaultPath: suggestProjectPath(),
    name: suggestProjectName(),
    workspacePath: appState.workspacePath,
    previewStylesheetPath: appState.previewStylesheetPath,
    pdfStylesheetPath: appState.pdfStylesheetPath,
    previewFontFamily: appState.previewFontFamily,
    pdfPaperSize: appState.pdfPaperSize
  };
}

// Preview/PDF settings are project-scoped: when a project is open, the
// project file is the source of truth and re-applies its values on every
// boot, so changes must also be written there or they are silently reset
// the next time the app starts.
async function persistProjectScopedSettings() {
  if (!appState.currentProjectPath) {
    return;
  }

  await window.desktop.saveProjectFile(buildProjectPayload());
}

function describeUpdateStatus(status) {
  switch (status?.status) {
    case "checking":
      return "Checking GitHub for a newer release…";
    case "available":
      return status.mode === "manual"
        ? `Version ${status.version} is available — this build updates via download.`
        : `Version ${status.version} is available.`;
    case "downloading":
      return `Downloading update… ${status.percent ?? 0}%`;
    case "ready":
      return "Update downloaded — restarting…";
    case "up-to-date":
      return "You are running the latest release.";
    case "error":
      return status.manual === false
        ? "Startup update check failed (offline?). Use Check now to retry."
        : `Update check failed: ${status.message ?? "unknown error"}`;
    default:
      return "No update check has run in this session.";
  }
}

function renderUpdateStatus() {
  const status = appState.updateStatus;
  const isAvailable = status?.status === "available";
  const showProgress = status?.status === "downloading" || status?.status === "ready";

  elements.updateToast.classList.toggle("is-open", Boolean(isAvailable || showProgress));
  if (isAvailable || showProgress) {
    // The update toast owns the bottom-right corner; the chrome hint
    // must never sit on top of it.
    elements.chromeHint?.classList.remove("is-open");
  }
  if (isAvailable) {
    elements.updateToastTitle.textContent = `Version ${status.version} is available`;
    elements.updateToastMessage.textContent = status.mode === "manual"
      ? "This build cannot update itself in place — grab the download from the release page."
      : "Install the update and restart, or keep editing and do it later.";
    elements.updateAccept.textContent = status.mode === "manual"
      ? "Get the download"
      : "Update & restart";
  } else if (showProgress) {
    elements.updateToastTitle.textContent = status.status === "ready"
      ? "Restarting…"
      : "Downloading update…";
    elements.updateToastMessage.textContent = status.status === "ready"
      ? "The new version is starting."
      : `${status.percent ?? 0}% downloaded`;
  }

  elements.updateProgress.classList.toggle("is-visible", showProgress);
  elements.updateProgressFill.style.width = `${showProgress ? (status.percent ?? 100) : 0}%`;
  elements.updateToast.classList.toggle("is-progressing", showProgress);
  elements.updateCheckStatus.textContent = describeUpdateStatus(status);
}

async function handleUpdateAccept() {
  const status = appState.updateStatus;
  if (status?.status !== "available") {
    return;
  }

  if (status.mode === "manual") {
    await window.desktop.openExternal(status.releaseUrl);
    return;
  }

  // Restarting installs the update; give dirty documents the same
  // save-or-discard choice as quitting the app before proceeding.
  const proceed = await confirmApplicationClose();
  if (!proceed) {
    return;
  }

  appState.updateStatus = { status: "downloading", percent: 0 };
  renderUpdateStatus();
  await window.desktop.applyUpdate();
}

function getWatchedDocumentPaths() {
  return appState.openDocuments
    .map((document) => document.path)
    .filter(Boolean);
}

function syncWatchedPaths() {
  void window.desktop.setWatchedPaths(getWatchedDocumentPaths());
}

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
        background: transparent;
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

function createLayout() {
  const app = document.querySelector("#app");
  app.innerHTML = `
    <div class="shell">
      <header class="app-strip">
        <button id="open-about" class="strip-brand" type="button" aria-label="About AsciiDoc Editor" data-tip="About AsciiDoc Editor">
          <span class="brand-mark brand-mark-strip">${ICONS.brand}</span>
        </button>
        <div id="document-tabs" class="document-tabs" role="tablist" aria-label="Open documents"></div>
        <button id="new-document" class="strip-button strip-plus" type="button" aria-label="New document" data-tip="New document (Ctrl+N)">${ICONS.newDocument}</button>
        <div class="strip-spacer"></div>
        <button id="save-file" class="strip-button" type="button" aria-label="Save document" data-tip="Save document (Ctrl+S)">${ICONS.save}</button>
        <button id="toggle-outline" class="strip-button" type="button" aria-label="Toggle outline panel" aria-pressed="true" data-tip="Outline panel">${ICONS.outlineList}</button>
        <button id="open-reference" class="strip-button" type="button" aria-label="Markup reference" data-tip="Markup reference (Ctrl+Shift+K)">${ICONS.reference}</button>
        <span id="document-status" class="sync-dot" role="status" data-state="synced" aria-label="Preview synced"></span>
        <button id="open-kebab" class="strip-button" type="button" aria-label="More actions" aria-haspopup="true" aria-expanded="false" data-tip="More actions" data-tip-align="left">${ICONS.kebab}</button>
        <button id="open-settings" class="strip-button" type="button" aria-label="Settings" data-tip="Settings (Ctrl+,)" data-tip-align="left">${ICONS.settings}</button>
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
            <div class="workspace-action-row">
              <button id="open-folder" class="toolbar-button ghost-button workspace-button workspace-button-compact" title="Choose a workspace folder to browse, search, and open files.">
                <span class="button-icon">${ICONS.folder}</span><span>Workspace</span>
              </button>
              <button id="open-workspace-search" class="toolbar-button ghost-button workspace-button workspace-button-icon" title="Search across saved files in the current workspace." aria-label="Search workspace contents">
                <span class="button-icon">${ICONS.search}</span>
              </button>
            </div>
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
          <div class="editor-surface">
            <div id="split-layout" class="split-layout">
              <section class="split-panel split-panel-editor">
                <div id="editor-searchbar" class="editor-searchbar" hidden>
                  <div class="editor-search-row editor-search-row-primary">
                    <label class="editor-search-shell">
                      <span class="button-icon">${ICONS.search}</span>
                      <input id="editor-search-input" class="editor-search-input" type="search" placeholder="Find in document..." />
                    </label>
                    <div class="editor-search-actions">
                      <button id="editor-search-case" class="toolbar-button ghost-button search-toggle" type="button">Aa</button>
                      <button id="editor-search-word" class="toolbar-button ghost-button search-toggle" type="button">Word</button>
                      <button id="editor-search-regex" class="toolbar-button ghost-button search-toggle" type="button">.*</button>
                      <button id="editor-search-prev" class="toolbar-button ghost-button" type="button">Prev</button>
                      <button id="editor-search-next" class="toolbar-button ghost-button" type="button">Next</button>
                    </div>
                  </div>
                  <div class="editor-search-row editor-search-row-status">
                    <div id="editor-search-status" class="editor-search-status">0 matches</div>
                  </div>
                  <div id="editor-replace-row" class="editor-search-row editor-replace-row" hidden>
                    <label class="editor-search-shell editor-replace-shell">
                      <input id="editor-replace-input" class="editor-search-input" type="text" placeholder="Replace with..." />
                    </label>
                    <div class="editor-search-actions">
                      <button id="editor-replace-next" class="toolbar-button ghost-button" type="button">Replace</button>
                      <button id="editor-replace-all" class="toolbar-button ghost-button" type="button">Replace All</button>
                    </div>
                  </div>
                  <div class="editor-search-row editor-search-row-scope" hidden id="editor-replace-scope-row">
                    <label class="scope-toggle" title="Replace across all open tabs instead of only the current file.">
                      <input id="editor-replace-scope-open-files" type="checkbox" />
                      <span>All open files</span>
                    </label>
                  </div>
                  <div class="editor-search-row editor-search-row-note" hidden id="editor-replace-note-row">
                    <div class="editor-search-note">Replace All is limited to the open tabs you already have loaded.</div>
                  </div>
                </div>
                <div id="editor-root" class="editor-root"></div>
              </section>
              <div id="splitter" class="splitter" role="separator" aria-orientation="vertical" aria-label="Resize editor and preview" tabindex="0" aria-valuemin="25" aria-valuemax="75" aria-valuenow="50"></div>
              <section class="split-panel split-panel-preview">
                <iframe id="preview-frame" class="preview-frame" title="AsciiDoc preview" sandbox="allow-same-origin"></iframe>
              </section>
            </div>
            <aside id="outline-panel" class="outline-panel" aria-label="Document outline">
              <div class="outline-panel-header">
                <div class="panel-header-main panel-header-compact">
                  <span class="panel-icon">${ICONS.reference}</span>
                  <div>
                    <div class="panel-title">Outline</div>
                    <div id="outline-summary" class="panel-subtitle">0 sections</div>
                  </div>
                </div>
                <button id="close-outline" class="toolbar-button ghost-button outline-close-button" type="button" aria-label="Hide outline">
                  <span class="button-icon">${ICONS.close}</span>
                </button>
              </div>
              <div id="outline-list" class="outline-list"></div>
            </aside>
          </div>
        </section>
      </main>
      <button id="exit-focus-mode" class="strip-button focus-exit-button" type="button" aria-label="Exit focus mode" data-tip="Exit focus mode">${ICONS.close}</button>
      <footer class="statusbar" aria-label="Document status">
        <span id="statusbar-sync" class="statusbar-item statusbar-sync" aria-live="polite">Preview synced</span>
        <span id="document-name" class="statusbar-item statusbar-path" title="">Untitled.adoc</span>
        <div class="statusbar-spacer"></div>
        <span class="statusbar-item statusbar-metrics"><span id="word-count">0</span> words · <span id="line-count">1</span> lines</span>
        <button id="stylesheet-chip" class="statusbar-item statusbar-chip" type="button" title="Preview stylesheet — click to open settings">No custom preview CSS</button>
      </footer>
      <div id="kebab-menu" class="kebab-menu" role="menu" aria-label="More actions" hidden></div>
      <div id="chrome-hint" class="chrome-hint" role="status">
        <div class="chrome-hint-body">
          <strong>A slimmer toolbar</strong>
          <span>Press <kbd>Ctrl</kbd>+<kbd>K</kbd> for the command palette, or <kbd>Alt</kbd> for the classic menu bar. Everything still lives in the <strong>⋯</strong> menu too.</span>
        </div>
        <div class="chrome-hint-actions">
          <button id="chrome-hint-shortcuts" class="toolbar-button" type="button">Show shortcuts</button>
          <button id="chrome-hint-dismiss" class="toolbar-button ghost-button" type="button">Got it</button>
        </div>
      </div>
      <div id="preview-overlay" class="reference-overlay">
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
          <iframe id="preview-frame-expanded" class="preview-frame preview-frame-expanded" title="Expanded AsciiDoc preview" sandbox="allow-same-origin"></iframe>
        </section>
      </div>
      <div id="export-overlay" class="reference-overlay">
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
      <div id="settings-overlay" class="reference-overlay">
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
            <article class="settings-card">
              <div class="settings-card-header">
                <h3>Updates</h3>
                <p>Check GitHub for new app releases.</p>
              </div>
              <label class="scope-toggle" title="Look for a newer release shortly after the app starts.">
                <input id="settings-auto-update" type="checkbox" />
                <span>Check for new releases on startup</span>
              </label>
              <div class="settings-css-row">
                <div id="update-check-status" class="settings-note">No update check has run in this session.</div>
                <div class="command-group">
                  <button id="check-updates" class="toolbar-button ghost-button"><span class="button-icon">${ICONS.update}</span><span>Check now</span></button>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>
      <div id="reference-overlay" class="reference-overlay">
        <div id="reference-backdrop" class="reference-backdrop"></div>
        <section class="reference-dialog panel" role="dialog" aria-modal="true" aria-labelledby="reference-title">
          <div class="panel-header">
            <div class="panel-header-main">
              <span class="panel-icon">${ICONS.reference}</span>
              <div>
                <div id="reference-title" class="panel-title">Markup Reference</div>
                <div class="panel-subtitle">Search snippets, insert them into the editor, or open the official AsciiDoc docs.</div>
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
      <div id="workspace-content-overlay" class="reference-overlay">
        <div id="workspace-content-backdrop" class="reference-backdrop"></div>
        <section class="reference-dialog workspace-search-dialog panel" role="dialog" aria-modal="true" aria-labelledby="workspace-content-title">
          <div class="panel-header">
            <div class="panel-header-main">
              <span class="panel-icon">${ICONS.search}</span>
              <div>
                <div id="workspace-content-title" class="panel-title">Workspace Search</div>
                <div class="panel-subtitle">Search across saved files in the current workspace.</div>
              </div>
            </div>
            <button id="close-workspace-search" class="toolbar-button ghost-button"><span>Close</span></button>
          </div>
          <div class="workspace-search-panel">
            <div class="workspace-search-row">
              <label class="reference-search-shell">
                <span class="button-icon">${ICONS.search}</span>
                <input id="workspace-content-query" class="reference-search" type="search" placeholder="Search all workspace files..." />
              </label>
              <button id="workspace-content-run-search" class="toolbar-button" type="button">Search</button>
              <div class="editor-search-actions">
                <button id="workspace-content-case" class="toolbar-button ghost-button search-toggle" type="button">Aa</button>
                <button id="workspace-content-word" class="toolbar-button ghost-button search-toggle" type="button">Word</button>
                <button id="workspace-content-regex" class="toolbar-button ghost-button search-toggle" type="button">.*</button>
              </div>
            </div>
            <div class="workspace-search-summary-row">
              <div id="workspace-content-summary" class="workspace-search-summary">Search across the current workspace.</div>
            </div>
          </div>
          <div id="workspace-content-results" class="workspace-content-results"></div>
        </section>
      </div>
      <div id="help-overlay" class="reference-overlay">
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
            <p class="shortcuts-note">Use <strong>Ctrl</strong> on Windows and Linux. The same shortcuts use <strong>Cmd</strong> on macOS where shown. Looking for a button that moved? Try the <strong>Ctrl+K</strong> command palette, the <strong>⋯</strong> menu in the top-right corner, or press <strong>Alt</strong> for the classic menu bar.</p>
            <div class="shortcut-grid">
              ${renderShortcutSections()}
            </div>
          </div>
        </section>
      </div>
      <div id="about-overlay" class="reference-overlay">
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
      <div id="update-toast" class="update-toast" role="status" aria-live="polite">
        <div class="update-toast-icon">${ICONS.update}</div>
        <div class="update-toast-body">
          <strong id="update-toast-title"></strong>
          <span id="update-toast-message"></span>
          <div id="update-progress" class="update-progress"><div id="update-progress-fill" class="update-progress-fill"></div></div>
        </div>
        <div class="update-toast-actions">
          <button id="update-accept" class="toolbar-button" type="button"></button>
          <button id="update-dismiss" class="toolbar-button ghost-button" type="button">Later</button>
        </div>
      </div>
    </div>
  `;

  // The kebab must exist before the element refs below: entries like
  // #open-project and #save-project live inside it and updateDocumentChrome
  // writes their tooltips.
  renderKebabMenu();

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
  elements.settingsAutoUpdate = document.querySelector("#settings-auto-update");
  elements.updateCheckStatus = document.querySelector("#update-check-status");
  elements.checkUpdates = document.querySelector("#check-updates");
  elements.updateToast = document.querySelector("#update-toast");
  elements.updateToastTitle = document.querySelector("#update-toast-title");
  elements.updateToastMessage = document.querySelector("#update-toast-message");
  elements.updateProgress = document.querySelector("#update-progress");
  elements.updateProgressFill = document.querySelector("#update-progress-fill");
  elements.updateAccept = document.querySelector("#update-accept");
  elements.updateDismiss = document.querySelector("#update-dismiss");
  elements.helpOverlay = document.querySelector("#help-overlay");
  elements.helpBackdrop = document.querySelector("#help-backdrop");
  elements.closeHelp = document.querySelector("#close-help");
  elements.openAbout = document.querySelector("#open-about");
  elements.newDocument = document.querySelector("#new-document");
  elements.openProject = document.querySelector("#open-project");
  elements.saveProject = document.querySelector("#save-project");
  elements.aboutOverlay = document.querySelector("#about-overlay");
  elements.aboutBackdrop = document.querySelector("#about-backdrop");
  elements.closeAbout = document.querySelector("#close-about");
  elements.previewOverlay = document.querySelector("#preview-overlay");
  elements.previewBackdrop = document.querySelector("#preview-backdrop");
  elements.closePreviewOverlay = document.querySelector("#close-preview-overlay");
  elements.previewFrameExpanded = document.querySelector("#preview-frame-expanded");
  elements.exportOverlay = document.querySelector("#export-overlay");
  elements.exportBackdrop = document.querySelector("#export-backdrop");
  elements.closeExport = document.querySelector("#close-export");
  elements.exportFormats = Array.from(document.querySelectorAll("[data-export-format]"));
  elements.exportPdfDescription = document.querySelector("#export-pdf-description");
  elements.fileTree = document.querySelector("#file-tree");
  elements.openFolder = document.querySelector("#open-folder");
  elements.openWorkspaceSearch = document.querySelector("#open-workspace-search");
  elements.collapseWorkspace = document.querySelector("#collapse-workspace");
  elements.expandWorkspace = document.querySelector("#expand-workspace");
  elements.toggleOutline = document.querySelector("#toggle-outline");
  elements.outlinePanel = document.querySelector("#outline-panel");
  elements.outlineList = document.querySelector("#outline-list");
  elements.outlineSummary = document.querySelector("#outline-summary");
  elements.closeOutline = document.querySelector("#close-outline");
  elements.documentTabs = document.querySelector("#document-tabs");
  elements.workspaceSearch = document.querySelector("#workspace-search");
  elements.workspaceLabel = document.querySelector("#workspace-label");
  elements.editorSurface = document.querySelector(".editor-surface");
  elements.editorRoot = document.querySelector("#editor-root");
  elements.exitFocusMode = document.querySelector("#exit-focus-mode");
  elements.documentName = document.querySelector("#document-name");
  elements.documentStatus = document.querySelector("#document-status");
  elements.previewFrame = document.querySelector("#preview-frame");
  elements.stylesheetChip = document.querySelector("#stylesheet-chip");
  elements.editorSearchBar = document.querySelector("#editor-searchbar");
  elements.editorSearchInput = document.querySelector("#editor-search-input");
  elements.editorReplaceRow = document.querySelector("#editor-replace-row");
  elements.editorReplaceScopeRow = document.querySelector("#editor-replace-scope-row");
  elements.editorReplaceNoteRow = document.querySelector("#editor-replace-note-row");
  elements.editorReplaceInput = document.querySelector("#editor-replace-input");
  elements.editorReplaceScopeOpenFiles = document.querySelector("#editor-replace-scope-open-files");
  elements.editorReplaceNext = document.querySelector("#editor-replace-next");
  elements.editorReplaceAll = document.querySelector("#editor-replace-all");
  elements.editorSearchStatus = document.querySelector("#editor-search-status");
  elements.editorSearchCase = document.querySelector("#editor-search-case");
  elements.editorSearchWord = document.querySelector("#editor-search-word");
  elements.editorSearchRegex = document.querySelector("#editor-search-regex");
  elements.editorSearchPrev = document.querySelector("#editor-search-prev");
  elements.editorSearchNext = document.querySelector("#editor-search-next");
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
  elements.workspaceContentOverlay = document.querySelector("#workspace-content-overlay");
  elements.workspaceContentBackdrop = document.querySelector("#workspace-content-backdrop");
  elements.closeWorkspaceSearch = document.querySelector("#close-workspace-search");
  elements.workspaceContentQuery = document.querySelector("#workspace-content-query");
  elements.workspaceContentRunSearch = document.querySelector("#workspace-content-run-search");
  elements.workspaceContentCase = document.querySelector("#workspace-content-case");
  elements.workspaceContentWord = document.querySelector("#workspace-content-word");
  elements.workspaceContentRegex = document.querySelector("#workspace-content-regex");
  elements.workspaceContentSummary = document.querySelector("#workspace-content-summary");
  elements.workspaceContentResults = document.querySelector("#workspace-content-results");
  elements.openKebab = document.querySelector("#open-kebab");
  elements.kebabMenu = document.querySelector("#kebab-menu");
  elements.statusbarSync = document.querySelector("#statusbar-sync");
  elements.chromeHint = document.querySelector("#chrome-hint");
  elements.chromeHintShortcuts = document.querySelector("#chrome-hint-shortcuts");
  elements.chromeHintDismiss = document.querySelector("#chrome-hint-dismiss");
  elements.previewFrame.srcdoc = PREVIEW_SHELL_HTML;
  elements.previewFrameExpanded.srcdoc = PREVIEW_SHELL_HTML;
}

// The single action registry. The kebab popover, the command palette, and
// the native menu bar (shipped to the main process over IPC) are all built
// from these entries, so no action can exist in one surface and miss the
// others.
function getAppActions() {
  return [
    {
      id: "newDocument",
      label: "New document",
      icon: ICONS.newDocument,
      hint: "Ctrl+N",
      run: () => {
        void createUntitledDocument();
      }
    },
    {
      id: "openFile",
      label: "Open file…",
      icon: ICONS.open,
      hint: "Ctrl+O",
      // The only action whose accelerator lives on the native menu: the
      // renderer has no Ctrl+O handler, so the menu is its single key path.
      accelerator: "CmdOrCtrl+O",
      run: async () => {
        const documentPayload = await window.desktop.openFile();
        if (documentPayload) {
          await openDocument(normalizeDocumentPayload(documentPayload));
        }
      }
    },
    {
      id: "openProject",
      label: "Open project…",
      icon: ICONS.openProject,
      run: () => {
        void openProjectDialog();
      }
    },
    {
      id: "saveFile",
      label: "Save document",
      icon: ICONS.save,
      hint: "Ctrl+S",
      run: () => {
        void saveCurrentDocument();
      }
    },
    {
      id: "saveFileAs",
      label: "Save as…",
      icon: ICONS.saveAs,
      run: () => {
        void saveAsCurrentDocument();
      }
    },
    {
      id: "saveProject",
      label: "Save project",
      icon: ICONS.saveProject,
      run: () => {
        void saveCurrentProject();
      }
    },
    {
      id: "exportDocument",
      label: "Export document…",
      icon: ICONS.export,
      run: () => {
        openExportOverlay();
      }
    },
    {
      id: "toggleOutline",
      label: "Toggle outline panel",
      icon: ICONS.outlineList,
      run: () => {
        void setOutlineCollapsed(!appState.outlineCollapsed);
      }
    },
    {
      id: "openReference",
      label: "Markup reference",
      icon: ICONS.reference,
      hint: "Ctrl+Shift+K",
      run: () => {
        openReferenceOverlay();
      }
    },
    {
      id: "findInDocument",
      label: "Find in document",
      icon: ICONS.search,
      hint: "Ctrl+F",
      run: () => {
        openEditorSearch({ prefillSelection: true });
      }
    },
    {
      id: "searchWorkspace",
      label: "Search workspace contents",
      icon: ICONS.search,
      hint: "Ctrl+Shift+F",
      run: () => {
        openWorkspaceSearchOverlay();
      }
    },
    {
      id: "toggleFocusMode",
      label: "Toggle focus mode",
      icon: ICONS.focus,
      run: () => {
        void setDistractionFree(!appState.distractionFree);
      }
    },
    {
      id: "expandPreview",
      label: "Expand preview",
      icon: ICONS.expand,
      run: () => {
        openPreviewOverlay();
      }
    },
    {
      id: "commandPalette",
      label: "Command palette",
      icon: ICONS.command,
      hint: "Ctrl+K",
      run: () => {
        openCommandPalette();
      }
    },
    {
      id: "openSettings",
      label: "Open settings",
      icon: ICONS.settings,
      hint: "Ctrl+,",
      run: () => {
        openSettingsOverlay();
      }
    },
    {
      id: "openHelp",
      label: "Keyboard shortcuts",
      icon: ICONS.shortcuts,
      hint: "F1",
      run: () => {
        openHelpOverlay();
      }
    },
    {
      id: "about",
      label: "About AsciiDoc Editor",
      icon: ICONS.info,
      run: () => {
        openAboutOverlay();
      }
    }
  ];
}

function runActionById(actionId) {
  const action = getAppActions().find((entry) => entry.id === actionId);
  if (action) {
    action.run();
  }
}

// Kebab items whose DOM the chrome updater still touches by id: project
// tooltips and the focus-mode label. Everything else dispatches purely
// through data-action-id.
const KEBAB_DOM_IDS = {
  openProject: "open-project",
  saveProject: "save-project",
  toggleFocusMode: "toggle-focus"
};

function renderKebabMenu() {
  const menu = document.querySelector("#kebab-menu");
  if (!menu) {
    return;
  }

  elements.kebabMenu = menu;
  const actions = new Map(getAppActions().map((action) => [action.id, action]));
  menu.innerHTML = KEBAB_LAYOUT.map((entry) => {
    if (entry === "separator") {
      return `<div class="kebab-separator" role="separator"></div>`;
    }

    const action = actions.get(entry);
    if (!action) {
      return "";
    }

    const domId = KEBAB_DOM_IDS[entry];
    return `
      <button class="kebab-item" role="menuitem" type="button" data-action-id="${entry}"${domId ? ` id="${domId}"` : ""}>
        <span class="kebab-item-icon">${action.icon}</span>
        <span class="kebab-item-label">${entry === "toggleFocusMode" ? `<span id="focus-button-label">Enter Focus</span>` : escapeHtml(action.label)}</span>
        ${action.hint ? `<span class="kebab-shortcut">${escapeHtml(action.hint)}</span>` : ""}
      </button>
    `;
  }).join("");
}

let kebabRestoreFocus = null;

function isKebabMenuOpen() {
  return !elements.kebabMenu.hidden;
}

function setKebabMenu(open) {
  elements.kebabMenu.hidden = !open;
  elements.openKebab.setAttribute("aria-expanded", String(open));
  elements.openKebab.classList.toggle("is-active", open);
  if (open) {
    kebabRestoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    elements.kebabMenu.querySelector(".kebab-item")?.focus();
  } else {
    if (kebabRestoreFocus?.isConnected) {
      kebabRestoreFocus.focus();
    } else {
      editorRef.view?.focus();
    }
    kebabRestoreFocus = null;
  }
}

function buildNativeMenuPayload() {
  const actions = new Map(getAppActions().map((action) => [action.id, action]));
  return {
    menu: MENU_LAYOUT.map((section) => ({
      label: section.label,
      items: section.items.map((id) => {
        if (id === "separator") {
          return "separator";
        }

        const action = actions.get(id);
        return {
          id,
          label: action?.label ?? id,
          accelerator: action?.accelerator
        };
      })
    }))
  };
}

// Preview state for the strip's sync dot plus the statusbar text.
function setPreviewStatus(state, text) {
  elements.documentStatus.dataset.state = state;
  elements.documentStatus.setAttribute("aria-label", text);
  elements.statusbarSync.textContent = text;
}

function jumpToOutlineLine(lineNumber) {
  if (!editorRef.view) {
    return;
  }

  const targetLine = editorRef.view.state.doc.line(Math.min(lineNumber, editorRef.view.state.doc.lines));
  editorRef.view.dispatch({
    selection: { anchor: targetLine.from },
    effects: EditorView.scrollIntoView(targetLine.from, { y: "center" })
  });
  editorRef.view.focus();
}

function initPalette() {
  initCommandPalette({
    paletteIcon: ICONS.command,
    outlineIcon: ICONS.outlineList,
    getActions: () => getAppActions().map((action) => ({
      type: "action",
      label: action.label,
      hint: action.hint,
      icon: action.icon,
      run: action.run
    })),
    getTabs: () => appState.openDocuments.map((doc) => ({
      id: doc.id,
      name: doc.name,
      dirty: doc.isDirty,
      icon: ICONS.fileAsciiDoc
    })),
    getOutline: () => appState.outlineEntries,
    canSearchFiles: () => Boolean(appState.workspacePath),
    searchFiles: async (query) => {
      const results = await window.desktop.searchWorkspace({
        rootPath: appState.workspacePath,
        query,
        limit: 25
      });
      return results
        .filter((result) => canOpenFileInEditor(result.name))
        .map((result) => ({
          name: result.name,
          path: result.path,
          relativePath: result.relativePath,
          icon: getFileTypeMeta(result.name).icon
        }));
    },
    onTab: (documentId) => {
      void activateDocument(documentId);
    },
    onOutline: (lineNumber) => {
      jumpToOutlineLine(lineNumber);
    },
    onFile: (filePath) => {
      void (async () => {
        const documentPayload = await window.desktop.readDocument(filePath);
        if (documentPayload) {
          await openDocument(normalizeDocumentPayload(documentPayload));
        }
      })();
    },
    onClosed: () => {
      editorRef.view?.focus();
    }
  });
}

const CHROME_HINT_STORAGE_KEY = "adoc-chrome-hint-seen";

function dismissChromeHint() {
  localStorage.setItem(CHROME_HINT_STORAGE_KEY, "1");
  elements.chromeHint.classList.remove("is-open");
}

function maybeShowChromeHint() {
  if (localStorage.getItem(CHROME_HINT_STORAGE_KEY)) {
    return;
  }

  setTimeout(() => {
    if (!localStorage.getItem(CHROME_HINT_STORAGE_KEY)) {
      elements.chromeHint.classList.add("is-open");
    }
  }, 1600);
}

function renderReferenceGuide() {
  const query = appState.referenceQuery.trim().toLowerCase();
  const visibleEntries = MARKUP_REFERENCE.map((entry, index) => ({
    ...entry,
    referenceIndex: index
  })).filter((entry) => {
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
        <div class="reference-actions">
          <button class="toolbar-button ghost-button reference-action" type="button" data-insert-reference="${entry.referenceIndex}">Insert Snippet</button>
          <a class="reference-action reference-action-link" href="${escapeHtml(entry.docsUrl)}" data-external-link target="_blank" rel="noreferrer noopener">Official Docs</a>
        </div>
      </article>
    `).join("")
    : `<div class="reference-empty">No reference entries match that search. Try “xref”, “table”, “ifdef”, or “attributes”.</div>`;
}

function applyProjectSettings(project) {
  if (!project) {
    appState.currentProjectPath = null;
    appState.currentProjectName = null;
    return;
  }

  appState.currentProjectPath = project.projectPath;
  appState.currentProjectName = project.name;
  appState.workspacePath = project.workspacePath ?? appState.workspacePath;
  appState.previewStylesheetPath = project.previewStylesheetPath ?? null;
  appState.pdfStylesheetPath = project.pdfStylesheetPath ?? null;
  appState.previewFontFamily = normalizePreviewFontValue(project.previewFontFamily);
  appState.pdfPaperSize = normalizePdfPaperSize(project.pdfPaperSize);
  appState.workspaceQuery = "";
  appState.directoryCache.clear();
  if (elements.workspaceSearch) {
    elements.workspaceSearch.value = "";
  }
}

async function loadProject(project, projectSession = null) {
  applyProjectSettings(project);

  const sessionState = projectSession ?? appState.projectSessions?.[project.projectPath] ?? null;
  const rawDocuments = Array.isArray(sessionState?.openDocuments) ? sessionState.openDocuments : [];
  appState.nextDocumentId = sessionState?.nextDocumentId ?? 1;
  appState.untitledSequence = sessionState?.untitledSequence ?? 1;
  appState.openDocuments = rawDocuments.map((document) => createDocumentSession({
    ...document,
    workspacePath: project.workspacePath
  }));

  if (appState.openDocuments.length === 0) {
    appState.openDocuments.push(createDocumentSession({
      workspacePath: project.workspacePath
    }));
  }

  syncWatchedPaths();
  await refreshFileTree();
  const activeDocument = getDocumentSession(sessionState?.activeDocumentId) ?? appState.openDocuments[0];
  await activateDocument(activeDocument.id);
}

async function openProjectFromBundle(bundle) {
  if (!bundle?.project) {
    return false;
  }

  await loadProject(bundle.project, bundle.projectSession);
  appState.recentProjects = [bundle.project.projectPath, ...(appState.recentProjects ?? []).filter((item) => item !== bundle.project.projectPath)].slice(0, 10);
  await persistWindowState();
  return true;
}

async function openProjectDialog() {
  const canCloseCurrent = await confirmApplicationClose();
  if (!canCloseCurrent) {
    return false;
  }

  const bundle = await window.desktop.openProjectDialog();
  if (!bundle) {
    return false;
  }

  return openProjectFromBundle(bundle);
}

async function saveCurrentProject() {
  const savedProject = await window.desktop.saveProjectFile(buildProjectPayload());
  if (!savedProject) {
    return false;
  }

  applyProjectSettings(savedProject);
  appState.recentProjects = [savedProject.projectPath, ...(appState.recentProjects ?? []).filter((item) => item !== savedProject.projectPath)].slice(0, 10);
  updateDocumentChrome();
  await persistWindowState();
  setPreviewStatus("synced", `Saved project ${savedProject.name}`);
  return true;
}

async function handleIncomingPath(filePath) {
  if (!filePath) {
    return;
  }

  if (/\.adp$/i.test(filePath)) {
    const canCloseCurrent = await confirmApplicationClose();
    if (!canCloseCurrent) {
      return;
    }

    const bundle = await window.desktop.openProjectFile(filePath);
    await openProjectFromBundle(bundle);
    return;
  }

  const documentPayload = await window.desktop.readDocument(filePath);
  if (documentPayload) {
    await openDocument(normalizeDocumentPayload(documentPayload));
  }
}

function buildSnippetInsertion(snippet) {
  const selection = editorRef.view.state.selection.main;
  let insert = snippet;

  if (snippet.includes("\n")) {
    const beforeCharacter = selection.from > 0 ? editorRef.view.state.sliceDoc(selection.from - 1, selection.from) : "";
    const afterCharacter = selection.to < editorRef.view.state.doc.length
      ? editorRef.view.state.sliceDoc(selection.to, selection.to + 1)
      : "";

    if (beforeCharacter && beforeCharacter !== "\n") {
      insert = `\n${insert}`;
    }

    if (afterCharacter && afterCharacter !== "\n") {
      insert = `${insert}\n`;
    }
  }

  return {
    selection,
    insert
  };
}

function insertTextAtSelection(snippet, options = {}) {
  if (!editorRef.view) {
    return;
  }

  const { selection, insert } = buildSnippetInsertion(snippet);
  const anchor = selection.from + insert.length;

  editorRef.view.dispatch({
    changes: {
      from: selection.from,
      to: selection.to,
      insert
    },
    selection: { anchor },
    scrollIntoView: true
  });

  if (options.closeReference) {
    closeReferenceOverlay();
  }

  requestAnimationFrame(() => {
    editorRef.view.focus();
  });
}

function insertReferenceSnippet(referenceIndex) {
  const entry = MARKUP_REFERENCE[referenceIndex];
  if (!entry || !editorRef.view) {
    return;
  }

  insertTextAtSelection(entry.syntax, { closeReference: true });
}

function renderWorkspaceContentResults() {
  const results = appState.workspaceContentResults ?? [];
  elements.workspaceContentResults.innerHTML = results.length > 0
    ? results.map((fileResult) => `
      <article class="workspace-result-card">
        <div class="workspace-result-header">
          <div>
            <strong>${escapeHtml(fileResult.name)}</strong>
            <div class="workspace-result-path">${escapeHtml(fileResult.relativePath)}</div>
          </div>
          <span class="panel-chip panel-chip-compact">${fileResult.matchCount} match${fileResult.matchCount === 1 ? "" : "es"}</span>
        </div>
        <div class="workspace-result-matches">
          ${fileResult.matches.map((match, index) => `
            <button
              class="workspace-result-match"
              type="button"
              data-workspace-result-path="${escapeHtml(fileResult.path)}"
              data-workspace-result-line="${match.lineNumber}"
              data-workspace-result-column="${match.column}"
              data-workspace-result-length="${match.length}"
            >
              <span class="workspace-result-line">Line ${match.lineNumber}:${match.column}</span>
              <span class="workspace-result-preview">${escapeHtml(match.preview)}</span>
            </button>
          `).join("")}
        </div>
      </article>
    `).join("")
    : `<div class="reference-empty">No workspace matches yet. Run a search to inspect occurrences across saved files.</div>`;
}

function openWorkspaceSearchOverlay() {
  appState.workspaceContentSearchOpen = true;
  updateDocumentChrome();
  renderWorkspaceContentResults();
  requestAnimationFrame(() => {
    elements.workspaceContentQuery.focus();
    elements.workspaceContentQuery.select();
  });
}

function closeWorkspaceSearchOverlay() {
  appState.workspaceContentSearchOpen = false;
  updateDocumentChrome();
}

function buildWorkspaceContentOptions() {
  return {
    caseSensitive: appState.workspaceContentCaseSensitive,
    wholeWord: appState.workspaceContentWholeWord,
    regex: appState.workspaceContentRegex
  };
}

function jumpToEditorLocation(lineNumber, column = 1, matchLength = 0) {
  if (!editorRef.view) {
    return;
  }

  const targetLine = editorRef.view.state.doc.line(Math.min(Math.max(1, lineNumber), editorRef.view.state.doc.lines));
  const from = Math.min(targetLine.from + Math.max(0, column - 1), targetLine.to);
  const to = Math.min(from + Math.max(0, matchLength), targetLine.to);
  editorRef.view.dispatch({
    selection: {
      anchor: from,
      head: to
    },
    effects: EditorView.scrollIntoView(from, { y: "center" })
  });
  editorRef.view.focus();
}

async function openWorkspaceResult(resultPath, lineNumber, column, matchLength) {
  const existingDocument = getDocumentSessionByPath(resultPath);
  if (existingDocument) {
    await activateDocument(existingDocument.id);
  } else {
    const documentPayload = await window.desktop.readDocument(resultPath);
    if (!documentPayload) {
      return;
    }
    await openDocument(documentPayload);
  }

  requestAnimationFrame(() => {
    jumpToEditorLocation(lineNumber, column, matchLength);
  });
}

async function runWorkspaceContentSearch() {
  if (!appState.workspacePath) {
    appState.workspaceContentResults = [];
    appState.workspaceContentSummary = "Choose a workspace folder before searching across files.";
    updateDocumentChrome();
    renderWorkspaceContentResults();
    return;
  }

  const query = appState.workspaceContentQuery.trim();
  if (!query) {
    appState.workspaceContentResults = [];
    appState.workspaceContentSummary = "Enter a search query to scan the current workspace.";
    updateDocumentChrome();
    renderWorkspaceContentResults();
    return;
  }

  appState.workspaceContentBusy = true;
  appState.workspaceContentSummary = "Searching workspace files...";
  updateDocumentChrome();

  try {
    const result = await window.desktop.searchWorkspaceContent({
      rootPath: appState.workspacePath,
      query,
      options: buildWorkspaceContentOptions(),
      limit: 250
    });

    appState.workspaceContentResults = result.results ?? [];
    appState.workspaceContentSummary = result.totalMatches > 0
      ? `${result.totalMatches} match${result.totalMatches === 1 ? "" : "es"} in ${result.totalFiles} file${result.totalFiles === 1 ? "" : "s"}.`
      : "No matches found in the current workspace.";
  } catch (error) {
    appState.workspaceContentResults = [];
    appState.workspaceContentSummary = `Workspace search failed: ${error.message}`;
  } finally {
    appState.workspaceContentBusy = false;
    updateDocumentChrome();
    renderWorkspaceContentResults();
  }
}

async function importDroppedAssets(files) {
  if (!editorRef.view || !currentDocumentHasPreview()) {
    return;
  }

  const assetPaths = files
    .map((file) => file?.path)
    .filter(Boolean);

  if (assetPaths.length === 0) {
    return;
  }

  const result = await window.desktop.importAssets({
    assetPaths,
    documentPath: appState.openFilePath,
    workspacePath: appState.workspacePath
  });

  if (!result?.snippets?.length) {
    return;
  }

  insertTextAtSelection(result.snippets.join("\n"));
}

function getOutlineEntries(content = appState.currentContent) {
  const lines = content.split("\n");
  const entries = [];

  lines.forEach((line, index) => {
    const headingMatch = line.match(/^(={1,6})\s+(.+?)\s*$/);
    if (!headingMatch) {
      return;
    }

    entries.push({
      id: `outline-${index + 1}`,
      level: headingMatch[1].length,
      lineNumber: index + 1,
      title: headingMatch[2].trim()
    });
  });

  return entries;
}

function getActiveOutlineLineNumber() {
  if (!editorRef.view || appState.outlineEntries.length === 0) {
    return null;
  }

  const currentLine = editorRef.view.state.doc.lineAt(editorRef.view.state.selection.main.head).number;
  let activeEntry = appState.outlineEntries[0];

  for (const entry of appState.outlineEntries) {
    if (entry.lineNumber > currentLine) {
      break;
    }

    activeEntry = entry;
  }

  return activeEntry?.lineNumber ?? null;
}

function updateActiveOutlineEntry() {
  if (!elements.outlineList) {
    return;
  }

  const activeLineNumber = getActiveOutlineLineNumber();
  elements.outlineList.querySelectorAll(".outline-entry").forEach((entry) => {
    const isActive = Number(entry.dataset.line) === activeLineNumber;
    entry.classList.toggle("is-active", isActive);
    entry.setAttribute("aria-current", isActive ? "true" : "false");
  });
}

function outlineEntriesEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((entry, index) => entry.level === right[index].level
    && entry.lineNumber === right[index].lineNumber
    && entry.title === right[index].title);
}

function renderOutlinePanel() {
  const outlineEntries = currentDocumentHasPreview() ? getOutlineEntries(appState.currentContent) : [];
  const entriesUnchanged = outlineEntriesEqual(outlineEntries, appState.outlineEntries);
  appState.outlineEntries = outlineEntries;

  if (!elements.outlineList || !elements.outlineSummary) {
    return;
  }

  if (!currentDocumentHasPreview()) {
    elements.outlineSummary.textContent = "No outline available";
    elements.outlineList.innerHTML = `<div class="outline-empty">Outline is only available for AsciiDoc documents.</div>`;
    return;
  }

  elements.outlineSummary.textContent = `${outlineEntries.length} section${outlineEntries.length === 1 ? "" : "s"}`;
  if (!entriesUnchanged) {
    elements.outlineList.innerHTML = outlineEntries.length > 0
      ? outlineEntries.map((entry) => `
        <button
          class="outline-entry outline-level-${entry.level}"
          type="button"
          data-line="${entry.lineNumber}"
          title="Jump to line ${entry.lineNumber}"
        >
          <span class="outline-entry-label">${escapeHtml(entry.title)}</span>
        </button>
      `).join("")
      : `<div class="outline-empty">No section headings yet. Add <code>= Title</code> or <code>== Section</code> headings to build an outline.</div>`;
  }

  updateActiveOutlineEntry();
}

function scheduleOutlineUpdate() {
  clearTimeout(appState.outlineTimer);
  appState.outlineTimer = setTimeout(renderOutlinePanel, 300);
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
  if (!editorRef.view) {
    return;
  }

  const query = getSearchQuery(editorRef.view.state);
  if (!query.search) {
    elements.editorSearchStatus.textContent = "0 matches";
    return;
  }

  if (!query.valid) {
    elements.editorSearchStatus.textContent = "Invalid pattern";
    return;
  }

  const cursor = query.getCursor(editorRef.view.state.doc.toString());
  const selection = editorRef.view.state.selection.main;
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
  if (!editorRef.view) {
    return;
  }

  editorRef.view.dispatch({
    effects: setSearchQuery.of(buildEditorSearchQuery())
  });
  updateEditorSearchStatus();
}

function openEditorSearch({ prefillSelection = false, showReplace = false } = {}) {
  if (!editorRef.view) {
    return;
  }

  appState.editorSearchOpen = true;
  appState.editorReplaceOpen = showReplace;

  if (prefillSelection) {
    const selection = editorRef.view.state.selection.main;
    const selectedText = selection.empty ? "" : editorRef.view.state.sliceDoc(selection.from, selection.to);
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
  if (!editorRef.view) {
    return;
  }

  appState.editorSearchOpen = false;
  appState.editorReplaceOpen = false;
  appState.editorSearchQuery = "";
  appState.editorReplaceQuery = "";
  appState.editorReplaceAllOpenFiles = false;
  updateDocumentChrome();
  syncEditorSearchQuery();
  editorRef.view.focus();
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
  command(editorRef.view);
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

  replaceNext(editorRef.view);
  updateEditorSearchStatus();
}

function replaceTextWithQuery(source, query) {
  if (!query.search || !query.valid) {
    return { content: source, matchCount: 0 };
  }

  const cursor = query.getCursor(source);
  let matchCount = 0;
  let previousOffset = 0;
  const parts = [];

  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    const { from, to } = next.value;
    parts.push(source.slice(previousOffset, from), query.replace);
    previousOffset = to;
    matchCount += 1;
  }

  if (matchCount === 0) {
    return { content: source, matchCount: 0 };
  }

  parts.push(source.slice(previousOffset));
  return {
    content: parts.join(""),
    matchCount
  };
}

async function runEditorReplaceAllOpenDocuments() {
  const query = buildEditorSearchQuery();
  if (!query.search.trim() || !query.valid) {
    updateEditorSearchStatus();
    return;
  }

  const activeDocument = getDocumentSession();
  let totalMatches = 0;
  let changedDocumentCount = 0;
  let activeReplacement = null;

  for (const document of appState.openDocuments) {
    const currentContent = document.id === appState.activeDocumentId ? appState.currentContent : document.content;
    const replacement = replaceTextWithQuery(currentContent, query);
    if (replacement.matchCount === 0) {
      continue;
    }

    totalMatches += replacement.matchCount;
    changedDocumentCount += 1;

    if (document.id === appState.activeDocumentId) {
      activeReplacement = replacement;
      continue;
    }

    document.content = replacement.content;
    document.editorState = createEditorState(replacement.content);
    document.isDirty = true;
    document.previewInSync = false;
  }

  if (activeReplacement) {
    editorRef.view.dispatch({
      changes: {
        from: 0,
        to: editorRef.view.state.doc.length,
        insert: activeReplacement.content
      }
    });
  } else if (activeDocument) {
    activeDocument.previewInSync = false;
  }

  renderDocumentTabs();
  scheduleSessionPersistence();
  if (!activeReplacement) {
    updateDocumentChrome();
  }

  elements.editorSearchStatus.textContent = totalMatches === 0
    ? "0 matches"
    : `Replaced ${totalMatches} in ${changedDocumentCount} file${changedDocumentCount === 1 ? "" : "s"}`;
}

function runEditorReplaceAll() {
  if (!appState.editorSearchOpen) {
    openEditorSearch({ prefillSelection: true, showReplace: true });
  }

  syncEditorSearchQuery();
  if (!appState.editorSearchQuery.trim()) {
    return;
  }

  if (appState.editorReplaceAllOpenFiles) {
    void runEditorReplaceAllOpenDocuments();
    return;
  }

  replaceAll(editorRef.view);
  updateEditorSearchStatus();
}

function createEditorState(doc) {
  const themeConfig = THEME_STYLES[appState.theme] ?? THEME_STYLES.nocturne;
  return EditorState.create({
    doc,
    extensions: [
      ...editorExtensions,
      themeCompartment.of(themeConfig.syntax),
      editorThemeCompartment.of(themeConfig.editor)
    ]
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
      {
        key: "Mod-Space",
        run: startCompletion
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
    asciidocCompletion(),
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
        scheduleOutlineUpdate();
        scheduleSessionPersistence();
        schedulePreviewRender();
      }

      if ((update.docChanged || update.selectionSet || update.viewportChanged) && !appState.isApplyingDocument) {
        schedulePreviewSync();
      }

      if (update.docChanged || update.selectionSet) {
        updateEditorSearchStatus();
        updateActiveOutlineEntry();
      }
    })
  ];

  editorRef.view = new EditorView({
    state: createEditorState(appState.currentContent),
    parent: document.querySelector("#editor-root")
  });
}


function updateDocumentMetrics() {
  if (!elements.wordCount || !elements.lineCount) {
    return;
  }

  const doc = editorRef.view?.state.doc;
  const content = doc ? doc.sliceString(0) : appState.currentContent;
  const trimmedContent = content.trim();
  elements.wordCount.textContent = String(trimmedContent ? trimmedContent.split(/\s+/).length : 0);
  elements.lineCount.textContent = String(doc ? doc.lines : content.split("\n").length);
}

function scheduleDocumentMetrics() {
  clearTimeout(appState.metricsTimer);
  appState.metricsTimer = setTimeout(updateDocumentMetrics, 250);
}

function updateDocumentChrome() {
  const fileName = getCurrentDocumentName();
  const activeDocument = getDocumentSession();

  const displayName = activeDocument?.path ?? fileName;
  elements.documentName.textContent = displayName;
  elements.documentName.title = displayName;
  if (activeDocument?.externalChangePending) {
    setPreviewStatus(
      "error",
      activeDocument.existsOnDisk
        ? (activeDocument.isDirty ? "Local changes + newer disk file" : "File changed on disk")
        : "File removed on disk"
    );
  } else if (!currentDocumentHasPreview()) {
    setPreviewStatus("none", "No preview available");
  } else if (appState.isDirty) {
    setPreviewStatus(appState.previewInSync ? "warn" : "busy", appState.previewInSync ? "Unsaved changes" : "Preview updating");
  } else {
    setPreviewStatus(appState.previewInSync ? "synced" : "busy", appState.previewInSync ? "Preview synced" : "Rendering preview");
  }
  const workspacePath = appState.workspacePath ?? "No folder selected";
  elements.workspaceLabel.textContent = workspacePath;
  elements.workspaceLabel.title = appState.workspacePath ?? "";
  elements.openFolder.title = appState.workspacePath
    ? `Current workspace: ${appState.workspacePath}`
    : "Choose a workspace folder to browse, search, and open files.";
  elements.openProject.title = appState.currentProjectPath
    ? `Current project: ${appState.currentProjectName ?? getBaseName(appState.currentProjectPath)}`
    : "Open an AsciiDoc project file (.adp).";
  elements.saveProject.title = appState.currentProjectPath
    ? `Save project ${appState.currentProjectName ?? getBaseName(appState.currentProjectPath)}`
    : "Save the current workspace settings as a project file.";
  elements.stylesheetChip.textContent = appState.previewStylesheetPath
    ? `Preview CSS: ${appState.previewStylesheetPath.split(/[\\/]/).pop()}`
    : "No custom preview CSS";
  elements.settingsStylesheetStatus.textContent = appState.previewStylesheetPath
    ? appState.previewStylesheetPath.split(/[\\/]/).pop()
    : "No custom preview CSS selected.";
  elements.settingsPdfStylesheetStatus.textContent = appState.pdfStylesheetPath
    ? appState.pdfStylesheetPath.split(/[\\/]/).pop()
    : "No custom PDF CSS selected.";
  elements.focusButtonLabel.textContent = appState.distractionFree ? "Exit Focus" : "Enter Focus";
  elements.shell.classList.toggle("focus-mode", appState.distractionFree);
  elements.shell.classList.toggle("workspace-collapsed", appState.workspaceCollapsed);
  elements.expandWorkspace.hidden = !appState.workspaceCollapsed;
  elements.expandWorkspace.setAttribute("aria-hidden", String(!appState.workspaceCollapsed));
  elements.collapseWorkspace.setAttribute("aria-label", appState.workspaceCollapsed ? "Expand file manager" : "Collapse file manager");
  elements.editorSurface.classList.toggle("outline-collapsed", appState.outlineCollapsed);
  elements.outlinePanel.hidden = appState.outlineCollapsed;
  elements.toggleOutline.classList.toggle("is-active", !appState.outlineCollapsed);
  elements.toggleOutline.setAttribute("aria-pressed", String(!appState.outlineCollapsed));
  elements.shell.style.setProperty("--split-ratio", String(appState.splitRatio));
  applyShellTheme(appState.theme);
  elements.settingsAppTheme.value = appState.theme;
  elements.settingsPreviewFont.value = appState.previewFontFamily;
  elements.settingsPdfPaperSize.value = appState.pdfPaperSize;
  elements.settingsAutoUpdate.checked = appState.autoCheckUpdates;
  elements.updateCheckStatus.textContent = describeUpdateStatus(appState.updateStatus);
  elements.editorSearchBar.hidden = !appState.editorSearchOpen;
  elements.editorReplaceRow.hidden = !appState.editorReplaceOpen;
  elements.editorReplaceScopeRow.hidden = !appState.editorReplaceOpen;
  elements.editorReplaceNoteRow.hidden = !(appState.editorReplaceOpen && appState.editorReplaceAllOpenFiles);
  setInputElementValue(elements.editorSearchInput, appState.editorSearchQuery);
  setInputElementValue(elements.editorReplaceInput, appState.editorReplaceQuery);
  elements.editorReplaceScopeOpenFiles.checked = appState.editorReplaceAllOpenFiles;
  elements.editorSearchCase.classList.toggle("is-active", appState.editorSearchCaseSensitive);
  elements.editorSearchWord.classList.toggle("is-active", appState.editorSearchWholeWord);
  elements.editorSearchRegex.classList.toggle("is-active", appState.editorSearchRegex);
  const pdfCssSuffix = appState.pdfStylesheetPath ? " with custom PDF CSS." : ".";
  elements.exportPdfDescription.textContent = `Clean print-friendly document export (${appState.pdfPaperSize})${pdfCssSuffix}`;
  elements.settingsOverlay.classList.toggle("is-open", appState.settingsOpen);
  elements.previewOverlay.classList.toggle("is-open", appState.previewOverlayOpen);
  elements.exportOverlay.classList.toggle("is-open", appState.exportOverlayOpen);
  elements.referenceOverlay.classList.toggle("is-open", appState.referenceOpen);
  elements.workspaceContentOverlay.classList.toggle("is-open", appState.workspaceContentSearchOpen);
  elements.helpOverlay.classList.toggle("is-open", appState.helpOpen);
  elements.aboutOverlay.classList.toggle("is-open", appState.aboutOpen);
  setInputElementValue(elements.workspaceContentQuery, appState.workspaceContentQuery);
  elements.workspaceContentCase.classList.toggle("is-active", appState.workspaceContentCaseSensitive);  elements.workspaceContentWord.classList.toggle("is-active", appState.workspaceContentWholeWord);
  elements.workspaceContentRegex.classList.toggle("is-active", appState.workspaceContentRegex);
  elements.workspaceContentSummary.textContent = appState.workspaceContentSummary;
  elements.workspaceContentRunSearch.disabled = appState.workspaceContentBusy;
  renderDocumentTabs();
  scheduleDocumentMetrics();
}

function setSplitRatio(nextRatio) {
  appState.splitRatio = Math.min(0.75, Math.max(0.25, nextRatio));
  elements.shell.style.setProperty("--split-ratio", String(appState.splitRatio));
  elements.splitter?.setAttribute("aria-valuenow", String(Math.round(appState.splitRatio * 100)));
}

async function setWorkspaceCollapsed(nextValue) {
  appState.workspaceCollapsed = nextValue;
  updateDocumentChrome();
  await window.desktop.updateState({ workspaceCollapsed: appState.workspaceCollapsed });
}

async function setOutlineCollapsed(nextValue) {
  appState.outlineCollapsed = nextValue;
  updateDocumentChrome();
  if (!appState.outlineCollapsed) {
    renderOutlinePanel();
  }
  await window.desktop.updateState({ outlineCollapsed: appState.outlineCollapsed });
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
  void hydrateExpandedPreviewFrame();
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

  // Keyboard equivalent of dragging for the focusable separator.
  elements.splitter.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 0.1 : 0.03;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSplitRatio(appState.splitRatio - step);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setSplitRatio(appState.splitRatio + step);
    } else if (event.key === "Home") {
      event.preventDefault();
      setSplitRatio(0.25);
    } else if (event.key === "End") {
      event.preventDefault();
      setSplitRatio(0.75);
    }
  });
}

function applyEditorTheme(theme) {
  const themeConfig = THEME_STYLES[theme] ?? THEME_STYLES.nocturne;
  editorRef.view.dispatch({
    effects: [
      themeCompartment.reconfigure(themeConfig.syntax),
      editorThemeCompartment.reconfigure(themeConfig.editor)
    ]
  });
}

let lastAppliedShellTheme = null;

function applyShellTheme(theme) {
  if (theme === lastAppliedShellTheme) {
    return;
  }

  lastAppliedShellTheme = theme;
  const themeVars = APP_THEME_VARS[theme] ?? APP_THEME_VARS.nocturne;
  Object.entries(themeVars).forEach(([name, value]) => {
    elements.shell.style.setProperty(name, value);
  });
  document.documentElement.style.colorScheme = theme === "porcelain" || theme === "solarized" || theme === "material" ? "light" : "dark";
}

function renderDocumentTabs() {
  elements.documentTabs.innerHTML = appState.openDocuments.map((document) => `
    <button
      class="document-tab ${document.id === appState.activeDocumentId ? "is-active" : ""} ${document.externalChangePending ? "has-external-change" : ""}"
      type="button"
      role="tab"
      aria-selected="${document.id === appState.activeDocumentId}"
      data-document-id="${document.id}"
      title="${escapeHtml(document.path ?? document.name)}"
    >
      <span class="document-tab-label">${escapeHtml(document.name)}</span>
      ${document.isDirty ? `<span class="document-tab-dirty" aria-label="Unsaved changes"></span>` : ""}
      ${document.externalChangePending ? `<span class="document-tab-external" aria-label="File changed on disk"></span>` : ""}
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
  editorRef.view.setState(document.editorState ?? createEditorState(document.content));
  appState.isApplyingDocument = false;
  document.editorState = editorRef.view.state;
  appState.currentContent = editorRef.view.state.doc.toString();
  appState.isDirty = document.isDirty;
  appState.previewInSync = document.previewInSync;
  appState.editorSearchOpen = false;
  appState.editorReplaceOpen = false;
  appState.editorSearchQuery = "";
  appState.editorReplaceQuery = "";
  renderDocumentTabs();
  updateDocumentChrome();
  renderOutlinePanel();
  scheduleSessionPersistence();
  await renderPreviewNow();
  if (document.externalChangePending) {
    await promptForExternalChange(document);
  }
  if (options.refreshTree !== false) {
    await refreshFileTree();
  }
  return true;
}

async function openDocument(document) {
  const normalizedDocument = normalizeDocumentPayload(document);
  const existingDocument = getDocumentSessionByPath(normalizedDocument.path);
  if (existingDocument) {
    await activateDocument(existingDocument.id);
    return existingDocument;
  }

  const session = createDocumentSession(normalizedDocument);
  appState.openDocuments.push(session);
  if (session.workspacePath) {
    appState.workspacePath = session.workspacePath;
  }
  syncWatchedPaths();
  await activateDocument(session.id);
  return session;
}

async function createUntitledDocument() {
  return openDocument({
    workspacePath: appState.workspacePath ?? null
  });
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

// Dark app themes drive a dark preview document; light themes stay light.
// Keep in sync with the colorScheme logic in applyShellTheme.
function getPreviewColorScheme() {
  return ["porcelain", "solarized", "material"].includes(appState.theme) ? "light" : "dark";
}

function buildPreviewPayload() {
  const activeDocument = getDocumentSession();
  return {
    content: appState.currentContent,
    filePath: appState.openFilePath,
    baseDir: activeDocument?.workspacePath ?? appState.workspacePath ?? null,
    stylesheetPath: appState.previewStylesheetPath,
    previewFontFamily: appState.previewFontFamily,
    pdfPaperSize: appState.pdfPaperSize,
    previewColorScheme: getPreviewColorScheme()
  };
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

async function renderPreviewNow() {
  const renderVersion = ++appState.previewRenderVersion;
  appState.previewInSync = false;
  updateDocumentChrome();

  try {
    await waitForPreviewFrameReady(elements.previewFrame);
    if (appState.previewOverlayOpen) {
      await waitForPreviewFrameReady(elements.previewFrameExpanded);
    }

    const previewDocument = currentDocumentHasPreview()
      ? await window.desktop.renderPreview(buildPreviewPayload())
      : buildUnavailablePreviewDocument();
    if (renderVersion !== appState.previewRenderVersion) {
      return;
    }

    appState.lastPreviewDocument = previewDocument;
    applyPreviewDocument(elements.previewFrame, previewDocument);
    applyPreviewSyncPoints(elements.previewFrame);
    installPreviewInteractions(elements.previewFrame);

    // The expanded overlay is usually closed; only mirror the render into it
    // when it is visible and mark it stale otherwise, halving the DOM work.
    if (appState.previewOverlayOpen) {
      applyPreviewDocument(elements.previewFrameExpanded, previewDocument);
      applyPreviewSyncPoints(elements.previewFrameExpanded);
      installPreviewInteractions(elements.previewFrameExpanded);
      appState.expandedPreviewStale = false;
    } else {
      appState.expandedPreviewStale = true;
    }

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
    appState.lastPreviewDocument = fallbackPreviewDocument;
    applyPreviewDocument(elements.previewFrame, fallbackPreviewDocument);
    installPreviewInteractions(elements.previewFrame);
    appState.previewInSync = false;
    const activeDocument = getDocumentSession();
    if (activeDocument) {
      activeDocument.previewInSync = false;
    }
  }

  consumePendingPreviewAnchor();
  updateDocumentChrome();
}

async function hydrateExpandedPreviewFrame() {
  if (!appState.expandedPreviewStale) {
    return;
  }

  const previewDocument = appState.lastPreviewDocument;
  if (!previewDocument) {
    return;
  }

  await waitForPreviewFrameReady(elements.previewFrameExpanded);
  applyPreviewDocument(elements.previewFrameExpanded, previewDocument);
  applyPreviewSyncPoints(elements.previewFrameExpanded);
  installPreviewInteractions(elements.previewFrameExpanded);
  appState.expandedPreviewStale = false;
}

function syncPreviewToEditorPosition() {
  if (!editorRef.view || appState.pendingPreviewAnchor || !currentDocumentHasPreview()) {
    return;
  }

  // The preview is currently driving the editor (user scrolled it); do not
  // fight it by scrolling the preview back to the cursor.
  if (isScrollSyncLockedBy("preview")) {
    return;
  }

  acquireScrollSyncLock("editor");

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
    setPreviewStatus("error", result.message);
  }
}

function installPreviewInteractions(frame) {
  const previewDocument = frame.contentDocument;
  if (!previewDocument?.body || previewDocument.body.dataset.previewBound === "true") {
    return;
  }

  previewDocument.addEventListener("click", (event) => {
    void handlePreviewLinkClick(event, frame);
  });
  previewDocument.body.dataset.previewBound = "true";
}

function consumePendingPreviewAnchor() {
  if (appState.pendingPreviewAnchor) {
    const anchorId = appState.pendingPreviewAnchor;
    appState.pendingPreviewAnchor = null;
    scrollPreviewToAnchor(anchorId, elements.previewFrame, "auto");
    scrollPreviewToAnchor(anchorId, elements.previewFrameExpanded, "auto");
    return;
  }

  syncPreviewToEditorPosition();
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
        <details class="tree-node" data-path="${escapeHtml(item.path)}" ${isOpen ? "open" : ""}>
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
    const isOpenable = canOpenFileInEditor(item.name);
    return `
      <button class="tree-entry tree-entry-file is-${fileType.kind} ${isActive ? "is-active" : ""}" data-path="${escapeHtml(item.path)}" data-type="file" data-openable="${isOpenable}" draggable="true" title="${isOpenable ? "Open file or drag to insert a reference" : "Drag to insert a reference"}">
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
    const isOpenable = canOpenFileInEditor(item.name);
    return `
      <button class="tree-entry tree-entry-file tree-entry-search is-${fileType.kind} ${isActive ? "is-active" : ""}" data-path="${escapeHtml(item.path)}" data-type="file" data-openable="${isOpenable}" draggable="true" title="${isOpenable ? "Open file or drag to insert a reference" : "Drag to insert a reference"}">
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
      : `<p class="empty-state">No documents or assets match “${escapeHtml(appState.workspaceQuery)}”.</p>`;
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
  document.existsOnDisk = true;
  document.externalChangePending = false;
  document.suppressWatchUntil = Date.now() + 2500;
  document.isDirty = false;
  if (document.id === appState.activeDocumentId) {
    syncMirrorStateFromDocument(document);
  }

  syncWatchedPaths();
  await refreshFileTree();
  updateDocumentChrome();
  scheduleSessionPersistence();
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
  syncWatchedPaths();

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
    scheduleSessionPersistence();
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

async function reloadDocumentSessionFromDisk(document) {
  if (!document?.path) {
    return false;
  }

  const reloadedDocument = await window.desktop.readDocument(document.path);
  if (!reloadedDocument) {
    return false;
  }

  document.name = reloadedDocument.name;
  document.workspacePath = reloadedDocument.workspacePath;
  document.content = reloadedDocument.content;
  document.lastModifiedMs = reloadedDocument.lastModifiedMs;
  document.existsOnDisk = true;
  document.externalChangePending = false;
  document.suppressWatchUntil = Date.now() + 2500;
  document.isDirty = false;
  document.previewInSync = false;
  document.editorState = createEditorState(document.content);

  if (document.id === appState.activeDocumentId) {
    await activateDocument(document.id);
  } else {
    updateDocumentChrome();
    renderDocumentTabs();
    scheduleSessionPersistence();
  }

  return true;
}

async function promptForExternalChange(document) {
  if (!document?.externalChangePending) {
    return;
  }

  const decision = await window.desktop.confirmExternalChange({
    itemName: document.name,
    exists: document.existsOnDisk,
    isDirty: document.isDirty
  });

  if (decision === "reload") {
    await reloadDocumentSessionFromDisk(document);
    return;
  }

  if (decision === "keep") {
    document.externalChangePending = false;
    if (!document.isDirty) {
      document.isDirty = true;
      if (document.id === appState.activeDocumentId) {
        appState.isDirty = true;
      }
    }
    updateDocumentChrome();
    renderDocumentTabs();
    scheduleSessionPersistence();
  }
}

async function persistWindowState() {
  const sessionSnapshot = buildSessionSnapshot();
  if (appState.currentProjectPath) {
    appState.projectSessions = {
      ...(appState.projectSessions ?? {}),
      [appState.currentProjectPath]: sessionSnapshot
    };
  }

  const persistedState = {
    currentProjectPath: appState.currentProjectPath,
    recentProjects: appState.recentProjects,
    projectSessions: appState.projectSessions,
    theme: appState.theme,
    previewFontFamily: appState.previewFontFamily,
    pdfPaperSize: appState.pdfPaperSize,
    distractionFree: appState.distractionFree,
    workspaceCollapsed: appState.workspaceCollapsed,
    outlineCollapsed: appState.outlineCollapsed,
    previewStylesheetPath: appState.previewStylesheetPath,
    pdfStylesheetPath: appState.pdfStylesheetPath
  };

  if (!appState.currentProjectPath) {
    Object.assign(persistedState, {
      workspacePath: appState.workspacePath,
      openFilePath: appState.openFilePath,
      openDocuments: sessionSnapshot.openDocuments,
      activeDocumentId: sessionSnapshot.activeDocumentId,
      nextDocumentId: sessionSnapshot.nextDocumentId,
      untitledSequence: sessionSnapshot.untitledSequence
    });
  }

  await window.desktop.updateState(persistedState);
}

function scheduleSessionPersistence() {
  clearTimeout(appState.autoSaveTimer);
  appState.autoSaveTimer = setTimeout(() => {
    void persistWindowState();
  }, 800);
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
    baseDir: getDocumentSession()?.workspacePath ?? appState.workspacePath ?? null,
    destinationPath,
    format,
    stylesheetPath: format === "pdf" ? appState.pdfStylesheetPath : appState.previewStylesheetPath,
    previewFontFamily: appState.previewFontFamily,
    pdfPaperSize: appState.pdfPaperSize
  });
  setPreviewStatus("synced", `Exported ${format.toUpperCase()}`);
}

async function bindEvents() {
  elements.newDocument.addEventListener("click", () => {
    void createUntitledDocument();
  });

  elements.openKebab.addEventListener("click", () => {
    setKebabMenu(!isKebabMenuOpen());
  });

  elements.kebabMenu.addEventListener("click", (event) => {
    const item = event.target instanceof Element ? event.target.closest("[data-action-id]") : null;
    if (!item) {
      return;
    }

    setKebabMenu(false);
    runActionById(item.dataset.actionId);
  });

  elements.kebabMenu.addEventListener("keydown", (event) => {
    const items = Array.from(elements.kebabMenu.querySelectorAll(".kebab-item"));
    if (items.length === 0) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setKebabMenu(false);
      return;
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const next = items[(currentIndex + delta + items.length) % items.length];
    next?.focus();
  });

  document.addEventListener("click", (event) => {
    if (!isKebabMenuOpen()) {
      return;
    }

    const target = event.target instanceof Node ? event.target : null;
    if (target && (elements.kebabMenu.contains(target) || elements.openKebab.contains(target))) {
      return;
    }

    setKebabMenu(false);
  });

  elements.stylesheetChip.addEventListener("click", () => {
    openSettingsOverlay();
  });

  elements.chromeHintDismiss.addEventListener("click", () => {
    dismissChromeHint();
  });

  elements.chromeHintShortcuts.addEventListener("click", () => {
    dismissChromeHint();
    openHelpOverlay();
  });

  if (window.desktop.onMenuAction) {
    window.desktop.onMenuAction(({ id }) => {
      runActionById(id);
    });
  }

  initPalette();

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

  elements.openWorkspaceSearch.addEventListener("click", () => {
    openWorkspaceSearchOverlay();
  });

  document.querySelector("#save-file").addEventListener("click", () => {
    void saveCurrentDocument();
  });

  elements.collapseWorkspace.addEventListener("click", () => {
    void setWorkspaceCollapsed(true);
  });

  elements.expandWorkspace.addEventListener("click", () => {
    void setWorkspaceCollapsed(false);
  });

  elements.toggleOutline.addEventListener("click", () => {
    void setOutlineCollapsed(!appState.outlineCollapsed);
  });

  elements.closeOutline.addEventListener("click", () => {
    void setOutlineCollapsed(true);
  });

  elements.exitFocusMode.addEventListener("click", async () => {
    await setDistractionFree(false);
  });

  elements.openSettings.addEventListener("click", () => {
    openSettingsOverlay();
  });

  elements.closePreviewOverlay.addEventListener("click", () => {
    closePreviewOverlay();
  });

  elements.previewBackdrop.addEventListener("click", () => {
    closePreviewOverlay();
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
    await renderPreviewNow();
    await window.desktop.updateState({ theme: appState.theme });
  });

  elements.settingsPreviewFont.addEventListener("change", async (event) => {
    appState.previewFontFamily = normalizePreviewFontValue(event.target.value);
    updateDocumentChrome();
    await renderPreviewNow();
    await window.desktop.updateState({ previewFontFamily: appState.previewFontFamily });
    await persistProjectScopedSettings();
  });

  elements.settingsPdfPaperSize.addEventListener("change", async (event) => {
    appState.pdfPaperSize = normalizePdfPaperSize(event.target.value);
    updateDocumentChrome();
    await window.desktop.updateState({ pdfPaperSize: appState.pdfPaperSize });
    await persistProjectScopedSettings();
  });

  elements.settingsAutoUpdate.addEventListener("change", async (event) => {
    appState.autoCheckUpdates = event.target.checked;
    await window.desktop.updateState({ autoCheckUpdates: appState.autoCheckUpdates });
  });

  elements.checkUpdates.addEventListener("click", async () => {
    appState.updateStatus = { status: "checking" };
    renderUpdateStatus();
    await window.desktop.checkForUpdates();
  });

  elements.updateAccept.addEventListener("click", () => {
    void handleUpdateAccept();
  });

  elements.updateDismiss.addEventListener("click", () => {
    elements.updateToast.classList.remove("is-open");
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
    await persistProjectScopedSettings();
  });

  elements.clearStylesheet.addEventListener("click", async () => {
    appState.previewStylesheetPath = null;
    updateDocumentChrome();
    await renderPreviewNow();
    await window.desktop.updateState({ previewStylesheetPath: null });
    await persistProjectScopedSettings();
  });

  elements.choosePdfStylesheet.addEventListener("click", async () => {
    const selectedStylesheet = await window.desktop.chooseStylesheet("pdf");
    if (!selectedStylesheet) {
      return;
    }

    appState.pdfStylesheetPath = selectedStylesheet;
    updateDocumentChrome();
    await window.desktop.updateState({ pdfStylesheetPath: appState.pdfStylesheetPath });
    await persistProjectScopedSettings();
  });

  elements.clearPdfStylesheet.addEventListener("click", async () => {
    appState.pdfStylesheetPath = null;
    updateDocumentChrome();
    await window.desktop.updateState({ pdfStylesheetPath: null });
    await persistProjectScopedSettings();
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

  elements.editorReplaceNext.addEventListener("click", () => {
    runEditorReplaceNext();
  });

  elements.editorReplaceAll.addEventListener("click", () => {
    runEditorReplaceAll();
  });

  elements.editorReplaceScopeOpenFiles.addEventListener("change", () => {
    appState.editorReplaceAllOpenFiles = elements.editorReplaceScopeOpenFiles.checked;
    updateDocumentChrome();
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

  elements.closeWorkspaceSearch.addEventListener("click", () => {
    closeWorkspaceSearchOverlay();
  });

  elements.workspaceContentBackdrop.addEventListener("click", () => {
    closeWorkspaceSearchOverlay();
  });

  elements.workspaceContentQuery.addEventListener("input", () => {
    appState.workspaceContentQuery = elements.workspaceContentQuery.value;
    updateDocumentChrome();
  });

  elements.workspaceContentQuery.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void runWorkspaceContentSearch();
    }
  });

  elements.workspaceContentRunSearch.addEventListener("click", () => {
    void runWorkspaceContentSearch();
  });

  elements.workspaceContentCase.addEventListener("click", () => {
    appState.workspaceContentCaseSensitive = !appState.workspaceContentCaseSensitive;
    updateDocumentChrome();
  });

  elements.workspaceContentWord.addEventListener("click", () => {
    appState.workspaceContentWholeWord = !appState.workspaceContentWholeWord;
    updateDocumentChrome();
  });

  elements.workspaceContentRegex.addEventListener("click", () => {
    appState.workspaceContentRegex = !appState.workspaceContentRegex;
    updateDocumentChrome();
  });

  elements.workspaceContentResults.addEventListener("click", (event) => {
    const matchButton = event.target instanceof Element ? event.target.closest("[data-workspace-result-path]") : null;
    if (!matchButton) {
      return;
    }

    void openWorkspaceResult(
      matchButton.dataset.workspaceResultPath,
      Number.parseInt(matchButton.dataset.workspaceResultLine, 10),
      Number.parseInt(matchButton.dataset.workspaceResultColumn, 10),
      Number.parseInt(matchButton.dataset.workspaceResultLength, 10)
    );
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

  elements.referenceResults.addEventListener("click", (event) => {
    const insertButton = event.target instanceof Element ? event.target.closest("[data-insert-reference]") : null;
    if (!insertButton) {
      return;
    }

    event.preventDefault();
    insertReferenceSnippet(Number.parseInt(insertButton.dataset.insertReference, 10));
  });

  elements.previewFrame.addEventListener("load", () => {
    installPreviewInteractions(elements.previewFrame);
    installReversePreviewSync(elements.previewFrame);
  });

  elements.previewFrameExpanded.addEventListener("load", () => {
    installPreviewInteractions(elements.previewFrameExpanded);
  });

  elements.fileTree.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-type='file']");
    if (!target) {
      return;
    }

    if (target.dataset.openable !== "true") {
      setPreviewStatus("none", "Drag assets into an AsciiDoc document to insert a reference.");
      return;
    }

    const documentPayload = await window.desktop.readDocument(target.dataset.path);
    if (documentPayload) {
      await openDocument(normalizeDocumentPayload(documentPayload));
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

  elements.outlineList.addEventListener("click", (event) => {
    const entry = event.target instanceof Element ? event.target.closest("[data-line]") : null;
    if (!entry || !editorRef.view) {
      return;
    }

    const lineNumber = Number(entry.dataset.line);
    if (!Number.isInteger(lineNumber) || lineNumber < 1) {
      return;
    }

    const targetLine = editorRef.view.state.doc.line(Math.min(lineNumber, editorRef.view.state.doc.lines));
    editorRef.view.dispatch({
      selection: { anchor: targetLine.from },
      effects: EditorView.scrollIntoView(targetLine.from, { y: "center" })
    });
    editorRef.view.focus();
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

  const setEditorDropTarget = (nextValue) => {
    elements.editorRoot.classList.toggle("is-drop-target", nextValue);
  };

  const hasDroppablePayload = (dataTransfer) => {
    if (!dataTransfer) {
      return false;
    }

    if ((dataTransfer.files?.length ?? 0) > 0) {
      return true;
    }

    return Array.from(dataTransfer.types ?? []).includes("application/x-asciidoc-editor-paths");
  };

  elements.editorRoot.addEventListener("dragenter", (event) => {
    if (hasDroppablePayload(event.dataTransfer)) {
      event.preventDefault();
      setEditorDropTarget(true);
    }
  });

  elements.editorRoot.addEventListener("dragover", (event) => {
    if (hasDroppablePayload(event.dataTransfer)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setEditorDropTarget(true);
    }
  });

  elements.editorRoot.addEventListener("dragleave", (event) => {
    const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (!elements.editorRoot.contains(nextTarget)) {
      setEditorDropTarget(false);
    }
  });

  elements.editorRoot.addEventListener("drop", (event) => {
    setEditorDropTarget(false);
    event.preventDefault();
    const droppedFiles = Array.from(event.dataTransfer?.files ?? []);
    if (droppedFiles.length > 0) {
      void importDroppedAssets(droppedFiles);
      return;
    }

    let internalPaths = [];
    try {
      internalPaths = JSON.parse(event.dataTransfer?.getData("application/x-asciidoc-editor-paths") || "[]");
    } catch {
      internalPaths = [];
    }

    if (Array.isArray(internalPaths) && internalPaths.length > 0) {
      void importDroppedAssets(internalPaths.map((filePath) => ({ path: filePath })));
    }
  });

  elements.fileTree.addEventListener("dragstart", (event) => {
    const fileEntry = event.target instanceof Element ? event.target.closest("[data-type='file']") : null;
    if (!fileEntry || !event.dataTransfer) {
      return;
    }

    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-asciidoc-editor-paths", JSON.stringify([fileEntry.dataset.path]));
    event.dataTransfer.setData("text/plain", fileEntry.dataset.path);
  });

  elements.fileTree.addEventListener("dragend", () => {
    setEditorDropTarget(false);
  });

  window.addEventListener("beforeunload", () => {
    void persistWindowState();
  });

  window.desktop.onOpenPath(({ path }) => {
    void handleIncomingPath(path);
  });

  window.desktop.onUpdateStatus((status) => {
    appState.updateStatus = status;
    renderUpdateStatus();
  });

  window.desktop.onAppCloseRequested(async ({ requestId }) => {
    if (appState.isHandlingCloseRequest) {
      await window.desktop.respondToAppCloseRequest({ requestId, allowClose: false });
      return;
    }

    appState.isHandlingCloseRequest = true;
    let allowClose = false;
    try {
      allowClose = await confirmApplicationClose();
      if (allowClose) {
        await persistWindowState();
      }
    } finally {
      // Always clear the flag and answer the request; a thrown error in the
      // save flow must never leave the app unclosable.
      appState.isHandlingCloseRequest = false;
      await window.desktop.respondToAppCloseRequest({ requestId, allowClose });
    }
  });

  window.desktop.onExternalFileChanged(async ({ filePath, exists, lastModifiedMs }) => {
    const document = getDocumentSessionByPath(filePath);
    if (!document) {
      return;
    }

    if (Date.now() < (document.suppressWatchUntil ?? 0)) {
      return;
    }

    if (exists && document.lastModifiedMs && Math.abs((lastModifiedMs ?? 0) - document.lastModifiedMs) < 1) {
      return;
    }

    document.existsOnDisk = exists !== false;
    document.lastModifiedMs = exists === false ? document.lastModifiedMs : (lastModifiedMs ?? document.lastModifiedMs);
    document.externalChangePending = true;

    if (document.id === appState.activeDocumentId) {
      updateDocumentChrome();
      await promptForExternalChange(document);
      return;
    }

    renderDocumentTabs();
    scheduleSessionPersistence();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (isCommandPaletteOpen()) {
        closeCommandPalette();
      }

      if (isKebabMenuOpen()) {
        setKebabMenu(false);
      }

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

      if (appState.workspaceContentSearchOpen) {
        closeWorkspaceSearchOverlay();
      }

      if (appState.editorSearchOpen) {
        closeEditorSearch();
      }
    }

    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openReferenceOverlay();
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openCommandPalette();
    }

    if ((event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === "p") {
      event.preventDefault();
      openCommandPalette();
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "n") {
      event.preventDefault();
      void createUntitledDocument();
    }

    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "f") {
      event.preventDefault();
      openWorkspaceSearchOverlay();
    }

    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "h") {
      event.preventDefault();
      appState.editorReplaceAllOpenFiles = true;
      openEditorSearch({ prefillSelection: true, showReplace: true });
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
    const { state, project, projectSession, restoredDocuments, initialDocument } = await window.desktop.getBootPayload();
    Object.assign(appState, state, {
      theme: normalizeThemeValue(state?.theme),
      previewFontFamily: normalizePreviewFontValue(state?.previewFontFamily),
      pdfPaperSize: normalizePdfPaperSize(state?.pdfPaperSize),
      autoCheckUpdates: state?.autoCheckUpdates !== false,
      workspaceCollapsed: Boolean(state?.workspaceCollapsed),
      outlineCollapsed: Boolean(state?.outlineCollapsed),
      currentProjectPath: project?.projectPath ?? null,
      currentProjectName: project?.name ?? null,
      recentProjects: Array.isArray(state?.recentProjects) ? state.recentProjects : [],
      projectSessions: state?.projectSessions ?? {}
    });
    applyEditorTheme(appState.theme);

    if (project) {
      applyProjectSettings(project);
    }

    if (Array.isArray(restoredDocuments) && restoredDocuments.length > 0) {
      const sessionWorkspace = project?.workspacePath ?? appState.workspacePath;
      const sessionState = projectSession ?? state;
      appState.nextDocumentId = sessionState?.nextDocumentId ?? appState.nextDocumentId;
      appState.untitledSequence = sessionState?.untitledSequence ?? appState.untitledSequence;
      appState.openDocuments = restoredDocuments.map((document) => createDocumentSession({
        ...document,
        workspacePath: sessionWorkspace ?? document.workspacePath
      }));
      syncWatchedPaths();
      const restoredActiveDocument = getDocumentSession(sessionState?.activeDocumentId) ?? appState.openDocuments[0];
      await activateDocument(restoredActiveDocument.id);
    } else if (initialDocument) {
      await openDocument(normalizeDocumentPayload(initialDocument));
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
if (typeof window.desktop.defineMenu === "function") {
  window.desktop.defineMenu(buildNativeMenuPayload());
}
maybeShowChromeHint();
