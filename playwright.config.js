import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  // Launching the full Electron app takes ~30s on a loaded dev machine.
  timeout: 180_000,
  // The suite launches the full Electron app; run one instance at a time.
  workers: 1,
  reporter: [["list"]]
});
