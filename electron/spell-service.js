// Hunspell-backed spell check service for the renderer. The dictionary is
// loaded lazily so the app never pays the nspell init cost unless the spell
// check setting is actually used, and words the writer adds are persisted to
// spell-dictionary.json in userData (written atomically like state.json).

import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import nspell from "nspell";

// Words the renderer is allowed to ask about: 2-80 chars of letters with
// internal apostrophes or hyphens. Anything else is rejected instead of
// being handed to hunspell.
const WORD_PATTERN = /^[A-Za-z][A-Za-z'’-]*[A-Za-z]$/;
const MAX_BATCH_WORDS = 500;
const MAX_SUGGESTIONS = 5;

let spell = null;
let spellPromise = null;
let personalWords = null;

function getDictionaryPath() {
  return path.join(app.getPath("userData"), "spell-dictionary.json");
}

function isCheckableWord(word) {
  return typeof word === "string" && word.length >= 2 && word.length <= 80 && WORD_PATTERN.test(word);
}

async function loadPersonalWords() {
  if (personalWords) {
    return personalWords;
  }

  try {
    const content = await fs.readFile(getDictionaryPath(), "utf8");
    const parsed = JSON.parse(content);
    personalWords = new Set(Array.isArray(parsed) ? parsed.filter((word) => isCheckableWord(word)) : []);
  } catch {
    // Missing or unreadable file: start from an empty personal dictionary.
    personalWords = new Set();
  }
  return personalWords;
}

async function persistPersonalWords(words) {
  const dictionaryPath = getDictionaryPath();
  const tempPath = `${dictionaryPath}.tmp`;
  await fs.mkdir(path.dirname(dictionaryPath), { recursive: true });
  await fs.writeFile(tempPath, JSON.stringify([...words], null, 2), "utf8");
  await fs.rename(tempPath, dictionaryPath);
}

async function getSpell() {
  if (spell) {
    return spell;
  }

  if (!spellPromise) {
    spellPromise = (async () => {
      // Loaded dynamically so startup never reads the ~550 KB dictionary
      // until the first spell check request arrives (dictionary-en is a
      // top-level-await module, which dynamic import handles fine).
      const dictionary = (await import("dictionary-en")).default;
      const instance = nspell(Buffer.from(dictionary.aff), Buffer.from(dictionary.dic));
      for (const word of await loadPersonalWords()) {
        instance.personal(word);
      }
      spell = instance;
      return instance;
    })();
  }
  return spellPromise;
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
