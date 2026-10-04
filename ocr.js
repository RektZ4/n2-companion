import { createWorker } from "./vendor/tesseract/tesseract.esm.min.js";

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
    corePath: chrome.runtime.getURL("vendor/tesseract"),
    langPath: chrome.runtime.getURL("vendor/tesseract/lang"),
    logger: ({ status, progress: value }) => { progress.textContent = `${status} ${Math.round((value || 0) * 100)}%`; }
  });
  const { data } = await worker.recognize(canvas);
  await worker.terminate();
  recognized.value = data.text.replace(/\s+/g, " ").trim();
  lookupButton.disabled = !recognized.value;
  progress.textContent = `OCR complete · ${Math.round(data.confidence)}% confidence`;
} catch (error) {
  progress.textContent = "OCR failed";
  recognized.value = `OCR error: ${error.message}`;
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
    article.innerHTML = `<h2><span class="word"></span> <small class="reading-inline"></small></h2><p class="definition"></p><p class="pdf-cue" hidden></p><button class="primary">Save card with screenshot</button>`;
    article.querySelector(".word").textContent = entry.term; article.querySelector(".reading-inline").textContent = entry.reading ? `【${entry.reading}】` : ""; article.querySelector(".definition").textContent = meanings.join("; ");
    const cue = article.querySelector(".pdf-cue"); if (entry.chineseCue) { cue.textContent = entry.chineseCue; cue.hidden = false; }
    article.querySelector("button").addEventListener("click", async (event) => {
      const screenshot = canvas.toDataURL("image/jpeg", 0.82);
      const result = await chrome.runtime.sendMessage({ type: "N2_SAVE_CARD", card: { term: entry.term, reading: entry.reading, meanings, partsOfSpeech, context: recognized.value.trim(), sourceUrl: ocrCapture.sourceUrl, sourceTitle: ocrCapture.sourceTitle, sourceType: "ocr", screenshot, tags: entry.jlpt.length ? entry.jlpt.map((tag) => tag.toUpperCase()) : ["N2"], notes: entry.chineseCue || "" } });
      event.currentTarget.textContent = result?.duplicate ? "Already saved" : "Saved with screenshot ✓"; event.currentTarget.disabled = true;
    });
    results.appendChild(article);
  }
}
