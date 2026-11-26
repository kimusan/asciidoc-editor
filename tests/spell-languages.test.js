import test from "node:test";
import assert from "node:assert/strict";
import {
  SPELL_LANGUAGES,
  DEFAULT_SPELL_LANGUAGE,
  findSpellLanguage,
  normalizeSpellLanguageValue
} from "../electron/spell-languages.js";

test("spell language catalog has unique codes with npm package names", () => {
  const codes = SPELL_LANGUAGES.map((language) => language.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const language of SPELL_LANGUAGES) {
    assert.match(language.code, /^[a-z]{2}(-[A-Z]{2})?$/, language.code);
    assert.match(language.packageName, /^dictionary-[a-z-]+$/, language.packageName);
    assert.equal(typeof language.name, "string");
    assert.ok(language.name.length > 0);
  }
});

test("English (US) is the bundled default language", () => {
  const bundled = SPELL_LANGUAGES.filter((language) => language.bundled);
  assert.equal(bundled.length, 1);
  assert.equal(bundled[0].code, DEFAULT_SPELL_LANGUAGE);
  assert.equal(DEFAULT_SPELL_LANGUAGE, "en-US");
});

test("findSpellLanguage resolves catalog entries only", () => {
  assert.equal(findSpellLanguage("da")?.packageName, "dictionary-da");
  assert.equal(findSpellLanguage("en-GB")?.packageName, "dictionary-en-gb");
  assert.equal(findSpellLanguage("xx"), null);
  assert.equal(findSpellLanguage("../../etc"), null);
});

test("normalizeSpellLanguageValue falls back to English (US)", () => {
  assert.equal(normalizeSpellLanguageValue("de"), "de");
  assert.equal(normalizeSpellLanguageValue("nope"), DEFAULT_SPELL_LANGUAGE);
  assert.equal(normalizeSpellLanguageValue(""), DEFAULT_SPELL_LANGUAGE);
  assert.equal(normalizeSpellLanguageValue(null), DEFAULT_SPELL_LANGUAGE);
  assert.equal(normalizeSpellLanguageValue(42), DEFAULT_SPELL_LANGUAGE);
});
