import { getCards, getDecks, getSettings, saveSettings, updateCard } from "./lib/storage.js";
import { isDue, scheduleReview } from "./lib/scheduler.js";
import { segmentFurigana } from "./lib/furigana.js";
import { appendFurigana } from "./lib/render.js";

const [allCards, decks, settings] = await Promise.all([getCards(), getDecks(), getSettings()]);
const archivedDecks = new Set(decks.filter((deck) => deck.archived).map((deck) => deck.id));
let queue = allCards.filter((card) => !card.suspended && !archivedDecks.has(card.deckId) && isDue(card)).sort((a, b) => a.dueAt - b.dueAt);
let completed = 0;
let current = null;
const cardEl = document.querySelector("#reviewCard");
const finishedEl = document.querySelector("#finished");
document.body.classList.toggle("dark", settings.reviewDarkMode);

function renderNext() {
  current = queue.shift();
  document.querySelector("#progress").textContent = current ? `${completed + 1} of ${completed + queue.length + 1}` : `${completed} reviewed`;
  if (!current) {
    cardEl.hidden = true;
    finishedEl.hidden = false;
    return;
  }
  cardEl.hidden = false;
  appendFurigana(document.querySelector("#term"), current.furigana || segmentFurigana(current.term, current.reading), current.term);
  const screenshot = document.querySelector("#screenshot");
  screenshot.src = current.screenshot || "";
  screenshot.hidden = !current.screenshot;
  document.querySelector("#context").textContent = current.context || "No sentence was captured.";
  document.querySelector("#reading").textContent = current.reading ? `【${current.reading}】` : "Reading unavailable";
  document.querySelector("#meanings").textContent = current.meanings.join("; ");
  const example = document.querySelector("#example"); example.hidden = !current.example;
  if (current.example) { example.querySelector("p").textContent = current.example.japanese; example.querySelector("small").textContent = current.example.english; }
  document.querySelector("#parts").textContent = current.partsOfSpeech.join(" · ");
  const note = document.querySelector("#note");
  note.textContent = current.notes || "";
  note.hidden = !current.notes;
  const source = document.querySelector("#source");
  source.textContent = current.sourceTitle || current.sourceUrl || "";
  source.href = current.sourceUrl || "#";
  document.querySelector("#answer").hidden = true;
  document.querySelector("#grades").hidden = true;
  document.querySelector("#reveal").hidden = false;
}

document.querySelector("#reveal").addEventListener("click", () => {
  document.querySelector("#answer").hidden = false;
  document.querySelector("#grades").hidden = false;
  document.querySelector("#reveal").hidden = true;
});

document.querySelectorAll("[data-grade]").forEach((button) => button.addEventListener("click", async () => {
  const grade = Number(button.dataset.grade);
  const reviewedAt = Date.now();
  const scheduled = scheduleReview(current, grade, reviewedAt);
  scheduled.reviewHistory = [...(current.reviewHistory || []), { grade, reviewedAt }];
  await updateCard(scheduled);
  completed += 1;
  renderNext();
}));

document.querySelector("#close").addEventListener("click", () => window.close());
document.querySelector("#darkMode").addEventListener("click", async () => {
  const enabled = !document.body.classList.contains("dark");
  document.body.classList.toggle("dark", enabled);
  await saveSettings({ reviewDarkMode: enabled });
});
renderNext();
