import test from "node:test";
import assert from "node:assert/strict";
import { injectPagedPrintRuntime } from "../electron/pagedjs-print.js";

test("injectPagedPrintRuntime inserts the polyfill bootstrap before </head>", () => {
  const html = "<!doctype html><html><head><title>D</title><style>x{}</style></head><body><main>hi</main></body></html>";
  const result = injectPagedPrintRuntime(html, "file:///vendor/paged.polyfill.min.js");

  // Bootstrap goes into the head, before any body content.
  const headEnd = result.indexOf("</head>");
  const bodyStart = result.indexOf("<body>");
  assert.ok(headEnd > -1 && bodyStart > headEnd);

  const bootstrap = result.slice(0, headEnd);
  assert.ok(bootstrap.includes("window.PagedConfig"), "PagedConfig missing");
  assert.ok(bootstrap.includes("__pagedDone"), "completion signal missing");
  assert.ok(bootstrap.includes('<script src="file:///vendor/paged.polyfill.min.js">'), "script tag missing");
  // PagedConfig must be defined before the polyfill loads.
  assert.ok(bootstrap.indexOf("window.PagedConfig") < bootstrap.indexOf("paged.polyfill.min.js"));

  // The document itself is untouched.
  assert.ok(result.includes("<main>hi</main>"));
  assert.ok(result.endsWith("</html>"));
});

test("injectPagedPrintRuntime unwraps code inside pre (Paged.js break-token bug)", () => {
  const html = "<!doctype html><html><head></head><body><pre class=\"highlightjs highlight\"><code class=\"language-java hljs\" data-lang=\"java\"><span class=\"hljs-keyword\">public</span> class A {\n}</code></pre></body></html>";
  const result = injectPagedPrintRuntime(html, "file:///v.js");

  assert.ok(!result.includes("<code"), "code element must be gone");
  assert.ok(result.includes('<pre class="highlightjs highlight"><span class="hljs-keyword">public</span> class A {\n}</pre>'), "spans and text must survive directly in the pre");
});

test("injectPagedPrintRuntime leaves pres without code untouched", () => {
  const html = "<html><head></head><body><pre>plain text\nlines</pre><code>inline code in prose</code></body></html>";
  const result = injectPagedPrintRuntime(html, "file:///v.js");

  assert.ok(result.includes("<pre>plain text\nlines</pre>"));
  assert.ok(result.includes("<code>inline code in prose</code>"), "inline code outside pre must stay");
});

test("injectPagedPrintRuntime handles documents without </head>", () => {
  const result = injectPagedPrintRuntime("<html><body>hi</body></html>", "file:///v.js");
  assert.ok(result.startsWith("<script>"));
  assert.ok(result.includes("window.PagedConfig"));
  assert.ok(result.endsWith("</html>"));
});

test("the completion flow payload uses flow totals", () => {
  // Documents the contract with the polyfill: after(flow) receives the
  // flow object with .total and .pages; the bootstrap maps both.
  const html = injectPagedPrintRuntime("</head>x", "u");
  const match = html.match(/after:\s*function\s*\(flow\)\s*{([^}]+)}/);
  assert.ok(match, "after callback missing");
  assert.ok(match[1].includes("flow.total"));
  assert.ok(match[1].includes("flow.pages.length"));
});
