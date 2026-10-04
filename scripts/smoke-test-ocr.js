import { resolve } from "node:path";
import { createWorker } from "tesseract.js";

const imagePath = process.argv[2];
if (!imagePath) throw new Error("Usage: node scripts/smoke-test-ocr.js <image>");
const worker = await createWorker("jpn", 1, { langPath: resolve("node_modules/@tesseract.js-data/jpn/4.0.0_best_int") });
const { data } = await worker.recognize(resolve(imagePath));
await worker.terminate();
const text = data.text.replace(/\s+/g, " ").trim();
console.log(`OCR_SMOKE confidence=${Math.round(data.confidence)} text=${text}`);
if (!/[\u3040-\u30ff\u3400-\u9fff]/u.test(text)) throw new Error("OCR smoke test did not recognize Japanese text");
