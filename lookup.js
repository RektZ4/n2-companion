import { appendFurigana } from "./lib/render.js";

const params = new URLSearchParams(location.search);
const selected = params.get("text") || "";
const sourceUrl = params.get("sourceUrl") || "";
const sourceTitle = params.get("sourceTitle") || "PDF";
document.querySelector("#selected").textContent = selected;

const status = document.querySelector("#status");
const response = await chrome.runtime.sendMessage({ type: "N2_DICTIONARY_LOOKUP", text: selected });
if (!response?.ok) {
  status.textContent = response?.error || "Lookup failed.";
} else if (!response.entries.length) {
  status.textContent = "No entry found. Try selecting a shorter expression.";
} else {
  status.remove();
  for (const entry of response.entries) {
    const meanings = entry.senses.flatMap((sense) => sense.meanings).slice(0, 5);
    const partsOfSpeech = [...new Set(entry.senses.flatMap((sense) => sense.partsOfSpeech))].slice(0, 3);
    const article = document.createElement("article");
    article.className = "lookup-card";
    article.innerHTML = `<h2><span class="word"></span> <small class="reading-inline"></small></h2><p class="meta"></p><p class="definition"></p><p class="example" hidden></p><p class="pdf-cue" hidden></p><button class="primary">Save contextual card</button>`;
    appendFurigana(article.querySelector(".word"), entry.furigana, entry.term);
    article.querySelector(".reading-inline").textContent = entry.furigana?.length ? "" : (entry.reading ? `【${entry.reading}】` : "");
    article.querySelector(".meta").textContent = [entry.jlpt.join(" · ").toUpperCase(), ...partsOfSpeech].filter(Boolean).join(" · ");
    article.querySelector(".definition").textContent = meanings.join("; ");
    const example = article.querySelector(".example"); if (entry.example) { example.textContent = `${entry.example.japanese} — ${entry.example.english}`; example.hidden = false; }
    const cue = article.querySelector(".pdf-cue");
    if (entry.chineseCue) { cue.textContent = entry.chineseCue; cue.hidden = false; }
    article.querySelector("button").addEventListener("click", async (event) => {
      const result = await chrome.runtime.sendMessage({ type: "N2_SAVE_CARD", card: {
        term: entry.term, reading: entry.reading, meanings, partsOfSpeech,
        context: selected, sourceUrl, sourceTitle, sourceType: "pdf",
        tags: entry.jlpt.length ? entry.jlpt.map((tag) => tag.toUpperCase()) : ["N2"],
        notes: entry.chineseCue || "", furigana: entry.furigana, example: entry.example
      }});
      event.currentTarget.textContent = result?.duplicate ? "Added another encounter ✓" : "Saved for review ✓";
      event.currentTarget.disabled = true;
    });
    document.querySelector("#entries").appendChild(article);
  }
  loadTopExample(response.entries[0], document.querySelector("#entries .lookup-card .example"));
}

async function loadTopExample(entry, element) {
  const response = await chrome.runtime.sendMessage({ type: "N2_EXAMPLE_LOOKUP", term: entry.term }).catch(() => null);
  if (!response?.example || !element?.isConnected) return;
  entry.example = response.example;
  element.textContent = `${entry.example.japanese} — ${entry.example.english}`;
  element.hidden = false;
}
