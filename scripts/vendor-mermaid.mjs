// Vendors the Mermaid renderer for offline use inside the app.
//
// Mermaid stays a devDependency: shipping its whole node_modules tree in
// the asar would undo the 38->17MB slimming. Instead the build copies the
// single IIFE bundle plus a small shim page into electron/vendor/ (the
// asar "files" list already includes electron/**), and the main process
// loads that page in a hidden sandboxed BrowserWindow to render diagrams.
//
// The shim page references mermaid.min.js via a relative src (never
// inlined) so "</script>" sequences inside the minified bundle cannot
// break the page.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const sourcePath = path.join(root, "node_modules", "mermaid", "dist", "mermaid.min.js");
const vendorDir = path.join(root, "electron", "vendor");

const shimPage = `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body>
<script src="./mermaid.min.js"><\/script>
<script>
window.__mermaidRenderCounter = 0;
// Renders one diagram. Runs in a sandboxed hidden window with no node
// access; securityLevel "strict" keeps the SVG free of scripts and
// foreign-object escapes. Errors come back as data instead of rejections
// so executeJavaScript never surfaces as an unhandled promise.
window.__renderMermaid = function (source, theme) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: theme,
    suppressErrorRendering: true
  });
  window.__mermaidRenderCounter += 1;
  var id = "mermaid-render-" + window.__mermaidRenderCounter;
  return mermaid.render(id, source).then(
    function (result) { return { svg: result.svg }; },
    function (error) {
      return { error: (error && error.message) ? String(error.message) : String(error) };
    }
  );
};
<\/script>
</body>
</html>
`;

await fs.mkdir(vendorDir, { recursive: true });
await fs.copyFile(sourcePath, path.join(vendorDir, "mermaid.min.js"));
await fs.writeFile(path.join(vendorDir, "mermaid-render.html"), shimPage, "utf8");
console.log("vendored mermaid renderer into electron/vendor/");
