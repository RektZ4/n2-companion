import { toHiragana } from "../vendor/wanakana/index.js";
import { containsJapanese } from "./japanese.js";

const LATIN_QUERY_RE = /^[A-Za-z][A-Za-z' -]*$/;
const LATIN_CHAR_RE = /[A-Za-z]/;

export function buildLookupQueries(text) {
  if (containsJapanese(text)) return [text];
  if (!LATIN_QUERY_RE.test(text)) return [];

  const hiragana = toHiragana(text.toLowerCase()).replace(/\s+/g, " ").trim();
  // WanaKana leaves impossible romaji letters untouched. Only prioritize a
  // conversion when the entire query was valid romaji; otherwise let Jisho
  // handle it as an ordinary English definition search.
  if (hiragana !== text.toLowerCase() && containsJapanese(hiragana) && !LATIN_CHAR_RE.test(hiragana)) {
    return [hiragana, text];
  }
  return [text];
}
