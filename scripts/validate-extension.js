import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";

const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
if (manifest.manifest_version !== 3) throw new Error("manifest.json must use Manifest V3");
const paths = [manifest.background.service_worker, manifest.action.default_popup, manifest.options_page, "lookup.html", "lookup.js", "review.html", "review.js", "library.html", "library.js", "capture.html", "capture.js", "ocr.html", "ocr.js", "pdf-reader.html", "pdf-reader.js", "lib/furigana.js", "lib/render.js", "vendor/pdfjs/pdf.min.mjs", "vendor/pdfjs/pdf.worker.min.mjs", "vendor/tesseract/tesseract.esm.min.js", "vendor/tesseract/worker.min.js", "vendor/tesseract/tesseract-core.wasm.js", "vendor/tesseract/tesseract-core-simd.wasm.js", "vendor/tesseract/tesseract-core-simd-lstm.wasm.js", "vendor/tesseract/tesseract-core-relaxedsimd.wasm.js", "vendor/tesseract/tesseract-core-relaxedsimd-lstm.wasm.js", "vendor/tesseract/lang/jpn.traineddata.gz", "vendor/wanakana/index.js", ...manifest.content_scripts.flatMap((entry) => entry.js)];
for (const path of paths) await access(new URL(`../${path}`, import.meta.url), constants.R_OK);
if (!manifest.host_permissions.includes("https://jisho.org/*")) throw new Error("Jisho host permission is missing");
if (!manifest.host_permissions.includes("https://api.tatoeba.org/*")) throw new Error("Tatoeba host permission is missing");
const readerSource = await readFile(new URL("../pdf-reader.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
for (const marker of ["streamTextContent", "includeMarkedContent", "disableNormalization", "--scale-factor", "event.ctrlKey", "passive: false"]) {
  if (!readerSource.includes(marker) && !styles.includes(marker)) throw new Error(`PDF text-layer integration is missing ${marker}`);
}
console.log(`Validated ${manifest.name} v${manifest.version}: ${paths.length} entry points found.`);
