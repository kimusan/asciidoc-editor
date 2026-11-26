import assert from "node:assert";
import { test } from "node:test";
import { findAnchorLine, findNavigationTarget } from "../src/navigation.js";

test("findNavigationTarget extracts include, xref, link, and angle targets", () => {
  assert.deepEqual(
    findNavigationTarget("include::chapters/intro.adoc[leveloffset=+1]", 12),
    { href: "chapters/intro.adoc", start: 0, end: 44 }
  );

  assert.deepEqual(
    findNavigationTarget("see xref:guide.adoc#setup[the setup guide]", 12),
    { href: "guide.adoc#setup", start: 4, end: 42 }
  );

  assert.deepEqual(
    findNavigationTarget("bare xref:appendix.adoc[] here", 14),
    { href: "appendix.adoc", start: 5, end: 25 }
  );

  assert.deepEqual(
    findNavigationTarget("the link:design.adoc[design doc] explains", 8),
    { href: "design.adoc", start: 4, end: 32 }
  );

  // Web URLs are not navigation targets.
  assert.equal(findNavigationTarget("see link:https://example.com/x[site]", 12), null);

  // <<anchor>> stays in the document; <<doc.adoc#anchor,text>> travels.
  assert.deepEqual(findNavigationTarget("go <<_install>> now", 8), { href: "#_install", start: 3, end: 15 });
  assert.deepEqual(
    findNavigationTarget("<<guide.adoc#setup,see setup>>", 4),
    { href: "guide.adoc#setup", start: 0, end: 30 }
  );
});

test("findNavigationTarget requires the click to land inside the macro", () => {
  const line = "prefix include::a.adoc[] suffix";
  assert.equal(findNavigationTarget(line, 2), null);
  assert.equal(findNavigationTarget(line, 40), null);
  assert.equal(findNavigationTarget(line, 10)?.href, "a.adoc");
  // The trailing bracket is placement-click territory, not navigation.
  assert.equal(findNavigationTarget(line, line.indexOf("]") + 1), null);
  assert.equal(findNavigationTarget(line, line.indexOf("]")), null);
});

test("findNavigationTarget tolerates bad input", () => {
  assert.equal(findNavigationTarget(null, 3), null);
  assert.equal(findNavigationTarget("xref:a.adoc[]", -1), null);
  assert.equal(findNavigationTarget("xref:a.adoc[]", 99), null);
});

test("findAnchorLine finds explicit anchors and generated heading ids", () => {
  const content = [
    "= Doc",
    "",
    "[[install,install section]]",
    "== Install",
    "",
    "== Troubleshooting Guide (Advanced)",
    "body"
  ].join("\n");

  assert.equal(findAnchorLine(content, "install"), 3);
  assert.equal(findAnchorLine(content, "_troubleshooting-guide-advanced"), 6);
  assert.equal(findAnchorLine(content, "nope"), null);
  assert.equal(findAnchorLine(content, ""), null);
  assert.equal(findAnchorLine("", "_anything"), null);
});
