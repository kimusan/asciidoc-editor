import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";

// Bump when a persisted key is renamed or reshaped and add a migration in
// stateMigrations below. Additive changes (new keys with defaults) need no
// bump: defaultState spreads over whatever the file contains.
const STATE_SCHEMA_VERSION = 1;

// Forward-compatibility hooks for auto-updated binaries. A state file with
// schemaVersion N is walked forward through every migration > N before use.
const stateMigrations = {
  // 2: (state) => ({ ...state, newKey: state.oldKey ?? default }),
};

function migrateState(state) {
  let version = typeof state.schemaVersion === "number" ? state.schemaVersion : 1;
  let migrated = state;

  while (version < STATE_SCHEMA_VERSION) {
    const migrate = stateMigrations[version + 1];
    if (migrate) {
      migrated = migrate(migrated);
    }
    version += 1;
  }

  return { ...migrated, schemaVersion: STATE_SCHEMA_VERSION };
}

const defaultState = {
  schemaVersion: STATE_SCHEMA_VERSION,
  currentProjectPath: null,
  workspacePath: null,
  openFilePath: null,
  openDocuments: [],
  activeDocumentId: null,
  nextDocumentId: 1,
  untitledSequence: 1,
  zoomLevel: 0,
  recentFiles: [],
  recentProjects: [],
  projectSessions: {},
  theme: "nord",
  previewFontFamily: "serif",
  previewColorScheme: "auto",
  editorFontSize: "default",
  pdfPaperSize: "A4",
  autoCheckUpdates: true,
  distractionFree: false,
  workspaceCollapsed: false,
  outlineCollapsed: false,
  previewStylesheetPath: null,
  pdfStylesheetPath: null
};

let writeQueue = Promise.resolve();
// The parsed state lives in memory: state.json holds the full content of
// every open document, so re-reading and re-parsing it on every save (one
// per typing pause) is pure waste on the main process. The file is only
// read at boot; after that the cache and the file are written together.
let cachedState = null;

async function readStateFile() {
  const content = await fs.readFile(getStatePath(), "utf8");
  return migrateState({
    ...defaultState,
    ...JSON.parse(content)
  });
}

function getStatePath() {
  return path.join(app.getPath("userData"), "state.json");
}

// A corrupt state file silently reverted the app to defaults - and since
// dirty-document snapshots live inside state.json, that meant losing every
// unsaved buffer with no trace. Keep the unreadable file for manual
// recovery before falling back.
async function backUpCorruptStateFile(error) {
  if (error?.code === "ENOENT") {
    // A missing file is a normal first run, nothing to back up.
    return;
  }

  const statePath = getStatePath();
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  try {
    await fs.copyFile(statePath, `${statePath}.corrupt-${timestamp}`);
    console.error(`[store] state.json was unreadable (${error instanceof Error ? error.message : error}); previous file kept as state.json.corrupt-${timestamp}`);
  } catch (backupError) {
    console.error("[store] could not back up the unreadable state file:", backupError);
  }
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

  if (cachedState) {
    return cachedState;
  }

  try {
    cachedState = await readStateFile();
  } catch (error) {
    await backUpCorruptStateFile(error);
    cachedState = { ...defaultState };
  }
  return cachedState;
}

export async function saveState(partialState) {
  const write = writeQueue.then(async () => {
    const nextState = migrateState({
      ...(cachedState ?? defaultState),
      ...partialState
    });
    cachedState = nextState;
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
