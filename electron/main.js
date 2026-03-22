import path from "node:path";
import fs from "node:fs/promises";
import { watchFile, unwatchFile } from "node:fs";
import { randomUUID } from "node:crypto";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { fileURLToPath } from "node:url";
import { exportDocument, renderPreviewDocument } from "./asciidoc.js";
import { resolvePreviewLinkTarget } from "./preview-links.js";
import { loadState, saveState } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "..", "dist");
const WORKSPACE_EDITABLE_FILE_PATTERN = /\.(adoc|asciidoc|asc|css)$/i;
const IMAGE_ASSET_FILE_PATTERN = /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i;
const WORKSPACE_ASSET_FILE_PATTERN = /\.(png|jpe?g|gif|svg|webp|bmp|ico|pdf|txt|csv|json|xml|yml|yaml|zip|tar|gz|mp3|wav|ogg|mp4|webm)$/i;
const watchedPathsByWebContents = new Map();
const fileWatchRegistrations = new Map();

function isWorkspaceEditableFile(fileName) {
  return WORKSPACE_EDITABLE_FILE_PATTERN.test(fileName);
}

function isWorkspaceBrowsableFile(fileName) {
  return isWorkspaceEditableFile(fileName) || WORKSPACE_ASSET_FILE_PATTERN.test(fileName);
}

async function directoryContainsBrowsableFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    if (entry.isFile() && isWorkspaceBrowsableFile(entry.name)) {
      return true;
    }

    if (entry.isDirectory()) {
      const hasBrowsableDescendants = await directoryContainsBrowsableFiles(path.join(dirPath, entry.name));
      if (hasBrowsableDescendants) {
        return true;
      }
    }
  }

  return false;
}

function normalizeRecentFiles(recentFiles, filePath) {
  return [filePath, ...recentFiles.filter((item) => item !== filePath)].slice(0, 10);
}

function isImageAssetFile(filePath) {
  return IMAGE_ASSET_FILE_PATTERN.test(filePath ?? "");
}

function toPortablePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function isPathInside(parentPath, childPath) {
  if (!parentPath || !childPath) {
    return false;
  }

  const relativePath = path.relative(parentPath, childPath);
  return relativePath === ""
    || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function getAssetImportBaseDir(documentPath, workspacePath) {
  return documentPath ? path.dirname(documentPath) : (workspacePath ?? null);
}

function buildAssetLabel(filePath) {
  const rawLabel = path.basename(filePath, path.extname(filePath));
  const normalized = rawLabel.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Asset";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

async function resolveUniqueFilePath(targetPath) {
  const extension = path.extname(targetPath);
  const baseName = path.basename(targetPath, extension);
  const directory = path.dirname(targetPath);
  let candidatePath = targetPath;
  let counter = 1;

  while (true) {
    try {
      await fs.access(candidatePath);
      counter += 1;
      candidatePath = path.join(directory, `${baseName}-${counter}${extension}`);
    } catch {
      return candidatePath;
    }
  }
}

async function copyAssetIntoProject(sourcePath, baseDir) {
  const targetFolderName = isImageAssetFile(sourcePath) ? "images" : "assets";
  const targetDirectory = path.join(baseDir, targetFolderName);
  await fs.mkdir(targetDirectory, { recursive: true });
  const targetPath = await resolveUniqueFilePath(path.join(targetDirectory, path.basename(sourcePath)));
  await fs.copyFile(sourcePath, targetPath);
  return targetPath;
}

function buildAssetSnippet(assetPath, { documentPath, workspacePath }) {
  const baseDir = getAssetImportBaseDir(documentPath, workspacePath);
  const targetPath = baseDir ? path.relative(baseDir, assetPath) : assetPath;
  const portablePath = toPortablePath(targetPath);

  if (isImageAssetFile(assetPath)) {
    return `image::${portablePath}[${buildAssetLabel(assetPath)}]`;
  }

  if (WORKSPACE_EDITABLE_FILE_PATTERN.test(assetPath)) {
    return `xref:${portablePath}[]`;
  }

  return `link:${portablePath}[${path.basename(assetPath)}]`;
}

async function confirmAssetImport(window, { assetCount, baseDir }) {
  const { response } = await dialog.showMessageBox(window, {
    type: "question",
    buttons: ["Copy into Project", "Use Current Path", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    title: "Import dropped asset",
    message: assetCount === 1
      ? "How do you want to insert the dropped asset?"
      : `How do you want to insert these ${assetCount} dropped assets?`,
    detail: `Copying places them under ${baseDir} so the inserted references stay portable with the document.`
  });

  return ["copy", "keep", "cancel"][response] ?? "cancel";
}

function watchPathForSender(webContents, filePath) {
  let registration = fileWatchRegistrations.get(filePath);
  if (!registration) {
    const listeners = new Set();
    const handler = (currentStat, previousStat) => {
      if (
        currentStat.mtimeMs === previousStat.mtimeMs
        && currentStat.nlink === previousStat.nlink
      ) {
        return;
      }

      for (const listener of listeners) {
        if (listener.isDestroyed()) {
          continue;
        }

        listener.send("fs:file-changed", {
          filePath,
          exists: currentStat.nlink > 0,
          lastModifiedMs: currentStat.nlink > 0 ? currentStat.mtimeMs : null
        });
      }
    };

    watchFile(filePath, { interval: 1200, bigint: false }, handler);
    registration = { listeners, handler };
    fileWatchRegistrations.set(filePath, registration);
  }

  registration.listeners.add(webContents);
}

function unwatchPathForSender(webContents, filePath) {
  const registration = fileWatchRegistrations.get(filePath);
  if (!registration) {
    return;
  }

  registration.listeners.delete(webContents);
  if (registration.listeners.size === 0) {
    unwatchFile(filePath, registration.handler);
    fileWatchRegistrations.delete(filePath);
  }
}

function updateWatchedPathsForSender(webContents, paths = []) {
  const nextPaths = new Set((paths ?? []).filter(Boolean));
  const previousPaths = watchedPathsByWebContents.get(webContents.id) ?? new Set();

  for (const filePath of previousPaths) {
    if (!nextPaths.has(filePath)) {
      unwatchPathForSender(webContents, filePath);
    }
  }

  for (const filePath of nextPaths) {
    if (!previousPaths.has(filePath)) {
      watchPathForSender(webContents, filePath);
    }
  }

  watchedPathsByWebContents.set(webContents.id, nextPaths);
}

function clearWatchedPathsForSender(webContents) {
  const watchedPaths = watchedPathsByWebContents.get(webContents.id) ?? new Set();
  for (const filePath of watchedPaths) {
    unwatchPathForSender(webContents, filePath);
  }

  watchedPathsByWebContents.delete(webContents.id);
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

async function hydrateStoredDocuments(state) {
  const storedDocuments = Array.isArray(state.openDocuments) ? state.openDocuments : [];
  const restoredDocuments = [];

  for (const storedDocument of storedDocuments) {
    if (storedDocument?.path && !storedDocument.isDirty) {
      try {
        const loadedDocument = await loadDocument(storedDocument.path);
        restoredDocuments.push({
          ...storedDocument,
          ...loadedDocument,
          id: storedDocument.id ?? loadedDocument.path,
          isDirty: false,
          previewInSync: true
        });
        continue;
      } catch {
        // Fall back to the serialized snapshot below.
      }
    }

    restoredDocuments.push({
      id: storedDocument?.id ?? randomUUID(),
      path: storedDocument?.path ?? null,
      workspacePath: storedDocument?.workspacePath ?? state.workspacePath ?? null,
      name: storedDocument?.name ?? path.basename(storedDocument?.path ?? "Untitled.adoc"),
      content: storedDocument?.content ?? "",
      lastModifiedMs: storedDocument?.lastModifiedMs ?? null,
      isDirty: Boolean(storedDocument?.isDirty),
      previewInSync: storedDocument?.previewInSync ?? !storedDocument?.isDirty
    });
  }

  return restoredDocuments;
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
    if (entry.isFile() && !isWorkspaceBrowsableFile(entry.name)) {
      continue;
    }

    if (entry.isDirectory() && !await directoryContainsBrowsableFiles(fullPath)) {
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
        if (await directoryContainsBrowsableFiles(fullPath)) {
          await visitDirectory(fullPath);
        }
        continue;
      }

      if (!isWorkspaceBrowsableFile(entry.name)) {
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

  const closeRequestResolvers = new Map();
  let allowWindowClose = false;

  await window.loadFile(path.join(DIST_DIR, "index.html"));

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("destroyed", () => {
    clearWatchedPathsForSender(window.webContents);
  });

  ipcMain.handle("app:close-response", async (_, payload) => {
    const resolver = closeRequestResolvers.get(payload?.requestId);
    if (!resolver) {
      return false;
    }

    closeRequestResolvers.delete(payload.requestId);
    resolver(Boolean(payload?.allowClose));
    return true;
  });

  window.on("close", async (event) => {
    if (allowWindowClose) {
      return;
    }

    event.preventDefault();

    const requestId = randomUUID();
    const allowClose = await new Promise((resolve) => {
      closeRequestResolvers.set(requestId, resolve);
      window.webContents.send("app:close-requested", { requestId });
    });

    if (allowClose) {
      allowWindowClose = true;
      window.close();
    }
  });

  window.on("closed", () => {
    closeRequestResolvers.clear();
    ipcMain.removeHandler("app:close-response");
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

  ipcMain.handle("dialog:confirm-unsaved", async (event, payload = {}) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const itemName = payload.itemName ?? "document";

    if (payload.scope === "app") {
      const { response } = await dialog.showMessageBox(window, {
        type: "warning",
        buttons: ["Save All", "Discard Changes", "Cancel"],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
        title: "Unsaved changes",
        message: `You have ${payload.count ?? 0} unsaved document${payload.count === 1 ? "" : "s"}.`,
        detail: "Closing now will lose changes unless you save them first."
      });

      return ["save", "discard", "cancel"][response] ?? "cancel";
    }

    const { response } = await dialog.showMessageBox(window, {
      type: "warning",
      buttons: ["Save", "Discard", "Cancel"],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: "Unsaved changes",
      message: `${itemName} has unsaved changes.`,
      detail: "Do you want to save before closing it?"
    });

    return ["save", "discard", "cancel"][response] ?? "cancel";
  });

  ipcMain.handle("dialog:confirm-external-change", async (event, payload = {}) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const itemName = payload.itemName ?? "This document";
    const exists = payload.exists !== false;

    const { response } = await dialog.showMessageBox(window, {
      type: "warning",
      buttons: exists
        ? ["Reload from Disk", "Keep Editor Version", "Later"]
        : ["Keep Editor Version", "Later"],
      defaultId: 0,
      cancelId: exists ? 2 : 1,
      noLink: true,
      title: "File changed on disk",
      message: exists
        ? `${itemName} was changed outside the editor.`
        : `${itemName} was removed outside the editor.`,
      detail: payload.isDirty
        ? "Your current tab also has unsaved changes."
        : "You can reload the file from disk or keep the current editor version."
    });

    if (!exists) {
      return ["keep", "later"][response] ?? "later";
    }

    return ["reload", "keep", "later"][response] ?? "later";
  });

  ipcMain.handle("fs:list-directory", async (_, rootPath) => listDirectory(rootPath));
  ipcMain.handle("fs:search-workspace", async (_, { rootPath, query, limit }) => searchWorkspace(rootPath, query, limit));
  ipcMain.handle("fs:set-watched-paths", (event, paths) => {
    updateWatchedPathsForSender(event.sender, paths);
    return true;
  });

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

  ipcMain.handle("fs:import-assets", async (event, payload = {}) => {
    const assetPaths = Array.isArray(payload.assetPaths)
      ? payload.assetPaths.filter(Boolean)
      : [];

    if (assetPaths.length === 0) {
      return null;
    }

    const window = BrowserWindow.fromWebContents(event.sender);
    const documentPath = payload.documentPath ?? null;
    const workspacePath = payload.workspacePath ?? null;
    const baseDir = getAssetImportBaseDir(documentPath, workspacePath);
    const needsCopyDecision = Boolean(baseDir) && assetPaths.some((assetPath) => !isPathInside(baseDir, assetPath));

    let importMode = "keep";
    if (needsCopyDecision) {
      importMode = await confirmAssetImport(window, {
        assetCount: assetPaths.length,
        baseDir
      });
    }

    if (importMode === "cancel") {
      return null;
    }

    const importedPaths = [];
    for (const assetPath of assetPaths) {
      if (importMode === "copy" && baseDir && !isPathInside(baseDir, assetPath)) {
        importedPaths.push(await copyAssetIntoProject(assetPath, baseDir));
        continue;
      }

      importedPaths.push(assetPath);
    }

    return {
      importMode,
      snippets: importedPaths.map((assetPath) => buildAssetSnippet(assetPath, {
        documentPath,
        workspacePath
      }))
    };
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
    const restoredDocuments = await hydrateStoredDocuments(state);
    let initialDocument = null;

    if (restoredDocuments.length === 0 && state.openFilePath) {
      try {
        initialDocument = await loadDocument(state.openFilePath);
      } catch {
        initialDocument = null;
      }
    }

    return {
      state,
      restoredDocuments,
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
