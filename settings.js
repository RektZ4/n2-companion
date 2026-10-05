import { exportData, getSettings, importData, saveSettings } from "./lib/storage.js";
const settings = await getSettings();
document.querySelector("#examDate").value = settings.examDate;
document.querySelector("#dailyGoal").value = settings.dailyGoal;
document.querySelector("#chineseMode").checked = settings.chineseBackgroundMode;
document.querySelector("#readingFirst").checked = settings.showReadingFirst;
document.querySelector("#automaticBackups").checked = settings.automaticBackups;

document.querySelector("#form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveSettings({ examDate: document.querySelector("#examDate").value, dailyGoal: Number(document.querySelector("#dailyGoal").value), chineseBackgroundMode: document.querySelector("#chineseMode").checked, showReadingFirst: document.querySelector("#readingFirst").checked, automaticBackups: document.querySelector("#automaticBackups").checked });
  const notice = document.querySelector("#notice"); notice.classList.add("show"); setTimeout(() => notice.classList.remove("show"), 1800);
});

document.querySelector("#export").addEventListener("click", async () => {
  const blob = new Blob([JSON.stringify(await exportData(), null, 2)], { type: "application/json" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `n2-companion-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href);
});

document.querySelector("#import").addEventListener("change", async (event) => {
  const file = event.target.files?.[0]; if (!file) return;
  try { await importData(JSON.parse(await file.text())); location.reload(); } catch (error) { alert(error.message); }
});
