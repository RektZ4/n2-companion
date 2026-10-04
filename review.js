import { getCards, updateCard } from "./lib/storage.js";
import { isDue, scheduleReview } from "./lib/scheduler.js";

let queue = (await getCards()).filter((card) => isDue(card)).sort((a, b) => a.dueAt - b.dueAt);
let completed = 0;
let current = null;
const cardEl = document.querySelector("#reviewCard");
const finishedEl = document.querySelector("#finished");

function renderNext() {
  current = queue.shift();
  document.querySelector("#progress").textContent = current ? `${completed + 1} of ${completed + queue.length + 1}` : `${completed} reviewed`;
  if (!current) {
    cardEl.hidden = true;
    finishedEl.hidden = false;
    return;
  }
  cardEl.hidden = false;
  document.querySelector("#term").textContent = current.term;
  document.querySelector("#context").textContent = current.context || "No sentence was captured.";
  document.querySelector("#reading").textContent = current.reading ? `【${current.reading}】` : "Reading unavailable";
  document.querySelector("#meanings").textContent = current.meanings.join("; ");
  document.querySelector("#parts").textContent = current.partsOfSpeech.join(" · ");
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
renderNext();
