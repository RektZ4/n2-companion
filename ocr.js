import Tesseract from "./vendor/tesseract/tesseract.esm.min.js";
import { errorMessage } from "./lib/errors.js";
import { appendFurigana } from "./lib/render.js";
import { cleanOcrText } from "./lib/ocr-quality.js";
import { runOcrPipeline } from "./lib/ocr-pipeline.js";

const { createWorker } = Tesseract;

const params = new URLSearchParams(location.search);
const id = params.get("id");
const crop = JSON.parse(params.get("crop") || "null");
const { ocrCapture } = await chrome.storage.session.get("ocrCapture");
if (!ocrCapture || ocrCapture.id !== id || !crop) throw new Error("OCR capture expired. Try the shortcut again.");

const canvas = document.querySelector("#crop");
const context = canvas.getContext("2d", { willReadFrequently: true });
const image = new Image();
await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = ocrCapture.screenshot; });
canvas.width = crop.width; canvas.height = crop.height;
context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);

const progress = document.querySelector("#progress");
const recognized = document.querySelector("#recognized");
const lookupButton = document.querySelector("#lookup");
const alternatives = document.querySelector("#alternatives");
let progressLabel = "Preparing OCR";

// One Tesseract worker per model, created on first use. "jpn" reads horizontal
// text and single glyph columns; "jpn_vert" is the vertical-writing model.
const workers = new Map();
function getWorker(model) {
  if (!workers.has(model)) {
    workers.set(model, createWorker(model, 1, {
      workerPath: chrome.runtime.getURL("vendor/tesseract/worker.min.js"),
      workerBlobURL: false,
      corePath: chrome.runtime.getURL("vendor/tesseract"),
      langPath: chrome.runtime.getURL("vendor/tesseract/lang"),
      logger: ({ status, progress: value }) => { progress.textContent = `${progressLabel} · ${status} ${Math.round((value || 0) * 100)}%`; }
    }));
  }
  return workers.get(model);
}

const engine = {
  async recognize(model, image, pageSegmentationMode) {
    const worker = await getWorker(model);
    await worker.setParameters({ tessedit_pageseg_mode: String(pageSegmentationMode), preserve_interword_spaces: "1" });
    const input = document.createElement("canvas"); input.width = image.width; input.height = image.height;
    input.getContext("2d").putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
    const { data } = await worker.recognize(input, {}, { blocks: true });
    const symbols = (data.blocks || []).flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words.flatMap((word) => word.symbols))));
    return { text: data.text, confidence: data.confidence, symbols };
  }
};

try {
  const source = context.getImageData(0, 0, canvas.width, canvas.height);
  const ranked = await runOcrPipeline(source, engine, {
    onStatus: ({ variant, model, column, columns }) => { progressLabel = column ? `Column ${column}/${columns}` : `Reading (${variant}, ${model === "jpn_vert" ? "vertical" : "horizontal"})`; progress.textContent = `${progressLabel}…`; }
  });
  const best = ranked[0];
  recognized.value = cleanOcrText(best?.text);
  lookupButton.disabled = !recognized.value;
  showAlternatives(ranked, recognized.value);
  progress.textContent = `OCR complete · ${Math.round(best?.confidence || 0)}% confidence · ${best?.mode || "automatic"}`;
} catch (error) {
  progress.textContent = "OCR failed";
  recognized.value = `OCR error: ${errorMessage(error)}`;
} finally {
  for (const pending of workers.values()) pending.then((worker) => worker.terminate()).catch(() => {});
}

// Offer the other distinct readings so a near-miss can be fixed in one click.
function showAlternatives(ranked, chosen) {
  const seen = new Set([chosen]); const options = [];
  for (const candidate of ranked) {
    const text = cleanOcrText(candidate.text);
    if (!text || seen.has(text) || !/[\u3040-\u30ff\u3400-\u9fff]/u.test(text)) continue;
    seen.add(text); options.push(text);
    if (options.length === 3) break;
  }
  alternatives.replaceChildren();
  alternatives.hidden = !options.length;
  if (!options.length) return;
  const label = document.createElement("span"); label.textContent = "Other readings:"; alternatives.append(label);
  for (const text of options) {
    const chip = document.createElement("button"); chip.type = "button"; chip.className = "chip"; chip.textContent = text;
    chip.addEventListener("click", () => { recognized.value = text; lookupButton.disabled = false; });
    alternatives.append(chip);
  }
}

recognized.addEventListener("input", () => { lookupButton.disabled = !recognized.value.trim(); });
document.querySelector("#retry").addEventListener("click", () => { location.href = `capture.html?id=${encodeURIComponent(id)}`; });
lookupButton.addEventListener("click", async () => {
  const selected = recognized.value.substring(recognized.selectionStart, recognized.selectionEnd).trim() || recognized.value.trim();
  const response = await chrome.runtime.sendMessage({ type: "N2_DICTIONARY_LOOKUP", text: selected });
  renderResults(response, selected);
});

function renderResults(response, selected) {
  const results = document.querySelector("#results"); results.replaceChildren();
  if (!response?.ok || !response.entries.length) { results.className = "card empty"; results.textContent = response?.error || "No dictionary entry found. Select a shorter word in the OCR text."; return; }
  results.className = "card";
  for (const entry of response.entries) {
    const meanings = entry.senses.flatMap((sense) => sense.meanings).slice(0, 5);
    const partsOfSpeech = [...new Set(entry.senses.flatMap((sense) => sense.partsOfSpeech))].slice(0, 3);
    const article = document.createElement("article"); article.className = "lookup-card";
    article.innerHTML = `<h2><span class="word"></span> <small class="reading-inline"></small></h2><p class="definition"></p><p class="example" hidden></p><p class="pdf-cue" hidden></p><button class="primary">Save card with screenshot</button>`;
    appendFurigana(article.querySelector(".word"), entry.furigana, entry.term); article.querySelector(".reading-inline").textContent = entry.furigana?.length ? "" : (entry.reading ? `【${entry.reading}】` : ""); article.querySelector(".definition").textContent = meanings.join("; ");
    const example = article.querySelector(".example"); if (entry.example) { example.textContent = `${entry.example.japanese} — ${entry.example.english}`; example.hidden = false; }
    const cue = article.querySelector(".pdf-cue"); if (entry.chineseCue) { cue.textContent = entry.chineseCue; cue.hidden = false; }
    article.querySelector("button").addEventListener("click", async (event) => {
      const screenshot = canvas.toDataURL("image/jpeg", 0.82);
      const result = await chrome.runtime.sendMessage({ type: "N2_SAVE_CARD", card: { term: entry.term, reading: entry.reading, meanings, partsOfSpeech, context: recognized.value.trim(), sourceUrl: ocrCapture.sourceUrl, sourceTitle: ocrCapture.sourceTitle, sourceType: "ocr", screenshot, tags: entry.jlpt.length ? entry.jlpt.map((tag) => tag.toUpperCase()) : ["N2"], notes: entry.chineseCue || "", furigana: entry.furigana, example: entry.example } });
      event.currentTarget.textContent = result?.duplicate ? "Added another encounter ✓" : "Saved with screenshot ✓"; event.currentTarget.disabled = true;
    });
    results.appendChild(article);
  }
  loadTopExample(response.entries[0], results.querySelector(".lookup-card .example"));
}

async function loadTopExample(entry, element) {
  const response = await chrome.runtime.sendMessage({ type: "N2_EXAMPLE_LOOKUP", term: entry.term }).catch(() => null);
  if (!response?.example || !element?.isConnected) return;
  entry.example = response.example;
  element.textContent = `${entry.example.japanese} — ${entry.example.english}`;
  element.hidden = false;
}
