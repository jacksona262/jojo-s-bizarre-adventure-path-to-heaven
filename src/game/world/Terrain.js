import { fbm, ridged, simplex, smoothstep, lerp } from './Noise';
import { REGIONS, SPACING, POIS, regionBlend, SANCTUARY } from './Layout';

// Analytic terrain: height, road curve and surface queries shared by rendering, physics and AI.

export const ROAD_HALF = 4.2;

export function roadX(z) {
  // Gentle meanders; the canyon section straightens, the ridge section swings wide.
  const base = 70 * Math.sin(z / 760) + 38 * Math.sin(z / 300 + 1.3) + 14 * Math.sin(z / 97 + 0.4);
  const settle = smoothstep(-SPACING * 8 + 500, -SPACING * 8 + 200, z); // straight run into the sanctuary
  return base * (1 - settle);
}

export function roadDir(z) {
  const dx = roadX(z - 1) - roadX(z + 1);
  const len = Math.hypot(dx, 2);
  return { x: dx / len, z: -2 / len }; // heading north (-z)
}

function baseElevation(z) {
  const { a, b, t } = regionBlend(z);
  let y = lerp(a.base, b.base, t);
  // the final climb to the sanctuary plateau
  y += smoothstep(-SPACING * 8 + 450, -SPACING * 8 - 60, z) * 46;
  return y;
}

export function roadY(z) {
  return baseElevation(z) + simplex(0.3, z / 420) * 2.2;
}

// Region-specific cross-section profile. s = signed distance from road centre.
function profile(r, s, x, z) {
  const d = Math.abs(s);
  const n = fbm(x / 210, z / 210, 4);
  const hills = r.hills * fbm(x / 90 + 7, z / 90, 3) * smoothstep(14, 70, d);
  switch (r.id) {
    case 'redstone': {
      // sheer terraced canyon walls
      const t = smoothstep(r.corridor, r.corridor + 36, d + n * 10);
      const steps = Math.floor(t * 4 + 0.5 * (n + 1)) / 4;
      return lerp(t, steps, 0.6) * r.wall * (0.75 + 0.35 * ridged(x / 130, z / 130, 3)) + hills;
    }
    case 'bleak': {
      // road on a ridge: drop to the east, mountain wall to the west
      if (s > 0) return -70 * smoothstep(26, 140, s) + 18 * fbm(x / 60, z / 60, 3) * smoothstep(40, 120, s);
      return r.wall * smoothstep(r.corridor, r.corridor + 180, d) * (0.6 + 0.5 * ridged(x / 160, z / 160, 4)) + hills;
    }
    case 'gravewater': {
      // flat flooded lowland of hummocks and pools
      const hum = fbm(x / 34, z / 34, 3) * 1.6 + fbm(x / 120, z / 120, 2) * 1.2;
      return hum + r.wall * smoothstep(r.corridor, r.corridor + 260, d);
    }
    case 'rift': {
      const terr = Math.floor((fbm(x / 70, z / 70, 3) + 1) * 3) / 3 * 14 * smoothstep(20, 60, d);
      return terr + r.wall * smoothstep(r.corridor, r.corridor + 200, d) * (0.6 + 0.5 * ridged(x / 150, z / 150, 4));
    }
    case 'hollow': {
      return r.wall * smoothstep(r.corridor, r.corridor + 220, d) * (0.6 + 0.4 * n) + hills * 1.2;
    }
    default:
      return r.wall * smoothstep(r.corridor, r.corridor + 170, d) * (0.65 + 0.45 * ridged(x / 180, z / 180, 4)) + hills;
  }
}

// --- flatten zones (settlements, arenas) ---
const flats = [];
export function addFlat(x, z, r, y, feather = 18, strength = 1) {
  flats.push({ x, z, r, y, feather, strength, r2: (r + feather) * (r + feather) });
}

let poiCache = null;
export function resolvePOI(id) {
  if (!poiCache) {
    poiCache = new Map();
    for (const p of POIS) {
      const reg = REGIONS.find((r) => r.id === p.region);
      const z = reg.z + p.dz;
      const x = roadX(z) + (p.side || 0);
      poiCache.set(p.id, { ...p, x, z });
    }
  }
  return poiCache.get(id);
}

// Built once; the World adds building footprints too.
let flatsInit = false;
export function initFlats() {
  if (flatsInit) return;
  flatsInit = true;
  for (const p of POIS) {
    const q = resolvePOI(p.id);
    const r = p.kind === 'boss' ? 46 : p.kind === 'town' ? 110 : p.kind === 'camp' ? 14 : 30;
    addFlat(q.x, q.z, r, roadY(q.z) + (p.region === 'gravewater' ? 0.9 : 0), p.kind === 'town' ? 30 : 22, 1);
  }
  const sy = roadY(SANCTUARY.z);
  SANCTUARY.y = sy;
  addFlat(SANCTUARY.x, SANCTUARY.z, 120, sy, 40, 1);
  // gulches crossed by trestles: Hol Horse's gulch (Redstone) and Diavolo's canyon (Iron Vale)
  for (const g of GULCHES) {
    const zc = REGIONS.find((r) => r.id === g.region).z + g.dz;
    const xc = roadX(zc);
    const y = roadY(zc) - g.depth;
    for (let o = -g.span; o <= g.span; o += 8) addFlat(xc + o, zc + o * 0.08, g.width, y, 10, 1);
    g.x = xc; g.z = zc; g.deckY = roadY(zc);
  }
  // the chasm before the sanctuary (collapsing bridge on The Thousand Steps)
}

export const GULCHES = [
  { id: 'holGulch', region: 'redstone', dz: 160, depth: 26, width: 9, span: 60 },
  { id: 'diavoloCanyon', region: 'iron', dz: -640, depth: 48, width: 22, span: 120 },
];

function _unused() {
  // homepage mansion terrace (well off the playable road, used only by the title scene)
}

export function rawHeight(x, z) {
  const { a, b, t } = regionBlend(z);
  const rx = roadX(z);
  const s = x - rx;
  const base = baseElevation(z);
  let h = base + lerp(profile(a, s, x, z), profile(b, s, x, z), t);
  // great outer mountains enclose the world
  const d = Math.abs(s);
  h += smoothstep(380, 900, d) * (220 + 140 * ridged(x / 300, z / 300, 4));
  // the sanctuary mountain behind Heaven's Reach
  const dm = Math.hypot(x - SANCTUARY.x, (z - (SANCTUARY.z - 380)) * 0.8);
  h += smoothstep(700, 120, dm) * 260 * (0.8 + 0.3 * ridged(x / 120, z / 120, 3));
  // northern wall closing the map beyond the sanctuary
  h += smoothstep(SANCTUARY.z - 180, SANCTUARY.z - 600, z) * 180;
  // southern wall behind Ebon Crossing
  h += smoothstep(170, 330, z) * 120 * (0.7 + 0.3 * ridged(x / 100, z / 100, 3));
  return h;
}

export function heightAt(x, z) {
  let h = rawHeight(x, z);
  const rx = roadX(z);
  const d = Math.abs(x - rx);
  if (d < ROAD_HALF + 16) {
    const ry = roadY(z) + (regionBlend(z).a.id === 'gravewater' || regionBlend(z).b.id === 'gravewater' ? 0.9 * regionWeight(z, 'gravewater') : 0);
    const w = smoothstep(ROAD_HALF + 16, ROAD_HALF + 1, d);
    h = lerp(h, ry - 0.05, w);
  }
  for (let i = 0; i < flats.length; i += 1) {
    const f = flats[i];
    const dx = x - f.x; const dz = z - f.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > f.r2) continue;
    const w = smoothstep(f.r + f.feather, f.r, Math.sqrt(d2)) * f.strength;
    h = lerp(h, f.y, w);
  }
  return h;
}

export function regionWeight(z, id) {
  const { a, b, t } = regionBlend(z);
  let w = 0;
  if (a.id === id) w += 1 - t;
  if (b.id === id) w += t;
  return w;
}

export function normalAt(x, z, out) {
  const e = 0.6;
  const hl = heightAt(x - e, z); const hr = heightAt(x + e, z);
  const hd = heightAt(x, z - e); const hu = heightAt(x, z + e);
  const nx = hl - hr; const nz = hd - hu; const ny = 2 * e;
  const len = Math.hypot(nx, ny, nz);
  if (out) { out.set(nx / len, ny / len, nz / len); return out; }
  return { x: nx / len, y: ny / len, z: nz / len };
}

export function roadWeight(x, z) {
  return smoothstep(ROAD_HALF + 1.2, ROAD_HALF - 0.8, Math.abs(x - roadX(z)));
}

export function waterLevelAt(z) {
  const w = regionWeight(z, 'gravewater');
  return w > 0.05 ? REGIONS.find((r) => r.id === 'gravewater').water : -Infinity;
}

// Lateral walkable limit (keeps the player inside the long valley).
export function lateralLimit(z) {
  const { a, b, t } = regionBlend(z);
  return lerp(a.corridor, b.corridor, t) + 120;
}
