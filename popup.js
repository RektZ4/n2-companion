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
document.querySelector("#pdfReader").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("pdf-reader.html") }));

const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
const currentPdfButton = document.querySelector("#currentPdf");
const pdfNotice = document.querySelector("#pdfNotice");
const activeUrl = activeTab?.url || "";
if (/^(https?:|file:)/.test(activeUrl) && (/\.pdf(?:$|[?#])/i.test(activeUrl) || activeTab?.title?.toLowerCase().includes(".pdf"))) {
  currentPdfButton.hidden = false;
  currentPdfButton.addEventListener("click", async () => {
    const permission = activeUrl.startsWith("file:") ? "file:///*" : `${new URL(activeUrl).origin}/*`;
    const granted = await chrome.permissions.request({ origins: [permission] });
    if (!granted) {
      pdfNotice.hidden = false;
      pdfNotice.textContent = activeUrl.startsWith("file:")
        ? "Enable “Allow access to file URLs” for N2 Companion, then try again."
        : "Permission is needed to read this PDF locally.";
      return;
    }
    await chrome.tabs.create({ url: chrome.runtime.getURL(`pdf-reader.html?source=${encodeURIComponent(activeUrl)}`) });
    window.close();
  });
}
