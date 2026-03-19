import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  onBoot(callback) {
    ipcRenderer.on("app:boot", (_, payload) => callback(payload));
  },
  openFile: () => ipcRenderer.invoke("dialog:open-file"),
  openFolder: () => ipcRenderer.invoke("dialog:open-folder"),
  saveDialog: (defaultPath) => ipcRenderer.invoke("dialog:save-file", defaultPath),
  chooseStylesheet: () => ipcRenderer.invoke("dialog:choose-stylesheet"),
  listDirectory: (rootPath) => ipcRenderer.invoke("fs:list-directory", rootPath),
  readDocument: (filePath) => ipcRenderer.invoke("fs:read-document", filePath),
  saveDocument: (payload) => ipcRenderer.invoke("fs:save-document", payload),
  renderPreview: (payload) => ipcRenderer.invoke("preview:render", payload),
  followPreviewLink: (payload) => ipcRenderer.invoke("preview:follow-link", payload),
  exportDocument: (payload) => ipcRenderer.invoke("export:document", payload),
  updateState: (payload) => ipcRenderer.invoke("state:update", payload),
  loadState: () => ipcRenderer.invoke("state:load")
});
