import path from "node:path";
import fs from "node:fs/promises";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { fileURLToPath } from "node:url";
import { exportDocument, renderPreviewDocument } from "./asciidoc.js";
import { resolvePreviewLinkTarget } from "./preview-links.js";
import { loadState, saveState } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "..", "dist");
const WORKSPACE_EDITABLE_FILE_PATTERN = /\.(adoc|asciidoc|asc|css)$/i;

function isWorkspaceEditableFile(fileName) {
  return WORKSPACE_EDITABLE_FILE_PATTERN.test(fileName);
}

async function directoryContainsEditableFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    if (entry.isFile() && isWorkspaceEditableFile(entry.name)) {
      return true;
    }

    if (entry.isDirectory()) {
      const hasEditableDescendants = await directoryContainsEditableFiles(path.join(dirPath, entry.name));
      if (hasEditableDescendants) {
        return true;
      }
    }
  }

  return false;
}

function normalizeRecentFiles(recentFiles, filePath) {
  return [filePath, ...recentFiles.filter((item) => item !== filePath)].slice(0, 10);
}

function buildSaveDialogConfig(payload) {
  const options = typeof payload === "string" ? { defaultPath: payload, kind: "document" } : (payload ?? {});
  const kind = options.kind ?? "document";

  const baseOptions = {
    defaultPath: options.defaultPath,
    filters: [{ name: "All files", extensions: ["*"] }]
  };

  if (kind === "document") {
    return {
      ...baseOptions,
      title: "Save AsciiDoc file",
      filters: [
        { name: "AsciiDoc", extensions: ["adoc", "asciidoc", "asc"] },
        { name: "Text", extensions: ["txt"] },
        { name: "All files", extensions: ["*"] }
      ]
    };
  }

  if (kind === "html") {
    return {
      ...baseOptions,
      title: "Export HTML",
      filters: [
        { name: "HTML", extensions: ["html", "htm"] },
        { name: "All files", extensions: ["*"] }
      ]
    };
  }

  if (kind === "pdf") {
    return {
      ...baseOptions,
      title: "Export PDF",
      filters: [
        { name: "PDF", extensions: ["pdf"] },
        { name: "All files", extensions: ["*"] }
      ]
    };
  }

  if (kind === "docbook") {
    return {
      ...baseOptions,
      title: "Export DocBook",
      filters: [
        { name: "DocBook XML", extensions: ["xml"] },
        { name: "All files", extensions: ["*"] }
      ]
    };
  }

  return baseOptions;
}

async function loadDocument(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  const stat = await fs.stat(filePath);
  return {
    path: filePath,
    name: path.basename(filePath),
    workspacePath: path.dirname(filePath),
    content,
    lastModifiedMs: stat.mtimeMs
  };
}

async function listDirectory(rootPath) {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const children = [];

  for (const entry of entries.sort((left, right) => {
    if (left.isDirectory() && !right.isDirectory()) {
      return -1;
    }
    if (!left.isDirectory() && right.isDirectory()) {
      return 1;
    }
    return left.name.localeCompare(right.name);
  })) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const fullPath = path.join(rootPath, entry.name);
    if (entry.isFile() && !isWorkspaceEditableFile(entry.name)) {
      continue;
    }

    if (entry.isDirectory() && !await directoryContainsEditableFiles(fullPath)) {
      continue;
    }

    children.push({
      name: entry.name,
      path: fullPath,
      type: entry.isDirectory() ? "directory" : "file"
    });
  }

  return children;
}

async function searchWorkspace(rootPath, query, limit = 200) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const results = [];

  async function visitDirectory(currentPath) {
    if (results.length >= limit) {
      return;
    }

    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (results.length >= limit || entry.name.startsWith(".")) {
        continue;
      }

      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (await directoryContainsEditableFiles(fullPath)) {
          await visitDirectory(fullPath);
        }
        continue;
      }

      if (!isWorkspaceEditableFile(entry.name)) {
        continue;
      }

      const relativePath = path.relative(rootPath, fullPath);
      if (
        entry.name.toLowerCase().includes(normalizedQuery)
        || relativePath.toLowerCase().includes(normalizedQuery)
      ) {
        results.push({
          name: entry.name,
          path: fullPath,
          relativePath,
          type: "file"
        });
      }
    }
  }

  await visitDirectory(rootPath);
  return results;
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#111418",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: false
    }
  });

  if (process.platform !== "darwin") {
    window.setMenuBarVisibility(false);
    window.setAutoHideMenuBar(true);
  }

  await window.loadFile(path.join(DIST_DIR, "index.html"));

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(async () => {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
  }

  ipcMain.handle("dialog:open-file", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Open AsciiDoc file",
      properties: ["openFile"],
      filters: [
        { name: "AsciiDoc", extensions: ["adoc", "asciidoc", "asc"] },
        { name: "All files", extensions: ["*"] }
      ]
    });

    if (canceled || filePaths.length === 0) {
      return null;
    }

    const document = await loadDocument(filePaths[0]);
    const currentState = await loadState();
    await saveState({
      openFilePath: document.path,
      workspacePath: document.workspacePath,
      recentFiles: normalizeRecentFiles(currentState.recentFiles, document.path)
    });
    return document;
  });

  ipcMain.handle("dialog:open-folder", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Choose workspace folder",
      properties: ["openDirectory"]
    });

    if (canceled || filePaths.length === 0) {
      return null;
    }

    await saveState({ workspacePath: filePaths[0] });
    return filePaths[0];
  });

  ipcMain.handle("dialog:save-file", async (_, payload) => {
    const { canceled, filePath } = await dialog.showSaveDialog(buildSaveDialogConfig(payload));
    return canceled ? null : filePath;
  });

  ipcMain.handle("dialog:choose-stylesheet", async (_, kind = "preview") => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: kind === "pdf" ? "Choose PDF stylesheet" : "Choose preview stylesheet",
      properties: ["openFile"],
      filters: [
        { name: "CSS", extensions: ["css"] },
        { name: "All files", extensions: ["*"] }
      ]
    });

    if (canceled || filePaths.length === 0) {
      return null;
    }

    return filePaths[0];
  });

  ipcMain.handle("fs:list-directory", async (_, rootPath) => listDirectory(rootPath));
  ipcMain.handle("fs:search-workspace", async (_, { rootPath, query, limit }) => searchWorkspace(rootPath, query, limit));

  ipcMain.handle("fs:read-document", async (_, filePath) => {
    const document = await loadDocument(filePath);
    const currentState = await loadState();
    await saveState({
      openFilePath: document.path,
      workspacePath: document.workspacePath,
      recentFiles: normalizeRecentFiles(currentState.recentFiles, document.path)
    });
    return document;
  });

  ipcMain.handle("fs:save-document", async (_, { filePath, content }) => {
    let resolvedPath = filePath;
    if (!resolvedPath) {
      return null;
    }

    await fs.writeFile(resolvedPath, content, "utf8");
    const document = await loadDocument(resolvedPath);
    const currentState = await loadState();
    await saveState({
      openFilePath: document.path,
      workspacePath: document.workspacePath,
      recentFiles: normalizeRecentFiles(currentState.recentFiles, document.path)
    });
    return document;
  });

  ipcMain.handle("preview:render", async (_, payload) => renderPreviewDocument(
    payload.content,
    payload.filePath,
    {
      stylesheetPath: payload.stylesheetPath,
      previewFontFamily: payload.previewFontFamily
    }
  ));

  ipcMain.handle("preview:follow-link", async (_, { href, currentFilePath }) => {
    const result = await resolvePreviewLinkTarget(href, currentFilePath);

    if (result.type === "external") {
      await shell.openExternal(result.url);
      return result;
    }

    if (result.type === "file") {
      await shell.openPath(result.filePath);
      return result;
    }

    if (result.type === "document") {
      const document = await loadDocument(result.filePath);
      const currentState = await loadState();
      await saveState({
        openFilePath: document.path,
        workspacePath: document.workspacePath,
        recentFiles: normalizeRecentFiles(currentState.recentFiles, document.path)
      });
      return {
        ...result,
        document
      };
    }

    return result;
  });

  ipcMain.handle("export:document", async (_, payload) => exportDocument(payload));
  ipcMain.handle("shell:open-external", async (_, url) => shell.openExternal(url));

  ipcMain.handle("app:get-boot-payload", async () => {
    const state = await loadState();
    let initialDocument = null;

    if (state.openFilePath) {
      try {
        initialDocument = await loadDocument(state.openFilePath);
      } catch {
        initialDocument = null;
      }
    }

    return {
      state,
      initialDocument
    };
  });

  ipcMain.handle("state:update", async (_, partialState) => saveState(partialState));
  ipcMain.handle("state:load", async () => loadState());

  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
