import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ASCIIDOC_EXTENSIONS = [".adoc", ".asciidoc", ".asc"];

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isExternalHref(href) {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(href) && !href.startsWith("file://");
}

function splitHref(href) {
  const hashIndex = href.indexOf("#");
  if (hashIndex === -1) {
    return {
      pathname: href,
      anchorId: null
    };
  }

  return {
    pathname: href.slice(0, hashIndex),
    anchorId: decodeURIComponent(href.slice(hashIndex + 1))
  };
}

function normalizeTargetPath(pathname, currentFilePath) {
  if (pathname.startsWith("file://")) {
    return fileURLToPath(pathname);
  }

  if (path.isAbsolute(pathname)) {
    return pathname;
  }

  return path.resolve(path.dirname(currentFilePath), pathname);
}

function buildAsciiDocCandidates(targetPath, currentFilePath) {
  const parsedTarget = path.parse(targetPath);
  const candidates = [];
  const seen = new Set();

  const addCandidate = (candidatePath) => {
    if (!candidatePath || seen.has(candidatePath)) {
      return;
    }

    seen.add(candidatePath);
    candidates.push(candidatePath);
  };

  if (currentFilePath) {
    const currentParsed = path.parse(currentFilePath);
    const isSameStem = parsedTarget.name === currentParsed.name;
    const looksLikeRenderedCurrentDoc = [".html", ".xhtml", ""].includes(parsedTarget.ext.toLowerCase());
    if (isSameStem && looksLikeRenderedCurrentDoc) {
      addCandidate(currentFilePath);
    }
  }

  if (ASCIIDOC_EXTENSIONS.includes(parsedTarget.ext.toLowerCase())) {
    addCandidate(targetPath);
    return candidates;
  }

  for (const extension of ASCIIDOC_EXTENSIONS) {
    addCandidate(path.join(parsedTarget.dir, `${parsedTarget.name}${extension}`));
  }

  if (!parsedTarget.ext) {
    for (const extension of ASCIIDOC_EXTENSIONS) {
      addCandidate(`${targetPath}${extension}`);
    }
  }

  return candidates;
}

export async function resolvePreviewLinkTarget(href, currentFilePath) {
  if (!href) {
    return {
      type: "missing",
      message: "Empty preview link."
    };
  }

  if (href.startsWith("#")) {
    return {
      type: "anchor",
      anchorId: decodeURIComponent(href.slice(1))
    };
  }

  if (isExternalHref(href)) {
    return {
      type: "external",
      url: href
    };
  }

  if (!currentFilePath) {
    return {
      type: "missing",
      message: "Save or open the current document before following relative preview links."
    };
  }

  const { pathname, anchorId } = splitHref(href);
  const targetPath = normalizeTargetPath(pathname, currentFilePath);

  for (const candidatePath of buildAsciiDocCandidates(targetPath, currentFilePath)) {
    if (await fileExists(candidatePath)) {
      if (candidatePath === currentFilePath) {
        return {
          type: "anchor",
          anchorId
        };
      }

      return {
        type: "document",
        filePath: candidatePath,
        anchorId
      };
    }
  }

  if (await fileExists(targetPath)) {
    return {
      type: "file",
      filePath: targetPath,
      anchorId
    };
  }

  return {
    type: "missing",
    message: `Referenced file was not found: ${href}`
  };
}
