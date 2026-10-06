// Pure image-preprocessing helpers for OCR. They operate on ImageData-shaped
// objects ({ data: Uint8ClampedArray RGBA, width, height }) so they run in the
// extension page and under Node for tests.

export function makeImage(width, height, fill = 255) {
  const data = new Uint8ClampedArray(width * height * 4).fill(fill);
  if (fill !== 0) for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { data, width, height };
}

export function cloneImage(image) {
  return { data: new Uint8ClampedArray(image.data), width: image.width, height: image.height };
}

// Bilinear resize (also fine for mild downscales).
export function resizeImage(source, width, height) {
  const out = makeImage(width, height, 0);
  const sx = source.width / width; const sy = source.height / height;
  for (let y = 0; y < height; y += 1) {
    const fy = Math.max(0, Math.min(source.height - 1, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy); const y1 = Math.min(source.height - 1, y0 + 1); const wy = fy - y0;
    for (let x = 0; x < width; x += 1) {
      const fx = Math.max(0, Math.min(source.width - 1, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx); const x1 = Math.min(source.width - 1, x0 + 1); const wx = fx - x0;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const a = source.data[(y0 * source.width + x0) * 4 + c]; const b = source.data[(y0 * source.width + x1) * 4 + c];
        const d = source.data[(y1 * source.width + x0) * 4 + c]; const e = source.data[(y1 * source.width + x1) * 4 + c];
        out.data[o + c] = (a * (1 - wx) + b * wx) * (1 - wy) + (d * (1 - wx) + e * wx) * wy;
      }
      out.data[o + 3] = 255;
    }
  }
  return out;
}

// Scale so the short side of the text block is large enough for the LSTM
// (Tesseract works best with ~30-60px glyphs) without blowing up huge crops.
export function scaleForOcr(source, { targetShortSide = 120, minScale = 1, maxScale = 5, maxLongSide = 1800 } = {}) {
  const short = Math.min(source.width, source.height); const long = Math.max(source.width, source.height);
  let scale = Math.max(minScale, Math.min(maxScale, targetShortSide / short));
  scale = Math.min(scale, maxLongSide / long);
  if (Math.abs(scale - 1) < 0.05) return cloneImage(source);
  return resizeImage(source, Math.max(1, Math.round(source.width * scale)), Math.max(1, Math.round(source.height * scale)));
}

export function toGrayscale(image) {
  const gray = new Uint8ClampedArray(image.width * image.height);
  for (let i = 0, p = 0; i < image.data.length; i += 4, p += 1) gray[p] = Math.round(image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114);
  return gray;
}

export function grayToImage(gray, width, height) {
  const out = makeImage(width, height, 0);
  for (let p = 0; p < gray.length; p += 1) { const o = p * 4; out.data[o] = out.data[o + 1] = out.data[o + 2] = gray[p]; out.data[o + 3] = 255; }
  return out;
}

export function addPadding(image, padding, fill = 255) {
  const out = makeImage(image.width + padding * 2, image.height + padding * 2, fill);
  for (let y = 0; y < image.height; y += 1) out.data.set(image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4), ((y + padding) * out.width + padding) * 4);
  return out;
}

// Mean grayscale of the 1-px frame around the image.
function borderMean(gray, width, height) {
  let sum = 0; let n = 0;
  for (let x = 0; x < width; x += 1) { sum += gray[x] + gray[(height - 1) * width + x]; n += 2; }
  for (let y = 1; y < height - 1; y += 1) { sum += gray[y * width] + gray[y * width + width - 1]; n += 2; }
  return sum / n;
}

export function otsuThreshold(gray) {
  const histogram = new Array(256).fill(0); for (const v of gray) histogram[v] += 1;
  const total = gray.length; let sum = 0; for (let v = 0; v < 256; v += 1) sum += v * histogram[v];
  let bw = 0; let bs = 0; let max = 0; let threshold = 128;
  for (let v = 0; v < 256; v += 1) {
    bw += histogram[v]; if (!bw) continue; const fw = total - bw; if (!fw) break;
    bs += v * histogram[v]; const diff = bs / bw - (sum - bs) / fw; const variance = bw * fw * diff * diff;
    if (variance > max) { max = variance; threshold = v; }
  }
  return threshold;
}

// Stretch the 2nd-98th percentile to 0-255. Keeps anti-aliasing, which the
// LSTM engine generally prefers over a hard binarisation.
export function stretchContrast(gray) {
  const histogram = new Array(256).fill(0); for (const v of gray) histogram[v] += 1;
  const lowTarget = gray.length * 0.02; const highTarget = gray.length * 0.98;
  let low = 0; let high = 255; let acc = 0;
  for (let v = 0; v < 256; v += 1) { acc += histogram[v]; if (acc >= lowTarget) { low = v; break; } }
  acc = 0; for (let v = 0; v < 256; v += 1) { acc += histogram[v]; if (acc >= highTarget) { high = v; break; } }
  if (high - low < 16) return Uint8ClampedArray.from(gray);
  const out = new Uint8ClampedArray(gray.length);
  for (let p = 0; p < gray.length; p += 1) out[p] = Math.max(0, Math.min(255, ((gray[p] - low) * 255) / (high - low)));
  return out;
}

export function invertGray(gray) { return gray.map((v) => 255 - v); }

export function globalBinarize(gray, threshold = otsuThreshold(gray)) { return gray.map((v) => (v < threshold ? 0 : 255)); }

// Two-colour clustering (k-means in RGB). Returns a gray image where the
// cluster judged to be "text" is black and everything else white. Text is the
// cluster that is rarer along the image border (the border is almost always
// background), which handles dark-on-light, light-on-dark, and coloured text.
export function colorIsolate(image, { iterations = 8 } = {}) {
  const { width, height, data } = image; const pixels = width * height;
  const step = Math.max(1, Math.floor(pixels / 6000)); const sample = [];
  for (let p = 0; p < pixels; p += step) sample.push(p);
  const gray = toGrayscale(image);
  let darkest = sample[0]; let lightest = sample[0];
  for (const p of sample) { if (gray[p] < gray[darkest]) darkest = p; if (gray[p] > gray[lightest]) lightest = p; }
  const centers = [[data[darkest * 4], data[darkest * 4 + 1], data[darkest * 4 + 2]], [data[lightest * 4], data[lightest * 4 + 1], data[lightest * 4 + 2]]];
  const assign = (p) => {
    const o = p * 4; let best = 0; let bestDistance = Infinity;
    for (let c = 0; c < 2; c += 1) { const dr = data[o] - centers[c][0]; const dg = data[o + 1] - centers[c][1]; const db = data[o + 2] - centers[c][2]; const d = dr * dr + dg * dg + db * db; if (d < bestDistance) { bestDistance = d; best = c; } }
    return best;
  };
  for (let i = 0; i < iterations; i += 1) {
    const sums = [[0, 0, 0, 0], [0, 0, 0, 0]];
    for (const p of sample) { const c = assign(p); const o = p * 4; sums[c][0] += data[o]; sums[c][1] += data[o + 1]; sums[c][2] += data[o + 2]; sums[c][3] += 1; }
    for (let c = 0; c < 2; c += 1) if (sums[c][3]) centers[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
  }
  const labels = new Uint8Array(pixels); for (let p = 0; p < pixels; p += 1) labels[p] = assign(p);
  const border = [0, 0]; let borderCount = 0; const countBorder = (p) => { border[labels[p]] += 1; borderCount += 1; };
  for (let x = 0; x < width; x += 1) { countBorder(x); countBorder((height - 1) * width + x); }
  for (let y = 1; y < height - 1; y += 1) { countBorder(y * width); countBorder(y * width + width - 1); }
  const total = [0, 0]; for (let p = 0; p < pixels; p += 1) total[labels[p]] += 1;
  // Fraction of each cluster that lies on the border, relative to its size.
  const edgeShare = [border[0] / (total[0] || 1), border[1] / (total[1] || 1)];
  const textCluster = edgeShare[0] === edgeShare[1] ? (total[0] < total[1] ? 0 : 1) : (edgeShare[0] < edgeShare[1] ? 0 : 1);
  const out = new Uint8ClampedArray(pixels); for (let p = 0; p < pixels; p += 1) out[p] = labels[p] === textCluster ? 0 : 255;
  return out;
}

// Make the image dark-on-light by checking which polarity the border has.
export function ensureDarkOnLight(gray, width, height) {
  return borderMean(gray, width, height) < 110 ? invertGray(gray) : gray;
}

// Second-level Otsu inside one tonal class. Used for outlined/captioned text
// (white fill + dark outline, or the reverse) where the fill is the extreme
// tone of the image and the outline/photo sits in the middle.
export function fillIsolate(gray, light = true) {
  let low = 255; let high = 0; for (const v of gray) { if (v < low) low = v; if (v > high) high = v; }
  if (high - low < 48) return null; // flat image: there is no distinct fill tone to isolate
  const t1 = otsuThreshold(gray);
  const inClass = []; for (const v of gray) if (light ? v >= t1 : v < t1) inClass.push(v);
  if (inClass.length < gray.length * 0.02) return null;
  const t2 = otsuThreshold(Uint8ClampedArray.from(inClass));
  // Pixels in the extreme tone are text (black on white output).
  const out = new Uint8ClampedArray(gray.length);
  for (let p = 0; p < gray.length; p += 1) out[p] = (light ? gray[p] > t2 : gray[p] <= t2) ? 0 : 255;
  return out;
}

// Split a text mask (text = 0) into vertical-text columns, right to left.
// Returns null unless the crop clearly looks like 2+ tall columns, so that
// horizontal text with wide word gaps is never mistaken for columns.
export function findTextColumns(mask, width, height) {
  if (height < width * 0.9) return null;
  const ink = new Uint32Array(width);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if (mask[y * width + x] === 0) ink[x] += 1;
  const noise = Math.max(1, height * 0.03);
  const runs = []; let start = -1;
  for (let x = 0; x <= width; x += 1) {
    const on = x < width && ink[x] > noise;
    if (on && start < 0) start = x;
    if (!on && start >= 0) { runs.push([start, x - 1]); start = -1; }
  }
  if (runs.length < 2) return null;
  const widest = Math.max(...runs.map(([a, b]) => b - a + 1));
  const merged = [runs[0].slice()];
  for (const run of runs.slice(1)) {
    const last = merged[merged.length - 1];
    if (run[0] - last[1] - 1 < widest * 0.15) last[1] = run[1]; else merged.push(run.slice());
  }
  const columns = merged.filter(([a, b]) => { let total = 0; for (let x = a; x <= b; x += 1) total += ink[x]; return total > height * widest * 0.04; });
  if (columns.length < 2) return null;
  // Every column must be a tall strip (not a char-sized blob from horizontal text).
  const tall = columns.every(([a, b]) => {
    let top = height; let bottom = -1;
    for (let y = 0; y < height; y += 1) for (let x = a; x <= b; x += 1) if (mask[y * width + x] === 0) { if (y < top) top = y; bottom = y; break; }
    return bottom - top + 1 >= (b - a + 1) * 2.5;
  });
  if (!tall) return null;
  const pad = Math.round(widest * 0.15);
  return columns.map(([a, b]) => ({ x0: Math.max(0, a - pad), x1: Math.min(width - 1, b + pad) })).reverse();
}

export function cropColumns(image, x0, x1) {
  const width = x1 - x0 + 1; const out = makeImage(width, image.height, 0);
  for (let y = 0; y < image.height; y += 1) out.data.set(image.data.subarray((y * image.width + x0) * 4, (y * image.width + x1 + 1) * 4), y * width * 4);
  return out;
}
