import { escapeHtml } from "./utils.js";

export const MARKUP_REFERENCE = [
  { title: "Document Title", syntax: "= Project Notes", detail: "Top-level document title. Use this once at the top of the file.", tags: ["header", "title", "document"], docsUrl: "https://docs.asciidoctor.org/asciidoc/latest/document/title/" },
  { title: "Section Heading", syntax: "== Implementation Notes", detail: "Create sections with repeated equals signs. More equals means deeper nesting.", tags: ["heading", "sections", "outline"], docsUrl: "https://docs.asciidoctor.org/asciidoc/latest/sections/titles-and-levels/" },
  { title: "Attribute", syntax: ":toc: left", detail: "Define document attributes for features such as tables of contents, icons, or custom values.", tags: ["attributes", "toc", "settings"], docsUrl: "https://docs.asciidoctor.org/asciidoc/latest/toc/" },
  { title: "Bold and Italic", syntax: "*bold* and _italic_", detail: "Inline emphasis for strong or subtle emphasis.", tags: ["inline", "formatting", "emphasis"], docsUrl: "https://docs.asciidoctor.org/asciidoc/latest/text/" },
  { title: "Code Block", syntax: "[source,js]\n----\nconsole.log('hello')\n----", detail: "Add fenced source blocks with an optional language for syntax highlighting.", tags: ["code", "listing", "source"], docsUrl: "https://docs.asciidoctor.org/asciidoc/latest/verbatim/source-blocks/" },
  { title: "Admonition", syntax: "NOTE: Remember to save before export.", detail: "Create note, tip, warning, caution, and important callouts.", tags: ["note", "warning", "admonition"], docsUrl: "https://docs.asciidoctor.org/asciidoc/latest/blocks/admonitions/" },
  { title: "Link", syntax: "https://docs.asciidoctor.org[Docs]", detail: "External links open in the default browser from preview.", tags: ["link", "url", "external"], docsUrl: "https://docs.asciidoctor.org/asciidoc/latest/macros/links/" },
  { title: "Cross Reference", syntax: "xref:chapter-two.adoc#tables[Tables chapter]", detail: "Link to sections in the same document or another AsciiDoc file.", tags: ["xref", "reference", "anchors"], docsUrl: "https://docs.asciidoctor.org/asciidoc/latest/macros/xref/" },
  { title: "Image", syntax: "image::diagrams/flow.png[Flow, width=640]", detail: "Embed local or remote images with alt text and attributes.", tags: ["image", "media", "figures"], docsUrl: "https://docs.asciidoctor.org/asciidoc/latest/macros/images/" },
  { title: "MSC Diagram", syntax: "[msc]\n----\nmsc {\n  a,b;\n  a=>b[label=\"hello\"];\n}\n----", detail: "Render message sequence charts inline from MscGen syntax using the built-in MSC renderer.", tags: ["msc", "mscgen", "diagram", "sequence"], docsUrl: "https://docs.asciidoctor.org/diagram-extension/latest/diagram_types/msc/" },
  { title: "Table", syntax: "|===\n|Name |Role\n|Kim |Editor\n|===", detail: "Pipe-delimited tables support formatting, widths, and nested content.", tags: ["table", "grid", "columns"], docsUrl: "https://docs.asciidoctor.org/asciidoc/latest/tables/build-a-basic-table/" },
  { title: "Include", syntax: "include::partials/header.adoc[]", detail: "Reuse content from other files. The editor preview resolves includes relative to the current document.", tags: ["include", "imports", "reuse"], docsUrl: "https://docs.asciidoctor.org/asciidoc/latest/directives/include/" },
  { title: "Conditional", syntax: "ifdef::backend-html5[]\nOnly for HTML\nendif::[]", detail: "Conditionally render blocks based on attributes or backend.", tags: ["ifdef", "ifndef", "conditions"], docsUrl: "https://docs.asciidoctor.org/asciidoc/latest/directives/ifdef-ifndef/" },
  { title: "Passthrough", syntax: "++++\n<div class=\"custom\">HTML</div>\n++++", detail: "Pass raw HTML or other markup through unchanged.", tags: ["passthrough", "raw", "html"], docsUrl: "https://docs.asciidoctor.org/asciidoc/latest/pass/pass-block/" },
  { title: "Footnote", syntax: "Footnote examplefootnote:[This note appears at the bottom.]", detail: "Add inline footnotes that render automatically in preview and export.", tags: ["footnote", "notes", "references"], docsUrl: "https://docs.asciidoctor.org/asciidoc/latest/macros/footnote/" }
];

export const SHORTCUT_SECTIONS = [
  {
    title: "Document",
    items: [
      {
        title: "New document",
        detail: "Open a fresh unsaved draft in a new tab.",
        shortcuts: [["Ctrl", "N"], ["Cmd", "N"]]
      },
      {
        title: "Save current document",
        detail: "Write changes to the open file or prompt for a destination when needed.",
        shortcuts: [["Ctrl", "S"], ["Cmd", "S"]]
      },
      {
        title: "Open keyboard help",
        detail: "Show this shortcuts guide from anywhere in the app.",
        shortcuts: [["F1"], ["Ctrl", "/"], ["Cmd", "/"]]
      },
      {
        title: "Close active panel",
        detail: "Dismiss the current overlay or the in-editor search bar.",
        shortcuts: [["Esc"]]
      }
    ]
  },
  {
    title: "Search and Replace",
    items: [
      {
        title: "Find in document",
        detail: "Open the editor search bar and prefill from the current selection when possible.",
        shortcuts: [["Ctrl", "F"], ["Cmd", "F"]]
      },
      {
        title: "Replace in document",
        detail: "Open the search bar with replace controls visible.",
        shortcuts: [["Ctrl", "H"], ["Cmd", "H"]]
      },
      {
        title: "Next match",
        detail: "Jump to the next search hit in the current document.",
        shortcuts: [["F3"], ["Enter"]]
      },
      {
        title: "Previous match",
        detail: "Jump to the previous search hit.",
        shortcuts: [["Shift", "F3"], ["Shift", "Enter"]]
      },
      {
        title: "Replace current match",
        detail: "When the replace field is focused, replace the current match and move on.",
        shortcuts: [["Enter"]]
      },
      {
        title: "Find in workspace",
        detail: "Search recursively across files in the current workspace.",
        shortcuts: [["Ctrl", "Shift", "F"], ["Cmd", "Shift", "F"]]
      },
      {
        title: "Replace in all open files",
        detail: "Open replace and target every open tab instead of the current file only.",
        shortcuts: [["Ctrl", "Shift", "H"], ["Cmd", "Shift", "H"]]
      }
    ]
  },
  {
    title: "Panels",
    items: [
      {
        title: "Open settings",
        detail: "Adjust theme, preview typography, PDF settings, and custom stylesheets.",
        shortcuts: [["Ctrl", ","], ["Cmd", ","]]
      },
      {
        title: "Open markup reference",
        detail: "Browse searchable AsciiDoc examples and snippets.",
        shortcuts: [["Ctrl", "Shift", "K"], ["Cmd", "Shift", "K"]]
      }
    ]
  }
];

export function renderOptionMarkup(options) {
  return options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("");
}

export function renderShortcutSequence(sequence) {
  return `
    <span class="shortcut-sequence">
      ${sequence.map((part) => `<kbd class="shortcut-key">${escapeHtml(part)}</kbd>`).join('<span class="shortcut-plus">+</span>')}
    </span>
  `;
}

export function renderShortcutSections() {
  return SHORTCUT_SECTIONS.map((section) => `
    <article class="shortcut-card">
      <div class="shortcut-card-header">
        <h3>${escapeHtml(section.title)}</h3>
      </div>
      <div class="shortcut-list">
        ${section.items.map((item) => `
          <div class="shortcut-row">
            <div class="shortcut-copy">
              <strong>${escapeHtml(item.title)}</strong>
              <p>${escapeHtml(item.detail)}</p>
            </div>
            <div class="shortcut-keyset">
              ${item.shortcuts.map((sequence) => renderShortcutSequence(sequence)).join('<span class="shortcut-or">or</span>')}
            </div>
          </div>
        `).join("")}
      </div>
    </article>
  `).join("");
}
