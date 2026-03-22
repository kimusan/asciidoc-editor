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
const PROJECT_FILE_EXTENSION = ".adp";
const WORKSPACE_EDITABLE_FILE_PATTERN = /\.(adoc|asciidoc|asc|css)$/i;
const IMAGE_ASSET_FILE_PATTERN = /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i;
const WORKSPACE_ASSET_FILE_PATTERN = /\.(png|jpe?g|gif|svg|webp|bmp|ico|pdf|txt|csv|json|xml|yml|yaml|zip|tar|gz|mp3|wav|ogg|mp4|webm)$/i;
const watchedPathsByWebContents = new Map();
const fileWatchRegistrations = new Map();
let mainWindow = null;
let pendingOpenPath = null;

function isWorkspaceEditableFile(fileName) {
  return WORKSPACE_EDITABLE_FILE_PATTERN.test(fileName);
}

function isProjectFilePath(filePath = "") {
  return filePath.toLowerCase().endsWith(PROJECT_FILE_EXTENSION);
}

function isOpenableLaunchPath(filePath = "") {
  return isProjectFilePath(filePath) || WORKSPACE_EDITABLE_FILE_PATTERN.test(filePath);
}

function extractLaunchPath(argv = []) {
  for (const value of [...argv].reverse()) {
    if (!value || value.startsWith("-")) {
      continue;
    }

    if (isOpenableLaunchPath(value)) {
      return value;
    }
  }

  return null;
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

function normalizeRecentProjects(recentProjects, projectPath) {
  return [projectPath, ...(recentProjects ?? []).filter((item) => item !== projectPath)].slice(0, 10);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildWorkspaceSearchRegExp(query, options = {}) {
  if (!query) {
    return null;
  }

  let source = options.regex ? query : escapeRegExp(query);
  if (options.wholeWord) {
    source = `\\b(?:${source})\\b`;
  }

  return new RegExp(source, options.caseSensitive ? "g" : "gi");
}

function collectMatches(text, pattern) {
  const matches = [];
  const matcher = new RegExp(pattern.source, pattern.flags);
  let nextMatch = matcher.exec(text);

  while (nextMatch) {
    matches.push(nextMatch);
    if (nextMatch[0] === "") {
      matcher.lastIndex += 1;
    }
    nextMatch = matcher.exec(text);
  }

  return matches;
}

function isImageAssetFile(filePath) {
  return IMAGE_ASSET_FILE_PATTERN.test(filePath ?? "");
}

function toPortablePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function fromPortablePath(filePath) {
  return filePath.split("/").join(path.sep);
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

function resolveProjectPath(projectDir, relativePath, fallback = null) {
  if (typeof relativePath !== "string" || !relativePath.trim()) {
    return fallback;
  }

  return path.resolve(projectDir, fromPortablePath(relativePath));
}

function toProjectRelativePath(projectDir, targetPath, fallback = null) {
  if (!targetPath) {
    return fallback;
  }

  const relativePath = path.relative(projectDir, targetPath) || ".";
  return toPortablePath(relativePath);
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

  if (kind === "project") {
    return {
      ...baseOptions,
      title: "Save AsciiDoc project",
      filters: [
        { name: "AsciiDoc Project", extensions: ["adp"] },
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

async function loadProjectFile(projectPath) {
  const content = await fs.readFile(projectPath, "utf8");
  const rawProject = JSON.parse(content);
  const projectDir = path.dirname(projectPath);

  return {
    projectPath,
    name: typeof rawProject.name === "string" && rawProject.name.trim()
      ? rawProject.name.trim()
      : path.basename(projectPath, PROJECT_FILE_EXTENSION),
    workspacePath: resolveProjectPath(projectDir, rawProject.workspace ?? ".", projectDir),
    previewStylesheetPath: resolveProjectPath(projectDir, rawProject.previewStylesheet, null),
    pdfStylesheetPath: resolveProjectPath(projectDir, rawProject.pdfStylesheet, null),
    previewFontFamily: rawProject.previewFontFamily ?? "serif",
    pdfPaperSize: rawProject.pdfPaperSize ?? "A4"
  };
}

async function saveProjectFile(projectPath, projectPayload = {}) {
  const projectDir = path.dirname(projectPath);
  const serialized = {
    version: 1,
    name: projectPayload.name ?? path.basename(projectPath, PROJECT_FILE_EXTENSION),
    workspace: toProjectRelativePath(projectDir, projectPayload.workspacePath, "."),
    previewStylesheet: toProjectRelativePath(projectDir, projectPayload.previewStylesheetPath, null),
    pdfStylesheet: toProjectRelativePath(projectDir, projectPayload.pdfStylesheetPath, null),
    previewFontFamily: projectPayload.previewFontFamily ?? "serif",
    pdfPaperSize: projectPayload.pdfPaperSize ?? "A4"
  };

  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(projectPath, JSON.stringify(serialized, null, 2), "utf8");
  return loadProjectFile(projectPath);
}

function getSessionSource(state, projectPath = null) {
  if (projectPath) {
    return state.projectSessions?.[projectPath] ?? {};
  }

  return state;
}

async function hydrateStoredDocuments(sessionState, workspacePath = null) {
  const storedDocuments = Array.isArray(sessionState.openDocuments) ? sessionState.openDocuments : [];
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
      workspacePath: storedDocument?.workspacePath ?? workspacePath ?? null,
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

async function searchWorkspaceContent(rootPath, query, options = {}, limit = 250) {
  const pattern = buildWorkspaceSearchRegExp(query, options);
  if (!rootPath || !pattern) {
    return {
      results: [],
      totalMatches: 0,
      totalFiles: 0
    };
  }

  const results = [];
  let totalMatches = 0;

  async function visitDirectory(currentPath) {
    if (totalMatches >= limit) {
      return;
    }

    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (totalMatches >= limit || entry.name.startsWith(".")) {
        continue;
      }

      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (await directoryContainsBrowsableFiles(fullPath)) {
          await visitDirectory(fullPath);
        }
        continue;
      }

      if (!isWorkspaceEditableFile(entry.name)) {
        continue;
      }

      const content = await fs.readFile(fullPath, "utf8");
      const lines = content.split(/\r?\n/);
      const fileMatches = [];

      for (let lineIndex = 0; lineIndex < lines.length && totalMatches < limit; lineIndex += 1) {
        const line = lines[lineIndex];
        const lineMatches = collectMatches(line, pattern);

        for (const match of lineMatches) {
          fileMatches.push({
            lineNumber: lineIndex + 1,
            column: (match.index ?? 0) + 1,
            length: match[0].length,
            preview: line.trim() || "(blank line)"
          });
          totalMatches += 1;
          if (totalMatches >= limit) {
            break;
          }
        }
      }

      if (fileMatches.length > 0) {
        results.push({
          path: fullPath,
          relativePath: path.relative(rootPath, fullPath),
          name: entry.name,
          matchCount: fileMatches.length,
          matches: fileMatches
        });
      }
    }
  }

  await visitDirectory(rootPath);
  return {
    results,
    totalMatches,
    totalFiles: results.length
  };
}

async function replaceWorkspaceContent(rootPath, query, replaceText, options = {}) {
  const pattern = buildWorkspaceSearchRegExp(query, options);
  if (!rootPath || !pattern) {
    return {
      changedPaths: [],
      replacementCount: 0,
      fileCount: 0
    };
  }

  const changedPaths = [];
  let replacementCount = 0;

  async function visitDirectory(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name.startsWith(".")) {
        continue;
      }

      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (await directoryContainsBrowsableFiles(fullPath)) {
          await visitDirectory(fullPath);
        }
        continue;
      }

      if (!isWorkspaceEditableFile(entry.name)) {
        continue;
      }

      const content = await fs.readFile(fullPath, "utf8");
      const matches = collectMatches(content, pattern);
      if (matches.length === 0) {
        continue;
      }

      const replaced = content.replace(new RegExp(pattern.source, pattern.flags), replaceText);
      if (replaced === content) {
        continue;
      }

      await fs.writeFile(fullPath, replaced, "utf8");
      changedPaths.push(fullPath);
      replacementCount += matches.length;
    }
  }

  await visitDirectory(rootPath);
  return {
    changedPaths,
    replacementCount,
    fileCount: changedPaths.length
  };
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
  mainWindow = window;

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
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
}

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  pendingOpenPath = extractLaunchPath(process.argv.slice(1));

  app.on("second-instance", (_event, argv) => {
    const launchPath = extractLaunchPath(argv);
    if (launchPath) {
      pendingOpenPath = launchPath;
      mainWindow?.webContents.send("app:open-path", { path: launchPath });
    }

    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    pendingOpenPath = filePath;
    mainWindow?.webContents.send("app:open-path", { path: filePath });
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
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

  ipcMain.handle("dialog:open-project", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Open AsciiDoc project",
      properties: ["openFile"],
      filters: [
        { name: "AsciiDoc Project", extensions: ["adp"] },
        { name: "All files", extensions: ["*"] }
      ]
    });

    if (canceled || filePaths.length === 0) {
      return null;
    }

    const state = await loadState();
    const project = await loadProjectFile(filePaths[0]);
    await saveState({
      currentProjectPath: project.projectPath,
      recentProjects: normalizeRecentProjects(state.recentProjects, project.projectPath)
    });

    return {
      project,
      projectSession: state.projectSessions?.[project.projectPath] ?? null
    };
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

  ipcMain.handle("project:open-file", async (_, projectPath) => {
    const state = await loadState();
    const project = await loadProjectFile(projectPath);
    await saveState({
      currentProjectPath: project.projectPath,
      recentProjects: normalizeRecentProjects(state.recentProjects, project.projectPath)
    });

    return {
      project,
      projectSession: state.projectSessions?.[project.projectPath] ?? null
    };
  });

  ipcMain.handle("project:save-file", async (_, payload = {}) => {
    let projectPath = payload.projectPath ?? null;
    if (!projectPath) {
      const { canceled, filePath } = await dialog.showSaveDialog(buildSaveDialogConfig({
        kind: "project",
        defaultPath: payload.defaultPath
      }));
      if (canceled || !filePath) {
        return null;
      }
      projectPath = filePath;
    }

    if (!isProjectFilePath(projectPath)) {
      projectPath = `${projectPath}${PROJECT_FILE_EXTENSION}`;
    }

    const savedProject = await saveProjectFile(projectPath, payload);
    const state = await loadState();
    await saveState({
      currentProjectPath: savedProject.projectPath,
      recentProjects: normalizeRecentProjects(state.recentProjects, savedProject.projectPath)
    });

    return savedProject;
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
  ipcMain.handle("fs:search-workspace-content", async (_, payload = {}) => searchWorkspaceContent(
    payload.rootPath,
    payload.query,
    payload.options,
    payload.limit
  ));
  ipcMain.handle("fs:replace-workspace-content", async (_, payload = {}) => replaceWorkspaceContent(
    payload.rootPath,
    payload.query,
    payload.replaceText ?? "",
    payload.options
  ));
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
      baseDir: payload.baseDir,
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
    const launchPath = pendingOpenPath;
    pendingOpenPath = null;
    const launchProjectPath = isProjectFilePath(launchPath ?? "") ? launchPath : null;
    const launchDocumentPath = launchPath && !launchProjectPath ? launchPath : null;
    const activeProjectPath = launchProjectPath ?? state.currentProjectPath ?? null;
    let project = null;
    let projectSession = null;
    let restoredDocuments = [];
    let initialDocument = null;

    if (activeProjectPath) {
      try {
        project = await loadProjectFile(activeProjectPath);
        projectSession = state.projectSessions?.[project.projectPath] ?? null;
        restoredDocuments = await hydrateStoredDocuments(getSessionSource(state, project.projectPath), project.workspacePath);
      } catch {
        project = null;
        projectSession = null;
      }
    }

    if (launchDocumentPath) {
      try {
        initialDocument = await loadDocument(launchDocumentPath);
      } catch {
        initialDocument = null;
      }
    } else if (!project) {
      restoredDocuments = await hydrateStoredDocuments(state, state.workspacePath ?? null);
    }

    if (!project && restoredDocuments.length === 0 && state.openFilePath && !initialDocument) {
      try {
        initialDocument = await loadDocument(state.openFilePath);
      } catch {
        initialDocument = null;
      }
    }

    return {
      state,
      project,
      projectSession,
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
