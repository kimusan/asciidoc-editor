// Git integration, main process only. Wave 5 increment 1: file status for
// the workspace tree. Backed by isomorphic-git (pure JS - no git binary and
// no shell-out, which the roadmap requires for distribution safety).
//
// statusMatrix returns one row per file: [HEAD, workdir, stage] where each
// cell is 0 (absent), 1 (present, identical) or 2 (present, differs). The
// mapping below follows the table in the isomorphic-git docs.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import git from "isomorphic-git";
import ignore from "ignore";

// How long a computed status stays fresh. The renderer asks on every tree
// refresh (save, open, expand, search clear) which can burst, while a
// statusMatrix run walks the workdir and hashes changed files.
const STATUS_CACHE_TTL_MS = 2000;

const statusCache = new Map(); // repoRoot -> { expiresAt, payload }

// Pure: maps one statusMatrix row to a tree badge status, or null when the
// file is clean. Exported for unit tests.
//
// IMPORTANT: the matrix table in the isomorphic-git docs does NOT match the
// actual v1.44 encoding - the cells were verified empirically (probe in git
// history / unit tests). Real semantics:
//   HEAD cell:   0 = absent, 1 = present
//   workdir cell: 0 = absent, 1 = identical to HEAD, 2 = differs from HEAD
//   stage cell:  0 = absent, 1 = identical to HEAD,
//                2 = differs from HEAD but identical to workdir,
//                3 = differs from both HEAD and workdir
// The rules below only rely on those relations, so they stay correct for
// both the documented and the observed encodings.
export function statusForRow(row) {
  const head = row[1];
  const workdir = row[2];
  const stage = row[3];

  if (workdir === 0 && (head === 1 || stage > 0)) {
    return "deleted"; // gone from the working directory
  }
  if (head === 0 && workdir > 0 && stage === 0) {
    return "untracked"; // new, not staged
  }
  if (head === 0 && stage > 0) {
    return "added"; // new, staged (possibly with further workdir edits)
  }
  if (head === 1 && workdir === 2) {
    return "modified"; // tracked, content differs from HEAD
  }
  if (head === 1 && workdir === 1 && stage >= 2) {
    return "modified"; // workdir matches HEAD but the stage does not
  }
  // [1,1,1] and anything unexpected: clean / not interesting for the tree.
  return null;
}

// Pure: turns a full statusMatrix into the entries the tree consumes.
// Only non-clean files are included; paths become absolute via repoRoot.
// `staged` reflects the index vs HEAD (the panel's checkbox state).
export function mapStatusMatrixToEntries(matrix, repoRoot) {
  const files = [];
  for (const row of matrix) {
    const status = statusForRow(row);
    if (!status) {
      continue;
    }
    files.push({ path: path.join(repoRoot, row[0]), status, staged: row[3] !== row[1] });
  }
  return files;
}

// Walks up from startPath looking for a .git entry (a directory, or a file
// for git worktrees/submodules). Returns the repository root or null.
export async function findGitRepositoryRoot(startPath) {
  let current = path.resolve(startPath);
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

// Resolves the blob oid of `relativePath` (repo-relative, "/" separators)
// in the HEAD commit by walking commit -> tree -> ... -> entry. Returns
// null when HEAD or any path component is missing (fresh repo, untracked
// file, renamed mid-walk).
async function resolveHeadBlobOid(repoRoot, relativePath) {
  const parts = relativePath.split(path.sep).join("/").split("/").filter(Boolean);

  let oid;
  try {
    oid = await git.resolveRef({ fs, dir: repoRoot, ref: "HEAD" });
    const { object: commit } = await git.readObject({ fs, dir: repoRoot, oid });
    oid = commit.tree;
  } catch {
    return null;
  }

  for (let i = 0; i < parts.length; i += 1) {
    const isLast = i === parts.length - 1;
    let entry;
    try {
      const { object: entries } = await git.readObject({ fs, dir: repoRoot, oid });
      entry = entries.find((candidate) => candidate.path === parts[i]);
    } catch {
      return null;
    }
    if (!entry || (isLast ? entry.type !== "blob" : entry.type !== "tree")) {
      return null;
    }
    oid = entry.oid;
  }

  return oid;
}

// Reads the version of `relativePath` (repo-relative, "/" separators) as
// committed in HEAD, walking the commit -> tree -> ... -> blob chain.
// Returns null when HEAD or any path component is missing (fresh repo,
// untracked file, renamed mid-walk).
export async function readHeadFile(repoRoot, relativePath) {
  const oid = await resolveHeadBlobOid(repoRoot, relativePath);
  if (oid === null) {
    return null;
  }
  try {
    const { object: blob } = await git.readObject({ fs, dir: repoRoot, oid });
    return new TextDecoder().decode(blob);
  } catch {
    return null;
  }
}

// Resolves what the current buffer should be diffed against: the committed
// HEAD version when the file is tracked, otherwise the last saved copy on
// disk. `readFile` is injected so unit tests can stub disk reads.
// Returns { source: "head" | "disk" | "none", content, repoRoot }.
export async function getDiffSource(filePath, { readFile } = {}) {
  const read = readFile ?? ((p) => fs.promises.readFile(p, "utf8").catch(() => null));

  const repoRoot = await findGitRepositoryRoot(path.dirname(filePath));
  if (repoRoot) {
    const headContent = await readHeadFile(repoRoot, path.relative(repoRoot, filePath));
    if (headContent !== null) {
      return { source: "head", content: headContent, repoRoot };
    }
  }

  const diskContent = await read(filePath);
  if (diskContent !== null) {
    return { source: "disk", content: diskContent, repoRoot };
  }

  return { source: "none", content: null, repoRoot };
}

// Drop any cached status: called after writes the app itself performs
// (save, asset import) so the next ask sees fresh content.
export function invalidateGitStatusCache() {
  statusCache.clear();
}

// --- Stage / commit (Wave 5 increment 3) ---------------------------------
//
// isomorphic-git has no `reset` command (verified: absent even in the
// latest 1.44.19), so unstaging is implemented with direct .git/index
// I/O. The v2 index format has been stable since git 1.5 and both git and
// isomorphic-git read what we write; extensions (e.g. the TREE cache) are
// optional and dropped on rewrite.

// Fixed size of one index entry up to and including the flags field.
const INDEX_ENTRY_FIXED_BYTES = 62;

function readIndexEntries(buffer) {
  if (buffer.length < 12 || buffer.toString("latin1", 0, 4) !== "DIRC") {
    return [];
  }
  // Header: 4-byte "DIRC" signature, u32 version (offset 4), u32 entry
  // count (offset 8). Reading the count from offset 4 was a real bug: the
  // version is always 2, so the parser silently dropped everything after
  // the second entry.
  const entryCount = buffer.readUInt32BE(8);
  const entries = [];
  let offset = 12;
  for (let i = 0; i < entryCount && offset + INDEX_ENTRY_FIXED_BYTES <= buffer.length; i += 1) {
    const entry = {
      ctimeS: buffer.readUInt32BE(offset),
      ctimeN: buffer.readUInt32BE(offset + 4),
      mtimeS: buffer.readUInt32BE(offset + 8),
      mtimeN: buffer.readUInt32BE(offset + 12),
      dev: buffer.readUInt32BE(offset + 16),
      ino: buffer.readUInt32BE(offset + 20),
      mode: buffer.readUInt32BE(offset + 24),
      uid: buffer.readUInt32BE(offset + 28),
      gid: buffer.readUInt32BE(offset + 32),
      size: buffer.readUInt32BE(offset + 36),
      oid: buffer.toString("hex", offset + 40, offset + 60)
    };
    const nameLength = buffer.readUInt16BE(offset + 60) & 0xfff;
    entry.path = buffer.toString("utf8", offset + 62, offset + 62 + nameLength);
    entries.push(entry);
    // Entries are padded with NUL bytes to a multiple of 8 (minimum one).
    const entryBytes = INDEX_ENTRY_FIXED_BYTES + nameLength;
    offset += Math.ceil((entryBytes + 1) / 8) * 8;
  }
  return entries;
}

function writeIndexEntries(entries) {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const chunks = [];
  const header = Buffer.alloc(12);
  header.write("DIRC", 0, "latin1");
  header.writeUInt32BE(2, 4);
  header.writeUInt32BE(sorted.length, 8);
  chunks.push(header);
  for (const entry of sorted) {
    const pathBytes = Buffer.from(entry.path, "utf8");
    const entryBytes = INDEX_ENTRY_FIXED_BYTES + pathBytes.length;
    const padded = Buffer.alloc(Math.ceil((entryBytes + 1) / 8) * 8);
    let offset = 0;
    padded.writeUInt32BE(entry.ctimeS >>> 0, offset); offset += 4;
    padded.writeUInt32BE(entry.ctimeN >>> 0, offset); offset += 4;
    padded.writeUInt32BE(entry.mtimeS >>> 0, offset); offset += 4;
    padded.writeUInt32BE(entry.mtimeN >>> 0, offset); offset += 4;
    padded.writeUInt32BE(entry.dev >>> 0, offset); offset += 4;
    padded.writeUInt32BE(entry.ino >>> 0, offset); offset += 4;
    padded.writeUInt32BE(entry.mode >>> 0, offset); offset += 4;
    padded.writeUInt32BE(entry.uid >>> 0, offset); offset += 4;
    padded.writeUInt32BE(entry.gid >>> 0, offset); offset += 4;
    padded.writeUInt32BE(entry.size >>> 0, offset); offset += 4;
    Buffer.from(entry.oid, "hex").copy(padded, offset); offset += 20;
    padded.writeUInt16BE(Math.min(pathBytes.length, 0xfff), offset);
    pathBytes.copy(padded, INDEX_ENTRY_FIXED_BYTES);
    chunks.push(padded);
  }
  const body = Buffer.concat(chunks);
  const trailer = Buffer.from(crypto.createHash("sha1").update(body).digest("hex"), "hex");
  return Buffer.concat([body, trailer]);
}

function readGitIndexEntries(repoRoot) {
  try {
    return readIndexEntries(fs.readFileSync(path.join(repoRoot, ".git", "index")));
  } catch {
    // No index yet (fresh repository, nothing staged): equivalent to empty.
    return [];
  }
}

// Stat data for an index entry being reset to the HEAD blob. Deliberately
// stale (zeroed times): the entry's oid is the HEAD blob, not the workdir
// content, so stat data matching the workdir file would make statusMatrix's
// stat-cache shortcut report the file as clean. Zeroed times force a
// re-hash of the working directory file on the next status run, which is
// exactly what `git reset` makes visible. The mode still reflects the
// workdir file so an executable bit is not lost.
function statsForIndexEntry(repoRoot, relativePath) {
  let mode = 0o100644;
  try {
    const stats = fs.statSync(path.join(repoRoot, relativePath));
    if ((stats.mode & 0o100) === 0o100) {
      mode = 0o100755;
    }
  } catch {
    // Absent workdir file (unstaging a staged deletion): default mode.
  }
  return { ctimeS: 0, ctimeN: 0, mtimeS: 0, mtimeN: 0, dev: 0, ino: 0, mode, uid: 0, gid: 0, size: 0 };
}

// Normalizes an absolute path to a repo-relative "/"-separated string,
// or null when it does not live inside the repository.
function toRepoRelative(repoRoot, filePath) {
  const relative = path.relative(repoRoot, path.resolve(filePath));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return relative.split(path.sep).join("/");
}

// Stages files (by absolute path): git.add for present files, git.remove
// for files deleted from the working directory (verified: remove on an
// absent workdir file only updates the index, producing a staged
// deletion). Works in no-commit repositories via the index alone.
export async function stageFiles({ workspacePath, filePaths }) {
  const repoRoot = await findGitRepositoryRoot(workspacePath);
  if (!repoRoot || !Array.isArray(filePaths)) {
    return { ok: false, error: "not-a-repository" };
  }
  for (const filePath of filePaths) {
    if (typeof filePath !== "string") {
      continue;
    }
    const relative = toRepoRelative(repoRoot, filePath);
    if (!relative) {
      continue;
    }
    if (fs.existsSync(filePath)) {
      await git.add({ fs, dir: repoRoot, filepath: relative });
    } else {
      await git.remove({ fs, dir: repoRoot, filepath: relative });
    }
  }
  invalidateGitStatusCache();
  return { ok: true };
}

// Unstages files: resets their index entry to the HEAD blob (or removes
// the entry entirely when the file is not in HEAD, e.g. staged-new in a
// fresh repository). This is the manual equivalent of `git reset <file>`,
// which isomorphic-git does not implement.
export async function unstageFiles({ workspacePath, filePaths }) {
  const repoRoot = await findGitRepositoryRoot(workspacePath);
  if (!repoRoot || !Array.isArray(filePaths)) {
    return { ok: false, error: "not-a-repository" };
  }

  const targets = new Set();
  for (const filePath of filePaths) {
    if (typeof filePath !== "string") {
      continue;
    }
    const relative = toRepoRelative(repoRoot, filePath);
    if (relative) {
      targets.add(relative);
    }
  }
  if (targets.size === 0) {
    return { ok: true };
  }

  const entries = readGitIndexEntries(repoRoot);
  const kept = [];
  for (const entry of entries) {
    if (!targets.has(entry.path)) {
      kept.push(entry);
      continue;
    }
    const headOid = await resolveHeadBlobOid(repoRoot, entry.path);
    if (headOid === null) {
      continue; // not in HEAD: dropping the entry makes it untracked again
    }
    kept.push({ ...statsForIndexEntry(repoRoot, entry.path), oid: headOid, path: entry.path });
  }

  // Files that are staged-deleted have no index entry at all; restore one
  // pointing at HEAD so they show up as unstaged deletions again.
  for (const relative of targets) {
    if (entries.some((entry) => entry.path === relative)) {
      continue;
    }
    const headOid = await resolveHeadBlobOid(repoRoot, relative);
    if (headOid !== null) {
      kept.push({ ...statsForIndexEntry(repoRoot, relative), oid: headOid, path: relative });
    }
  }

  fs.writeFileSync(path.join(repoRoot, ".git", "index"), writeIndexEntries(kept));
  invalidateGitStatusCache();
  return { ok: true };
}

// Reads the configured git author (repo config, then global), or null.
export async function getGitAuthor({ workspacePath }) {
  const repoRoot = await findGitRepositoryRoot(workspacePath);
  if (!repoRoot) {
    return null;
  }
  const [name, email] = await Promise.all([
    git.getConfig({ fs, dir: repoRoot, path: "user.name" }).catch(() => undefined),
    git.getConfig({ fs, dir: repoRoot, path: "user.email" }).catch(() => undefined)
  ]);
  if (!name || !email) {
    return null;
  }
  return { name, email };
}

// Commits whatever is staged. The author comes from the explicit arguments
// (the panel's fallback fields), the git config, or the call fails with a
// distinct error the renderer can surface.
export async function commitStaged({ workspacePath, message, authorName, authorEmail }) {
  const repoRoot = await findGitRepositoryRoot(workspacePath);
  if (!repoRoot) {
    return { ok: false, error: "not-a-repository" };
  }
  if (typeof message !== "string" || !message.trim()) {
    return { ok: false, error: "empty-message" };
  }

  // isomorphic-git happily creates empty commits (same tree as the parent),
  // so "nothing staged" must be detected explicitly: any matrix row whose
  // stage cell differs from HEAD means there is something to commit.
  try {
    const matrix = await git.statusMatrix({ fs, dir: repoRoot });
    if (!matrix.some((row) => row[3] !== row[1])) {
      return { ok: false, error: "nothing-staged" };
    }
  } catch {
    // A broken repository surfaces as a commit failure below.
  }

  let author = null;
  if (authorName && authorEmail) {
    author = { name: authorName, email: authorEmail };
  } else {
    const configured = await getGitAuthor({ workspacePath: repoRoot });
    if (configured) {
      author = configured;
    }
  }
  if (!author) {
    return { ok: false, error: "missing-author" };
  }

  try {
    const oid = await git.commit({
      fs,
      dir: repoRoot,
      message: message.trim(),
      author,
      committer: author
    });
    invalidateGitStatusCache();
    return { ok: true, oid };
  } catch (error) {
    return { ok: false, error: error.code === "EmptyCommitError" ? "nothing-staged" : "commit-failed" };
  }
}

// isomorphic-git's statusMatrix does NOT respect .gitignore - ignored files
// would surface as untracked badges. Collect the repo's .gitignore files
// (bounded: node_modules and .git stay out of the walk) and expose a matcher
// honoring each file's directory scope, like git does.
export async function collectGitignoreMatchers(repoRoot) {
  const matchers = [];
  const walk = async (dir) => {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name === ".gitignore") {
        let rules;
        try {
          rules = await fs.promises.readFile(fullPath, "utf8");
        } catch {
          continue;
        }
        matchers.push({ scope: dir, test: ignore().add(rules) });
      }
    }
  };
  await walk(repoRoot);
  return matchers;
}

// Pure: true when any scoped .gitignore rule set matches the absolute path.
export function isGitIgnored(filePath, matchers) {
  for (const { scope, test } of matchers) {
    if (filePath === scope || filePath.startsWith(scope + path.sep)) {
      if (test.ignores(path.relative(scope, filePath).split(path.sep).join("/"))) {
        return true;
      }
    }
  }
  return false;
}

// Computes the workspace's git status. `isBrowsableFile` limits the matrix
// to files the workspace tree can show (the tree is the only consumer) -
// this keeps big non-document trees (node_modules and friends) out of the
// hash work. Returns { isRepo: false } when the workspace is not inside a
// git repository.
export async function getWorkspaceGitStatus({ workspacePath, isBrowsableFile }) {
  if (!workspacePath || typeof isBrowsableFile !== "function") {
    return { isRepo: false, repoRoot: null, files: [] };
  }

  const repoRoot = await findGitRepositoryRoot(workspacePath);
  if (!repoRoot) {
    return { isRepo: false, repoRoot: null, files: [] };
  }

  const cached = statusCache.get(repoRoot);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  let matrix;
  try {
    matrix = await git.statusMatrix({
      fs,
      dir: repoRoot,
      // Limits the matrix rows to files the workspace tree can show (the tree
      // is the only consumer); node_modules files stay out of the result and
      // the hash work on repos the walker can prune early.
      filter: (filePath) => {
        if (filePath.split("/").includes("node_modules")) {
          return false;
        }
        return isBrowsableFile(path.basename(filePath));
      }
    });
  } catch {
    // A corrupt or fake repository (e.g. an empty .git directory) can fail
    // mid-walk. Degrade to "no badges" rather than breaking the tree.
    const payload = { isRepo: true, repoRoot, files: [], unavailable: true };
    statusCache.set(repoRoot, { expiresAt: Date.now() + STATUS_CACHE_TTL_MS, payload });
    return payload;
  }

  const gitignoreMatchers = await collectGitignoreMatchers(repoRoot);
  const payload = {
    isRepo: true,
    repoRoot,
    files: mapStatusMatrixToEntries(matrix, repoRoot)
      .filter((entry) => !isGitIgnored(entry.path, gitignoreMatchers))
  };
  statusCache.set(repoRoot, { expiresAt: Date.now() + STATUS_CACHE_TTL_MS, payload });
  return payload;
}
