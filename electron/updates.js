// Pure update helpers, free of Electron imports so they can be unit tested.

export const GITHUB_OWNER = "kimusan";
export const GITHUB_REPO = "asciidoc-editor";
export const RELEASES_PAGE_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
export const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

// Compares two version strings ("1.2.3" or "v1.2.3", optional prerelease
// suffix ignored) and returns true only when candidate is strictly newer.
// Anything unparsable counts as "not newer" so a malformed API response can
// never trigger an update prompt.
export function isNewerVersion(currentVersion, candidateVersion) {
  const parse = (value) => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(value ?? ""));
    return match
      ? [Number(match[1]), Number(match[2]), Number(match[3])]
      : null;
  };

  const current = parse(currentVersion);
  const candidate = parse(candidateVersion);
  if (!current || !candidate) {
    return false;
  }

  for (let index = 0; index < 3; index += 1) {
    if (candidate[index] !== current[index]) {
      return candidate[index] > current[index];
    }
  }

  return false;
}

// Full in-place auto-update (download + silent install + restart) is only
// possible for installers that can replace themselves:
// - Linux: the AppImage (electron-updater rewrites the APPIMAGE file).
// - Windows: the NSIS installer (electron-updater runs it silently).
// deb/rpm/pacman packages need root privileges and the Windows zip/portable
// builds have no installer, so those fall back to a notification that opens
// the release page. electron-builder's portable wrapper sets
// PORTABLE_EXECUTABLE_DIR, which is how the two Windows flavors are told
// apart.
export function resolveUpdateCapability({
  platform = process.platform,
  appImagePath = process.env.APPIMAGE,
  portableExecutableDir = process.env.PORTABLE_EXECUTABLE_DIR
} = {}) {
  if (platform === "linux") {
    return appImagePath
      ? { mode: "auto", canSelfUpdate: true }
      : { mode: "manual", canSelfUpdate: false };
  }

  if (platform === "win32") {
    return portableExecutableDir
      ? { mode: "manual", canSelfUpdate: false }
      : { mode: "auto", canSelfUpdate: true };
  }

  return { mode: "manual", canSelfUpdate: false };
}
