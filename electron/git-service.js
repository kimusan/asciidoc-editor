// Git integration, main process only. Wave 5 increment 1: file status for
// the workspace tree. Backed by isomorphic-git (pure JS - no git binary and
// no shell-out, which the roadmap requires for distribution safety).
//
// statusMatrix returns one row per file: [HEAD, workdir, stage] where each
// cell is 0 (absent), 1 (present, identical) or 2 (present, differs). The
// mapping below follows the table in the isomorphic-git docs.

import fs from "node:fs";
import path from "node:path";
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
export function mapStatusMatrixToEntries(matrix, repoRoot) {
  const files = [];
  for (const row of matrix) {
    const status = statusForRow(row);
    if (!status) {
      continue;
    }
    files.push({ path: path.join(repoRoot, row[0]), status });
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

// Reads the version of `relativePath` (repo-relative, "/" separators) as
// committed in HEAD, walking the commit -> tree -> ... -> blob chain.
// Returns null when HEAD or any path component is missing (fresh repo,
// untracked file, renamed mid-walk).
export async function readHeadFile(repoRoot, relativePath) {
  const decoder = new TextDecoder();
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

  try {
    const { object: blob } = await git.readObject({ fs, dir: repoRoot, oid });
    return decoder.decode(blob);
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
