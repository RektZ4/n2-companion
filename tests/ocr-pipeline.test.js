import test from "node:test";
import assert from "node:assert/strict";
import { buildVariants, runOcrPipeline } from "../lib/ocr-pipeline.js";
import { makeImage } from "../lib/ocr-preprocess.js";

function paint(image, x0, y0, w, h, rgb) {
  for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) { const o = (y * image.width + x) * 4; image.data[o] = rgb[0]; image.data[o + 1] = rgb[1]; image.data[o + 2] = rgb[2]; }
}
const sym = (text, i) => ({ text, confidence: 90, bbox: { x0: 0, y0: i * 22, x1: 20, y1: i * 22 + 20 } });
const fake = (answers, calls = []) => ({ async recognize(model, image, psm) { calls.push({ model, psm, width: image.width }); const text = answers[model] ?? ""; return { text, confidence: 80, symbols: [...text].map(sym) }; } });

test("builds gray, colour and fill variants with padding", () => {
  const image = makeImage(40, 120); paint(image, 10, 20, 20, 60, [0, 0, 0]);
  const names = buildVariants(image).map((v) => v.name);
  assert.deepEqual(names.slice(0, 2), ["gray", "color"]);
  assert.ok(buildVariants(image).every((v) => v.image.width > 40));
});

test("tall crops are read with both models; vertical mode is PSM 5, block mode PSM 6", async () => {
  const image = makeImage(40, 120); paint(image, 10, 20, 20, 60, [0, 0, 0]);
  const calls = []; const ranked = await runOcrPipeline(image, fake({ jpn: "自己紹介", jpn_vert: "自己紹介" }, calls));
  assert.ok(calls.some((c) => c.model === "jpn" && c.psm === 6));
  assert.ok(calls.some((c) => c.model === "jpn_vert" && c.psm === 5));
  assert.equal(ranked[0].text, "自己紹介");
});
test("clearly wide crops skip the vertical model", async () => {
  const image = makeImage(300, 40); paint(image, 10, 10, 280, 20, [0, 0, 0]);
  const calls = []; await runOcrPipeline(image, fake({ jpn: "日本語", jpn_vert: "xx" }, calls));
  assert.ok(!calls.some((c) => c.model === "jpn_vert"));
});
test("two tall columns are read separately and joined right to left", async () => {
  const image = makeImage(120, 200); paint(image, 15, 10, 28, 180, [0, 0, 0]); paint(image, 75, 10, 28, 180, [0, 0, 0]);
  const seen = [];
  const engine = { async recognize(model, img) { seen.push(img.width); return { text: seen.length <= 8 ? "右列" : "左列", confidence: 80, symbols: [] }; } };
  const ranked = await runOcrPipeline(image, engine);
  assert.equal(ranked.length, 1); assert.equal(ranked[0].text, "右列 左列"); assert.match(ranked[0].mode, /2 columns/);
  assert.ok(seen.every((width) => width < 120 * 3)); // column crops, not the whole image
});
test("a failing variant does not abort the run; total failure surfaces the error", async () => {
  const image = makeImage(300, 40); paint(image, 10, 10, 280, 20, [0, 0, 0]);
  let n = 0; const flaky = { async recognize() { n += 1; if (n === 1) throw new Error("boom"); return { text: "日本語", confidence: 80, symbols: [] }; } };
  assert.equal((await runOcrPipeline(image, flaky))[0].text, "日本語");
  await assert.rejects(runOcrPipeline(image, { async recognize() { throw new Error("dead"); } }), /dead/);
});
