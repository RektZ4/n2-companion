import { getCards, getSettings } from "./lib/storage.js";
import { calculateAccuracy, isDue } from "./lib/scheduler.js";

const cards = await getCards();
const settings = await getSettings();
const now = Date.now();
const history = cards.flatMap((card) => card.reviewHistory || []);
const today = new Date().toISOString().slice(0, 10);
const todayReviews = history.filter((review) => new Date(review.reviewedAt).toISOString().slice(0, 10) === today).length;
const days = Math.max(0, Math.ceil((new Date(`${settings.examDate}T00:00:00`).getTime() - now) / 86_400_000));
const due = cards.filter((card) => isDue(card, now)).length;

document.querySelector("#days").textContent = days;
document.querySelector("#examDate").textContent = new Date(`${settings.examDate}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
document.querySelector("#due").textContent = due;
document.querySelector("#total").textContent = cards.length;
document.querySelector("#accuracy").textContent = `${calculateAccuracy(history)}%`;
document.querySelector("#goalText").textContent = `${todayReviews} / ${settings.dailyGoal}`;
document.querySelector("#goalBar").style.width = `${Math.min(100, todayReviews / settings.dailyGoal * 100)}%`;
document.querySelector("#review").disabled = due === 0;
document.querySelector("#review").textContent = due ? `Review ${due} due card${due === 1 ? "" : "s"}` : "All caught up";

const recent = document.querySelector("#recent");
if (!cards.length) recent.innerHTML = `<li class="empty">Your first saved word will appear here.</li>`;
for (const card of cards.slice(0, 4)) {
  const li = document.createElement("li");
  li.innerHTML = `<span><b></b><small></small></span><small class="tag"></small>`;
  li.querySelector("b").textContent = card.term;
  li.querySelector("small").textContent = card.reading;
  li.querySelector(".tag").textContent = card.tags?.[0] || "";
  recent.appendChild(li);
}

document.querySelector("#review").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("review.html") }));
document.querySelector("#settings").addEventListener("click", () => chrome.runtime.openOptionsPage());

document.querySelector("#lookupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = document.querySelector("#lookupInput").value.trim();
  const output = document.querySelector("#lookupResult");
  output.className = "lookup-result"; output.textContent = "Looking up…";
  const response = await chrome.runtime.sendMessage({ type: "N2_DICTIONARY_LOOKUP", text });
  const entry = response?.entries?.[0];
  if (!entry) { output.textContent = response?.error || "No entry found."; return; }
  const meanings = entry.senses.flatMap((sense) => sense.meanings).slice(0, 5);
  const partsOfSpeech = [...new Set(entry.senses.flatMap((sense) => sense.partsOfSpeech))].slice(0, 3);
  output.innerHTML = `<b></b><small></small><p></p><div class="cue" hidden></div><button class="secondary">Save card</button>`;
  output.querySelector("b").textContent = entry.term;
  output.querySelector("small").textContent = entry.reading;
  output.querySelector("p").textContent = meanings.join("; ");
  const cue = output.querySelector(".cue");
  if (entry.chineseCue) { cue.textContent = entry.chineseCue; cue.hidden = false; }
  output.querySelector("button").addEventListener("click", async (click) => {
    const result = await chrome.runtime.sendMessage({ type: "N2_SAVE_CARD", card: { term: entry.term, reading: entry.reading, meanings, partsOfSpeech, context: text, sourceType: "paste", tags: entry.jlpt.length ? entry.jlpt.map((tag) => tag.toUpperCase()) : ["N2"], notes: entry.chineseCue || "" } });
    click.currentTarget.textContent = result?.duplicate ? "Already saved" : "Saved ✓";
    click.currentTarget.disabled = true;
  });
});
