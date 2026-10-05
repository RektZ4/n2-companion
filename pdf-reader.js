import { getDocument, GlobalWorkerOptions, TextLayer } from "./vendor/pdfjs/pdf.min.mjs";

GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdfjs/pdf.worker.min.mjs");

const pages = document.querySelector("#pdfPages");
const empty = document.querySelector("#pdfEmpty");
const status = document.querySelector("#pdfStatus");
const zoom = document.querySelector("#pdfZoom");
const dropZone = document.querySelector("#pdfDropZone");
let documentProxy = null;
let renderGeneration = 0;

document.querySelectorAll('input[type="file"]').forEach((input) => input.addEventListener("change", () => {
  const file = input.files?.[0];
  if (file) openPdf(file);
}));

for (const eventName of ["dragenter", "dragover"]) {
  dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.add("dragging"); });
}
for (const eventName of ["dragleave", "drop"]) {
  dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.remove("dragging"); });
}
dropZone.addEventListener("drop", (event) => {
  const file = [...event.dataTransfer.files].find((item) => item.type === "application/pdf" || item.name.toLowerCase().endsWith(".pdf"));
  if (file) openPdf(file);
});
zoom.addEventListener("change", () => { if (documentProxy) renderPdf(documentProxy, Number(zoom.value)); });

async function openPdf(file) {
  status.textContent = `Opening ${file.name}…`;
  document.title = `${file.name} · N2 Companion`;
  try {
    documentProxy = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    empty.hidden = true;
    await renderPdf(documentProxy, Number(zoom.value));
  } catch (error) {
    status.textContent = `Could not open PDF: ${error?.message || String(error)}`;
  }
}

async function renderPdf(pdf, scale) {
  const generation = ++renderGeneration;
  pages.replaceChildren();
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    if (generation !== renderGeneration) return;
    status.textContent = `Rendering page ${pageNumber} of ${pdf.numPages}…`;
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const wrapper = document.createElement("section");
    wrapper.className = "pdf-page";
    wrapper.style.width = `${viewport.width}px`;
    wrapper.style.height = `${viewport.height}px`;
    wrapper.setAttribute("aria-label", `Page ${pageNumber}`);
    const canvas = document.createElement("canvas");
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * pixelRatio);
    canvas.height = Math.floor(viewport.height * pixelRatio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    wrapper.appendChild(canvas);
    const textContainer = document.createElement("div");
    textContainer.className = "textLayer";
    wrapper.appendChild(textContainer);
    pages.appendChild(wrapper);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport, transform: pixelRatio === 1 ? null : [pixelRatio, 0, 0, pixelRatio, 0, 0] }).promise;
    const textContent = await page.getTextContent();
    await new TextLayer({ textContentSource: textContent, container: textContainer, viewport }).render();
  }
  status.textContent = `${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"} · Select Japanese for lookup`;
}
