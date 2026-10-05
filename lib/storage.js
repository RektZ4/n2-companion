const DEFAULT_SETTINGS = {
  dailyGoal: 20,
  examDate: "2026-12-06",
  chineseBackgroundMode: true,
  showReadingFirst: true,
  reviewDarkMode: false,
  automaticBackups: false,
  lastAutoBackupAt: null
};

export const DEFAULT_DECKS = [
  { id: "jlpt-n2", name: "JLPT N2", archived: false, createdAt: 0 },
  { id: "past-papers", name: "Past Papers", archived: false, createdAt: 0 },
  { id: "youtube", name: "YouTube", archived: false, createdAt: 0 },
  { id: "instagram", name: "Instagram", archived: false, createdAt: 0 },
  { id: "general", name: "General", archived: false, createdAt: 0 }
];

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

export async function getCards() {
  const { cards = [] } = await storageGet("cards");
  return cards.map((card) => ({ deckId: "jlpt-n2", suspended: false, occurrences: [], ...card }));
}

export async function getDecks() {
  const { decks } = await storageGet("decks");
  return Array.isArray(decks) && decks.length ? decks : DEFAULT_DECKS.map((deck) => ({ ...deck }));
}

export async function saveDecks(decks) {
  await storageSet({ decks });
  return decks;
}

export async function createDeck(name) {
  const decks = await getDecks();
  const deck = { id: crypto.randomUUID(), name: name.trim(), archived: false, createdAt: Date.now() };
  decks.push(deck);
  await saveDecks(decks);
  return deck;
}

export async function saveCard(candidate) {
  const cards = await getCards();
  const duplicate = cards.find((card) =>
    card.term === candidate.term && card.reading === candidate.reading
  );
  if (duplicate) {
    const occurrence = makeOccurrence(candidate);
    duplicate.occurrences = [...(duplicate.occurrences || []), occurrence].slice(-50);
    if (candidate.screenshot && !duplicate.screenshot) duplicate.screenshot = candidate.screenshot;
    if (candidate.example && !duplicate.example) duplicate.example = candidate.example;
    if (candidate.furigana && !duplicate.furigana) duplicate.furigana = candidate.furigana;
    if (candidate.context && !duplicate.context) duplicate.context = candidate.context;
    await storageSet({ cards });
    return { card: duplicate, duplicate: true, enriched: true };
  }

  const now = Date.now();
  const card = {
    id: crypto.randomUUID(),
    term: candidate.term,
    reading: candidate.reading || "",
    furigana: candidate.furigana || null,
    meanings: candidate.meanings || [],
    partsOfSpeech: candidate.partsOfSpeech || [],
    example: candidate.example || null,
    context: candidate.context || "",
    sourceUrl: candidate.sourceUrl || "",
    sourceTitle: candidate.sourceTitle || "",
    sourceType: candidate.sourceType || "web",
    screenshot: candidate.screenshot || null,
    tags: candidate.tags || ["N2"],
    notes: candidate.notes || "",
    createdAt: now,
    dueAt: now,
    intervalDays: 0,
    ease: 2.5,
    repetitions: 0,
    lapses: 0,
    reviewHistory: [],
    deckId: candidate.deckId || inferDeck(candidate.sourceUrl, candidate.sourceType),
    suspended: false,
    occurrences: [makeOccurrence(candidate)]
  };
  cards.unshift(card);
  await storageSet({ cards });
  return { card, duplicate: false };
}

export async function updateCard(updated) {
  const cards = await getCards();
  const index = cards.findIndex((card) => card.id === updated.id);
  if (index === -1) throw new Error("Card not found");
  cards[index] = updated;
  await storageSet({ cards });
  return updated;
}

export async function deleteCard(id) {
  const cards = await getCards();
  await storageSet({ cards: cards.filter((card) => card.id !== id) });
}

export async function copyCard(id, deckId) {
  const cards = await getCards();
  const original = cards.find((card) => card.id === id);
  if (!original) throw new Error("Card not found");
  const copy = { ...structuredClone(original), id: crypto.randomUUID(), deckId, createdAt: Date.now(), dueAt: Date.now(), repetitions: 0, lapses: 0, reviewHistory: [] };
  cards.unshift(copy);
  await storageSet({ cards });
  return copy;
}

export async function getSettings() {
  const { settings = {} } = await storageGet("settings");
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function saveSettings(settings) {
  const current = await getSettings();
  const next = { ...current, ...settings };
  await storageSet({ settings: next });
  return next;
}

export async function exportData() {
  return { version: 2, exportedAt: new Date().toISOString(), cards: await getCards(), decks: await getDecks(), settings: await getSettings() };
}

export async function importData(data) {
  if (!data || ![1, 2].includes(data.version) || !Array.isArray(data.cards)) throw new Error("Unsupported backup file");
  await storageSet({ cards: data.cards, decks: data.decks || DEFAULT_DECKS, settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) } });
}

function makeOccurrence(candidate) {
  return { context: candidate.context || "", sourceUrl: candidate.sourceUrl || "", sourceTitle: candidate.sourceTitle || "", sourceType: candidate.sourceType || "web", screenshot: candidate.screenshot || null, capturedAt: Date.now() };
}

function inferDeck(url = "", sourceType = "") {
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  if (/instagram\.com/i.test(url)) return "instagram";
  if (sourceType === "pdf") return "past-papers";
  return "jlpt-n2";
}
