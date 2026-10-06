import test from "node:test";
import assert from "node:assert/strict";
import { cleanContext, cleanSelection, containsJapanese, hiraganaToKatakana, isSameReading } from "../lib/japanese.js";
import { getChineseBackgroundCue } from "../lib/cognates.js";
import { buildLookupQueries } from "../lib/lookup-query.js";
import { errorMessage } from "../lib/errors.js";
import { segmentFurigana } from "../lib/furigana.js";
import { bestOcrCandidate, cleanOcrText } from "../lib/ocr-quality.js";

test("detects kana and kanji but not English", () => {
  assert.equal(containsJapanese("日本語"), true);
  assert.equal(containsJapanese("かな"), true);
  assert.equal(containsJapanese("hello"), false);
});
test("normalizes selected whitespace and limits its size", () => assert.equal(cleanSelection("  日本\n 語 ", 3), "日本語"));
test("truncates context with an ellipsis", () => assert.equal(cleanContext("123456", 5), "1234…"));
test("compares hiragana and katakana readings", () => assert.equal(isSameReading("かな", "カナ"), true));
test("provides a curated Chinese false-friend warning", () => assert.match(getChineseBackgroundCue("手紙"), /信件/));
test("converts complete romaji to hiragana before lookup", () => assert.deepEqual(buildLookupQueries("oshiroi"), ["おしろい", "oshiroi"]));
test("preserves Japanese queries", () => assert.deepEqual(buildLookupQueries("白粉"), ["白粉"]));
test("leaves ordinary incomplete English as an English query", () => assert.deepEqual(buildLookupQueries("book"), ["book"]));
test("shows Error messages and plain-text worker failures", () => {
  assert.equal(errorMessage(new Error("worker failed")), "worker failed");
  assert.equal(errorMessage("worker blocked"), "worker blocked");
});
test("aligns kana around kanji without inventing character readings", () => {
  assert.deepEqual(segmentFurigana("食べる", "たべる"), [{ text: "食", reading: "た" }, { text: "べる", reading: "" }]);
  assert.deepEqual(segmentFurigana("小麦粉", "こむぎこ"), [{ text: "小麦粉", reading: "こむぎこ" }]);
});

test("OCR cleanup removes recognition noise without removing Japanese", () => {
  assert.equal(cleanOcrText("柳 仁 $ ∃ ♫ 二着 放 が"), "柳仁二着放が");
  assert.equal(cleanOcrText("人々 の 暮らし"), "人々の暮らし");
});

test("OCR selection favors Japanese-rich candidates", () => {
  const best = bestOcrCandidate([{ text: "A $ 3", confidence: 80 }, { text: "移住", confidence: 65 }]);
  assert.equal(best.text, "移住");
});
