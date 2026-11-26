// Vendors the Paged.js polyfill for offline use inside the app.
//
// Paged.js stays a devDependency; the build copies the single minified
// polyfill bundle (~490KB, MIT) into electron/vendor/ (covered by the
// asar "files" list). The paginated PDF export path loads it in a hidden
// offscreen BrowserWindow to chunk the print HTML into real pages with
// page numbers and running headers before printToPDF.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const sourcePath = path.join(root, "node_modules", "pagedjs", "dist", "paged.polyfill.min.js");
const vendorDir = path.join(root, "electron", "vendor");

await fs.mkdir(vendorDir, { recursive: true });
await fs.copyFile(sourcePath, path.join(vendorDir, "paged.polyfill.min.js"));
console.log("vendored paged.js polyfill into electron/vendor/");
