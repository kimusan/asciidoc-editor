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
  autoCheckUpdates: true,
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

// Write via a temp file and rename: rename is atomic on the same filesystem,
// so state.json can never be left truncated if the process dies mid-write
// (fs.writeFile truncates the target file first, which is how a quit-time
// save used to zero out the whole persisted state).
async function writeStateFile(nextState) {
  const statePath = getStatePath();
  const tempPath = `${statePath}.tmp`;

  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(tempPath, JSON.stringify(nextState, null, 2), "utf8");
  await fs.rename(tempPath, statePath);
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

    await writeStateFile(nextState);
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

// Resolves once every queued state write has settled. The quit path uses
// this to let the final session snapshot land before the process exits.
export function flushStateWrites() {
  return Promise.resolve(writeQueue);
}
