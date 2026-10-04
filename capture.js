const id = new URLSearchParams(location.search).get("id");
const { ocrCapture } = await chrome.storage.session.get("ocrCapture");
if (!ocrCapture || ocrCapture.id !== id) throw new Error("OCR capture expired. Try the shortcut again.");

const stage = document.querySelector("#stage");
const image = document.querySelector("#screenshot");
const selection = document.querySelector("#selection");
image.src = ocrCapture.screenshot;
let start = null;

stage.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const bounds = image.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return;
  start = { x: event.clientX, y: event.clientY };
  selection.hidden = false;
  selection.style.left = `${event.clientX}px`; selection.style.top = `${event.clientY}px`;
  selection.style.width = "0"; selection.style.height = "0";
  stage.setPointerCapture(event.pointerId);
});

stage.addEventListener("pointermove", (event) => {
  if (!start) return;
  const left = Math.min(start.x, event.clientX); const top = Math.min(start.y, event.clientY);
  selection.style.left = `${left}px`; selection.style.top = `${top}px`;
  selection.style.width = `${Math.abs(event.clientX - start.x)}px`; selection.style.height = `${Math.abs(event.clientY - start.y)}px`;
});

stage.addEventListener("pointerup", (event) => {
  if (!start) return;
  const bounds = image.getBoundingClientRect();
  const left = Math.max(bounds.left, Math.min(start.x, event.clientX));
  const top = Math.max(bounds.top, Math.min(start.y, event.clientY));
  const right = Math.min(bounds.right, Math.max(start.x, event.clientX));
  const bottom = Math.min(bounds.bottom, Math.max(start.y, event.clientY));
  start = null;
  if (right - left < 12 || bottom - top < 12) { selection.hidden = true; return; }
  const scaleX = image.naturalWidth / bounds.width; const scaleY = image.naturalHeight / bounds.height;
  const crop = { x: Math.round((left - bounds.left) * scaleX), y: Math.round((top - bounds.top) * scaleY), width: Math.round((right - left) * scaleX), height: Math.round((bottom - top) * scaleY) };
  location.href = `ocr.html?id=${encodeURIComponent(id)}&crop=${encodeURIComponent(JSON.stringify(crop))}`;
});

function cancel() { chrome.storage.session.remove("ocrCapture"); window.close(); }
document.querySelector("#cancel").addEventListener("click", cancel);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") cancel(); });
