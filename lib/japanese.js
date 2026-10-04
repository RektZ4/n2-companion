export const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;

export function containsJapanese(text = "") {
  return JAPANESE_RE.test(text);
}

export function cleanSelection(text = "", maxLength = 100) {
  return text
    .replace(/\s+/g, " ")
    .replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu, "$1")
    .trim()
    .slice(0, maxLength);
}

export function cleanContext(text = "", maxLength = 320) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1)}…`;
}

export function hiraganaToKatakana(text = "") {
  return [...text].map((char) => {
    const code = char.charCodeAt(0);
    return code >= 0x3041 && code <= 0x3096
      ? String.fromCharCode(code + 0x60)
      : char;
  }).join("");
}

export function isSameReading(term, reading) {
  return term === reading || hiraganaToKatakana(term) === hiraganaToKatakana(reading);
}
