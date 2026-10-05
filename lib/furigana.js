const KANJI_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;

// Aligns kana already present in the written form and groups the intervening
// kanji with the corresponding portion of the reading. All-kanji compounds
// remain one honest word-level group rather than inventing per-character reads.
export function segmentFurigana(term = "", reading = "") {
  if (!term || !reading || term === reading) return [{ text: term, reading: "" }];
  const segments = [];
  let termIndex = 0;
  let readingIndex = 0;
  while (termIndex < term.length) {
    if (!KANJI_RE.test(term[termIndex])) {
      const start = termIndex;
      while (termIndex < term.length && !KANJI_RE.test(term[termIndex])) termIndex += 1;
      const kana = term.slice(start, termIndex);
      segments.push({ text: kana, reading: "" });
      const found = reading.indexOf(kana, readingIndex);
      readingIndex = found >= 0 ? found + kana.length : readingIndex + kana.length;
      continue;
    }
    const start = termIndex;
    while (termIndex < term.length && KANJI_RE.test(term[termIndex])) termIndex += 1;
    const kanji = term.slice(start, termIndex);
    let nextKana = "";
    for (let index = termIndex; index < term.length && !KANJI_RE.test(term[index]); index += 1) nextKana += term[index];
    const end = nextKana ? reading.indexOf(nextKana, readingIndex) : reading.length;
    segments.push({ text: kanji, reading: reading.slice(readingIndex, end >= 0 ? end : reading.length) });
    readingIndex = end >= 0 ? end : reading.length;
  }
  return segments;
}
