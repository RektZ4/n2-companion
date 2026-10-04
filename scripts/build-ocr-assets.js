import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "vendor/tesseract");
const wanakanaOutput = resolve(root, "vendor/wanakana");
await rm(output, { recursive: true, force: true });
await rm(wanakanaOutput, { recursive: true, force: true });
await mkdir(resolve(output, "lang"), { recursive: true });
await mkdir(wanakanaOutput, { recursive: true });

const files = [
  ["node_modules/tesseract.js/dist/tesseract.esm.min.js", "tesseract.esm.min.js"],
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["node_modules/tesseract.js/LICENSE.md", "TESSERACT_JS_LICENSE.md"],
  ["node_modules/tesseract.js-core/tesseract-core.wasm.js", "tesseract-core.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd.wasm.js", "tesseract-core-simd.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/LICENSE", "TESSERACT_CORE_LICENSE"],
  ["node_modules/@tesseract.js-data/jpn/4.0.0_best_int/jpn.traineddata.gz", "lang/jpn.traineddata.gz"],
  ["node_modules/@tesseract.js-data/jpn/README.md", "JPN_DATA_README.md"]
];
for (const [from, to] of files) await cp(resolve(root, from), resolve(output, to));
await cp(resolve(root, "node_modules/wanakana/esm/index.js"), resolve(wanakanaOutput, "index.js"));
await cp(resolve(root, "node_modules/wanakana/LICENSE"), resolve(wanakanaOutput, "LICENSE"));
console.log(`Copied ${files.length} local OCR assets to vendor/tesseract.`);
