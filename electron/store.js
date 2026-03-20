import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";

const defaultState = {
  workspacePath: null,
  openFilePath: null,
  recentFiles: [],
  theme: "nocturne",
  previewTheme: "paper",
  previewFontFamily: "serif",
  pdfPaperSize: "A4",
  distractionFree: false,
  workspaceCollapsed: false,
  previewStylesheetPath: null
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
  writeQueue = writeQueue.then(async () => {
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

  return writeQueue;
}
