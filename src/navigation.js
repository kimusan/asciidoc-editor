// Editor-side navigation for AsciiDoc references: Ctrl+click a macro
// (include::, xref:, link:, <<target>>) to open its target, the same way
// preview links resolve. The actual path resolution runs in the main
// process (preview-links.js) so the editor and the preview can never
// disagree; this module only extracts the reference under the cursor and
// locates anchors inside the target document.

// All reference forms that can point at another document (or a place in
// it). Each pattern yields { href } for the shared resolver; the click
// must land inside the match.
const REFERENCE_PATTERNS = [
  // include::path[leveloffset=...]
  {
    regex: /include::([^\s\[]+)\[[^\]]*\]/g,
    build: (match) => match[1]
  },
  // xref:path#anchor[text] — also bare xref:path[]
  {
    regex: /xref:([^\s\[]+)(?:\[[^\]]*\])?/g,
    build: (match) => match[1]
  },
  // <<anchor>> and <<anchor,text>> — an inter-document target reference
  // is written <<target.adoc#anchor,text>>; plain <<anchor>> means the
  // current document.
  {
    regex: /<<([^,>]+?)(?:,([^>]*))?>>/g,
    build: (match) => match[1].includes("#") || /\.(adoc|asciidoc|asc|html?)$/i.test(match[1])
      ? match[1]
      : `#${match[1]}`
  },
  // link:path[text] — only document-ish paths, not web URLs
  {
    regex: /link:([^\s\[]+)\[[^\]]*\]/g,
    build: (match) => /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(match[1]) ? null : match[1]
  }
];

// Returns the reference { href } under `offset` (0-based character index
// within `line`), or null when the click is not on a reference.
export function findNavigationTarget(line, offset) {
  if (typeof line !== "string" || !Number.isInteger(offset) || offset < 0 || offset > line.length) {
    return null;
  }

  let best = null;
  for (const { regex, build } of REFERENCE_PATTERNS) {
    regex.lastIndex = 0;
    let match = regex.exec(line);
    while (match) {
      const href = build(match);
      const start = match.index;
      const end = start + match[0].length;
      // Inside the macro text, but never on the trailing bracket (clicks
      // there are usually just placement clicks, not navigation intent).
      if (href && offset >= start && offset < end - 1) {
        best = { href, start, end };
      }
      match = regex.exec(line);
    }
  }

  return best;
}

// Normalizes an AsciiDoc title the way the converter generates implicit
// ids: lowercase, non-alphanumerics collapsed to single dashes.
function titleToAnchorId(title) {
  return `_${String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

// Locates `anchorId` inside document `content`: explicit anchors first
// ([[id]] / [[id,text]] / [#id]), then section titles whose generated id
// matches. Returns a 1-based line number, or null.
export function findAnchorLine(content, anchorId) {
  if (typeof anchorId !== "string" || anchorId === "" || typeof content !== "string") {
    return null;
  }

  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const explicit = line.match(/^\s*\[\[\s*([^\],]+)/) ?? line.match(/^\s*\[\s*#\s*([^\]\s]+)/);
    if (explicit && explicit[1] === anchorId) {
      return index + 1;
    }
  }

  for (let index = 0; index < lines.length; index++) {
    const heading = lines[index].match(/^(={1,6})\s+(.+?)\s*$/);
    if (heading && titleToAnchorId(heading[2]) === anchorId) {
      return index + 1;
    }
  }

  return null;
}
