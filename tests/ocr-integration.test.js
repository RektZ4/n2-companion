import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createWorker } from "tesseract.js";
import { PNG } from "pngjs";
import { runOcrPipeline } from "../lib/ocr-pipeline.js";
import { cleanOcrText, textSimilarity } from "../lib/ocr-quality.js";

// End-to-end: real Tesseract + the preprocessing/ranking pipeline against
// synthetic fixtures (tests/fixtures/ocr) for the situations users hit:
// outlined captions, coloured text, ruled vertical columns, multi-column vertical.
const DATA = new URL("../node_modules/@tesseract.js-data/", import.meta.url).pathname;
const paths = { jpn: `${DATA}jpn/4.0.0_best_int`, jpn_vert: `${DATA}jpn_vert/4.0.0_best_int` };
const available = existsSync(`${paths.jpn}/jpn.traineddata.gz`) && existsSync(`${paths.jpn_vert}/jpn_vert.traineddata.gz`);

const cases = [
  ["horizontal-clean", "日本語の文章を読みます。", 0.95],
  ["light-on-dark", "明日は晴れるでしょう", 0.95],
  ["outlined-caption", "日本の街", 0.95],
  ["red-on-pale", "題名は、上を2〜3マスあけて書き始めます。", 0.95],
  ["vertical-ruled", "一組の大勝利", 0.9],
  ["vertical-two-columns", "春はあけぼのやうやう白く", 0.8]
];

function load(name) {
  const png = PNG.sync.read(readFileSync(new URL(`./fixtures/ocr/${name}.png`, import.meta.url)));
  return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
}
function encode(image) { const png = new PNG({ width: image.width, height: image.height }); png.data = Buffer.from(image.data); return PNG.sync.write(png); }

test("real OCR on fixtures", { skip: !available && "Tesseract language data not installed", timeout: 120000 }, async (t) => {
  const workers = { jpn: await createWorker("jpn", 1, { langPath: paths.jpn, cacheMethod: "none" }), jpn_vert: await createWorker("jpn_vert", 1, { langPath: paths.jpn_vert, cacheMethod: "none" }) };
  const engine = {
    async recognize(model, image, psm) {
      await workers[model].setParameters({ tessedit_pageseg_mode: String(psm), preserve_interword_spaces: "1" });
      const { data } = await workers[model].recognize(encode(image), {}, { blocks: true });
      const symbols = (data.blocks || []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words.flatMap((w) => w.symbols))));
      return { text: data.text, confidence: data.confidence, symbols };
    }
  };
  try {
    for (const [name, expected, minimum] of cases) {
      await t.test(name, async () => {
        const ranked = await runOcrPipeline(load(name), engine);
        const text = cleanOcrText(ranked[0]?.text).replace(/\s/g, "");
        const similarity = textSimilarity(text, expected);
        assert.ok(similarity >= minimum, `${name}: read "${text}", expected "${expected}" (similarity ${similarity.toFixed(2)})`);
      });
    }
  } finally { await Promise.all(Object.values(workers).map((worker) => worker.terminate())); }
});
