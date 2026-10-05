import { cleanSelection } from "./lib/japanese.js";
import { exportData, getSettings, saveCard, saveSettings } from "./lib/storage.js";
import { getChineseBackgroundCue } from "./lib/cognates.js";
import { buildLookupQueries } from "./lib/lookup-query.js";
import { segmentFurigana } from "./lib/furigana.js";

const MENU_ID = "n2-companion-lookup";
const lookupCache = new Map();
const exampleCache = new Map();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => chrome.contextMenus.create({
    id: MENU_ID,
    title: "Look up Japanese: %s",
    contexts: ["selection"]
  }));
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "N2_LOOKUP_TEXT", text: info.selectionText });
  } catch {
    const query = new URLSearchParams({
      text: cleanSelection(info.selectionText),
      sourceUrl: info.pageUrl || tab.url || "",
      sourceTitle: tab.title || "PDF"
    });
    await chrome.windows.create({
      url: chrome.runtime.getURL(`lookup.html?${query}`),
      type: "popup",
      width: 440,
      height: 620
    });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (command === "lookup-selection") {
    if (tab.url?.startsWith(chrome.runtime.getURL("pdf-reader.html"))) {
      chrome.runtime.sendMessage({ type: "N2_LOOKUP_CURRENT_SELECTION" }).catch(() => {});
    } else {
      chrome.tabs.sendMessage(tab.id, { type: "N2_LOOKUP_CURRENT_SELECTION" }).catch(() => {});
    }
  }
  if (command === "screenshot-ocr") await startOcrCapture(tab);
});

async function startOcrCapture(tab) {
  try {
    const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const id = crypto.randomUUID();
    await chrome.storage.session.set({ ocrCapture: { id, screenshot, sourceUrl: tab.url || "", sourceTitle: tab.title || "Screen capture", createdAt: Date.now() } });
    const currentWindow = await chrome.windows.get(tab.windowId);
    await chrome.windows.create({
      url: chrome.runtime.getURL(`capture.html?id=${encodeURIComponent(id)}`),
      type: "popup",
      width: Math.max(600, Math.min(1200, currentWindow.width || 1000)),
      height: Math.max(500, Math.min(900, currentWindow.height || 750))
    });
  } catch (error) {
    console.error("N2 Companion OCR capture failed", error);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "N2_DICTIONARY_LOOKUP") {
    lookup(message.text).then((result) => sendResponse({ ok: true, ...result })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "N2_EXAMPLE_LOOKUP") {
    lookupExample(cleanSelection(message.term)).then((example) => sendResponse({ ok: true, example })).catch(() => sendResponse({ ok: true, example: null }));
    return true;
  }
  if (message.type === "N2_SAVE_CARD") {
    saveCard(message.card).then(async (result) => {
      await maybeAutomaticBackup();
      sendResponse({ ok: true, ...result });
    }).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "N2_DOWNLOAD_BACKUP") {
    downloadBackup(Boolean(message.automatic)).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});

async function maybeAutomaticBackup() {
  const settings = await getSettings();
  const week = 7 * 86_400_000;
  if (!settings.automaticBackups || (settings.lastAutoBackupAt && Date.now() - settings.lastAutoBackupAt < week)) return;
  await downloadBackup(true);
}

async function downloadBackup(automatic = false) {
  const data = await exportData();
  const day = new Date().toISOString().slice(0, 10);
  const url = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
  await chrome.downloads.download({ url, filename: `N2-Companion-Backups/n2-companion-${automatic ? "automatic-" : ""}${day}.json`, saveAs: !automatic, conflictAction: "uniquify" });
  if (automatic) await saveSettings({ lastAutoBackupAt: Date.now() });
}

async function lookup(rawText) {
  const text = cleanSelection(rawText);
  const queries = buildLookupQueries(text);
  if (!text || !queries.length) throw new Error("Enter Japanese text, romaji, or an English dictionary term.");
  const settings = await getSettings();
  const cacheKey = `${settings.chineseBackgroundMode}:${text}`;
  if (lookupCache.has(cacheKey)) return lookupCache.get(cacheKey);

  let payload = { data: [] };
  let normalizedText = text;
  for (const query of queries) {
    const response = await fetchWithTimeout(`https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(query)}`, 8000);
    if (!response.ok) throw new Error(`Dictionary request failed (${response.status}).`);
    payload = await response.json();
    normalizedText = query;
    if (payload.data?.length) break;
  }
  const entries = payload.data.slice(0, 5).map((item) => ({
    slug: item.slug,
    term: item.japanese?.[0]?.word || item.slug,
    reading: item.japanese?.[0]?.reading || "",
    jlpt: item.jlpt || [],
    common: Boolean(item.is_common),
    furigana: segmentFurigana(item.japanese?.[0]?.word || item.slug, item.japanese?.[0]?.reading || ""),
    chineseCue: settings.chineseBackgroundMode ? getChineseBackgroundCue(item.japanese?.[0]?.word || item.slug) : "",
    senses: (item.senses || []).slice(0, 4).map((sense) => ({
      meanings: sense.english_definitions || [],
      partsOfSpeech: sense.parts_of_speech || []
    }))
  }));
  const result = { entries, normalizedText };
  lookupCache.set(cacheKey, result);
  if (lookupCache.size > 100) lookupCache.delete(lookupCache.keys().next().value);
  return result;
}

async function lookupExample(term) {
  if (!term) return null;
  if (exampleCache.has(term)) return exampleCache.get(term);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const params = new URLSearchParams({ lang: "jpn", q: term, showtrans: "all", sort: "relevance", limit: "1" });
    const response = await fetch(`https://api.tatoeba.org/v1/sentences?${params}`, { signal: controller.signal });
    if (!response.ok) return null;
    const sentence = (await response.json()).data?.[0];
    if (!sentence) return null;
    const english = sentence.translations?.find((item) => item.lang === "eng");
    const example = { japanese: sentence.text, english: english?.text || "", id: sentence.id, license: sentence.license || "", sourceUrl: `https://tatoeba.org/en/sentences/show/${sentence.id}` };
    exampleCache.set(term, example);
    return example;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithTimeout(url, milliseconds) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), milliseconds);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Dictionary request timed out. Please try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
