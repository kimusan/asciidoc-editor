// Hunspell-backed spell check service for the renderer. The active language
// (see electron/spell-languages.js for the catalog) owns an nspell instance that
// is built lazily: English (US) ships with the app, every other language is
// downloaded once from cdn.jsdelivr.net (the dictionary-<lang> npm packages)
// and cached in userData/spell-dictionaries/. Personal words are per
// language, persisted to spell-dictionary-<code>.json with the same atomic
// temp+rename write as state.json.

import fs from "node:fs/promises";
import path from "node:path";
import { app, net } from "electron";
import nspell from "nspell";
import { SPELL_LANGUAGES, findSpellLanguage, DEFAULT_SPELL_LANGUAGE } from "./spell-languages.js";

// Words the renderer is allowed to ask about: 2-80 chars of letters with
// internal apostrophes or hyphens. Anything else is rejected instead of
// being handed to hunspell.
const WORD_PATTERN = /^[A-Za-z][A-Za-z'’-]*[A-Za-z]$/;
const MAX_BATCH_WORDS = 500;
const MAX_SUGGESTIONS = 5;
const DICTIONARY_CDN = "https://cdn.jsdelivr.net/npm";
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_DICTIONARY_FILE_BYTES = 64 * 1024 * 1024;

let spell = null;
let spellPromise = null;
let personalWords = null;
let activeLanguage = DEFAULT_SPELL_LANGUAGE;
// Serializes language switches so two rapid switches cannot interleave
// downloads and instance rebuilds.
let languageQueue = Promise.resolve();

function getDictionaryCacheDir(languageCode) {
  return path.join(app.getPath("userData"), "spell-dictionaries", languageCode);
}

function getPersonalDictionaryPath(languageCode) {
  return path.join(app.getPath("userData"), `spell-dictionary-${languageCode}.json`);
}

// The first shipped spell check release used a single language-agnostic
// spell-dictionary.json; adopt it for English (US) so nobody loses words.
function getLegacyPersonalDictionaryPath() {
  return path.join(app.getPath("userData"), "spell-dictionary.json");
}

function isCheckableWord(word) {
  return typeof word === "string" && word.length >= 2 && word.length <= 80 && WORD_PATTERN.test(word);
}

async function readPersonalDictionaryFile(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(content);
    return new Set(Array.isArray(parsed) ? parsed.filter((word) => isCheckableWord(word)) : []);
  } catch {
    return null;
  }
}

async function loadPersonalWords() {
  if (personalWords) {
    return personalWords;
  }

  const languagePath = getPersonalDictionaryPath(activeLanguage);
  let words = await readPersonalDictionaryFile(languagePath);
  if (!words && activeLanguage === DEFAULT_SPELL_LANGUAGE) {
    words = await readPersonalDictionaryFile(getLegacyPersonalDictionaryPath());
  }
  personalWords = words ?? new Set();
  return personalWords;
}

async function persistPersonalWords(words) {
  const dictionaryPath = getPersonalDictionaryPath(activeLanguage);
  const tempPath = `${dictionaryPath}.tmp`;
  await fs.mkdir(path.dirname(dictionaryPath), { recursive: true });
  await fs.writeFile(tempPath, JSON.stringify([...words], null, 2), "utf8");
  await fs.rename(tempPath, dictionaryPath);
}

function buildSpell(aff, dic) {
  const instance = nspell(aff, dic);
  spell = instance;
  spellPromise = null;
  personalWords = null;
  return loadPersonalWords().then((words) => {
    for (const word of words) {
      instance.personal(word);
    }
    return instance;
  });
}

async function readCachedDictionary(language) {
  const directory = getDictionaryCacheDir(language.code);
  const [aff, dic] = await Promise.all([
    fs.readFile(path.join(directory, "index.aff")),
    fs.readFile(path.join(directory, "index.dic"))
  ]);
  return { aff, dic };
}

// Codes whose dictionaries are available offline: the bundled English (US)
// plus every downloadable entry already cached. The e2e fixture directory
// (ASCIIDOC_TEST_SPELL_LANG_DIR) stands in for the cache exactly like in
// installDictionary, so tests exercise the same availability logic.
export async function listDownloadedSpellLanguages() {
  const codes = [];
  for (const language of SPELL_LANGUAGES) {
    if (language.bundled) {
      codes.push(language.code);
      continue;
    }
    const directory = process.env.ASCIIDOC_TEST_SPELL_LANG_DIR
      ? path.join(process.env.ASCIIDOC_TEST_SPELL_LANG_DIR, language.code)
      : getDictionaryCacheDir(language.code);
    try {
      await Promise.all([
        fs.access(path.join(directory, "index.aff")),
        fs.access(path.join(directory, "index.dic"))
      ]);
      codes.push(language.code);
    } catch {
      // Not downloaded yet.
    }
  }
  return codes;
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const request = net.request(url);
    const chunks = [];
    let received = 0;
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      request.abort();
      reject(new Error(`timed out after ${DOWNLOAD_TIMEOUT_MS}ms`));
    }, DOWNLOAD_TIMEOUT_MS);

    request.on("response", (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        settled = true;
        clearTimeout(timer);
        request.abort();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      response.on("data", (chunk) => {
        received += chunk.length;
        if (received > MAX_DICTIONARY_FILE_BYTES) {
          settled = true;
          clearTimeout(timer);
          request.abort();
          reject(new Error("file exceeds the 64 MB safety cap"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        if (settled) {
          return;
        }
        clearTimeout(timer);
        resolve(Buffer.concat(chunks));
      });
      response.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    request.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) {
        reject(error);
      }
    });
    request.end();
  });
}

async function installDictionary(language) {
  // e2e hook: CI must not depend on the CDN. When the env var points at a
  // directory, <dir>/<code>/index.aff|.dic stand in for the download and
  // everything downstream is identical.
  const testDir = process.env.ASCIIDOC_TEST_SPELL_LANG_DIR;
  if (testDir) {
    const [aff, dic] = await Promise.all([
      fs.readFile(path.join(testDir, language.code, "index.aff")),
      fs.readFile(path.join(testDir, language.code, "index.dic"))
    ]);
    return { aff, dic };
  }

  const directory = getDictionaryCacheDir(language.code);
  await fs.mkdir(directory, { recursive: true });

  const [aff, dic] = await Promise.all([
    downloadFile(`${DICTIONARY_CDN}/${language.packageName}@latest/index.aff`),
    downloadFile(`${DICTIONARY_CDN}/${language.packageName}@latest/index.dic`)
  ]);

  const affTemp = path.join(directory, "index.aff.tmp");
  const dicTemp = path.join(directory, "index.dic.tmp");
  await fs.writeFile(affTemp, aff);
  await fs.writeFile(dicTemp, dic);
  await fs.rename(affTemp, path.join(directory, "index.aff"));
  await fs.rename(dicTemp, path.join(directory, "index.dic"));
  return { aff, dic };
}

async function loadDictionaryBuffers(language) {
  if (language.bundled) {
    // dictionary-en is an ESM package with top-level await; it cannot be
    // require()d, only dynamically imported.
    const dictionary = (await import("dictionary-en")).default;
    return { aff: Buffer.from(dictionary.aff), dic: Buffer.from(dictionary.dic) };
  }

  try {
    return await readCachedDictionary(language);
  } catch {
    // Not cached yet: download once, then every later start reads the cache.
    return installDictionary(language);
  }
}

function getSpell() {
  if (spell) {
    return Promise.resolve(spell);
  }
  if (!spellPromise) {
    spellPromise = loadDictionaryBuffers(findSpellLanguage(activeLanguage))
      .then(({ aff, dic }) => buildSpell(aff, dic))
      .catch((error) => {
        spellPromise = null;
        throw error;
      });
  }
  return spellPromise;
}

export async function setSpellCheckLanguage(code) {
  const language = findSpellLanguage(code);
  if (!language) {
    return { error: "unknown-language" };
  }
  if (code === activeLanguage && spell) {
    return { language: code, status: "ready" };
  }

  const run = async () => {
    let buffers;
    try {
      buffers = await loadDictionaryBuffers(language);
    } catch (error) {
      return {
        error: "download-failed",
        message: error instanceof Error ? error.message : String(error),
        language: activeLanguage
      };
    }

    activeLanguage = code;
    await buildSpell(buffers.aff, buffers.dic);
    return { language: code, status: "ready" };
  };

  // A failed switch leaves the previous language's instance untouched, so
  // spell checking keeps working while the Settings status shows the error.
  return languageQueue.then(run, run);
}

export async function getActiveSpellLanguage() {
  return activeLanguage;
}

export async function checkWords(words) {
  if (!Array.isArray(words)) {
    return [];
  }

  const candidates = [...new Set(words.filter(isCheckableWord))].slice(0, MAX_BATCH_WORDS);
  if (candidates.length === 0) {
    return [];
  }

  const instance = await getSpell();
  const misspelled = [];
  for (const word of candidates) {
    if (!instance.correct(word)) {
      misspelled.push(word);
    }
  }
  return misspelled;
}

export async function suggestWords(word) {
  if (!isCheckableWord(word)) {
    return [];
  }

  const instance = await getSpell();
  return instance.suggest(word)
    .filter((suggestion) => typeof suggestion === "string")
    .slice(0, MAX_SUGGESTIONS);
}

export async function addPersonalWord(word) {
  if (!isCheckableWord(word)) {
    return { added: false };
  }

  const [instance, words] = await Promise.all([getSpell(), loadPersonalWords()]);
  const lowercase = word.toLowerCase();
  for (const existing of words) {
    if (existing.toLowerCase() === lowercase) {
      return { added: false };
    }
  }

  words.add(word);
  instance.personal(word);
  await persistPersonalWords(words);
  return { added: true };
}
