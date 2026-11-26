// Spell check language catalog, shared by the renderer (Settings picker)
// and the main process (spell-service validation + downloads). Pure data:
// no Electron or node imports so both sides can bundle it.
//
// packageName is the npm package on cdn.jsdelivr.net that serves
// index.aff/index.dic. Every downloadable entry below was verified to
// resolve on the CDN (dictionary-fi/id/ar/ms/hi/th do not exist in the
// wooorm/dictionaries set and must not be listed).

export const SPELL_LANGUAGES = [
  { code: "en-US", name: "English (United States)", packageName: "dictionary-en", bundled: true },
  { code: "en-GB", name: "English (United Kingdom)", packageName: "dictionary-en-gb" },
  { code: "da", name: "Danish", packageName: "dictionary-da" },
  { code: "de", name: "German", packageName: "dictionary-de" },
  { code: "es", name: "Spanish", packageName: "dictionary-es" },
  { code: "fr", name: "French", packageName: "dictionary-fr" },
  { code: "it", name: "Italian", packageName: "dictionary-it" },
  { code: "nl", name: "Dutch", packageName: "dictionary-nl" },
  { code: "sv", name: "Swedish", packageName: "dictionary-sv" },
  { code: "nb", name: "Norwegian (Bokmål)", packageName: "dictionary-nb" },
  { code: "nn", name: "Norwegian (Nynorsk)", packageName: "dictionary-nn" },
  { code: "pl", name: "Polish", packageName: "dictionary-pl" },
  { code: "cs", name: "Czech", packageName: "dictionary-cs" },
  { code: "ru", name: "Russian", packageName: "dictionary-ru" },
  { code: "uk", name: "Ukrainian", packageName: "dictionary-uk" },
  { code: "tr", name: "Turkish", packageName: "dictionary-tr" },
  { code: "el", name: "Greek", packageName: "dictionary-el" },
  { code: "hu", name: "Hungarian", packageName: "dictionary-hu" },
  { code: "ro", name: "Romanian", packageName: "dictionary-ro" },
  { code: "bg", name: "Bulgarian", packageName: "dictionary-bg" },
  { code: "hr", name: "Croatian", packageName: "dictionary-hr" },
  { code: "sl", name: "Slovenian", packageName: "dictionary-sl" },
  { code: "sk", name: "Slovak", packageName: "dictionary-sk" },
  { code: "lt", name: "Lithuanian", packageName: "dictionary-lt" },
  { code: "lv", name: "Latvian", packageName: "dictionary-lv" },
  { code: "et", name: "Estonian", packageName: "dictionary-et" },
  { code: "is", name: "Icelandic", packageName: "dictionary-is" },
  { code: "he", name: "Hebrew", packageName: "dictionary-he" },
  { code: "fa", name: "Persian", packageName: "dictionary-fa" },
  { code: "vi", name: "Vietnamese", packageName: "dictionary-vi" },
  { code: "ko", name: "Korean", packageName: "dictionary-ko" }
];

export const DEFAULT_SPELL_LANGUAGE = "en-US";

export function findSpellLanguage(code) {
  return SPELL_LANGUAGES.find((language) => language.code === code) ?? null;
}

export function normalizeSpellLanguageValue(code) {
  return findSpellLanguage(typeof code === "string" ? code : null)
    ? code
    : DEFAULT_SPELL_LANGUAGE;
}
