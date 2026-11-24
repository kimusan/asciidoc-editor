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
