export function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

export function setInputElementValue(input, value) {
  // Reassigning .value even with an identical string resets the caret in
  // Chromium, which breaks mid-string editing in mirrored search fields.
  if (input && input.value !== value) {
    input.value = value;
  }
}

export function isAsciiDocFileName(name = "") {
  return /\.(adoc|asciidoc|asc)$/i.test(name);
}

export function canPreviewFileName(name = "") {
  return isAsciiDocFileName(name);
}

export function canOpenFileInEditor(name = "") {
  return /\.(adoc|asciidoc|asc|css)$/i.test(name);
}

export function getBaseName(filePath = "") {
  return filePath.split(/[\\/]/).pop() ?? "";
}

export function stripExtension(fileName = "") {
  return fileName.replace(/\.[^.]+$/, "");
}

export function getParentPath(filePath = "") {
  if (!filePath) {
    return "";
  }

  const normalized = filePath.replace(/[\\/]+$/, "");
  const lastSeparatorIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return lastSeparatorIndex >= 0 ? normalized.slice(0, lastSeparatorIndex) : "";
}

export function joinPath(parentPath, childName) {
  if (!parentPath) {
    return childName;
  }

  const separator = parentPath.includes("\\") ? "\\" : "/";
  return `${parentPath}${separator}${childName}`;
}
