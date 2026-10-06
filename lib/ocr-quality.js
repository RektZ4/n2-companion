const JAPANESE = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/gu;
const NOISE = /[^\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff01-\uff60A-Za-z0-9\s()]/gu;

export function cleanOcrText(text = "") {
  return text.replace(NOISE, " ").replace(/\s+/g, " ").replace(/(?<=[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff])\s+(?=[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff])/gu, "").trim();
}

export function scoreOcrCandidate(candidate) {
  const text = cleanOcrText(candidate?.text || "");
  const compact = text.replace(/\s/g, "");
  if (!compact) return -Infinity;
  const japanese = compact.match(JAPANESE)?.length || 0;
  const japaneseRatio = japanese / compact.length;
  return Number(candidate?.confidence || 0) + japaneseRatio * 55 + Math.min(japanese, 12) * 1.5;
}

export function bestOcrCandidate(candidates) {
  return [...candidates].sort((a, b) => scoreOcrCandidate(b) - scoreOcrCandidate(a))[0] || null;
}
