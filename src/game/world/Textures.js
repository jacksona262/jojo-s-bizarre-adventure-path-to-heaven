import * as THREE from 'three';
import { mulberry } from './Noise';

// Procedurally painted textures for architecture and terrain detail (no external images).

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function grain(g, w, h, rnd, alpha = 0.08, n = 1400) {
  for (let i = 0; i < n; i += 1) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,240,220'},${alpha * rnd()})`;
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

// Vertical weathered planks. tint: base rgb.
function planks(key, tint, { boards = 8, vertical = true, dark = 0 } = {}) {
  const S = 512;
  const [c, g] = canvas(S, S);
  const rnd = mulberry(key.length * 977);
  for (let i = 0; i < boards; i += 1) {
    const v = 0.75 + rnd() * 0.4 - dark;
    const r = Math.floor(tint[0] * v); const gg = Math.floor(tint[1] * v); const b = Math.floor(tint[2] * v);
    g.fillStyle = `rgb(${r},${gg},${b})`;
    const x = (i * S) / boards;
    if (vertical) g.fillRect(x, 0, S / boards, S); else g.fillRect(0, x, S, S / boards);
    // grain streaks
    for (let k = 0; k < 40; k += 1) {
      g.strokeStyle = `rgba(${rnd() < 0.6 ? '20,12,6' : '200,170,130'},${0.05 + rnd() * 0.08})`;
      g.lineWidth = 1 + rnd() * 1.5;
      g.beginPath();
      const o = x + rnd() * (S / boards);
      if (vertical) { g.moveTo(o, 0); g.bezierCurveTo(o + rnd() * 6 - 3, S * 0.3, o + rnd() * 6 - 3, S * 0.7, o + rnd() * 4 - 2, S); } else { g.moveTo(0, o); g.bezierCurveTo(S * 0.3, o + rnd() * 6 - 3, S * 0.7, o + rnd() * 6 - 3, S, o + rnd() * 4 - 2); }
      g.stroke();
    }
    // knots + nails
    if (rnd() < 0.6) {
      g.fillStyle = 'rgba(30,18,10,0.5)';
      const kx = vertical ? x + S / boards / 2 : rnd() * S; const ky = vertical ? rnd() * S : x + S / boards / 2;
      g.beginPath(); g.ellipse(kx, ky, 4 + rnd() * 5, 7 + rnd() * 8, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(15,10,8,0.85)';
    for (const yy of [S * 0.08, S * 0.92]) {
      const px = vertical ? x + S / boards * 0.3 : yy; const py = vertical ? yy : x + S / boards * 0.3;
      g.fillRect(px, py, 3, 3);
    }
    // gaps
    g.fillStyle = 'rgba(8,5,3,0.9)';
    if (vertical) g.fillRect(x, 0, 2, S); else g.fillRect(0, x, S, 2);
  }
  // water staining from the bottom
  const grd = g.createLinearGradient(0, S, 0, S * 0.55);
  grd.addColorStop(0, 'rgba(10,8,6,0.45)'); grd.addColorStop(1, 'rgba(10,8,6,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  grain(g, S, S, rnd);
  return tex(c);
}

function shingles(key, tint) {
  const S = 512;
  const [c, g] = canvas(S, S);
  const rnd = mulberry(4111);
  const rows = 14;
  for (let r = 0; r < rows; r += 1) {
    const y = (r * S) / rows;
    const off = r % 2 ? 0 : 18;
    for (let x = -off; x < S; x += 36) {
      const v = 0.6 + rnd() * 0.5;
      g.fillStyle = `rgb(${Math.floor(tint[0] * v)},${Math.floor(tint[1] * v)},${Math.floor(tint[2] * v)})`;
      g.fillRect(x + 1, y, 34 + rnd() * 3, S / rows + 4);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(x, y, 2, S / rows);
    }
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, y + S / rows - 3, S, 3);
  }
  grain(g, S, S, rnd, 0.1);
  return tex(c);
}

function stone(key, tint, { brick = false } = {}) {
  const S = 512;
  const [c, g] = canvas(S, S);
  const rnd = mulberry(brick ? 707 : 303);
  g.fillStyle = `rgb(${tint[0] * 0.5},${tint[1] * 0.5},${tint[2] * 0.5})`;
  g.fillRect(0, 0, S, S);
  const rows = brick ? 16 : 8;
  for (let r = 0; r < rows; r += 1) {
    const h = S / rows;
    const y = r * h;
    let x = (r % 2) * (brick ? 32 : 40) - 60;
    while (x < S) {
      const w = brick ? 64 : 60 + rnd() * 70;
      const v = 0.7 + rnd() * 0.45;
      g.fillStyle = `rgb(${Math.floor(tint[0] * v)},${Math.floor(tint[1] * v)},${Math.floor(tint[2] * v)})`;
      g.fillRect(x + 2, y + 2, w - 4, h - 4);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(x + 2, y + 2, w - 4, 3);
      x += w;
    }
  }
  grain(g, S, S, rnd, 0.12, 3000);
  return tex(c);
}

function rock() {
  const S = 512;
  const [c, g] = canvas(S, S);
  const rnd = mulberry(99);
  g.fillStyle = '#5c5650'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i += 1) {
    const v = 60 + rnd() * 80;
    g.fillStyle = `rgba(${v},${v * 0.95},${v * 0.9},${0.15 + rnd() * 0.25})`;
    g.beginPath();
    g.ellipse(rnd() * S, rnd() * S, 4 + rnd() * 30, 3 + rnd() * 14, rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 60; i += 1) {
    g.strokeStyle = `rgba(20,18,16,${0.3 + rnd() * 0.4})`;
    g.lineWidth = 1 + rnd() * 2;
    g.beginPath();
    let x = rnd() * S; let y = rnd() * S;
    g.moveTo(x, y);
    for (let k = 0; k < 5; k += 1) { x += rnd() * 40 - 20; y += rnd() * 40 - 10; g.lineTo(x, y); }
    g.stroke();
  }
  grain(g, S, S, rnd, 0.15, 4000);
  return tex(c);
}

function groundDetail() {
  const S = 256;
  const [c, g] = canvas(S, S);
  const rnd = mulberry(55);
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2500; i += 1) {
    const v = 100 + rnd() * 60;
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  for (let i = 0; i < 200; i += 1) {
    const v = 70 + rnd() * 40;
    g.fillStyle = `rgba(${v},${v},${v},0.6)`;
    g.beginPath(); g.arc(rnd() * S, rnd() * S, 1 + rnd() * 4, 0, Math.PI * 2); g.fill();
  }
  return tex(c, { srgb: false });
}

function windowGlow(lit) {
  const S = 128;
  const [c, g] = canvas(S, S);
  g.fillStyle = lit ? '#2a1505' : '#07090c';
  g.fillRect(0, 0, S, S);
  if (lit) {
    const grd = g.createRadialGradient(S / 2, S * 0.6, 4, S / 2, S * 0.6, S * 0.7);
    grd.addColorStop(0, 'rgba(255,190,90,1)'); grd.addColorStop(1, 'rgba(140,60,10,0.6)');
    g.fillStyle = grd; g.fillRect(6, 6, S - 12, S - 12);
  } else {
    g.fillStyle = 'rgba(70,90,110,0.25)'; g.fillRect(6, 6, S - 12, S - 12);
  }
  // muntins
  g.fillStyle = '#1a120a';
  g.fillRect(0, 0, S, 6); g.fillRect(0, S - 6, S, 6); g.fillRect(0, 0, 6, S); g.fillRect(S - 6, 0, 6, S);
  g.fillRect(S / 2 - 3, 0, 6, S); g.fillRect(0, S / 2 - 3, S, 6);
  return tex(c, { repeat: false });
}

export function signTexture(text) {
  const key = `sign:${text}`;
  if (cache.has(key)) return cache.get(key);
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#2a1a0e'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#3d2614'; g.fillRect(8, 8, 496, 112);
  g.strokeStyle = '#c9a05a'; g.lineWidth = 4; g.strokeRect(16, 16, 480, 96);
  g.fillStyle = '#e8d3a2';
  g.font = 'bold 58px Georgia, serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 68, 460);
  const rnd = mulberry(text.length * 31);
  for (let i = 0; i < 500; i += 1) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.25})`; g.fillRect(rnd() * 512, rnd() * 128, 3, 2); }
  const t = tex(c, { repeat: false });
  cache.set(key, t);
  return t;
}

export function getTextures() {
  if (cache.has('all')) return cache.get('all');
  const t = {
    woodLight: planks('woodLight', [150, 112, 74]),
    woodDark: planks('woodDark', [92, 64, 42], { dark: 0.05 }),
    woodRed: planks('woodRed', [128, 52, 38]),
    woodGrey: planks('woodGrey', [120, 112, 100]),
    woodFloor: planks('floor', [110, 80, 52], { vertical: false, boards: 10 }),
    shingle: shingles('shingle', [80, 62, 48]),
    shingleDark: shingles('shingleDark', [48, 44, 46]),
    stone: stone('stone', [140, 132, 120]),
    stoneDark: stone('stoneDark', [90, 88, 92]),
    stoneGothic: stone('gothic', [170, 166, 160]),
    brick: stone('brick', [140, 70, 50], { brick: true }),
    rock: rock(),
    ground: groundDetail(),
    windowLit: windowGlow(true),
    windowDark: windowGlow(false),
  };
  cache.set('all', t);
  return t;
}
