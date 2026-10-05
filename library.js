import { calculateAccuracy } from "./lib/scheduler.js";
import { copyCard, createDeck, deleteCard, getCards, getDecks, saveDecks, updateCard } from "./lib/storage.js";

let cards = await getCards();
let decks = await getDecks();
let selectedDeck = "all";
let editingId = null;
const dialog = document.querySelector("#cardDialog");

render();

function render() {
  renderStats(); renderDecks(); renderCards(); populateDeckSelects();
}

function renderStats() {
  const history = cards.flatMap((card) => card.reviewHistory || []);
  document.querySelector("#statCards").textContent = cards.length;
  document.querySelector("#statReviews").textContent = history.length;
  document.querySelector("#statAccuracy").textContent = `${calculateAccuracy(history)}%`;
  document.querySelector("#statLapses").textContent = cards.reduce((sum, card) => sum + Number(card.lapses || 0), 0);
}

function renderDecks() {
  const list = document.querySelector("#deckList"); list.replaceChildren();
  addDeckButton("all", "All cards", cards.length, false);
  for (const deck of decks) addDeckButton(deck.id, deck.name, cards.filter((card) => card.deckId === deck.id).length, deck.archived);
  const archive = document.querySelector("#archiveDeck");
  const current = decks.find((deck) => deck.id === selectedDeck);
  archive.hidden = !current; archive.textContent = current?.archived ? "Restore deck" : "Archive deck";
}

function addDeckButton(id, name, count, archived) {
  const button = document.createElement("button"); button.className = `deck-button${selectedDeck === id ? " active" : ""}`;
  button.innerHTML = `<span></span><b></b>`; button.querySelector("span").textContent = `${archived ? "▣ " : ""}${name}`; button.querySelector("b").textContent = count;
  button.addEventListener("click", () => { selectedDeck = id; render(); }); document.querySelector("#deckList").appendChild(button);
}

function renderCards() {
  const query = document.querySelector("#search").value.toLowerCase().trim();
  const state = document.querySelector("#stateFilter").value;
  const finalCards = cards.filter((card) => {
    if (selectedDeck !== "all" && card.deckId !== selectedDeck) return false;
    if (state !== "all" && ((state === "suspended") !== Boolean(card.suspended))) return false;
    const haystack = [card.term, card.reading, ...(card.meanings || []), card.context, card.notes].join(" ").toLowerCase();
    return !query || haystack.includes(query);
  });
  const list = document.querySelector("#cardList"); list.replaceChildren();
  if (!finalCards.length) { list.innerHTML = `<div class="empty">No cards match this view.</div>`; return; }
  for (const card of finalCards) {
    const deck = decks.find((item) => item.id === card.deckId);
    const item = document.createElement("button"); item.className = "library-card";
    item.innerHTML = `<div><strong></strong><span class="card-reading"></span><p></p></div><div class="card-meta"><span></span><b></b></div>`;
    item.querySelector("strong").textContent = card.term; item.querySelector(".card-reading").textContent = card.reading;
    item.querySelector("p").textContent = card.meanings?.slice(0, 3).join("; ") || "No meaning";
    item.querySelector(".card-meta span").textContent = `${deck?.name || "Unknown deck"}${card.suspended ? " · Suspended" : ""}`;
    item.querySelector(".card-meta b").textContent = `${card.reviewHistory?.length || 0} reviews`;
    item.addEventListener("click", () => openEditor(card.id)); list.appendChild(item);
  }
}

function populateDeckSelects() {
  for (const id of ["editDeck", "copyDeck"]) {
    const select = document.querySelector(`#${id}`); const value = select.value; select.replaceChildren();
    for (const deck of decks) { const option = document.createElement("option"); option.value = deck.id; option.textContent = `${deck.archived ? "[Archived] " : ""}${deck.name}`; select.appendChild(option); }
    if (value) select.value = value;
  }
}

function openEditor(id) {
  editingId = id; const card = cards.find((item) => item.id === id); if (!card) return;
  document.querySelector("#editTerm").value = card.term; document.querySelector("#editReading").value = card.reading || "";
  document.querySelector("#editMeanings").value = (card.meanings || []).join("\n"); document.querySelector("#editContext").value = card.context || "";
  document.querySelector("#editNotes").value = card.notes || ""; document.querySelector("#editDeck").value = card.deckId; document.querySelector("#editTags").value = (card.tags || []).join(", "); document.querySelector("#editSuspended").checked = Boolean(card.suspended);
  const image = document.querySelector("#editScreenshot"); image.src = card.screenshot || ""; image.hidden = !card.screenshot;
  const source = document.querySelector("#editSource"); source.href = card.sourceUrl || "#"; source.textContent = card.sourceTitle || card.sourceUrl || "No source URL";
  const history = card.reviewHistory || []; const occurrences = card.occurrences || [];
  document.querySelector("#cardHistory").innerHTML = `<b>${history.length} lifetime reviews · ${calculateAccuracy(history)}% accuracy · ${card.lapses || 0} lapses</b><p>Last reviewed: ${card.lastReviewedAt ? new Date(card.lastReviewedAt).toLocaleString() : "Never"}</p>`;
  renderOccurrences(occurrences.length ? occurrences : [{ context: card.context, sourceTitle: card.sourceTitle, sourceUrl: card.sourceUrl, capturedAt: card.createdAt }]);
  renderReviewHistory(history);
  dialog.showModal();
}

function renderOccurrences(items) {
  const container = document.querySelector("#cardOccurrences"); container.replaceChildren();
  const heading = document.createElement("b"); heading.textContent = `Encounters (${items.length})`; container.appendChild(heading);
  const list = document.createElement("ol");
  for (const item of [...items].reverse()) {
    const row = document.createElement("li");
    const source = item.sourceUrl ? document.createElement("a") : document.createElement("span");
    source.textContent = item.sourceTitle || item.sourceUrl || "Saved context";
    if (item.sourceUrl) { source.href = item.sourceUrl; source.target = "_blank"; source.rel = "noreferrer"; }
    row.append(source, document.createTextNode(` · ${item.capturedAt ? new Date(item.capturedAt).toLocaleString() : "Unknown date"}`));
    if (item.context) { const context = document.createElement("p"); context.textContent = item.context; row.appendChild(context); }
    list.appendChild(row);
  }
  container.appendChild(list);
}

function renderReviewHistory(items) {
  const labels = ["", "Again", "Hard", "Good", "Easy"];
  const container = document.querySelector("#reviewHistory"); container.replaceChildren();
  const heading = document.createElement("b"); heading.textContent = `Complete review history (${items.length})`; container.appendChild(heading);
  if (!items.length) { const empty = document.createElement("p"); empty.textContent = "Not reviewed yet."; container.appendChild(empty); return; }
  const list = document.createElement("ol");
  for (const item of [...items].reverse()) { const row = document.createElement("li"); row.textContent = `${labels[item.grade] || `Grade ${item.grade}`} · ${new Date(item.reviewedAt).toLocaleString()}`; list.appendChild(row); }
  container.appendChild(list);
}

document.querySelector("#search").addEventListener("input", renderCards);
document.querySelector("#stateFilter").addEventListener("change", renderCards);
document.querySelector("#closeDialog").addEventListener("click", () => dialog.close());
document.querySelector("#newDeck").addEventListener("click", async () => { const name = prompt("Deck name"); if (!name?.trim()) return; const deck = await createDeck(name); decks = await getDecks(); selectedDeck = deck.id; render(); });
document.querySelector("#archiveDeck").addEventListener("click", async () => { const deck = decks.find((item) => item.id === selectedDeck); if (!deck) return; deck.archived = !deck.archived; await saveDecks(decks); render(); });
document.querySelector("#backup").addEventListener("click", async () => chrome.runtime.sendMessage({ type: "N2_DOWNLOAD_BACKUP" }));
document.querySelector("#cardForm").addEventListener("submit", async () => { const card = cards.find((item) => item.id === editingId); if (!card) return; await updateCard({ ...card, term: document.querySelector("#editTerm").value.trim(), reading: document.querySelector("#editReading").value.trim(), meanings: document.querySelector("#editMeanings").value.split("\n").map((item) => item.trim()).filter(Boolean), context: document.querySelector("#editContext").value.trim(), notes: document.querySelector("#editNotes").value.trim(), deckId: document.querySelector("#editDeck").value, tags: document.querySelector("#editTags").value.split(",").map((item) => item.trim()).filter(Boolean), suspended: document.querySelector("#editSuspended").checked }); cards = await getCards(); render(); });
document.querySelector("#copyCard").addEventListener("click", async () => { await copyCard(editingId, document.querySelector("#copyDeck").value); cards = await getCards(); dialog.close(); render(); });
document.querySelector("#deleteCard").addEventListener("click", async () => { if (!confirm("Permanently delete this card?")) return; await deleteCard(editingId); cards = await getCards(); dialog.close(); render(); });
