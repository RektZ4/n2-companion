import { addPadding, colorIsolate, cropColumns, ensureDarkOnLight, fillIsolate, findTextColumns, grayToImage, scaleForOcr, stretchContrast, toGrayscale } from "./ocr-preprocess.js";
import { cleanOcrText, rankOcrCandidates } from "./ocr-quality.js";

// Tesseract page segmentation modes used here.
export const PSM_VERTICAL_BLOCK = 5;
export const PSM_BLOCK = 6;

const PADDING = 24;
// Glyph size matters to Tesseract and the right size depends on the picture,
// so each crop is read at a few sizes and the readings are compared.
export const DEFAULT_SCALES = [120];

// Different pictures break differently, so we feed Tesseract several cleaned-up
// renderings of the same crop and keep the one it reads most plausibly:
//   gray        contrast-stretched grayscale (keeps anti-aliasing; polarity-corrected)
//   color       two-colour split, so coloured text / textured backgrounds work
//   light-fill  brightest tone only: white caption text with a dark outline
//   dark-fill   darkest tone only: black text with a light outline / halo
export function buildVariants(source, scaleOptions) {
  const scaled = scaleForOcr(source, scaleOptions);
  const { width, height } = scaled;
  const gray = toGrayscale(scaled);
  const tag = scaleOptions?.targetShortSide ? `@${scaleOptions.targetShortSide}` : "";
  const make = (name, pixels) => ({ name: name + tag, image: addPadding(grayToImage(pixels, width, height), PADDING) });
  const variants = [make("gray", ensureDarkOnLight(stretchContrast(gray), width, height)), make("color", colorIsolate(scaled))];
  const light = fillIsolate(gray, true); if (light) variants.push(make("light-fill", light));
  const dark = fillIsolate(gray, false); if (dark) variants.push(make("dark-fill", dark));
  return variants;
}

// engine.recognize(model, image, psm) -> { text, confidence, symbols }
// model is "jpn" (horizontal-trained, also fine for single glyph columns) or "jpn_vert".
export async function runOcrPipeline(source, engine, { onStatus = () => {}, scales = DEFAULT_SCALES, splitColumns = true } = {}) {
  // Several vertical columns (manga, novels): OCR each column on its own, right
  // to left. Engines otherwise interleave characters from neighbouring columns.
  if (splitColumns) {
    const columns = findTextColumns(colorIsolate(source), source.width, source.height);
    if (columns) {
      const texts = []; const parts = [];
      for (const [index, { x0, x1 }] of columns.entries()) {
        onStatus({ column: index + 1, columns: columns.length });
        const ranked = await runOcrPipeline(cropColumns(source, x0, x1), engine, { onStatus, scales, splitColumns: false });
        if (ranked[0]) { parts.push(ranked[0]); texts.push(cleanOcrText(ranked[0].text)); }
      }
      if (parts.length) return [{ text: texts.join(" "), confidence: parts.reduce((sum, part) => sum + part.confidence, 0) / parts.length, mode: `${parts.length} columns`, score: Math.min(...parts.map((part) => part.score)), alternatives: [] }];
    }
  }
  const variants = scales.flatMap((targetShortSide) => buildVariants(source, { targetShortSide }));
  const candidates = []; const failures = [];
  const attempt = async (model, variant, psm) => {
    onStatus({ model, variant: variant.name });
    try {
      const result = await engine.recognize(model, variant.image, psm);
      candidates.push({ ...result, mode: `${variant.name}/${model}` });
    } catch (error) { failures.push(error); }
  };
  const aspect = source.height / source.width;

  // Each recognition takes a fraction of a second, and a confident-but-wrong
  // read is common, so every variant is tried and the candidates compete.
  // Horizontal model first: for a single column of upright glyphs, treating the
  // crop as a block of one-character lines reads better than vertical mode.
  for (const variant of variants) await attempt("jpn", variant, PSM_BLOCK);
  // Vertical model: skipped for clearly wide crops. Its reading-order check
  // (see ocr-quality) discards scrambled output on horizontal text anyway.
  if (aspect >= 0.5) for (const variant of variants) await attempt("jpn_vert", variant, PSM_VERTICAL_BLOCK);
  const ranked = rankOcrCandidates(candidates);
  if (!ranked.length && failures.length) throw failures[0];
  return ranked;
}
