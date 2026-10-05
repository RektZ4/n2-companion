import { getDocument, GlobalWorkerOptions, TextLayer } from "./vendor/pdfjs/pdf.min.mjs";

GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdfjs/pdf.worker.min.mjs");

const pages = document.querySelector("#pdfPages");
const empty = document.querySelector("#pdfEmpty");
const status = document.querySelector("#pdfStatus");
const zoom = document.querySelector("#pdfZoom");
const dropZone = document.querySelector("#pdfDropZone");
let documentProxy = null;
let renderGeneration = 0;
let zoomRenderTimer = null;
let annotationMode = "select";
const annotations = new Map();
const sourceUrl = new URLSearchParams(location.search).get("source");

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
zoom.addEventListener("change", scheduleZoomRender);
document.addEventListener("wheel", (event) => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  const options = [...zoom.options];
  const direction = event.deltaY < 0 ? 1 : -1;
  const nextIndex = Math.max(0, Math.min(options.length - 1, zoom.selectedIndex + direction));
  if (nextIndex === zoom.selectedIndex) return;
  zoom.selectedIndex = nextIndex;
  scheduleZoomRender();
}, { passive: false });
document.querySelectorAll("[data-annotation]").forEach((button) => button.addEventListener("click", () => {
  annotationMode = button.dataset.annotation;
  document.querySelectorAll("[data-annotation]").forEach((item) => item.classList.toggle("active", item === button));
  document.querySelectorAll(".annotation-layer").forEach((canvas) => {
    canvas.style.pointerEvents = annotationMode === "select" ? "none" : "auto";
    canvas.style.cursor = annotationMode === "draw" ? "crosshair" : "text";
  });
}));
document.querySelector("#clearAnnotations").addEventListener("click", () => {
  if (!annotations.size || !confirm("Clear all drawing and text annotations in this reader session?")) return;
  annotations.clear();
  if (documentProxy) renderPdf(documentProxy, Number(zoom.value));
});

if (sourceUrl) openPdfUrl(sourceUrl);

function scheduleZoomRender() {
  clearTimeout(zoomRenderTimer);
  if (!documentProxy) return;
  status.textContent = `Zoom ${Math.round(Number(zoom.value) * 100)}%…`;
  zoomRenderTimer = setTimeout(() => renderPdf(documentProxy, Number(zoom.value)), 160);
}

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

async function openPdfUrl(url) {
  const name = decodeURIComponent(url.split("/").pop()?.split(/[?#]/)[0] || "PDF");
  status.textContent = `Opening ${name}…`;
  document.title = `${name} · N2 Companion`;
  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) throw new Error(`PDF request failed (${response.status})`);
    documentProxy = await getDocument({ data: new Uint8Array(await response.arrayBuffer()) }).promise;
    empty.hidden = true;
    await renderPdf(documentProxy, Number(zoom.value));
  } catch (error) {
    status.textContent = `Could not open current PDF: ${error?.message || String(error)}`;
    empty.querySelector("p").textContent = url.startsWith("file:")
      ? "Chrome may require you to enable “Allow access to file URLs” for N2 Companion. You can also choose the file below."
      : "This site may protect the PDF URL. Download it and choose the local file below instead.";
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
    wrapper.style.setProperty("--scale-factor", scale);
    wrapper.style.setProperty("--user-unit", page.userUnit || 1);
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
    const textLayer = new TextLayer({
      textContentSource: page.streamTextContent({ includeMarkedContent: true, disableNormalization: true }),
      container: textContainer,
      viewport
    });
    await textLayer.render();
    const endOfContent = document.createElement("div");
    endOfContent.className = "endOfContent";
    textContainer.appendChild(endOfContent);
    textContainer.addEventListener("mousedown", () => textContainer.classList.add("selecting"));
    const annotationCanvas = document.createElement("canvas");
    annotationCanvas.className = "annotation-layer";
    annotationCanvas.width = Math.floor(viewport.width * pixelRatio);
    annotationCanvas.height = Math.floor(viewport.height * pixelRatio);
    annotationCanvas.style.width = `${viewport.width}px`;
    annotationCanvas.style.height = `${viewport.height}px`;
    annotationCanvas.style.pointerEvents = annotationMode === "select" ? "none" : "auto";
    annotationCanvas.style.cursor = annotationMode === "draw" ? "crosshair" : "text";
    wrapper.appendChild(annotationCanvas);
    setupAnnotationCanvas(annotationCanvas, pageNumber, viewport, pixelRatio);
  }
  status.textContent = `${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"} · Select Japanese for lookup`;
}

function setupAnnotationCanvas(canvas, pageNumber, viewport, pixelRatio) {
  const context = canvas.getContext("2d");
  context.scale(pixelRatio, pixelRatio);
  const items = annotations.get(pageNumber) || [];
  redrawAnnotations(context, items, viewport);
  let stroke = null;
  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height];
  };
  canvas.addEventListener("pointerdown", (event) => {
    if (annotationMode === "draw") {
      stroke = { type: "stroke", points: [point(event)], color: "#d12835", width: 2.5 };
      items.push(stroke); annotations.set(pageNumber, items); canvas.setPointerCapture(event.pointerId);
    } else if (annotationMode === "text") {
      const text = prompt("Annotation text");
      if (!text?.trim()) return;
      items.push({ type: "text", point: point(event), text: text.trim(), color: "#d12835", size: 16 });
      annotations.set(pageNumber, items); redrawAnnotations(context, items, viewport);
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!stroke) return;
    stroke.points.push(point(event)); redrawAnnotations(context, items, viewport);
  });
  canvas.addEventListener("pointerup", () => { stroke = null; });
}

function redrawAnnotations(context, items, viewport) {
  context.clearRect(0, 0, viewport.width, viewport.height);
  context.lineCap = "round"; context.lineJoin = "round";
  for (const item of items) {
    if (item.type === "stroke") {
      context.beginPath(); context.strokeStyle = item.color; context.lineWidth = item.width;
      item.points.forEach(([x, y], index) => { const px = x * viewport.width; const py = y * viewport.height; if (index) context.lineTo(px, py); else context.moveTo(px, py); });
      context.stroke();
    } else if (item.type === "text") {
      context.fillStyle = item.color; context.font = `600 ${item.size}px system-ui`;
      context.fillText(item.text, item.point[0] * viewport.width, item.point[1] * viewport.height);
    }
  }
}

document.addEventListener("pointerup", () => {
  document.querySelectorAll(".textLayer.selecting").forEach((layer) => layer.classList.remove("selecting"));
});
