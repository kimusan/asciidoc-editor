import test from "node:test";
import assert from "node:assert/strict";
import { sanitizePartialState } from "../electron/state-schema.js";

test("sanitizePartialState keeps known keys with matching types", () => {
  const sanitized = sanitizePartialState({
    theme: "nord",
    distractionFree: true,
    nextDocumentId: 3,
    openDocuments: [],
    projectSessions: { "/tmp/p.adp": {} },
    previewStylesheetPath: null
  });

  assert.deepEqual(sanitized, {
    theme: "nord",
    distractionFree: true,
    nextDocumentId: 3,
    openDocuments: [],
    projectSessions: { "/tmp/p.adp": {} },
    previewStylesheetPath: null
  });
});

test("sanitizePartialState persists the spell check toggle", () => {
  assert.deepEqual(
    sanitizePartialState({ spellCheckEnabled: false }),
    { spellCheckEnabled: false }
  );
  // Wrong type must be dropped, not coerced.
  assert.deepEqual(Object.keys(sanitizePartialState({ spellCheckEnabled: "off" })), []);
});

test("sanitizePartialState persists the spell check language", () => {
  assert.deepEqual(
    sanitizePartialState({ spellCheckLanguage: "da" }),
    { spellCheckLanguage: "da" }
  );
  assert.deepEqual(Object.keys(sanitizePartialState({ spellCheckLanguage: false })), []);
});

test("sanitizePartialState persists the writing focus toggles", () => {
  assert.deepEqual(
    sanitizePartialState({ typewriterScrolling: true, paragraphFocusDimming: true }),
    { typewriterScrolling: true, paragraphFocusDimming: true }
  );
  // Wrong type must be dropped, not coerced.
  assert.deepEqual(Object.keys(sanitizePartialState({ typewriterScrolling: "on" })), []);
  assert.deepEqual(Object.keys(sanitizePartialState({ paragraphFocusDimming: 1 })), []);
});

test("sanitizePartialState persists the preview color scheme override", () => {
  assert.deepEqual(
    sanitizePartialState({ previewColorScheme: "dark" }),
    { previewColorScheme: "dark" }
  );
  // Wrong type must be dropped, not coerced.
  assert.deepEqual(Object.keys(sanitizePartialState({ previewColorScheme: true })), []);
});

test("sanitizePartialState persists the editor font size and zoom level", () => {
  assert.deepEqual(
    sanitizePartialState({ editorFontSize: "large" }),
    { editorFontSize: "large" }
  );
  assert.deepEqual(sanitizePartialState({ zoomLevel: 1.5 }), { zoomLevel: 1.5 });
  // Non-numeric zoom and unknown font sizes are dropped, not coerced.
  assert.deepEqual(Object.keys(sanitizePartialState({ zoomLevel: "big" })), []);
  assert.deepEqual(Object.keys(sanitizePartialState({ editorFontSize: 99 })), []);
});

test("sanitizePartialState drops unknown keys", () => {
  const sanitized = sanitizePartialState({
    theme: "nord",
    evilInjectedKey: "anything",
    __proto__safe: "x"
  });

  assert.deepEqual(Object.keys(sanitized), ["theme"]);
});

test("sanitizePartialState drops type-mismatched values", () => {
  const sanitized = sanitizePartialState({
    theme: 42,
    distractionFree: "yes",
    openDocuments: "not-an-array",
    nextDocumentId: "3",
    recentFiles: null
  });

  assert.deepEqual(sanitized, {});
});

test("sanitizePartialState rejects non-object payloads entirely", () => {
  assert.deepEqual(sanitizePartialState(null), {});
  assert.deepEqual(sanitizePartialState("theme=nord"), {});
  assert.deepEqual(sanitizePartialState(["theme"]), {});
});
