# The AsciiDoc Editor

<p align="center">
  <img src="https://raw.githubusercontent.com/kimusan/asciidoc-editor/main/build/icon.svg" alt="AsciiDoc Editor logo" width="156" />
</p>

The AsciiDoc Editor is a stand-alone desktop writing and editing environment for the AsciiDoc markup language. It combines a code-oriented editor, a live formatted preview, workspace browsing, export tools, and built-in reference material in a single desktop app.

It is designed for people who want to write real AsciiDoc documents without juggling multiple tools or browser tabs. The app lets you edit source text, follow structure and references, preview the rendered result, search your workspace, inspect markup examples, and export deliverables from the same interface.

This implementation uses Electron for the desktop shell and `asciidoctor.js` for document rendering. That choice keeps the app portable, gives a modern UI surface for Windows and Linux, and avoids reimplementing the AsciiDoc language.

## Overview

The app is intended as a general-purpose AsciiDoc desktop editor for notes, technical documentation, books, articles, and structured publishing workflows. It focuses on three things:

- Writing comfortably in raw AsciiDoc source
- Seeing a close live rendering of the formatted document while you work
- Keeping common authoring tools like search, export, reference material, and workspace navigation close at hand

## Features

- Full document rendering through `asciidoctor.js`
- Live preview with editor-to-preview scroll synchronization
- Support for AsciiDoc includes, conditionals, passthrough blocks, substitutions, tables, attributes, cross references, footnotes, and document structure
- Message sequence chart rendering for inline `[msc]` / `[mscgen]` blocks
- Syntax-highlighted editor with AsciiDoc-aware coloring
- In-document find and replace with match highlighting and navigation
- Workspace-wide search and replace across saved project files
- Built-in searchable markup reference guide with snippet insertion and links to the official Asciidoctor documentation
- Drag-and-drop image and asset insertion with automatic `image::` / `link:` markup generation
- Keyboard shortcuts help overlay
- Built-in file browser with file-type icons, image assets, and drag-to-insert references
- Recursive workspace file search/filtering
- Collapsible workspace sidebar to reclaim editor space
- Resizable split view between the source editor and preview
- Expanded preview overlay for reading larger documents
- Dedicated export overlay for HTML, PDF, and DocBook 5
- Dedicated settings overlay for app theme, preview font, preview CSS, PDF paper size, and PDF CSS
- Multiple app and editor themes, including Nocturne, Porcelain, Nord, Darcula, Solarized, and Material Design
- Custom preview CSS support
- Portable `.adp` project files for restoring project-level workspace and stylesheet configuration
- Local per-project session recovery for open tabs and draft state
- Distraction-free writing mode
- About dialog and application metadata
- Packaged Linux AppImage output
- Windows portable packaging configuration

## Project Structure

- `electron/`: Electron main process, preload bridge, AsciiDoc rendering/export helpers, persisted app state
- `src/`: Vite-powered renderer UI, CodeMirror editor integration, AsciiDoc syntax highlighter, application styles
- `tests/`: Node test coverage for the AsciiDoc rendering pipeline

## Development

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Build the renderer bundle:

```bash
npm run build
```

Package a Linux AppImage:

```bash
npm run package:linux
```

Package a Windows portable build:

```bash
npm run package:win
```

## GitHub Releases

The repository includes a GitHub Actions workflow at `.github/workflows/release.yml` that builds release packages for:

- Linux AppImage on `ubuntu-latest`
- Windows portable `.exe` on `windows-latest`

To publish release assets automatically:

1. Create and push a version tag such as `v0.4.0`
2. Let GitHub Actions build both packages
3. The workflow attaches the generated files to the GitHub release for that tag

The same workflow can also be started manually with `workflow_dispatch`, which is useful for validating the packaging jobs without publishing a tagged release.

Tagged releases also include simple `.adp` file-association helpers:

- `tools/windows/register-adp-file-association.reg`: user-level Windows registry template for associating `.adp` with the portable `.exe`
- `tools/linux/register-adp-file-association.sh`: user-local MIME and desktop registration helper for associating `.adp` with an AppImage path

## Validation Status

- `npm test` passes
- `npm run build` passes
- `npm run package:linux` passes and produces `release/AsciiDoc Editor-0.4.0.AppImage`
- `npm run package:win` reaches the Windows packaging step but cannot complete from this Linux environment without `wine`

## Important Limitations

- Full AsciiDoc language coverage is delegated to `asciidoctor.js`. That is the correct path for standards coverage, but support is limited to what that engine and its bundled converters provide.
- PDF export is implemented by rendering the HTML preview and printing it through Chromium. This gives portable PDF export, but it is not the same feature set as `asciidoctor-pdf`.
- Additional export targets beyond HTML, PDF, and DocBook 5 are not bundled yet. They would require extra converters or extra runtime dependencies.
- The current outline panel is built from the open editor buffer only. It does not yet expand headings that come from resolved `include::` content in the rendered document.
- Message sequence chart support is implemented using `mscgen.js`. The current project license remains MIT for now, but this dependency may require a future licensing review for the distributed app.
- `.adp` project files can be opened directly by the app, but automatic OS-level file association depends on the packaging target. The current Windows portable build and Linux AppImage do not provide installer-based file association registration.
- Release assets include helper scripts for `.adp` association on Windows and Linux, but those registrations are path-based. If the portable `.exe` or AppImage is moved later, the association helper needs to be run again with the new path.
- Windows packaging from Linux needs `wine`, or the build should run on a Windows CI/runner. The codebase is prepared for Windows, but that package was not fully produced in this environment.
- The Linux AppImage can require FUSE 2 at runtime on some distributions. On Ubuntu 24.04, that typically means installing `libfuse2t64`; `libfuse3` alone is not sufficient for older AppImage runtimes.

## Backlog

- Add an optional include-aware outline mode that can show headings coming from resolved `include::` files, while still keeping the current open-file-only outline available for simple editing workflows.

## Credits

The AsciiDoc Editor is developed and maintained by Kim Schulz and is open source software licensed under the MIT License. Contributions are welcome. Please see the [GitHub repo](https://github.com/kimusan/asciidoc-editor) for more information.
