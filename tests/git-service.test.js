import test from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import git from "isomorphic-git";
import {
  statusForRow,
  mapStatusMatrixToEntries,
  findGitRepositoryRoot,
  getWorkspaceGitStatus,
  getDiffSource,
  readHeadFile,
  collectGitignoreMatchers,
  isGitIgnored
} from "../electron/git-service.js";

const BROWSABLE = (name) => /\.(adoc|asciidoc|asc|png|jpg|svg|txt|json)$/i.test(name);

// Scratch base for test directories. os.tmpdir() is preferred but a stray
// .git above it (seen on dev machines) would make "not a repository"
// assertions lie; fall back to a clean directory under the home directory.
async function makeScratchDir(prefix) {
  const tmpBase = await fsp.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  if ((await findGitRepositoryRoot(tmpBase)) === null) {
    return tmpBase;
  }
  await fsp.rm(tmpBase, { recursive: true, force: true });
  const homeBase = path.join(os.homedir(), ".asciidoc-editor-git-tests");
  await fsp.mkdir(homeBase, { recursive: true });
  return fsp.mkdtemp(path.join(homeBase, `${prefix}-`));
}

// The isomorphic-git docs table does not match the actual v1.44 matrix
// encoding (verified empirically): workdir/stage cells are relative to HEAD
// and the stage cell can be 3. These rows pin the real encoding so a future
// isomorphic-git upgrade that changes semantics fails loudly here.
test("statusForRow maps the observed v1.44 statusMatrix rows", () => {
  assert.equal(statusForRow(["clean.adoc", 1, 1, 1]), null);
  assert.equal(statusForRow(["mod.adoc", 1, 2, 1]), "modified");
  assert.equal(statusForRow(["modstaged.adoc", 1, 2, 2]), "modified");
  assert.equal(statusForRow(["del.adoc", 1, 0, 1]), "deleted");
  assert.equal(statusForRow(["newstaged.adoc", 0, 2, 2]), "added");
  assert.equal(statusForRow(["newstagedmod.adoc", 0, 2, 3]), "added");
  assert.equal(statusForRow(["newstagedgone.adoc", 0, 0, 3]), "deleted");
  assert.equal(statusForRow(["untracked.adoc", 0, 2, 0]), "untracked");
});

test("statusForRow also accepts the documented encoding", () => {
  assert.equal(statusForRow(["untracked.adoc", 0, 1, 0]), "untracked");
  assert.equal(statusForRow(["newstaged.adoc", 0, 1, 1]), "added");
  assert.equal(statusForRow(["mod.adoc", 1, 2, 1]), "modified");
  assert.equal(statusForRow(["del.adoc", 1, 0, 0]), "deleted");
  assert.equal(statusForRow(["delstaged.adoc", 1, 0, 1]), "deleted");
});

test("mapStatusMatrixToEntries keeps only non-clean files and absolutizes paths", () => {
  const entries = mapStatusMatrixToEntries(
    [
      ["clean.adoc", 1, 1, 1],
      ["mod.adoc", 1, 2, 1],
      ["untracked.adoc", 0, 2, 0]
    ],
    "/repo"
  );
  assert.deepEqual(entries, [
    { path: path.join("/repo", "mod.adoc"), status: "modified" },
    { path: path.join("/repo", "untracked.adoc"), status: "untracked" }
  ]);
});

test("isGitIgnored honors each .gitignore's directory scope", async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "git-ignore-test-"));
  await fsp.mkdir(path.join(dir, "sub"), { recursive: true });
  await fsp.writeFile(path.join(dir, ".gitignore"), "build/\nsecret.adoc\n");
  await fsp.writeFile(path.join(dir, "sub", ".gitignore"), "*.png\n");
  const matchers = await collectGitignoreMatchers(dir);

  assert.equal(isGitIgnored(path.join(dir, "secret.adoc"), matchers), true);
  assert.equal(isGitIgnored(path.join(dir, "build", "out.pdf"), matchers), true);
  assert.equal(isGitIgnored(path.join(dir, "sub", "pic.png"), matchers), true);
  assert.equal(isGitIgnored(path.join(dir, "pic.png"), matchers), false, "nested rule must not leak upward");
  assert.equal(isGitIgnored(path.join(dir, "keep.adoc"), matchers), false);
  await fsp.rm(dir, { recursive: true, force: true });
});

test("findGitRepositoryRoot walks up to the repository", async () => {
  const base = await makeScratchDir("git-root-test");
  const dir = path.join(base, "repo");
  await fsp.mkdir(path.join(dir, ".git"), { recursive: true });
  await fsp.mkdir(path.join(dir, "docs", "deep"), { recursive: true });
  assert.equal(await findGitRepositoryRoot(path.join(dir, "docs", "deep")), dir);
  assert.equal(await findGitRepositoryRoot(dir), dir);
  assert.equal(await findGitRepositoryRoot(base), null, "scratch base must not sit inside a repository");
  await fsp.rm(base, { recursive: true, force: true });
});

test("readHeadFile walks the commit/tree chain to nested blobs", async () => {
  const base = await makeScratchDir("git-headfile-test");
  const dir = path.join(base, "repo");
  await fsp.mkdir(path.join(dir, "docs", "deep"), { recursive: true });
  await git.init({ fs, dir });
  await fsp.writeFile(path.join(dir, "docs", "deep", "a.adoc"), "committed");
  await git.add({ fs, dir, filepath: "docs/deep/a.adoc" });
  await git.commit({ fs, dir, message: "init", author: { name: "T", email: "t@example.com" } });
  // Later disk edits must not affect the HEAD read.
  await fsp.writeFile(path.join(dir, "docs", "deep", "a.adoc"), "changed on disk");
  try {
    assert.equal(await readHeadFile(dir, path.join("docs", "deep", "a.adoc")), "committed");
    // Repo-relative separators ("/") must work without path.sep translation.
    assert.equal(await readHeadFile(dir, "docs/deep/a.adoc"), "committed");
    assert.equal(await readHeadFile(dir, "docs/missing.adoc"), null, "unknown path is null, not a throw");
    assert.equal(await readHeadFile(dir, "docs"), null, "a tree is not a blob");
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});

test("readHeadFile returns null without commits or with a broken HEAD", async () => {
  const base = await makeScratchDir("git-headfile-empty-test");
  const dir = path.join(base, "repo");
  await fsp.mkdir(dir, { recursive: true });
  await git.init({ fs, dir });
  try {
    assert.equal(await readHeadFile(dir, "a.adoc"), null, "fresh repository has no HEAD tree");
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});

test("getDiffSource prefers HEAD, falls back to disk, then reports none", async () => {
  const base = await buildScenarioRepo();
  const dir = path.join(base, "repo");
  try {
    // modified.adoc: committed as "original", changed to "changed" on disk.
    const head = await getDiffSource(path.join(dir, "modified.adoc"));
    assert.equal(head.source, "head");
    assert.equal(head.content, "original");
    assert.equal(head.repoRoot, dir);

    // untracked.adoc exists on disk but was never committed.
    const disk = await getDiffSource(path.join(dir, "untracked.adoc"));
    assert.equal(disk.source, "disk");
    assert.equal(disk.content, "new");

    // Never committed and nothing on disk either.
    const missing = await getDiffSource(path.join(dir, "never-saved.adoc"));
    assert.equal(missing.source, "none");
    assert.equal(missing.content, null);
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});

test("getDiffSource uses the last disk copy outside any repository", async () => {
  const base = await makeScratchDir("git-diff-norepo-test");
  const file = path.join(base, "notes.adoc");
  await fsp.writeFile(file, "saved");
  try {
    const result = await getDiffSource(file);
    assert.equal(result.source, "disk");
    assert.equal(result.content, "saved");
    assert.equal(result.repoRoot, null);
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});

async function buildScenarioRepo() {
  const base = await makeScratchDir("git-service-test");
  const dir = path.join(base, "repo");
  await fsp.mkdir(dir, { recursive: true });
  await git.init({ fs, dir });
  const write = (name, content) => fsp.writeFile(path.join(dir, name), content);
  await write("clean.adoc", "clean");
  await write("modified.adoc", "original");
  await write("deleted.adoc", "bye");
  for (const name of ["clean.adoc", "modified.adoc", "deleted.adoc"]) {
    await git.add({ fs, dir, filepath: name });
  }
  await git.commit({ fs, dir, message: "init", author: { name: "T", email: "t@example.com" } });

  await write("modified.adoc", "changed");
  await fsp.rm(path.join(dir, "deleted.adoc"));
  await write("untracked.adoc", "new");
  await write("ignored.adoc", "ignored");
  await write(".gitignore", "ignored.adoc\n");
  await fsp.mkdir(path.join(dir, "node_modules", "pkg"), { recursive: true });
  await fsp.writeFile(path.join(dir, "node_modules", "pkg", "logo.png"), "png");
  return base;
}

test("getWorkspaceGitStatus reports a full scenario end to end", async () => {
  const base = await buildScenarioRepo();
  const dir = path.join(base, "repo");
  try {
    const status = await getWorkspaceGitStatus({ workspacePath: dir, isBrowsableFile: BROWSABLE });
    assert.equal(status.isRepo, true);
    assert.equal(status.repoRoot, dir);
    const byName = new Map(status.files.map((entry) => [path.basename(entry.path), entry.status]));
    assert.equal(byName.get("modified.adoc"), "modified");
    assert.equal(byName.get("deleted.adoc"), "deleted");
    assert.equal(byName.get("untracked.adoc"), "untracked");
    assert.equal(byName.has("clean.adoc"), false, "clean file must not be listed");
    assert.equal(byName.has("ignored.adoc"), false, ".gitignore'd file must not be listed");
    assert.equal(byName.has("logo.png"), false, "node_modules must stay out");
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});

test("getWorkspaceGitStatus treats a fresh repository's files as untracked", async () => {
  const base = await makeScratchDir("git-nocommit-test");
  const dir = path.join(base, "repo");
  await fsp.mkdir(dir, { recursive: true });
  await git.init({ fs, dir });
  await fsp.writeFile(path.join(dir, "a.adoc"), "x");
  try {
    const status = await getWorkspaceGitStatus({ workspacePath: dir, isBrowsableFile: BROWSABLE });
    assert.equal(status.isRepo, true);
    assert.deepEqual(status.files, [{ path: path.join(dir, "a.adoc"), status: "untracked" }]);
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});

test("getWorkspaceGitStatus degrades for a broken .git directory", async () => {
  const base = await makeScratchDir("git-broken-test");
  const dir = path.join(base, "repo");
  await fsp.mkdir(path.join(dir, ".git"), { recursive: true });
  await fsp.writeFile(path.join(dir, "a.adoc"), "x");
  try {
    const status = await getWorkspaceGitStatus({ workspacePath: dir, isBrowsableFile: BROWSABLE });
    assert.equal(status.isRepo, true);
    assert.equal(status.unavailable, true);
    assert.deepEqual(status.files, []);
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});

test("getWorkspaceGitStatus returns isRepo false outside any repository", async () => {
  const dir = await makeScratchDir("git-norepo-test");
  try {
    const status = await getWorkspaceGitStatus({ workspacePath: dir, isBrowsableFile: BROWSABLE });
    // Note: if a stray .git exists above os.tmpdir() this finds it; the
    // assertion holds in CI and on this machine (verified).
    assert.equal(status.isRepo, false);
    assert.deepEqual(status.files, []);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});
