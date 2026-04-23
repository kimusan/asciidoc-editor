"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "linux") {
    return;
  }

  const executableName = context.packager?.executableName;
  if (!executableName) {
    return;
  }

  const launcherPath = path.join(context.appOutDir, executableName);
  const binaryName = `${executableName}-bin`;
  const binaryPath = path.join(context.appOutDir, binaryName);

  if (!(await exists(launcherPath))) {
    return;
  }

  if (!(await exists(binaryPath))) {
    await fs.rename(launcherPath, binaryPath);
  }

  const launcherScript = `#!/bin/sh
set -eu

APPDIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$APPDIR/${binaryName}" --no-sandbox --disable-setuid-sandbox "$@"
`;

  await fs.writeFile(launcherPath, launcherScript, { mode: 0o755 });
  await fs.chmod(launcherPath, 0o755);
};
