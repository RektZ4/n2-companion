import test from "node:test";
import assert from "node:assert/strict";
import { colorIsolate, cropColumns, ensureDarkOnLight, fillIsolate, findTextColumns, grayToImage, makeImage, otsuThreshold, resizeImage, scaleForOcr, stretchContrast, toGrayscale } from "../lib/ocr-preprocess.js";

function paint(image, x0, y0, w, h, [r, g, b]) {
  for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) { const o = (y * image.width + x) * 4; image.data[o] = r; image.data[o + 1] = g; image.data[o + 2] = b; }
}
function mask(width, height, rects) {
  const out = new Uint8ClampedArray(width * height).fill(255);
  for (const [x0, y0, w, h] of rects) for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) out[y * width + x] = 0;
  return out;
}

test("resize and scaling respect bounds", () => {
  const image = makeImage(40, 20);
  assert.deepEqual([resizeImage(image, 80, 40).width, resizeImage(image, 80, 40).height], [80, 40]);
  const scaled = scaleForOcr(image, { targetShortSide: 120, maxScale: 5 });
  assert.equal(scaled.height, 100); // capped at 5x
  const big = scaleForOcr(makeImage(3000, 400), { maxLongSide: 1800 });
  assert.ok(big.width <= 1800);
  assert.equal(scaleForOcr(makeImage(300, 200)).width, 300); // never shrinks small-scale crops below 1x
});

test("otsu separates a bimodal image", () => {
  const gray = Uint8ClampedArray.from([...new Array(50).fill(20), ...new Array(50).fill(220)]);
  const t = otsuThreshold(gray); assert.ok(t >= 20 && t < 220);
});
test("contrast stretch expands a washed-out range", () => {
  const gray = Uint8ClampedArray.from([...new Array(50).fill(100), ...new Array(50).fill(140)]);
  const out = stretchContrast(gray); assert.ok(Math.min(...out) <= 5 && Math.max(...out) >= 250);
});
test("polarity: light-on-dark is inverted to dark-on-light", () => {
  const dark = new Uint8ClampedArray(100).fill(10); dark[55] = 250;
  assert.equal(ensureDarkOnLight(dark, 10, 10)[0], 245);
  const light = new Uint8ClampedArray(100).fill(240);
  assert.equal(ensureDarkOnLight(light, 10, 10)[0], 240);
});

test("colour isolation makes red text on a pale page black and the page white", () => {
  const image = makeImage(60, 30); paint(image, 0, 0, 60, 30, [250, 246, 240]); paint(image, 20, 10, 20, 8, [205, 35, 35]);
  const out = colorIsolate(image);
  assert.equal(out[12 * 60 + 25], 0); assert.equal(out[2 * 60 + 2], 255);
});
test("colour isolation treats the rarer colour as text even when text is light", () => {
  const image = makeImage(60, 30); paint(image, 0, 0, 60, 30, [20, 25, 40]); paint(image, 20, 10, 20, 8, [240, 240, 240]);
  const out = colorIsolate(image);
  assert.equal(out[12 * 60 + 25], 0); assert.equal(out[2 * 60 + 2], 255);
});
test("fill isolation keeps bright caption fill and drops its dark outline", () => {
  // 0 = outline/background ring, ~120 = photo, 250 = fill
  const gray = new Uint8ClampedArray(400).fill(120);
  for (let i = 0; i < 80; i += 1) gray[i] = 20; // dark outline
  for (let i = 300; i < 360; i += 1) gray[i] = 250; // fill
  const out = fillIsolate(gray, true);
  assert.equal(out[320], 0); assert.equal(out[10], 255); assert.equal(out[200], 255);
});
test("fill isolation returns null when the tone barely exists", () => assert.equal(fillIsolate(new Uint8ClampedArray(1000).fill(128), true), null));

test("finds two tall columns and orders them right to left", () => {
  const m = mask(120, 200, [[15, 10, 28, 180], [75, 10, 28, 180]]);
  const cols = findTextColumns(m, 120, 200);
  assert.equal(cols.length, 2); assert.ok(cols[0].x0 > cols[1].x0);
});
test("a single column of staggered glyphs is not split", () => {
  const glyphs = [[15, 10, 26, 28], [18, 45, 20, 28], [14, 80, 28, 28], [16, 115, 24, 28], [13, 150, 30, 28]];
  assert.equal(findTextColumns(mask(60, 200, glyphs), 60, 200), null);
});
test("hairline gaps inside one column are merged, not split", () => {
  assert.equal(findTextColumns(mask(70, 200, [[10, 10, 26, 180], [37, 10, 10, 180]]), 70, 200), null);
});
test("wide horizontal text with word gaps is never treated as columns", () => {
  assert.equal(findTextColumns(mask(300, 40, [[5, 8, 60, 24], [120, 8, 60, 24], [230, 8, 60, 24]]), 300, 40), null);
});
test("tall crop of horizontal lines is not split into columns", () => {
  assert.equal(findTextColumns(mask(120, 200, [[10, 20, 40, 12], [70, 20, 40, 12], [10, 60, 40, 12]]), 120, 200), null);
});
test("cropColumns extracts the requested slice", () => {
  const image = makeImage(10, 4); paint(image, 4, 0, 2, 4, [1, 2, 3]);
  const part = cropColumns(image, 4, 5);
  assert.equal(part.width, 2); assert.equal(part.data[0], 1);
  assert.equal(grayToImage(toGrayscale(part), 2, 4).width, 2);
});
