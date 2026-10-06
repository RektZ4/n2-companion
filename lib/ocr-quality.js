const KANA_KANJI = "\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff";
const JAPANESE = new RegExp(`[${KANA_KANJI}]`, "u");
const JAPANESE_GLOBAL = new RegExp(`[${KANA_KANJI}]`, "gu");
const KEEP = new RegExp(`[${KANA_KANJI}\\u3000-\\u303f\\uff01-\\uff60A-Za-z0-9]`, "u");
const NOISE = /[^\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff01-\uff60A-Za-z0-9\s()]/gu;
const CJK_GAP = new RegExp(`(?<=[\\u3000-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uff01-\\uff60])\\s+(?=[\\u3000-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uff01-\\uff60])`, "gu");

export function cleanOcrText(text = "") {
  return fixCommonConfusions(text.replace(NOISE, " ").replace(/\s+/g, " ").replace(CJK_GAP, "").trim());
}

// Tesseract's Japanese model reliably turns a wave dash between numbers
// (2〜3マス) into ご / へ / ー / ~. Between two digits those are never real words.
function fixCommonConfusions(text) {
  return text.replace(/([0-9０-９])\s*[ごへーｰ~∼～]+\s*([0-9０-９])/gu, "$1〜$2");
}

function keptSymbols(symbols = []) {
  return symbols.filter((symbol) => symbol?.bbox && KEEP.test(symbol.text || "") && /\S/u.test(symbol.text));
}

// How well do consecutive characters follow a real Japanese reading path?
// Horizontal: step right on the same row, or wrap to the next row at the left.
// Vertical: step down the same column, or wrap to the next column on the left.
// Scrambled output (e.g. a vertical model reading horizontal text) fits neither.
// Returns 0..1, or 1 when there is too little geometry to judge.
export function readingOrderScore(symbols = []) {
  const kept = keptSymbols(symbols);
  if (kept.length < 3) return 1;
  const boxes = kept.map(({ bbox }) => ({ x: (bbox.x0 + bbox.x1) / 2, y: (bbox.y0 + bbox.y1) / 2, size: Math.max(bbox.x1 - bbox.x0, bbox.y1 - bbox.y0, 1) }));
  const sizes = boxes.map((box) => box.size).sort((a, b) => a - b);
  const size = sizes[Math.floor(sizes.length / 2)];
  let horizontal = 0; let vertical = 0; let columnBreaks = 0;
  for (let index = 1; index < boxes.length; index += 1) {
    const dx = boxes[index].x - boxes[index - 1].x; const dy = boxes[index].y - boxes[index - 1].y;
    if (dx > -0.3 * size && Math.abs(dy) < 0.7 * size) horizontal += 1;
    else if (dx < -0.8 * size && dy > 0.5 * size) horizontal += 1;
    if (dy > -0.3 * size && Math.abs(dx) < 0.7 * size) vertical += 1;
    else if (dy < -0.8 * size && dx < -0.5 * size) { vertical += 1; columnBreaks += 1; }
  }
  // A vertical model reading two horizontal rows yields a valid-looking path made
  // of tiny 2-character "columns". Real vertical text has longer columns.
  const columnLength = boxes.length / (columnBreaks + 1);
  if (boxes.length >= 6 && columnLength < 2.5) vertical *= 0.5;
  return Math.max(horizontal, vertical) / (boxes.length - 1);
}

export function scoreOcrCandidate(candidate) {
  const text = cleanOcrText(candidate?.text || "");
  const compact = text.replace(/\s/g, "");
  if (!compact) return -Infinity;
  const japanese = compact.match(JAPANESE_GLOBAL)?.length || 0;
  const japaneseRatio = japanese / compact.length;
  const kept = keptSymbols(candidate?.symbols);
  // Mean confidence over characters we actually keep; stray "|" from ruled
  // lines or borders must not drag down (or prop up) a result.
  const confidence = kept.length ? kept.reduce((sum, symbol) => sum + (symbol.confidence || 0), 0) / kept.length : Number(candidate?.confidence || 0);
  const order = candidate?.symbols ? readingOrderScore(candidate.symbols) : 1;
  return confidence * 0.7 + japaneseRatio * 40 + Math.min(japanese, 12) * 1.5 + order * 40;
}

function lcsLength(a, b) {
  const left = [...a]; const right = [...b];
  let previous = new Array(right.length + 1).fill(0);
  for (let i = 1; i <= left.length; i += 1) {
    const current = new Array(right.length + 1).fill(0);
    for (let j = 1; j <= right.length; j += 1) current[j] = left[i - 1] === right[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    previous = current;
  }
  return previous[right.length];
}

// 0..1 text similarity (Dice over the longest common subsequence).
export function textSimilarity(a, b) {
  const x = [...a].length; const y = [...b].length;
  if (!x || !y) return 0;
  return (2 * lcsLength(a, b)) / (x + y);
}

// Each variant/model misreads in its own way, but the true reading tends to
// recur. Candidates therefore earn credit for agreeing with the other ones.
export function rankOcrCandidates(candidates, { consensusWeight = 80 } = {}) {
  const scored = candidates.map((candidate) => ({ ...candidate, base: scoreOcrCandidate(candidate), clean: cleanOcrText(candidate?.text || "").replace(/\s/g, "") })).filter((candidate) => Number.isFinite(candidate.base));
  for (const candidate of scored) {
    const others = scored.filter((other) => other !== candidate);
    const agreement = others.length ? others.reduce((sum, other) => sum + textSimilarity(candidate.clean, other.clean), 0) / others.length : 0;
    candidate.score = candidate.base + agreement * consensusWeight;
  }
  return scored.sort((a, b) => b.score - a.score);
}

export function bestOcrCandidate(candidates) {
  return [...candidates].sort((a, b) => scoreOcrCandidate(b) - scoreOcrCandidate(a))[0] || null;
}

export function hasJapanese(text) { return JAPANESE.test(text || ""); }
