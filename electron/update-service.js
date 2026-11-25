// Update orchestration for the main process. All Electron/electron-updater
// dependencies are injected by main.js so the state machine can be unit
// tested with fakes. The renderer learns about progress exclusively through
// the sendStatus callback (wired to the update:status IPC event).

import {
  LATEST_RELEASE_API_URL,
  RELEASES_PAGE_URL,
  isNewerVersion,
  resolveUpdateCapability
} from "./updates.js";

const STARTUP_CHECK_DELAY_MS = 8000;

export function createUpdateService({
  app,
  net,
  autoUpdater,
  getState,
  allowQuitForUpdate,
  flushRendererSession,
  sendStatus: emitStatus = () => {},
  capability = resolveUpdateCapability()
}) {
  // E2E hook: ASCIIDOC_UPDATE_SIMULATE=auto|manual replaces every network
  // call with a synthetic "version 99.0.0 available" flow so the update UX
  // can be tested end to end without a published release. applyUpdate then
  // walks through downloading/ready but never actually quits.
  const simulatedMode = process.env.ASCIIDOC_UPDATE_SIMULATE === "manual"
    ? "manual"
    : process.env.ASCIIDOC_UPDATE_SIMULATE === "auto" ? "auto" : null;
  // The renderer can pull the last status at init (update:get-status) so a
  // status emitted before its listener attached is not lost forever.
  let lastStatus = null;
  const sendStatus = (payload) => {
    lastStatus = payload;
    emitStatus(payload);
  };
  // A second check while one is in flight shares the running check instead
  // of silently doing nothing (a manual click during a startup check used
  // to be a no-op with no feedback).
  let checkingPromise = null;

  if (autoUpdater) {
    autoUpdater.autoDownload = false;
    autoUpdater.on("download-progress", (progress) => {
      sendStatus({
        status: "downloading",
        percent: Math.max(0, Math.min(100, Math.round(progress?.percent ?? 0)))
      });
    });
  }

  async function fetchLatestRelease() {
    const response = await net.fetch(LATEST_RELEASE_API_URL, {
      headers: { "User-Agent": "asciidoc-editor-update-check" }
    });
    if (!response.ok) {
      throw new Error(`GitHub API responded with ${response.status}`);
    }

    const release = await response.json();
    return {
      version: release?.tag_name ?? null,
      releaseUrl: release?.html_url ?? RELEASES_PAGE_URL
    };
  }

  function checkNow(options = {}) {
    if (checkingPromise) {
      return checkingPromise;
    }

    checkingPromise = runCheck(options).finally(() => {
      checkingPromise = null;
    });
    return checkingPromise;
  }

  async function runCheck({ manual = false } = {}) {
    sendStatus({ status: "checking" });
    void manual;

    try {
      if (simulatedMode) {
        sendStatus({
          status: "available",
          version: "99.0.0",
          mode: simulatedMode,
          releaseUrl: RELEASES_PAGE_URL
        });
        return;
      }

      if (capability.mode === "auto") {
        const result = await autoUpdater.checkForUpdates();
        const candidate = result?.updateInfo?.version;
        if (isNewerVersion(app.getVersion(), candidate)) {
          sendStatus({
            status: "available",
            version: candidate,
            mode: "auto",
            releaseUrl: RELEASES_PAGE_URL
          });
        } else {
          sendStatus({ status: "up-to-date" });
        }
        return;
      }

      const release = await fetchLatestRelease();
      if (isNewerVersion(app.getVersion(), release.version)) {
        sendStatus({
          status: "available",
          version: release.version.replace(/^v/, ""),
          mode: "manual",
          releaseUrl: release.releaseUrl
        });
      } else {
        sendStatus({ status: "up-to-date" });
      }
    } catch (error) {
      // Only surface failures the user explicitly asked for: a background
      // startup check hitting a network error must not nag with a toast.
      sendStatus({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        manual
      });
    }
  }

  async function applyUpdate() {
    if (simulatedMode) {
      for (const percent of [12, 55, 100]) {
        sendStatus({ status: "downloading", percent });
        await new Promise((resolve) => {
          setTimeout(resolve, 120);
        });
      }

      sendStatus({ status: "ready", simulated: true });
      return;
    }

    if (capability.mode !== "auto") {
      return;
    }

    try {
      // downloadUpdate() re-resolves the latest release internally, so a
      // newer (or retracted) release between the check and the user's
      // consent cannot install something the user was not offered.
      await autoUpdater.downloadUpdate();
      sendStatus({ status: "ready" });
      allowQuitForUpdate();
      // Persist the renderer session BEFORE quitting: unsaved buffers live
      // in state.json, and the renderer's beforeunload flush is
      // fire-and-forget, so it can race window destruction. The main
      // process asks the renderer to persist now and awaits the round
      // trip; the before-quit flush remains as the backstop if the window
      // is already gone.
      try {
        await flushRendererSession?.();
      } catch {
        // A missing or destroyed window is fine - nothing left to flush.
      }
      // quitAndInstall(silent, forceRunAfter): install without wizard and
      // relaunch the app once the installer finishes.
      autoUpdater.quitAndInstall(true, true);
    } catch (error) {
      sendStatus({
        status: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async function scheduleStartupCheck() {
    if (simulatedMode) {
      setTimeout(() => {
        void checkNow();
      }, 800);
      return;
    }

    // Unpackaged runs (npx electron ., e2e dev tree) never touch the network.
    if (!app.isPackaged) {
      return;
    }

    const state = await getState();
    if (state?.autoCheckUpdates === false) {
      return;
    }

    setTimeout(() => {
      void checkNow();
    }, STARTUP_CHECK_DELAY_MS);
  }

  return {
    capability,
    checkNow,
    applyUpdate,
    scheduleStartupCheck,
    getStatus: () => lastStatus
  };
}
