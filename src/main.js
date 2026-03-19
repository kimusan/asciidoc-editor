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
  renderTimer: null,
  directoryCache: new Map()
};

const elements = {};
let editorView;

function createLayout() {
  const app = document.querySelector("#app");
  app.innerHTML = `
    <div class="shell" data-theme="dark">
      <aside class="sidebar">
        <div class="sidebar-header">
          <div>
            <p class="eyebrow">Workspace</p>
            <h1>AsciiDoc Editor</h1>
          </div>
          <button id="open-folder" class="ghost-button">Folder</button>
        </div>
        <div class="workspace-meta">
          <span id="workspace-label">No folder selected</span>
        </div>
        <div id="file-tree" class="file-tree"></div>
      </aside>
      <div class="main-column">
        <header class="toolbar">
          <div class="toolbar-group">
            <button id="open-file">Open</button>
            <button id="save-file">Save</button>
            <button id="save-file-as" class="ghost-button">Save As</button>
          </div>
          <div class="toolbar-title">
            <span id="document-name">Untitled.adoc</span>
            <span id="document-status" class="document-status">Preview synced</span>
          </div>
          <div class="toolbar-group">
            <select id="editor-theme">
              <option value="dark">Dark Editor</option>
              <option value="light">Light Editor</option>
            </select>
            <select id="preview-theme">
              <option value="paper">Paper Preview</option>
              <option value="slate">Slate Preview</option>
            </select>
            <button id="choose-stylesheet" class="ghost-button">Preview CSS</button>
            <button id="toggle-focus" class="ghost-button">Focus</button>
            <button id="export-html" class="ghost-button">HTML</button>
            <button id="export-pdf" class="ghost-button">PDF</button>
            <button id="export-docbook" class="ghost-button">DocBook</button>
          </div>
        </header>
        <section class="content-grid">
          <div class="editor-panel panel">
            <div class="panel-header">
              <span>Editor</span>
              <span id="stylesheet-chip" class="panel-chip">No custom preview CSS</span>
            </div>
            <div id="editor-root" class="editor-root"></div>
          </div>
          <div class="preview-panel panel">
            <div class="panel-header">
              <span>Live Preview</span>
              <span id="feature-chip" class="panel-chip">Includes, conditionals, substitutions enabled</span>
            </div>
            <iframe id="preview-frame" class="preview-frame" title="AsciiDoc preview"></iframe>
          </div>
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
  elements.shell.dataset.theme = appState.theme;
  elements.shell.classList.toggle("focus-mode", appState.distractionFree);
  elements.editorTheme.value = appState.theme;
  elements.previewTheme.value = appState.previewTheme;
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
updateDocumentChrome();
void renderPreviewNow();
