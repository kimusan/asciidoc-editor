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

# AppImage mounts are not suid-capable, so Chromium's setuid sandbox helper
# fails there. Prefer the user-namespace sandbox (kept enabled by only
# disabling the setuid helper) and fall back to --no-sandbox only on systems
# where unprivileged user namespaces are unavailable.
if [ -r /proc/sys/kernel/unprivileged_userns_clone ] \\
   && [ "\$(cat /proc/sys/kernel/unprivileged_userns_clone)" = "0" ]; then
  exec "$APPDIR/${binaryName}" --no-sandbox --disable-setuid-sandbox "$@"
fi

if [ ! -e /proc/sys/user/max_user_namespaces ] \\
   || [ "\$(cat /proc/sys/user/max_user_namespaces 2>/dev/null || echo 0)" = "0" ]; then
  exec "$APPDIR/${binaryName}" --no-sandbox --disable-setuid-sandbox "$@"
fi

exec "$APPDIR/${binaryName}" --disable-setuid-sandbox "$@"
`;

  await fs.writeFile(launcherPath, launcherScript, { mode: 0o755 });
  await fs.chmod(launcherPath, 0o755);
};
