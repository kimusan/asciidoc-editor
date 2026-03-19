# The AsciiDoc Editor

The AsciiDoc Editor is a stand-alone desktop editor for AsciiDoc with live preview, file browsing, export support, editor and preview theming, and a distraction-free writing mode.

This implementation uses Electron for the desktop shell and `asciidoctor.js` for document rendering. That choice keeps the app portable, gives a modern UI surface for Windows and Linux, and avoids reimplementing the AsciiDoc language.

## Features

- Full document rendering through `asciidoctor.js`
- Live preview while editing
- Support for AsciiDoc includes, conditionals, passthrough blocks, and substitutions
- Built-in file browser for navigating document folders
- Syntax-highlighted editor
- Light and dark editor themes
- Built-in preview themes plus custom preview CSS support
- Distraction-free writing mode
- Export to HTML, PDF, and DocBook 5
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

## Validation Status

- `npm test` passes
- `npm run build` passes
- `npm run package:linux` passes and produces `release/AsciiDoc Editor-0.1.0.AppImage`
- `npm run package:win` reaches the Windows packaging step but cannot complete from this Linux environment without `wine`

## Important Limitations

- Full AsciiDoc language coverage is delegated to `asciidoctor.js`. That is the correct path for standards coverage, but support is limited to what that engine and its bundled converters provide.
- PDF export is implemented by rendering the HTML preview and printing it through Chromium. This gives portable PDF export, but it is not the same feature set as `asciidoctor-pdf`.
- Additional export targets beyond HTML, PDF, and DocBook 5 are not bundled yet. They would require extra converters or extra runtime dependencies.
- Windows packaging from Linux needs `wine`, or the build should run on a Windows CI/runner. The codebase is prepared for Windows, but that package was not fully produced in this environment.

## Credits

The AsciiDoc Editor is developed and maintained by Kim Schulz and is open source software licensed under the MIT License. Contributions are welcome. Please see the [GitHub repo](https://github.com/kimusan/asciidoc-editor) for more information.
