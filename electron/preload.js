import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  getBootPayload: () => ipcRenderer.invoke("app:get-boot-payload"),
  openFile: () => ipcRenderer.invoke("dialog:open-file"),
  openFolder: () => ipcRenderer.invoke("dialog:open-folder"),
  saveDialog: (payload) => ipcRenderer.invoke("dialog:save-file", payload),
  chooseStylesheet: (kind) => ipcRenderer.invoke("dialog:choose-stylesheet", kind),
  listDirectory: (rootPath) => ipcRenderer.invoke("fs:list-directory", rootPath),
  searchWorkspace: (payload) => ipcRenderer.invoke("fs:search-workspace", payload),
  readDocument: (filePath) => ipcRenderer.invoke("fs:read-document", filePath),
  saveDocument: (payload) => ipcRenderer.invoke("fs:save-document", payload),
  renderPreview: (payload) => ipcRenderer.invoke("preview:render", payload),
  followPreviewLink: (payload) => ipcRenderer.invoke("preview:follow-link", payload),
  exportDocument: (payload) => ipcRenderer.invoke("export:document", payload),
  openExternal: (url) => ipcRenderer.invoke("shell:open-external", url),
  updateState: (payload) => ipcRenderer.invoke("state:update", payload),
  loadState: () => ipcRenderer.invoke("state:load")
});
