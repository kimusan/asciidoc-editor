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
  distractionFree: false,
  previewStylesheetPath: null
};

function getStatePath() {
  return path.join(app.getPath("userData"), "state.json");
}

export async function loadState() {
  try {
    const content = await fs.readFile(getStatePath(), "utf8");
    return {
      ...defaultState,
      ...JSON.parse(content)
    };
  } catch {
    return { ...defaultState };
  }
}

export async function saveState(partialState) {
  const nextState = {
    ...(await loadState()),
    ...partialState
  };

  await fs.mkdir(path.dirname(getStatePath()), { recursive: true });
  await fs.writeFile(getStatePath(), JSON.stringify(nextState, null, 2), "utf8");
  return nextState;
}
