import test from "node:test";
import assert from "node:assert/strict";
import { appState } from "../src/app-state.js";
import {
  acquireScrollSyncLock,
  interpolateLineNumberAtOffset,
  isScrollSyncLockedBy
} from "../src/preview-sync.js";

function resetLock() {
  appState.scrollSyncLock.owner = null;
  appState.scrollSyncLock.until = 0;
}

test("interpolateLineNumberAtOffset maps between surrounding anchors", () => {
  const points = [
    { lineNumber: 10, top: 100 },
    { lineNumber: 20, top: 300 }
  ];

  assert.equal(interpolateLineNumberAtOffset(200, points, 100, 1000), 15);
  assert.equal(interpolateLineNumberAtOffset(100, points, 100, 1000), 10);
  assert.equal(interpolateLineNumberAtOffset(300, points, 100, 1000), 20);
});

test("interpolateLineNumberAtOffset maps above the first anchor from line 1", () => {
  const points = [{ lineNumber: 50, top: 400 }];
  // Halfway between the document top (line 1) and the first anchor.
  assert.equal(interpolateLineNumberAtOffset(200, points, 100, 1000), 26);
  assert.equal(interpolateLineNumberAtOffset(0, points, 100, 1000), 1);
});

test("interpolateLineNumberAtOffset maps past the last anchor to the document end", () => {
  const points = [{ lineNumber: 40, top: 100 }];
  // Halfway between the last anchor and maxScrollTop, which forward sync
  // maps to the final line.
  assert.equal(interpolateLineNumberAtOffset(300, points, 100, 500), 70);
  // Never past the document end.
  assert.equal(interpolateLineNumberAtOffset(5000, points, 100, 500), 100);
});

test("interpolateLineNumberAtOffset falls back to proportional mapping without anchors", () => {
  assert.equal(interpolateLineNumberAtOffset(400, [], 200, 1000), 81);
  assert.equal(interpolateLineNumberAtOffset(0, [], 200, 1000), 1);
  assert.equal(interpolateLineNumberAtOffset(1000, [], 200, 1000), 200);
});

test("interpolateLineNumberAtOffset rejects nonsensical input", () => {
  assert.equal(interpolateLineNumberAtOffset(Number.NaN, [], 10, 100), null);
  assert.equal(interpolateLineNumberAtOffset(50, [], 0, 100), null);
});

test("scroll sync lock is exclusive per owner and expires", () => {
  resetLock();

  assert.equal(acquireScrollSyncLock("editor"), true);
  assert.equal(isScrollSyncLockedBy("editor"), true);
  assert.equal(isScrollSyncLockedBy("preview"), false);
  // The other side cannot take over while the lock is live.
  assert.equal(acquireScrollSyncLock("preview"), false);
  // The owner can refresh its own lock.
  assert.equal(acquireScrollSyncLock("editor"), true);

  // An expired lock no longer blocks anyone.
  appState.scrollSyncLock.until = Date.now() - 1;
  assert.equal(isScrollSyncLockedBy("editor"), false);
  assert.equal(acquireScrollSyncLock("preview"), true);
  assert.equal(isScrollSyncLockedBy("preview"), true);

  resetLock();
});
