import test from "node:test";
import assert from "node:assert/strict";
import { cleanOcrText, rankOcrCandidates, readingOrderScore, scoreOcrCandidate, textSimilarity } from "../lib/ocr-quality.js";

const sym = (text, x, y, size = 20, confidence = 90) => ({ text, confidence, bbox: { x0: x, y0: y, x1: x + size, y1: y + size } });
const row = (text, y = 0) => [...text].map((ch, i) => sym(ch, i * 22, y));
const column = (text, x = 0) => [...text].map((ch, i) => sym(ch, x, i * 22));

test("restores the wave dash Tesseract reads as ご / へ / ー between numbers", () => {
  assert.equal(cleanOcrText("上を2ご3マス"), "上を2〜3マス");
  assert.equal(cleanOcrText("2へー3"), "2〜3");
  assert.equal(cleanOcrText("ごはんを食べる"), "ごはんを食べる");
  assert.equal(cleanOcrText("ビー玉 3個"), "ビー玉 3個");
});
test("drops ruled-line and border noise", () => assert.equal(cleanOcrText("| 一 組 の |"), "一組の"));

test("reading order: natural horizontal and vertical paths score fully", () => {
  assert.equal(readingOrderScore(row("日本語の文章")), 1);
  assert.equal(readingOrderScore(column("日本語の文章")), 1);
});
test("reading order: wrapping to the next row / column is natural", () => {
  assert.equal(readingOrderScore([...row("日本語", 0), ...row("の文章", 40)]), 1);
  assert.equal(readingOrderScore([...column("春はあけ", 60), ...column("やうやう", 20)]), 1);
});
test("reading order: a vertical model zig-zagging across two horizontal rows scores low", () => {
  const top = row("日本語の", 0); const bottom = row("文章を読", 40);
  const zigzag = [top[3], bottom[3], top[2], bottom[2], top[1], bottom[1], top[0], bottom[0]];
  assert.ok(readingOrderScore(zigzag) <= 0.6);
});
test("reading order: too little geometry is neutral", () => assert.equal(readingOrderScore(row("日本")), 1));

test("text similarity", () => {
  assert.equal(textSimilarity("日本語", "日本語"), 1);
  assert.equal(textSimilarity("", "日本語"), 0);
  assert.ok(textSimilarity("組の大勝利", "一組の大勝利") > 0.9);
});

test("a scrambled high-confidence candidate loses to an ordered one", () => {
  const ordered = { text: "日本語の文章を読", confidence: 80, symbols: [...row("日本語の", 0), ...row("文章を読", 40)] };
  const top = row("日本語の", 0); const bottom = row("文章を読", 40);
  const zigzag = [top[3], bottom[3], top[2], bottom[2], top[1], bottom[1], top[0], bottom[0]].map((s) => ({ ...s, confidence: 95 }));
  const scrambled = { text: "の読語を本章日文", confidence: 95, symbols: zigzag };
  assert.ok(scoreOcrCandidate(ordered) > scoreOcrCandidate(scrambled));
});
test("consensus favours the reading most candidates agree on", () => {
  const ranked = rankOcrCandidates([
    { text: "題名は、上を2〜3マス", confidence: 80, mode: "a" },
    { text: "題名は、上を2〜3マス", confidence: 78, mode: "b" },
    { text: "馬名は、上を2へ3マス", confidence: 84, mode: "c" }
  ]);
  assert.equal(ranked[0].text, "題名は、上を2〜3マス");
});
test("empty or non-text candidates are dropped from the ranking", () => assert.deepEqual(rankOcrCandidates([{ text: "|||", confidence: 90 }, { text: "", confidence: 50 }]), []));
