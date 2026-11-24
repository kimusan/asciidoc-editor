// Preview frame plumbing and editor↔preview scroll-sync math. This module owns
// everything that talks to the sandboxed preview iframe DOM; the render
// orchestration (renderPreviewNow, link handling, scheduling) stays in
// main.js.

import { appState, editorRef, elements } from "./app-state.js";

export const PREVIEW_SYNC_SELECTOR = [
  "#content h1",
  "#content h2",
  "#content h3",
  "#content h4",
  "#content h5",
  "#content h6",
  "#content .paragraph",
  "#content .listingblock",
  "#content .literalblock",
  "#content .ulist",
  "#content .olist",
  "#content .dlist",
  "#content .imageblock",
  "#content .tableblock",
  "#content .admonitionblock",
  "#content .quoteblock",
  "#content .verseblock",
  "#content .sidebarblock",
  "#content .exampleblock",
  "#content .openblock",
  "#content .stemblock"
].join(", ");

export function waitForPreviewFrameReady(frame) {
  if (frame.contentDocument?.body?.dataset.previewShell === "true") {
    return Promise.resolve(frame.contentDocument);
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      frame.removeEventListener("load", handleLoad);
      reject(new Error("Preview frame did not finish loading"));
    }, 5000);

    const handleLoad = () => {
      clearTimeout(timeoutId);
      resolve(frame.contentDocument);
    };

    frame.addEventListener("load", handleLoad, { once: true });
  });
}

const previewAnchorCache = new WeakMap();

export function applyPreviewDocument(frame, previewDocument) {
  const frameDocument = frame.contentDocument;
  const styleHost = frameDocument?.getElementById("preview-style-host");
  const root = frameDocument?.getElementById("preview-root");
  if (!styleHost || !root) {
    return false;
  }

  frameDocument.title = previewDocument.title ?? "AsciiDoc Preview";
  styleHost.textContent = previewDocument.styles ?? "";
  root.innerHTML = previewDocument.body ?? "";
  previewAnchorCache.delete(frame);
  return true;
}

function elementMatchesSyncPoint(element, syncPoint) {
  const tagName = element.tagName;

  switch (syncPoint.context) {
    case "document":
      return tagName === "H1";
    case "section":
      return /^H[1-6]$/.test(tagName);
    case "paragraph":
      return element.classList.contains("paragraph");
    case "listing":
      return element.classList.contains("listingblock");
    case "literal":
      return element.classList.contains("literalblock");
    case "ulist":
      return element.classList.contains("ulist");
    case "olist":
      return element.classList.contains("olist");
    case "dlist":
      return element.classList.contains("dlist");
    case "image":
      return element.classList.contains("imageblock");
    case "table":
      return element.classList.contains("tableblock");
    case "admonition":
      return element.classList.contains("admonitionblock");
    case "quote":
      return element.classList.contains("quoteblock");
    case "verse":
      return element.classList.contains("verseblock");
    case "sidebar":
      return element.classList.contains("sidebarblock");
    case "example":
      return element.classList.contains("exampleblock");
    case "open":
      return element.classList.contains("openblock");
    case "stem":
      return element.classList.contains("stemblock");
    default:
      return false;
  }
}

export function applyPreviewSyncPoints(frame, syncPoints = []) {
  const frameDocument = frame.contentDocument;
  if (!frameDocument) {
    return;
  }

  const candidates = Array.from(frameDocument.querySelectorAll(PREVIEW_SYNC_SELECTOR));
  let candidateIndex = 0;

  for (const syncPoint of syncPoints) {
    for (; candidateIndex < candidates.length; candidateIndex += 1) {
      const candidate = candidates[candidateIndex];
      if (!elementMatchesSyncPoint(candidate, syncPoint)) {
        continue;
      }

      candidate.dataset.sourceLine = String(syncPoint.lineNumber);
      candidateIndex += 1;
      break;
    }
  }
}

export function scrollPreviewToAnchor(anchorId, frame = elements.previewFrame, behavior = "smooth") {
  if (!anchorId) {
    return;
  }

  const previewDocument = frame.contentDocument;
  const target = previewDocument?.getElementById(anchorId);
  if (!target) {
    return;
  }

  target.scrollIntoView({
    behavior,
    block: "start"
  });
}

let sourceSectionsCache = { content: null, sections: [] };

export function getSourceSections() {
  if (sourceSectionsCache.content === appState.currentContent) {
    return sourceSectionsCache.sections;
  }

  const sections = appState.currentContent
    .split("\n")
    .map((line, index) => {
      const match = line.match(/^(={2,6})\s+(.+)$/);
      if (!match) {
        return null;
      }

      return {
        lineNumber: index + 1,
        level: match[1].length,
        title: match[2].trim()
      };
    })
    .filter(Boolean);

  sourceSectionsCache = { content: appState.currentContent, sections };
  return sections;
}

export function getPreviewSectionHeadings(frame = elements.previewFrame) {
  return Array.from(
    frame.contentDocument?.querySelectorAll("#content h2, #content h3, #content h4, #content h5, #content h6") ?? []
  );
}

export function getPreviewSyncAnchors(frame = elements.previewFrame) {
  const cachedAnchors = previewAnchorCache.get(frame);
  if (cachedAnchors) {
    return cachedAnchors;
  }

  const anchors = Array.from(frame.contentDocument?.querySelectorAll("[data-source-line]") ?? [])
    .map((element) => ({
      element,
      lineNumber: Number.parseInt(element.dataset.sourceLine ?? "", 10)
    }))
    .filter((anchor) => Number.isFinite(anchor.lineNumber))
    .sort((left, right) => left.lineNumber - right.lineNumber);
  previewAnchorCache.set(frame, anchors);
  return anchors;
}

export function findNearestSectionIndex(lineNumber) {
  const sections = getSourceSections();
  let sectionIndex = -1;

  for (let index = 0; index < sections.length; index += 1) {
    if (sections[index].lineNumber <= lineNumber) {
      sectionIndex = index;
    } else {
      break;
    }
  }

  return sectionIndex;
}

export function getLineRatio(lineNumber, startLine, endLine) {
  if (endLine <= startLine) {
    return 0;
  }

  return Math.max(0, Math.min(1, (lineNumber - startLine) / (endLine - startLine)));
}

export function getEditorSectionSyncPosition() {
  const lineNumber = getEditorSyncLineNumber();
  const sections = getSourceSections();
  const totalLines = editorRef.view.state.doc.lines;

  if (sections.length === 0) {
    return {
      sectionIndex: -1,
      ratio: getLineRatio(lineNumber, 1, totalLines)
    };
  }

  const sectionIndex = findNearestSectionIndex(lineNumber);
  if (sectionIndex < 0) {
    return {
      sectionIndex,
      ratio: getLineRatio(lineNumber, 1, Math.max(1, sections[0].lineNumber - 1))
    };
  }

  const startLine = sections[sectionIndex].lineNumber;
  const endLine = sectionIndex + 1 < sections.length
    ? Math.max(startLine, sections[sectionIndex + 1].lineNumber - 1)
    : totalLines;

  return {
    sectionIndex,
    ratio: getLineRatio(lineNumber, startLine, endLine)
  };
}

export function getEditorSyncLineNumber() {
  const selectionLine = editorRef.view.state.doc.lineAt(editorRef.view.state.selection.main.head).number;
  const viewportStartLine = editorRef.view.state.doc.lineAt(editorRef.view.state.viewport.from).number;
  const viewportEndLine = editorRef.view.state.doc.lineAt(editorRef.view.state.viewport.to).number;

  if (selectionLine >= viewportStartLine && selectionLine <= viewportEndLine) {
    return selectionLine;
  }

  return viewportStartLine;
}

function getPreviewViewportHeight(frame) {
  return frame.clientHeight
    || frame.getBoundingClientRect().height
    || frame.contentWindow?.innerHeight
    || 0;
}

function getPreviewScrollMetrics(frame, frameDocument) {
  const scrollingElement = frameDocument.scrollingElement
    || frameDocument.documentElement
    || frameDocument.body;
  const viewportHeight = getPreviewViewportHeight(frame)
    || scrollingElement?.clientHeight
    || 0;
  const documentHeight = Math.max(
    scrollingElement?.scrollHeight ?? 0,
    frameDocument.documentElement?.scrollHeight ?? 0,
    frameDocument.body?.scrollHeight ?? 0
  );

  return {
    scrollingElement,
    viewportHeight,
    maxScrollTop: Math.max(0, documentHeight - viewportHeight)
  };
}

function getElementDocumentTop(element, scrollingElement) {
  if (!element || !scrollingElement) {
    return 0;
  }

  const elementRect = element.getBoundingClientRect();
  return elementRect.top + scrollingElement.scrollTop;
}

export function scrollPreviewToSyncPosition(syncPosition, frame = elements.previewFrame, behavior = "auto") {
  const frameWindow = frame.contentWindow;
  const frameDocument = frame.contentDocument;
  if (!frameWindow || !frameDocument) {
    return;
  }

  const headings = getPreviewSectionHeadings(frame);
  const { scrollingElement, viewportHeight, maxScrollTop } = getPreviewScrollMetrics(frame, frameDocument);
  let startTop = 0;
  let endTop = maxScrollTop;

  if (headings.length > 0) {
    if (syncPosition.sectionIndex < 0) {
      endTop = getElementDocumentTop(headings[0], scrollingElement);
    } else {
      const currentHeading = headings[syncPosition.sectionIndex];
      if (!currentHeading) {
        return;
      }

      startTop = getElementDocumentTop(currentHeading, scrollingElement);
      endTop = headings[syncPosition.sectionIndex + 1]
        ? getElementDocumentTop(headings[syncPosition.sectionIndex + 1], scrollingElement)
        : maxScrollTop;
    }
  }

  const targetOffset = startTop + ((endTop - startTop) * syncPosition.ratio);
  const centeredTargetTop = targetOffset - (viewportHeight * 0.5);
  const targetTop = Math.max(0, Math.min(maxScrollTop, centeredTargetTop));

  frameWindow.scrollTo({
    top: targetTop,
    behavior
  });
}

export function scrollPreviewToLineNumber(lineNumber, frame = elements.previewFrame, behavior = "auto") {
  const frameWindow = frame.contentWindow;
  const frameDocument = frame.contentDocument;
  if (!frameWindow || !frameDocument) {
    return;
  }

  const anchors = getPreviewSyncAnchors(frame);
  if (anchors.length === 0) {
    const fallbackSyncPosition = getEditorSectionSyncPosition();
    scrollPreviewToSyncPosition(fallbackSyncPosition, frame, behavior);
    return;
  }

  const { scrollingElement, viewportHeight, maxScrollTop } = getPreviewScrollMetrics(frame, frameDocument);
  const totalLines = editorRef.view.state.doc.lines;
  let previousAnchor = null;
  let nextAnchor = null;

  for (const anchor of anchors) {
    if (anchor.lineNumber <= lineNumber) {
      previousAnchor = anchor;
      continue;
    }

    nextAnchor = anchor;
    break;
  }

  const startLine = previousAnchor?.lineNumber ?? 1;
  const endLine = nextAnchor?.lineNumber ?? totalLines;
  const startTop = previousAnchor?.element
    ? getElementDocumentTop(previousAnchor.element, scrollingElement)
    : 0;
  const endTop = nextAnchor?.element
    ? getElementDocumentTop(nextAnchor.element, scrollingElement)
    : maxScrollTop;
  const ratio = getLineRatio(lineNumber, startLine, endLine);
  const targetOffset = startTop + ((endTop - startTop) * ratio);
  const centeredTargetTop = targetOffset - (viewportHeight * 0.5);
  const targetTop = Math.max(0, Math.min(maxScrollTop, centeredTargetTop));

  frameWindow.scrollTo({
    top: targetTop,
    behavior
  });
}
