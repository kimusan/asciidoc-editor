import test from "node:test";
import assert from "node:assert/strict";
import {
  isNewerVersion,
  resolveUpdateCapability,
  RELEASES_PAGE_URL
} from "../electron/updates.js";
import { createUpdateService } from "../electron/update-service.js";

test("isNewerVersion detects newer, older, equal and malformed versions", () => {
  assert.equal(isNewerVersion("0.7.0", "0.7.1"), true);
  assert.equal(isNewerVersion("0.7.0", "v0.8.0"), true);
  assert.equal(isNewerVersion("0.7.0", "1.0.0"), true);
  assert.equal(isNewerVersion("0.7.0", "0.7.0"), false);
  assert.equal(isNewerVersion("0.7.1", "0.7.0"), false);
  assert.equal(isNewerVersion("0.7.0", "0.7.0-beta.1"), false);
  // Malformed candidates must never trigger an update prompt.
  assert.equal(isNewerVersion("0.7.0", null), false);
  assert.equal(isNewerVersion("0.7.0", "not-a-version"), false);
  assert.equal(isNewerVersion("garbage", "0.8.0"), false);
});

test("resolveUpdateCapability maps installers to update modes", () => {
  assert.deepEqual(
    resolveUpdateCapability({ platform: "linux", appImagePath: "/tmp/app.AppImage" }),
    { mode: "auto", canSelfUpdate: true }
  );
  assert.deepEqual(
    resolveUpdateCapability({ platform: "linux", appImagePath: null }),
    { mode: "manual", canSelfUpdate: false }
  );
  assert.deepEqual(
    resolveUpdateCapability({ platform: "win32", portableExecutableDir: null }),
    { mode: "auto", canSelfUpdate: true }
  );
  // electron-builder's portable wrapper sets PORTABLE_EXECUTABLE_DIR.
  assert.deepEqual(
    resolveUpdateCapability({ platform: "win32", portableExecutableDir: "C:\\apps" }),
    { mode: "manual", canSelfUpdate: false }
  );
  assert.deepEqual(
    resolveUpdateCapability({ platform: "darwin" }),
    { mode: "manual", canSelfUpdate: false }
  );
});

function buildFakeService({
  currentVersion = "1.0.0",
  latestVersion = "1.1.0",
  autoMode = true,
  checkResult = null,
  downloadError = null
} = {}) {  const events = [];
  const calls = { downloads: 0, quits: 0, quitAllowed: 0, stateLoads: 0 };
  const autoUpdater = {
    autoDownload: null,
    listeners: new Map(),
    on(name, handler) {
      this.listeners.set(name, handler);
    },
    async checkForUpdates() {
      return checkResult ?? { updateInfo: { version: latestVersion } };
    },
    async downloadUpdate() {
      calls.downloads += 1;
      if (downloadError) {
        throw downloadError;
      }
      this.listeners.get("download-progress")?.({ percent: 62.4 });
      this.listeners.get("update-downloaded")?.();
    },
    quitAndInstall() {
      calls.quits += 1;
    }
  };

  const service = createUpdateService({
    app: { getVersion: () => currentVersion, isPackaged: true },
    net: {
      async fetch(url) {
        if (url.includes("/releases/latest")) {
          return {
            ok: true,
            json: async () => ({
              tag_name: latestVersion,
              html_url: RELEASES_PAGE_URL
            })
          };
        }
        throw new Error("unexpected fetch");
      }
    },
    autoUpdater: autoMode ? autoUpdater : null,
    capability: autoMode
      ? { mode: "auto", canSelfUpdate: true }
      : { mode: "manual", canSelfUpdate: false },
    sendStatus: (payload) => events.push(payload),
    getState: async () => {
      calls.stateLoads += 1;
      return { autoCheckUpdates: true };
    },
    allowQuitForUpdate: () => {
      calls.quitAllowed += 1;
    }
  });

  return { service, events, calls, autoUpdater };
}

test("service startup check skips unpackaged runs and respects the setting", async () => {
  const events = [];
  let stateLoads = 0;
  const service = createUpdateService({
    app: { getVersion: () => "1.0.0", isPackaged: false },
    net: { fetch: async () => ({ ok: true, json: async () => ({}) }) },
    autoUpdater: null,
    sendStatus: (payload) => events.push(payload),
    getState: async () => {
      stateLoads += 1;
      return {};
    },
    allowQuitForUpdate: () => {}
  });

  await service.scheduleStartupCheck();
  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
  // Unpackaged: no network, no state reads, no events.
  assert.equal(stateLoads, 0);
  assert.equal(events.length, 0);
});

test("auto mode check reports available and applyUpdate restarts", async () => {
  const { service, events, calls } = buildFakeService();

  await service.checkNow();
  assert.equal(events[0].status, "checking");
  assert.deepEqual(events[1], {
    status: "available",
    version: "1.1.0",
    mode: "auto",
    releaseUrl: RELEASES_PAGE_URL
  });

  await service.applyUpdate();
  assert.equal(calls.downloads, 1);
  assert.equal(calls.quitAllowed, 1);
  assert.equal(calls.quits, 1);
  assert.ok(events.some((event) => event.status === "downloading" && event.percent === 62));
  assert.ok(events.some((event) => event.status === "ready"));
});

test("auto mode check reports up-to-date when the release is not newer", async () => {
  const { service, events } = buildFakeService({ latestVersion: "1.0.0" });

  await service.checkNow();
  assert.deepEqual(events, [{ status: "checking" }, { status: "up-to-date" }]);
});

test("manual mode checks the GitHub API and never self-installs", async () => {
  const { service, events, calls } = buildFakeService({ autoMode: false });

  await service.checkNow();
  assert.equal(events[1].status, "available");
  assert.equal(events[1].mode, "manual");
  assert.equal(events[1].version, "1.1.0");

  await service.applyUpdate();
  assert.equal(calls.downloads, 0);
  assert.equal(calls.quits, 0);
});

test("check failures surface as error status with the message", async () => {
  const { service, events } = buildFakeService({
    checkResult: null,
    autoMode: false
  });
  // Force the fetch to fail by pointing the service at a broken net layer is
  // not possible post-construction; instead exercise the error path through
  // an unparsable latest version handled above, and directly here via a
  // service whose fetch rejects.
  const failing = createUpdateService({
    app: { getVersion: () => "1.0.0", isPackaged: true },
    net: {
      fetch: async () => {
        throw new Error("offline");
      }
    },
    autoUpdater: null,
    // Pin the capability: the default resolveUpdateCapability() is
    // platform-dependent ("auto" on win32, "manual" on this Linux dev
    // box), and in auto mode the service would call the null
    // autoUpdater instead of walking the fetch path under test.
    capability: { mode: "manual", canSelfUpdate: false },
    sendStatus: (payload) => events.push(payload),
    getState: async () => ({}),
    allowQuitForUpdate: () => {}
  });

  await failing.checkNow();
  assert.equal(events.at(-1).status, "error");
  assert.equal(events.at(-1).message, "offline");
});

test("auto mode with a broken updater surfaces an error instead of crashing", async () => {
  // Regression guard for the Windows CI failure: a service constructed in
  // auto mode whose autoUpdater is unavailable must report an error status,
  // not throw out of checkNow.
  const events = [];
  const broken = createUpdateService({
    app: { getVersion: () => "1.0.0", isPackaged: true },
    net: { fetch: async () => { throw new Error("unreachable"); } },
    autoUpdater: null,
    capability: { mode: "auto", canSelfUpdate: true },
    sendStatus: (payload) => events.push(payload),
    getState: async () => ({}),
    allowQuitForUpdate: () => {}
  });

  await assert.doesNotReject(() => broken.checkNow());
  assert.equal(events.at(-1).status, "error");
});

test("applyUpdate flushes the renderer session before quitting to install", async () => {
  // The renderer's beforeunload flush is fire-and-forget, so the update
  // restart must await an explicit session flush BEFORE quitAndInstall or
  // unsaved buffers can be lost to the window teardown race.
  const order = [];
  const autoUpdater = {
    autoDownload: null,
    listeners: new Map(),
    on(name, handler) {
      this.listeners.set(name, handler);
    },
    async checkForUpdates() {
      return { updateInfo: { version: "1.1.0" } };
    },
    async downloadUpdate() {},
    quitAndInstall() {
      order.push("quit");
    }
  };

  const service = createUpdateService({
    app: { getVersion: () => "1.0.0", isPackaged: true },
    net: { fetch: async () => { throw new Error("unreachable"); } },
    autoUpdater,
    capability: { mode: "auto", canSelfUpdate: true },
    sendStatus: () => {},
    getState: async () => ({}),
    allowQuitForUpdate: () => {},
    flushRendererSession: async () => {
      order.push("flush");
    }
  });

  await service.applyUpdate();

  assert.deepEqual(order, ["flush", "quit"]);
});

test("concurrent checks share the in-flight check instead of no-oping", async () => {
  let fetchCount = 0;
  const service = createUpdateService({
    app: { getVersion: () => "1.0.0", isPackaged: true },
    net: {
      async fetch() {
        fetchCount += 1;
        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });
        return {
          ok: true,
          json: async () => ({ tag_name: "1.1.0", html_url: RELEASES_PAGE_URL })
        };
      }
    },
    autoUpdater: null,
    capability: { mode: "manual", canSelfUpdate: false },
    sendStatus: () => {},
    getState: async () => ({}),
    allowQuitForUpdate: () => {}
  });

  const [first, second] = [service.checkNow({ manual: true }), service.checkNow({ manual: true })];
  await Promise.all([first, second]);

  assert.equal(fetchCount, 1);
});

test("getStatus returns the last emitted status for the renderer pull", async () => {
  const { service, events } = buildFakeService({ latestVersion: "1.1.0" });

  await service.checkNow();

  assert.equal(service.getStatus(), events.at(-1));
  assert.equal(service.getStatus().status, "available");
});

test("applyUpdate reports download failures instead of quitting", async () => {
  const { service, events, calls } = buildFakeService({
    downloadError: new Error("checksum mismatch")
  });

  await service.checkNow();
  await service.applyUpdate();
  assert.equal(calls.quits, 0);
  assert.equal(calls.quitAllowed, 0);
  assert.equal(events.at(-1).status, "error");
  assert.equal(events.at(-1).message, "checksum mismatch");
});
