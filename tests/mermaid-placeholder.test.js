import test from "node:test";
import assert from "node:assert/strict";
import { runRenderJobForTests, disposeRenderWorker } from "../electron/asciidoc.js";
import { extractMermaidSources, applyMermaidDiagrams } from "../electron/mermaid-html.js";

// The worker contract for [mermaid] blocks: emit a placeholder div carrying
// the URI-encoded source (rendering happens in the main process, which has
// a live DOM). Raw worker output comes from runRenderJobForTests so the
// main-process substitution seam never runs in unit space.
test("[mermaid] blocks emit URI-encoded placeholders for the main-process renderer", async () => {
  const source = [
    "= Diagrams",
    "",
    "[mermaid]",
    "----",
    "flowchart TD",
    "  A[Start] --> B{Choice}",
    "----",
    ""
  ].join("\n");

  const { body } = await runRenderJobForTests("renderPreviewBody", source, "diagrams.adoc", {
    backend: "html5",
    standalone: true
  });

  const match = body.match(/<div class="imageblock mermaid-block"([^>]*)><\/div>/);
  assert.ok(match, `placeholder not found in: ${body.slice(0, 400)}`);

  const attributes = match[1];
  const sourceMatch = attributes.match(/data-mermaid-source="([^"]*)"/);
  assert.ok(sourceMatch, "data-mermaid-source attribute missing");
  assert.equal(
    decodeURIComponent(sourceMatch[1]),
    "flowchart TD\n  A[Start] --> B{Choice}"
  );

  // The pure substitution helpers must accept this exact worker markup.
  const sources = extractMermaidSources(body);
  assert.equal(sources.length, 1);
  assert.equal(sources[0], sourceMatch[1]);

  const substituted = applyMermaidDiagrams(body, new Map([
    [sourceMatch[1], { svg: "<svg>ok</svg>" }]
  ]));
  assert.ok(substituted.includes('<div class="content"><svg>ok</svg></div>'));
  assert.ok(!substituted.includes("mermaid-block\" data-mermaid-source=\"\"><"));
});

test("non-html5 backends fall back to a literal block, not a placeholder", async () => {
  const source = "[mermaid]\n----\nflowchart TD\n  A --> B\n----\n";

  const { body } = await runRenderJobForTests("renderPreviewBody", source, "diagrams.adoc", {
    backend: "docbook",
    standalone: true
  });

  assert.ok(!body.includes("mermaid-block"), "placeholder leaked into DocBook output");
  assert.ok(body.includes("<literallayout"), "literal fallback missing");
});

test.after(async () => {
  await disposeRenderWorker();
});
