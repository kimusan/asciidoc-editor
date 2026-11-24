import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";

const defaultState = {
  currentProjectPath: null,
  workspacePath: null,
  openFilePath: null,
  openDocuments: [],
  activeDocumentId: null,
  nextDocumentId: 1,
  untitledSequence: 1,
  recentFiles: [],
  recentProjects: [],
  projectSessions: {},
  theme: "nord",
  previewFontFamily: "serif",
  pdfPaperSize: "A4",
  distractionFree: false,
  workspaceCollapsed: false,
  outlineCollapsed: false,
  previewStylesheetPath: null,
  pdfStylesheetPath: null
};

let writeQueue = Promise.resolve();

async function readStateFile() {
  const content = await fs.readFile(getStatePath(), "utf8");
  return {
    ...defaultState,
    ...JSON.parse(content)
  };
}

function getStatePath() {
  return path.join(app.getPath("userData"), "state.json");
}

export async function loadState() {
  await writeQueue;

  try {
    return await readStateFile();
  } catch {
    return { ...defaultState };
  }
}

export async function saveState(partialState) {
  const write = writeQueue.then(async () => {
    let currentState = { ...defaultState };
    try {
      currentState = await readStateFile();
    } catch {
      currentState = { ...defaultState };
    }

    const nextState = {
      ...currentState,
      ...partialState
    };

    await fs.mkdir(path.dirname(getStatePath()), { recursive: true });
    await fs.writeFile(getStatePath(), JSON.stringify(nextState, null, 2), "utf8");
    return nextState;
  });

  // Keep the queue alive when a write fails (disk full, permissions, ...).
  // Without this, one rejected write would chain every later saveState onto
  // a rejected promise and silently disable session persistence.
  writeQueue = write.catch((error) => {
    console.error("[store] failed to persist state:", error);
  });

  return write;
}
