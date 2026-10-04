const DEFAULT_SETTINGS = {
  dailyGoal: 20,
  examDate: "2026-12-06",
  chineseBackgroundMode: true,
  showReadingFirst: true
};

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

export async function getCards() {
  const { cards = [] } = await storageGet("cards");
  return cards;
}

export async function saveCard(candidate) {
  const cards = await getCards();
  const duplicate = cards.find((card) =>
    card.term === candidate.term && card.reading === candidate.reading
  );
  if (duplicate) return { card: duplicate, duplicate: true };

  const now = Date.now();
  const card = {
    id: crypto.randomUUID(),
    term: candidate.term,
    reading: candidate.reading || "",
    meanings: candidate.meanings || [],
    partsOfSpeech: candidate.partsOfSpeech || [],
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
    reviewHistory: []
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

export async function getSettings() {
  const { settings = {} } = await storageGet("settings");
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function saveSettings(settings) {
  const next = { ...DEFAULT_SETTINGS, ...settings };
  await storageSet({ settings: next });
  return next;
}

export async function exportData() {
  return { version: 1, exportedAt: new Date().toISOString(), cards: await getCards(), settings: await getSettings() };
}

export async function importData(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.cards)) throw new Error("Unsupported backup file");
  await storageSet({ cards: data.cards, settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) } });
}
