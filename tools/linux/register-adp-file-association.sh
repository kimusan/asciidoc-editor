#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 /full/path/to/AsciiDoc\\ Editor-<version>.AppImage" >&2
  exit 1
fi

APP_PATH="$(realpath "$1")"
APP_DIR="$(dirname "$APP_PATH")"
MIME_DIR="${HOME}/.local/share/mime/packages"
APPLICATIONS_DIR="${HOME}/.local/share/applications"
MIME_FILE="${MIME_DIR}/asciidoc-editor-adp.xml"
DESKTOP_FILE="${APPLICATIONS_DIR}/asciidoc-editor-adp.desktop"

mkdir -p "$MIME_DIR" "$APPLICATIONS_DIR"

cat > "$MIME_FILE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="application/x-asciidoc-project">
    <comment>AsciiDoc Editor Project</comment>
    <glob pattern="*.adp"/>
  </mime-type>
</mime-info>
EOF

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=AsciiDoc Editor
Comment=Open AsciiDoc Editor project files
Exec="${APP_PATH}" %f
Terminal=false
MimeType=application/x-asciidoc-project;
Categories=Office;TextEditor;
EOF

if command -v update-mime-database >/dev/null 2>&1; then
  update-mime-database "${HOME}/.local/share/mime"
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPLICATIONS_DIR"
fi

if command -v xdg-mime >/dev/null 2>&1; then
  xdg-mime default "$(basename "$DESKTOP_FILE")" application/x-asciidoc-project
fi

echo "Registered .adp with AsciiDoc Editor for this user."
echo "If you move the AppImage, run this script again with the new path."
