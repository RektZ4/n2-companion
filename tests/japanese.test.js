import test from "node:test";
import assert from "node:assert/strict";
import { cleanContext, cleanSelection, containsJapanese, hiraganaToKatakana, isSameReading } from "../lib/japanese.js";
import { getChineseBackgroundCue } from "../lib/cognates.js";

test("detects kana and kanji but not English", () => {
  assert.equal(containsJapanese("日本語"), true);
  assert.equal(containsJapanese("かな"), true);
  assert.equal(containsJapanese("hello"), false);
});
test("normalizes selected whitespace and limits its size", () => assert.equal(cleanSelection("  日本\n 語 ", 3), "日本語"));
test("truncates context with an ellipsis", () => assert.equal(cleanContext("123456", 5), "1234…"));
test("compares hiragana and katakana readings", () => assert.equal(isSameReading("かな", "カナ"), true));
test("provides a curated Chinese false-friend warning", () => assert.match(getChineseBackgroundCue("手紙"), /信件/));
