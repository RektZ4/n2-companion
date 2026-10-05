export function appendFurigana(container, segments, fallback = "") {
  container.replaceChildren();
  if (!segments?.length) { container.textContent = fallback; return; }
  for (const segment of segments) {
    if (!segment.reading) { container.append(document.createTextNode(segment.text)); continue; }
    const ruby = document.createElement("ruby"); ruby.className = "furigana-group"; ruby.append(document.createTextNode(segment.text));
    const rt = document.createElement("rt"); rt.textContent = segment.reading; ruby.append(rt); container.append(ruby);
  }
}
