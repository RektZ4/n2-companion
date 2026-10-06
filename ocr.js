import Tesseract from "./vendor/tesseract/tesseract.esm.min.js";
import { errorMessage } from "./lib/errors.js";
import { appendFurigana } from "./lib/render.js";
import { bestOcrCandidate, cleanOcrText, scoreOcrCandidate } from "./lib/ocr-quality.js";

const { createWorker, PSM } = Tesseract;

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
try {
  const worker = await createWorker("jpn", 1, {
    workerPath: chrome.runtime.getURL("vendor/tesseract/worker.min.js"),
    workerBlobURL: false,
    corePath: chrome.runtime.getURL("vendor/tesseract"),
    langPath: chrome.runtime.getURL("vendor/tesseract/lang"),
    logger: ({ status, progress: value }) => { progress.textContent = `${status} ${Math.round((value || 0) * 100)}%`; }
  });
  const enhanced = makeEnhancedCanvas(canvas);
  const verticalFirst = crop.height > crop.width * 1.25;
  const candidates = [];
  await recognizeCandidate(worker, enhanced, verticalFirst ? PSM.SINGLE_BLOCK_VERT_TEXT : PSM.SINGLE_BLOCK, candidates, "enhanced");
  if (scoreOcrCandidate(candidates[0]) < 105) {
    await recognizeCandidate(worker, canvas, PSM.SINGLE_BLOCK, candidates, "original");
    await recognizeCandidate(worker, enhanced, PSM.SINGLE_BLOCK_VERT_TEXT, candidates, "vertical");
  }
  await worker.terminate();
  const best = bestOcrCandidate(candidates);
  recognized.value = cleanOcrText(best?.text);
  lookupButton.disabled = !recognized.value;
  progress.textContent = `OCR complete · ${Math.round(best?.confidence || 0)}% confidence · ${best?.mode || "automatic"} mode`;
} catch (error) {
  progress.textContent = "OCR failed";
  recognized.value = `OCR error: ${errorMessage(error)}`;
}

async function recognizeCandidate(worker, input, pageSegmentationMode, candidates, mode) {
  await worker.setParameters({ tessedit_pageseg_mode: pageSegmentationMode, preserve_interword_spaces: "1" });
  const { data } = await worker.recognize(input);
  candidates.push({ text: data.text, confidence: data.confidence, mode });
}

function makeEnhancedCanvas(source) {
  const scale = Math.max(2, Math.min(4, 900 / Math.max(source.width, source.height)));
  const padding = 18;
  const output = document.createElement("canvas");
  output.width = Math.round(source.width * scale) + padding * 2;
  output.height = Math.round(source.height * scale) + padding * 2;
  const outputContext = output.getContext("2d", { willReadFrequently: true });
  outputContext.fillStyle = "white"; outputContext.fillRect(0, 0, output.width, output.height);
  outputContext.imageSmoothingEnabled = true;
  outputContext.drawImage(source, padding, padding, output.width - padding * 2, output.height - padding * 2);
  const imageData = outputContext.getImageData(0, 0, output.width, output.height);
  const histogram = new Array(256).fill(0);
  for (let index = 0; index < imageData.data.length; index += 4) {
    const gray = Math.round(imageData.data[index] * 0.299 + imageData.data[index + 1] * 0.587 + imageData.data[index + 2] * 0.114);
    imageData.data[index] = gray; histogram[gray] += 1;
  }
  const threshold = otsuThreshold(histogram, output.width * output.height);
  for (let index = 0; index < imageData.data.length; index += 4) {
    const value = imageData.data[index] < threshold ? 0 : 255;
    imageData.data[index] = value; imageData.data[index + 1] = value; imageData.data[index + 2] = value; imageData.data[index + 3] = 255;
  }
  outputContext.putImageData(imageData, 0, 0);
  return output;
}

function otsuThreshold(histogram, total) {
  let sum = 0; for (let value = 0; value < 256; value += 1) sum += value * histogram[value];
  let backgroundWeight = 0; let backgroundSum = 0; let maximum = 0; let threshold = 128;
  for (let value = 0; value < 256; value += 1) {
    backgroundWeight += histogram[value]; if (!backgroundWeight) continue;
    const foregroundWeight = total - backgroundWeight; if (!foregroundWeight) break;
    backgroundSum += value * histogram[value];
    const difference = backgroundSum / backgroundWeight - (sum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * difference * difference;
    if (variance > maximum) { maximum = variance; threshold = value; }
  }
  return threshold;
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
