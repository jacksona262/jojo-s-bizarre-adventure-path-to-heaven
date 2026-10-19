// Deterministic 2D simplex noise + helpers (seeded, no allocations in the hot path).

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const grad = new Float32Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1]);

function buildPerm(seed) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) p[i] = i;
  let s = seed >>> 0;
  for (let i = 255; i > 0; i -= 1) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i += 1) perm[i] = p[i & 255];
  return perm;
}

const perm = buildPerm(1889);

export function simplex(xin, yin) {
  const s = (xin + yin) * F2;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const t = (i + j) * G2;
  const x0 = xin - (i - t);
  const y0 = yin - (j - t);
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2; const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2; const y2 = y0 - 1 + 2 * G2;
  const ii = i & 255; const jj = j & 255;
  let n = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) { const g = (perm[ii + perm[jj]] & 7) * 2; t0 *= t0; n += t0 * t0 * (grad[g] * x0 + grad[g + 1] * y0); }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) { const g = (perm[ii + i1 + perm[jj + j1]] & 7) * 2; t1 *= t1; n += t1 * t1 * (grad[g] * x1 + grad[g + 1] * y1); }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) { const g = (perm[ii + 1 + perm[jj + 1]] & 7) * 2; t2 *= t2; n += t2 * t2 * (grad[g] * x2 + grad[g + 1] * y2); }
  return 70 * n; // ~[-1,1]
}

export function fbm(x, y, oct = 4, lac = 2.03, gain = 0.5) {
  let a = 1; let f = 1; let sum = 0; let norm = 0;
  for (let o = 0; o < oct; o += 1) {
    sum += simplex(x * f, y * f) * a;
    norm += a; a *= gain; f *= lac;
  }
  return sum / norm;
}

export function ridged(x, y, oct = 4) {
  let a = 0.5; let f = 1; let sum = 0;
  for (let o = 0; o < oct; o += 1) {
    const n = 1 - Math.abs(simplex(x * f, y * f));
    sum += n * n * a; a *= 0.5; f *= 2.1;
  }
  return sum;
}

// Hash-based random for deterministic placement.
export function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a, b, t) => a + (b - a) * t;
