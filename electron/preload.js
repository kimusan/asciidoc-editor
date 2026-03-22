import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  getBootPayload: () => ipcRenderer.invoke("app:get-boot-payload"),
  openFile: () => ipcRenderer.invoke("dialog:open-file"),
  openProjectDialog: () => ipcRenderer.invoke("dialog:open-project"),
  openFolder: () => ipcRenderer.invoke("dialog:open-folder"),
  saveDialog: (payload) => ipcRenderer.invoke("dialog:save-file", payload),
  chooseStylesheet: (kind) => ipcRenderer.invoke("dialog:choose-stylesheet", kind),
  listDirectory: (rootPath) => ipcRenderer.invoke("fs:list-directory", rootPath),
  searchWorkspace: (payload) => ipcRenderer.invoke("fs:search-workspace", payload),
  readDocument: (filePath) => ipcRenderer.invoke("fs:read-document", filePath),
  saveDocument: (payload) => ipcRenderer.invoke("fs:save-document", payload),
  importAssets: (payload) => ipcRenderer.invoke("fs:import-assets", payload),
  openProjectFile: (projectPath) => ipcRenderer.invoke("project:open-file", projectPath),
  saveProjectFile: (payload) => ipcRenderer.invoke("project:save-file", payload),
  setWatchedPaths: (paths) => ipcRenderer.invoke("fs:set-watched-paths", paths),
  onExternalFileChanged: (callback) => {
    ipcRenderer.removeAllListeners("fs:file-changed");
    ipcRenderer.on("fs:file-changed", (_, payload) => callback(payload));
  },
  renderPreview: (payload) => ipcRenderer.invoke("preview:render", payload),
  followPreviewLink: (payload) => ipcRenderer.invoke("preview:follow-link", payload),
  exportDocument: (payload) => ipcRenderer.invoke("export:document", payload),
  openExternal: (url) => ipcRenderer.invoke("shell:open-external", url),
  confirmUnsaved: (payload) => ipcRenderer.invoke("dialog:confirm-unsaved", payload),
  confirmExternalChange: (payload) => ipcRenderer.invoke("dialog:confirm-external-change", payload),
  onOpenPath: (callback) => {
    ipcRenderer.removeAllListeners("app:open-path");
    ipcRenderer.on("app:open-path", (_, payload) => callback(payload));
  },
  onAppCloseRequested: (callback) => {
    ipcRenderer.removeAllListeners("app:close-requested");
    ipcRenderer.on("app:close-requested", (_, payload) => callback(payload));
  },
  respondToAppCloseRequest: (payload) => ipcRenderer.invoke("app:close-response", payload),
  updateState: (payload) => ipcRenderer.invoke("state:update", payload),
  loadState: () => ipcRenderer.invoke("state:load")
});
