// AsciiDoc autocompletion for the CodeMirror editor.
//
// The source is deliberately syntactic and prose-safe: it only offers
// options in positions where AsciiDoc structure is being written (a
// block attribute list, a document attribute entry, a section marker,
// an attribute reference, or a known macro after its colon). Normal
// prose typing never produces a popup.

import { autocompletion, startCompletion } from "@codemirror/autocomplete";

// Fenced block templates. insert replaces the typed prefix; cursorOffset
// (relative to the inserted text) places the caret inside the block body.
function fencedBlock(label, detail, fence) {
  const insert = `${label}\n${fence}\n\n${fence}`;
  return {
    label,
    detail,
    insert,
    cursorOffset: label.length + fence.length + 2
  };
}

function lineBlock(label, detail) {
  return { label, detail, insert: `${label}\n`, cursorOffset: label.length + 1 };
}

export function buildBlockAttributeOptions() {
  return [
    fencedBlock("[source]", "fenced source code block", "----"),
    fencedBlock("[listing]", "fenced listing block", "----"),
    fencedBlock("[quote]", "quoted passage", "____"),
    lineBlock("[quote, Author, Source]", "quoted passage with attribution"),
    fencedBlock("[verse]", "poetry or verse", "____"),
    lineBlock("[verse, Author, Title]", "verse with attribution"),
    fencedBlock("[sidebar]", "aside commentary", "____"),
    fencedBlock("[example]", "captionable example block", "===="),
    fencedBlock("[literal]", "preformatted literal block", "...."),
    fencedBlock("[pass]", "raw passthrough block", "++++"),
    fencedBlock("[msc]", "mscgen sequence diagram", "----"),
    fencedBlock("[mscgen]", "mscgen sequence diagram (mscgen syntax)", "----"),
    lineBlock("[abstract]", "abstract (book and paper doctypes)"),
    lineBlock("[discrete]", "heading outside the section hierarchy"),
    lineBlock("[NOTE]", "note admonition paragraph"),
    lineBlock("[TIP]", "tip admonition paragraph"),
    lineBlock("[WARNING]", "warning admonition paragraph"),
    lineBlock("[CAUTION]", "caution admonition paragraph"),
    lineBlock("[IMPORTANT]", "important admonition paragraph"),
    lineBlock("[collapsible]", "collapsible (details) block")
  ];
}

// Languages registered by highlight.js/lib/common, which is exactly what
// the render worker loads; aliases shown where hljs accepts them.
export function buildSourceLanguageOptions() {
  const languages = [
    ["bash", "Bash (shell, sh)"],
    ["c", "C"],
    ["cpp", "C++"],
    ["csharp", "C#"],
    ["css", "CSS"],
    ["diff", "Diff / patch"],
    ["go", "Go"],
    ["graphql", "GraphQL"],
    ["ini", "INI / TOML"],
    ["java", "Java"],
    ["javascript", "JavaScript (js)"],
    ["json", "JSON"],
    ["kotlin", "Kotlin"],
    ["less", "Less"],
    ["lua", "Lua"],
    ["makefile", "Makefile"],
    ["markdown", "Markdown"],
    ["objectivec", "Objective-C"],
    ["perl", "Perl"],
    ["php", "PHP"],
    ["plaintext", "Plain text"],
    ["python", "Python (py)"],
    ["r", "R"],
    ["ruby", "Ruby"],
    ["rust", "Rust"],
    ["scss", "SCSS"],
    ["shell", "Shell session"],
    ["sql", "SQL"],
    ["swift", "Swift"],
    ["typescript", "TypeScript (ts)"],
    ["vbnet", "Visual Basic .NET"],
    ["wasm", "WebAssembly"],
    ["xml", "XML / HTML"],
    ["yaml", "YAML"]
  ];

  // The closing bracket is part of the applied text so accepting a
  // language finishes the whole attribute list, e.g. [source,js].
  return languages.map(([name, detail]) => ({
    label: name,
    detail,
    insert: `${name}]`,
    cursorOffset: name.length + 1
  }));
}

export function buildDocumentAttributeOptions() {
  return [
    { label: ":toc:", detail: "table of contents (auto, left, right, preamble)" },
    { label: ":toclevels:", detail: "levels shown in the table of contents" },
    { label: ":doctype:", detail: "article (default), book, manpage, inline" },
    { label: ":icons:", detail: "admonition icons: font or image" },
    { label: ":sectnums:", detail: "number sections" },
    { label: ":sectnumlevels:", detail: "depth of section numbering" },
    { label: ":sectids:", detail: "generate custom section ids" },
    { label: ":source-highlighter:", detail: "syntax highlighting backend" },
    { label: ":experimental:", detail: "enable kbd, menu and btn macros" },
    { label: ":reproducible:", detail: "omit timestamps from output" },
    { label: ":lang:", detail: "document language, e.g. en, da, de" },
    { label: ":imagesdir:", detail: "base folder for image targets" },
    { label: ":author:", detail: "document author" },
    { label: ":email:", detail: "author email address" },
    { label: ":description:", detail: "document summary" },
    { label: ":keywords:", detail: "comma-separated keywords" },
    { label: ":revnumber:", detail: "document revision number" },
    { label: ":revdate:", detail: "document revision date" }
  ].map((option) => ({ ...option, insert: option.label, cursorOffset: option.label.length }));
}

export function buildSectionLevelOptions() {
  const levels = [
    ["= ", "document title (level 0)"],
    ["== ", "level 1 section"],
    ["=== ", "level 2 section"],
    ["==== ", "level 3 section"],
    ["===== ", "level 4 section"],
    ["====== ", "level 5 section"]
  ];

  return levels.map(([label, detail]) => ({
    label,
    detail,
    insert: label,
    cursorOffset: label.length
  }));
}

// Single-colon macros are inline; double-colon macros are block-level and
// must start the line. Both complete the full form with the cursor before
// the closing bracket so the target is typed in place.
const MACRO_DESCRIPTIONS = {
  xref: { detail: "cross reference, e.g. xref:#anchor[Label]", colons: ":", inline: true },
  link: { detail: "inline link", colons: ":", inline: true },
  footnote: { detail: "inline footnote", colons: ":", inline: true },
  include: { detail: "include another document", colons: "::", inline: false },
  image: { detail: "block image", colons: "::", inline: false },
  ifdef: { detail: "conditional content when attribute is set", colons: "::", inline: false },
  ifndef: { detail: "conditional content when attribute is unset", colons: "::", inline: false },
  endif: { detail: "end of a conditional block", colons: "::", inline: false },
  ifeval: { detail: "conditional content on an expression", colons: "::", inline: false }
};

export function buildMacroOptions() {
  return Object.entries(MACRO_DESCRIPTIONS).map(([name, { detail, colons }]) => {
    const insert = `${name}${colons}[]`;
    return {
      label: insert,
      detail,
      insert,
      cursorOffset: insert.length - 1
    };
  });
}

// Attribute references: builtins plus every :name: entry defined in the
// current document, so {url-...} style variables complete themselves.
const BUILTIN_ATTRIBUTE_NAMES = [
  "docname",
  "doctitle",
  "docdir",
  "docfile",
  "docdate",
  "docyear",
  "today",
  "localdate",
  "localyear"
];

export function collectDocumentAttributeNames(lines) {
  const names = new Set(BUILTIN_ATTRIBUTE_NAMES);
  for (const line of lines) {
    const match = line.match(/^:([\w-]+):/);
    if (match) {
      names.add(match[1]);
    }
  }
  return [...names];
}

export function buildAttributeReferenceOptions(names) {
  return names
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const insert = `{${name}}`;
      return {
        label: insert,
        detail: "attribute reference",
        insert,
        cursorOffset: insert.length
      };
    });
}

// Classifies what the caret is inside, based on the line prefix. Returns
// null for prose; a context descriptor otherwise. from is the offset
// within the line where the completion should replace from.
export function findCompletionContext(lineText) {
  let match = lineText.match(/^\[(source|listing),([\w+#-]*)$/);
  if (match) {
    return {
      type: "sourceLanguage",
      from: lineText.length - match[2].length,
      options: buildSourceLanguageOptions()
    };
  }

  // Block attribute list at the line start, still unclosed.
  match = lineText.match(/^(\[[^\][\s]*)$/);
  if (match) {
    return {
      type: "blockAttribute",
      from: 0,
      options: buildBlockAttributeOptions()
    };
  }

  // Document attribute entry at the line start.
  match = lineText.match(/^(:[\w-]*)$/);
  if (match) {
    return {
      type: "documentAttribute",
      from: 0,
      options: buildDocumentAttributeOptions()
    };
  }

  // A run of = characters alone means a heading level is being typed.
  if (/^={1,6}$/.test(lineText)) {
    return {
      type: "sectionLevel",
      from: 0,
      options: buildSectionLevelOptions()
    };
  }

  // Attribute reference {name anywhere in the line.
  match = lineText.match(/\{([\w-]*)$/);
  if (match) {
    return {
      type: "attributeReference",
      from: lineText.length - match[1].length - 1
    };
  }

  // A known macro keyword immediately followed by a colon.
  match = lineText.match(/([A-Za-z]+):$/);
  if (match) {
    const name = match[1];
    const description = MACRO_DESCRIPTIONS[name];
    if (description && (description.inline || lineText === `${name}:`)) {
      return {
        type: "macro",
        from: lineText.length - name.length - 1,
        options: buildMacroOptions()
      };
    }
  }

  return null;
}

function toCompletion(option) {
  const { insert, cursorOffset, ...completion } = option;
  if (cursorOffset === undefined || cursorOffset === insert.length) {
    return { ...completion, apply: insert };
  }

  return {
    ...completion,
    apply: (view, _completion, from, to) => {
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + cursorOffset }
      });
    }
  };
}

function asciidocCompletionSource(context) {
  const line = context.state.doc.lineAt(context.pos);
  const linePrefix = line.text.slice(0, context.pos - line.from);
  const match = findCompletionContext(linePrefix);
  if (!match) {
    return null;
  }

  let options = match.options;
  if (match.type === "attributeReference") {
    const lines = [];
    for (let number = 1; number <= context.state.doc.lines; number += 1) {
      lines.push(context.state.doc.line(number).text);
    }
    options = buildAttributeReferenceOptions(collectDocumentAttributeNames(lines));
  }

  if (!options?.length) {
    return null;
  }

  return {
    from: line.from + match.from,
    options: options.map(toCompletion),
    validFor: /^\S*$/
  };
}

export function asciidocCompletion() {
  return autocompletion({
    override: [asciidocCompletionSource],
    activateOnTyping: true,
    icons: false
  });
}

export { startCompletion };
