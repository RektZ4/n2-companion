import { cleanSelection, containsJapanese } from "./lib/japanese.js";
import { getSettings, saveCard } from "./lib/storage.js";
import { getChineseBackgroundCue } from "./lib/cognates.js";

const MENU_ID = "n2-companion-lookup";
const lookupCache = new Map();

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
    chrome.tabs.sendMessage(tab.id, { type: "N2_LOOKUP_CURRENT_SELECTION" }).catch(() => {});
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
    lookup(message.text).then((entries) => sendResponse({ ok: true, entries })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "N2_SAVE_CARD") {
    saveCard(message.card).then((result) => sendResponse({ ok: true, ...result })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});

async function lookup(rawText) {
  const text = cleanSelection(rawText);
  if (!text || !containsJapanese(text)) throw new Error("Select Japanese text first.");
  const settings = await getSettings();
  const cacheKey = `${settings.chineseBackgroundMode}:${text}`;
  if (lookupCache.has(cacheKey)) return lookupCache.get(cacheKey);

  const response = await fetch(`https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(text)}`);
  if (!response.ok) throw new Error(`Dictionary request failed (${response.status}).`);
  const payload = await response.json();
  const entries = payload.data.slice(0, 5).map((item) => ({
    slug: item.slug,
    term: item.japanese?.[0]?.word || item.slug,
    reading: item.japanese?.[0]?.reading || "",
    jlpt: item.jlpt || [],
    common: Boolean(item.is_common),
    chineseCue: settings.chineseBackgroundMode ? getChineseBackgroundCue(item.japanese?.[0]?.word || item.slug) : "",
    senses: (item.senses || []).slice(0, 4).map((sense) => ({
      meanings: sense.english_definitions || [],
      partsOfSpeech: sense.parts_of_speech || []
    }))
  }));
  lookupCache.set(cacheKey, entries);
  if (lookupCache.size > 100) lookupCache.delete(lookupCache.keys().next().value);
  return entries;
}
