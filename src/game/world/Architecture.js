import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getTextures, signTexture } from './Textures';
import { mulberry } from './Noise';

// Static geometry batching + western architecture generators.
// Every building has closed exterior shells, a foundation skirt that reaches below grade,
// proper roofs and a collision footprint.

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

function tileBox(g, w, h, d, tile) {
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f += 1) {
    const [fw, fh] = dims[f];
    for (let v = 0; v < 4; v += 1) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * fw / tile, uv.getY(i) * fh / tile);
    }
  }
  return g;
}

function prismGeometry(w, h, d) {
  // triangular gable: base width w at y=0, apex at y=h, depth d (centred)
  const hw = w / 2; const hd = d / 2;
  const pos = [
    -hw, 0, hd, hw, 0, hd, 0, h, hd, // front
    hw, 0, -hd, -hw, 0, -hd, 0, h, -hd, // back
  ];
  const uv = [0, 0, w / 1.2, 0, w / 2.4, h / 1.2, 0, 0, w / 1.2, 0, w / 2.4, h / 1.2];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 3, 4, 5]);
  g.computeVertexNormals();
  return g;
}

export class Frame {
  constructor(x, y, z, rotY = 0) {
    this.m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)), new THREE.Vector3(1, 1, 1));
    this.x = x; this.y = y; this.z = z; this.rotY = rotY;
  }
  // local -> world point
  pt(lx, ly, lz) {
    return new THREE.Vector3(lx, ly, lz).applyMatrix4(this.m);
  }
}

export class Batch {
  constructor() {
    this.parts = new Map();
    this.colliders = [];   // { x, z, hw, hd, rot, top }
    this.lights = [];      // { x, y, z, color, intensity, flicker }
    this.animated = [];    // objects needing update(t)
    this.extra = [];       // ready-made Object3Ds
    this.interactables = [];
  }

  addGeom(mat, geom, frame, lx = 0, ly = 0, lz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(lx, ly, lz), _q, _s.set(sx, sy, sz));
    if (frame) _m.premultiply(frame.m);
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    if (geom.index) geom.dispose();
    g.applyMatrix4(_m);
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
  }

  box(mat, frame, cx, cy, cz, w, h, d, rx = 0, ry = 0, rz = 0, tile = 1.4) {
    this.addGeom(mat, tileBox(new THREE.BoxGeometry(w, h, d), w, h, d, tile), frame, cx, cy, cz, rx, ry, rz);
  }

  cyl(mat, frame, cx, cy, cz, rTop, rBot, h, seg = 8, rx = 0, ry = 0, rz = 0) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * Math.PI * 2 * Math.max(rTop, rBot) / 1.2, uv.getY(i) * h / 1.2);
    this.addGeom(mat, g, frame, cx, cy, cz, rx, ry, rz);
  }

  cone(mat, frame, cx, cy, cz, r, h, seg = 8, ry = 0) {
    this.addGeom(mat, new THREE.ConeGeometry(r, h, seg, 1), frame, cx, cy, cz, 0, ry, 0);
  }

  prism(mat, frame, cx, cy, cz, w, h, d, ry = 0) {
    this.addGeom(mat, prismGeometry(w, h, d), frame, cx, cy, cz, 0, ry, 0);
  }

  collider(frame, lx, lz, hw, hd, top = 6, extraRot = 0) {
    const p = frame.pt(lx, 0, lz);
    this.colliders.push({ x: p.x, z: p.z, hw, hd, rot: frame.rotY + extraRot, top: frame.y + top, bottom: frame.y - 2 });
  }

  light(frame, lx, ly, lz, color = 0xffa040, intensity = 1, flicker = 1) {
    const p = frame.pt(lx, ly, lz);
    this.lights.push({ x: p.x, y: p.y, z: p.z, color, intensity, flicker });
  }

  build(materials) {
    const group = new THREE.Group();
    for (const [mat, geoms] of this.parts) {
      const merged = mergeGeometries(geoms, false);
      for (const g of geoms) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, materials.get(mat));
      mesh.castShadow = !mat.startsWith('window') && mat !== 'lantern' && !mat.startsWith('sign');
      mesh.receiveShadow = true;
      mesh.name = `batch:${mat}`;
      group.add(mesh);
    }
    for (const o of this.extra) group.add(o);
    this.parts.clear();
    return group;
  }
}

// ---------------------------------------------------------------- materials
export class MaterialBank {
  constructor() {
    const t = getTextures();
    this.t = t;
    this.map = new Map();
    const std = (map, extra = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0, ...extra });
    this.map.set('woodLight', std(t.woodLight));
    this.map.set('woodDark', std(t.woodDark));
    this.map.set('woodRed', std(t.woodRed));
    this.map.set('woodGrey', std(t.woodGrey));
    this.map.set('floor', std(t.woodFloor));
    this.map.set('shingle', std(t.shingle));
    this.map.set('shingleDark', std(t.shingleDark));
    this.map.set('stone', std(t.stone));
    this.map.set('stoneDark', std(t.stoneDark));
    this.map.set('gothic', std(t.stoneGothic, { roughness: 0.85 }));
    this.map.set('brick', std(t.brick));
    this.map.set('rock', std(t.rock));
    this.map.set('metal', new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 0.5, metalness: 0.8 }));
    this.map.set('rail', new THREE.MeshStandardMaterial({ color: 0x5a524a, roughness: 0.35, metalness: 0.9 }));
    this.map.set('black', new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }));
    this.map.set('cloth', new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 1, side: THREE.DoubleSide }));
    this.map.set('clothBurnt', new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 1, side: THREE.DoubleSide }));
    this.map.set('windowLit', new THREE.MeshStandardMaterial({ map: t.windowLit, emissive: 0xffffff, emissiveMap: t.windowLit, emissiveIntensity: 1.6, roughness: 0.3 }));
    this.map.set('windowDark', new THREE.MeshStandardMaterial({ map: t.windowDark, roughness: 0.15, metalness: 0.3 }));
    this.map.set('lantern', new THREE.MeshStandardMaterial({ color: 0xffb060, emissive: 0xff9a40, emissiveIntensity: 4, roughness: 0.4 }));
    this.map.set('ember', new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff4810, emissiveIntensity: 2.5, roughness: 1 }));
    this.map.set('glassRose', new THREE.MeshStandardMaterial({ color: 0x8a6cff, emissive: 0xb090ff, emissiveIntensity: 2.2, roughness: 0.2 }));
    this.map.set('glassGold', new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffc860, emissiveIntensity: 2.0, roughness: 0.2 }));
    this.map.set('rift', new THREE.MeshStandardMaterial({ color: 0x6a3cff, emissive: 0x5a2cff, emissiveIntensity: 2.5, roughness: 0.3, transparent: true, opacity: 0.85 }));
  }

  get(key) {
    if (this.map.has(key)) return this.map.get(key);
    if (key.startsWith('sign:')) {
      const m = new THREE.MeshStandardMaterial({ map: signTexture(key.slice(5)), roughness: 0.85 });
      this.map.set(key, m);
      return m;
    }
    return this.map.get('woodDark');
  }
}

// ---------------------------------------------------------------- generators
function gableRoof(b, f, w, d, h, rise, mat, overhang = 0.35, ridgeAlongZ = true) {
  // two sloped planes + ridge cap + gable infill
  const halfSpan = (ridgeAlongZ ? w : d) / 2 + overhang;
  const len = Math.hypot(halfSpan, rise + overhang * rise / ((ridgeAlongZ ? w : d) / 2));
  const ang = Math.atan2(rise, (ridgeAlongZ ? w : d) / 2);
  const run = (ridgeAlongZ ? d : w) + overhang * 2;
  const cy = h + rise / 2 - 0.05;
  if (ridgeAlongZ) {
    b.box(mat, f, -halfSpan / 2 + 0.02, cy, 0, len, 0.14, run, 0, 0, ang, 1.6);
    b.box(mat, f, halfSpan / 2 - 0.02, cy, 0, len, 0.14, run, 0, 0, -ang, 1.6);
    b.box('woodDark', f, 0, h + rise + 0.02, 0, 0.3, 0.18, run + 0.05);
    b.prism('woodGrey', f, 0, h, d / 2 - 0.01, w, rise, 0.02);
    b.prism('woodGrey', f, 0, h, -d / 2 + 0.01, w, rise, 0.02);
  } else {
    b.box(mat, f, 0, cy, -halfSpan / 2 + 0.02, run, 0.14, len, -ang, 0, 0, 1.6);
    b.box(mat, f, 0, cy, halfSpan / 2 - 0.02, run, 0.14, len, ang, 0, 0, 1.6);
    b.box('woodDark', f, 0, h + rise + 0.02, 0, run + 0.05, 0.18, 0.3);
    b.prism('woodGrey', f, w / 2 - 0.01, h, 0, d, rise, 0.02, Math.PI / 2);
    b.prism('woodGrey', f, -w / 2 + 0.01, h, 0, d, rise, 0.02, Math.PI / 2);
  }
}

function windowAt(b, f, x, y, z, ry, lit, w = 1.0, h = 1.3) {
  b.box(lit ? 'windowLit' : 'windowDark', f, x, y, z, w, h, 0.06, 0, ry, 0, 10);
  // frame
  b.box('woodDark', f, x, y - h / 2 - 0.06, z, w + 0.2, 0.1, 0.16, 0, ry, 0);
  b.box('woodDark', f, x, y + h / 2 + 0.06, z, w + 0.2, 0.1, 0.12, 0, ry, 0);
}

function foundation(b, f, w, d, mat = 'stoneDark') {
  b.box(mat, f, 0, -0.9, 0, w + 0.15, 2.2, d + 0.15);
}

export function storefront(b, f, o) {
  const { w = 7, d = 10, h = 4.2, wall = 'woodLight', sign = null, lit = false, porch = true, rng = Math.random, twoStory = false, balcony = false } = o;
  const H = twoStory ? h + 3 : h;
  foundation(b, f, w, d);
  b.box(wall, f, 0, H / 2, 0, w, H, d);
  const rise = w * 0.28;
  gableRoof(b, f, w, d, H, rise, o.roof || 'shingle');
  // false front
  const ffH = H + rise + 1.0;
  b.box(wall, f, 0, ffH / 2, d / 2 + 0.14, w + 0.5, ffH, 0.28);
  b.box('woodDark', f, 0, ffH + 0.1, d / 2 + 0.14, w + 0.8, 0.22, 0.42);
  b.box('woodDark', f, 0, ffH - 0.8, d / 2 + 0.3, w + 0.55, 0.12, 0.14);
  if (rng() < 0.6) b.box(wall, f, 0, ffH + 0.5, d / 2 + 0.14, w * 0.45, 0.8, 0.26);
  if (sign) {
    b.box(`sign:${sign}`, f, 0, H + rise * 0.45 + 0.2, d / 2 + 0.31, Math.min(w * 0.85, 6), 1.3, 0.05, 0, 0, 0, 100);
  }
  // door + windows
  b.box('woodDark', f, 0, 1.15, d / 2 + 0.3, 1.25, 2.3, 0.08);
  b.box('black', f, 0, 1.15, d / 2 + 0.27, 1.05, 2.15, 0.04);
  windowAt(b, f, -w * 0.3, 1.6, d / 2 + 0.3, 0, lit && rng() < 0.8, 1.3, 1.5);
  windowAt(b, f, w * 0.3, 1.6, d / 2 + 0.3, 0, lit && rng() < 0.6, 1.3, 1.5);
  if (twoStory) {
    for (const x of [-w * 0.3, 0, w * 0.3]) windowAt(b, f, x, h + 1.6, d / 2 + 0.3, 0, lit && rng() < 0.5, 0.9, 1.3);
  }
  for (const z of [-d * 0.25, d * 0.2]) {
    windowAt(b, f, w / 2 + 0.03, 1.7, z, Math.PI / 2, lit && rng() < 0.3, 0.9, 1.2);
    windowAt(b, f, -w / 2 - 0.03, 1.7, z, Math.PI / 2, lit && rng() < 0.3, 0.9, 1.2);
  }
  if (porch) {
    const pd = 2.6;
    b.box('floor', f, 0, 0.18, d / 2 + 0.3 + pd / 2, w + 0.6, 0.22, pd);
    b.box('stoneDark', f, 0, -0.6, d / 2 + 0.3 + pd / 2, w + 0.6, 1.3, pd);
    for (const x of [-w / 2 - 0.1, -w / 6, w / 6, w / 2 + 0.1]) {
      b.box('woodDark', f, x, 1.6, d / 2 + 0.3 + pd - 0.15, 0.18, 2.9, 0.18);
    }
    if (!balcony) b.box(o.roof || 'shingle', f, 0, 3.08, d / 2 + 0.3 + pd / 2, w + 0.8, 0.1, pd + 0.4, -0.12, 0, 0);
    // hanging lantern
    b.box('lantern', f, w * 0.35, 2.55, d / 2 + 0.3 + pd - 0.4, 0.22, 0.32, 0.22);
    b.light(f, w * 0.35, 2.45, d / 2 + 0.3 + pd - 0.4, 0xffa040, 1.1, 1);
  }
  if (balcony) {
    const pd = 2.6;
    b.box('floor', f, 0, h + 0.1, d / 2 + 0.3 + pd / 2, w + 0.6, 0.2, pd);
    b.box('woodDark', f, 0, h + 1.05, d / 2 + 0.3 + pd - 0.08, w + 0.6, 0.08, 0.08);
    for (let x = -w / 2; x <= w / 2 + 0.01; x += 0.5) b.box('woodDark', f, x, h + 0.6, d / 2 + 0.3 + pd - 0.08, 0.06, 0.9, 0.06);
    for (const x of [-w / 2 - 0.1, w / 2 + 0.1]) b.box('woodDark', f, x, h + 1.5, d / 2 + 0.3 + pd - 0.15, 0.16, 3.0, 0.16);
    b.box(o.roof || 'shingle', f, 0, h + 3.0, d / 2 + 0.3 + pd / 2, w + 0.8, 0.1, pd + 0.4, -0.12, 0, 0);
  }
  b.collider(f, 0, 0.15, w / 2 + 0.3, d / 2 + 0.45, H + rise);
  return { frontZ: d / 2 + 0.3 };
}

export function house(b, f, o) {
  const { w = 8, d = 6, h = 3.2, wall = 'woodGrey', roof = 'shingleDark', lit = false, rng = Math.random } = o;
  foundation(b, f, w, d);
  b.box(wall, f, 0, h / 2, 0, w, h, d);
  gableRoof(b, f, w, d, h, d * 0.38, roof, 0.4, false);
  b.box('stone', f, w * 0.3, h + 1.6, -d * 0.15, 0.7, 2.8, 0.7);
  b.box('woodDark', f, 0, 1.1, d / 2 + 0.03, 1.1, 2.2, 0.08);
  windowAt(b, f, -w * 0.28, 1.5, d / 2 + 0.04, 0, lit && rng() < 0.6);
  windowAt(b, f, w * 0.28, 1.5, d / 2 + 0.04, 0, lit && rng() < 0.4);
  windowAt(b, f, -w * 0.25, 1.5, -d / 2 - 0.04, 0, false);
  b.box('floor', f, 0, 0.15, d / 2 + 1.0, w * 0.6, 0.2, 2);
  b.box(roof, f, 0, 2.7, d / 2 + 1.1, w * 0.65, 0.1, 2.3, -0.2, 0, 0);
  for (const x of [-w * 0.3, w * 0.3]) b.box('woodDark', f, x, 1.4, d / 2 + 1.9, 0.14, 2.5, 0.14);
  b.collider(f, 0, 0, w / 2 + 0.2, d / 2 + 0.2, h + 2);
}

export function barn(b, f, o) {
  const { w = 10, d = 14, h = 5, wall = 'woodRed' } = o;
  foundation(b, f, w, d);
  b.box(wall, f, 0, h / 2, 0, w, h, d);
  gableRoof(b, f, w, d, h, w * 0.45, 'shingleDark', 0.5, true);
  b.box('woodDark', f, 0, 2.2, d / 2 + 0.04, 4, 4.4, 0.1);
  b.box('black', f, 0, 2.1, d / 2 + 0.02, 3.6, 4.0, 0.06);
  // X braces on the doors
  b.box('woodLight', f, -1, 2.2, d / 2 + 0.1, 0.16, 4.6, 0.06, 0, 0, 0.6);
  b.box('woodLight', f, 1, 2.2, d / 2 + 0.1, 0.16, 4.6, 0.06, 0, 0, -0.6);
  b.box('woodDark', f, 0, h + 1.5, d / 2 + 0.06, 1.4, 1.2, 0.08);
  b.collider(f, 0, 0, w / 2 + 0.2, d / 2 + 0.2, h + 3);
  // corral fence
  for (let i = 0; i < 6; i += 1) {
    const z = d / 2 + 2 + i * 2;
    b.box('woodDark', f, w / 2 + 6, 0.7, z, 0.15, 1.4, 0.15);
    b.box('woodGrey', f, w / 2 + 6, 1.1, z + 1, 0.08, 0.12, 2);
    b.box('woodGrey', f, w / 2 + 6, 0.6, z + 1, 0.08, 0.12, 2);
  }
}

export function church(b, f, o) {
  const { lit = true } = o;
  const w = 7.5; const d = 15; const h = 5.8;
  foundation(b, f, w, d);
  b.box('woodGrey', f, 0, h / 2, 0, w, h, d);
  gableRoof(b, f, w, d, h, 3.4, 'shingleDark', 0.4, true);
  // steeple
  b.box('woodGrey', f, 0, 5, d / 2 + 1.3, 3, 10, 3);
  b.box('woodDark', f, 0, 10.2, d / 2 + 1.3, 3.3, 0.3, 3.3);
  b.box('woodGrey', f, 0, 11.4, d / 2 + 1.3, 2.4, 2.2, 2.4);
  b.box('black', f, 0, 11.4, d / 2 + 2.52, 1, 1.6, 0.05);
  b.cone('shingleDark', f, 0, 14.5, d / 2 + 1.3, 1.9, 4.2, 4, Math.PI / 4);
  b.box('woodDark', f, 0, 17.1, d / 2 + 1.3, 0.12, 1.2, 0.12);
  b.box('woodDark', f, 0, 17.3, d / 2 + 1.3, 0.6, 0.12, 0.12);
  b.box('woodDark', f, 0, 1.4, d / 2 + 2.82, 1.6, 2.8, 0.1);
  for (const z of [-4.5, -1.5, 1.5, 4.5]) {
    windowAt(b, f, w / 2 + 0.03, 2.6, z, Math.PI / 2, lit, 0.9, 2.2);
    windowAt(b, f, -w / 2 - 0.03, 2.6, z, Math.PI / 2, lit, 0.9, 2.2);
  }
  b.light(f, 0, 3, 0, 0xffb070, 0.8, 0.3);
  b.collider(f, 0, 0.6, w / 2 + 0.2, d / 2 + 1.5, 17);
}

export function waterTower(b, f) {
  for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
    b.box('woodDark', f, x, 3.5, z, 0.25, 7, 0.25);
  }
  b.box('woodDark', f, 0, 2.5, -1.6, 3.4, 0.15, 0.1, 0, 0, 0.9);
  b.box('woodDark', f, 0, 2.5, 1.6, 3.4, 0.15, 0.1, 0, 0, -0.9);
  b.box('woodDark', f, 0, 7.05, 0, 3.8, 0.2, 3.8);
  b.cyl('woodLight', f, 0, 8.7, 0, 2.1, 2.1, 3.2, 14);
  b.cone('shingleDark', f, 0, 10.9, 0, 2.4, 1.3, 14);
  for (const y of [7.6, 8.7, 9.8]) b.cyl('metal', f, 0, y, 0, 2.14, 2.14, 0.08, 14);
  b.collider(f, 0, 0, 1.9, 1.9, 11);
}

export function windmill(b, f) {
  for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
    b.box('woodGrey', f, x * 0.6, 4.5, z * 0.6, 0.16, 9.2, 0.16, z * 0.07, 0, -x * 0.07);
  }
  for (const y of [2, 4.5, 7]) {
    b.box('woodGrey', f, 0, y, 0.75 - y * 0.03, 1.6 - y * 0.08, 0.1, 0.08);
    b.box('woodGrey', f, 0, y, -0.75 + y * 0.03, 1.6 - y * 0.08, 0.1, 0.08);
  }
  // rotor (animated)
  const rotor = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ map: getTextures().woodGrey, roughness: 0.9 });
  for (let i = 0; i < 12; i += 1) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.9, 0.04), mat);
    blade.position.set(0, 1.25, 0);
    const piv = new THREE.Group();
    piv.rotation.z = (i / 12) * Math.PI * 2;
    blade.rotation.y = 0.35;
    piv.add(blade);
    rotor.add(piv);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.4, 8), mat);
  hub.rotation.x = Math.PI / 2;
  rotor.add(hub);
  const p = f.pt(0, 9.4, 0.4);
  rotor.position.copy(p);
  rotor.rotation.y = f.rotY;
  rotor.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  b.extra.push(rotor);
  const inner = new THREE.Group();
  rotor.add(inner);
  b.animated.push({ update: (t, dt) => { for (const c of rotor.children) if (c !== hub && c !== inner) c.rotation.z += dt * 0.9; } });
  b.collider(f, 0, 0, 1.0, 1.0, 9);
}

export function cabin(b, f, o) {
  const { w = 6, d = 5, h = 2.8, lit = false } = o;
  foundation(b, f, w, d, 'stone');
  // log courses
  for (let y = 0.2; y < h; y += 0.32) {
    b.cyl('woodDark', f, 0, y, d / 2, 0.17, 0.17, w + 0.4, 7, 0, 0, Math.PI / 2);
    b.cyl('woodDark', f, 0, y, -d / 2, 0.17, 0.17, w + 0.4, 7, 0, 0, Math.PI / 2);
    b.cyl('woodDark', f, w / 2, y + 0.16, 0, 0.17, 0.17, d + 0.4, 7, Math.PI / 2, 0, 0);
    b.cyl('woodDark', f, -w / 2, y + 0.16, 0, 0.17, 0.17, d + 0.4, 7, Math.PI / 2, 0, 0);
  }
  b.box('woodDark', f, 0, h / 2, 0, w - 0.2, h, d - 0.2);
  gableRoof(b, f, w, d, h, d * 0.42, 'shingleDark', 0.5, false);
  b.box('stone', f, -w / 2 - 0.35, h * 0.75, 0, 0.8, h * 1.6 + 1.5, 0.9);
  b.box('woodLight', f, 0.6, 1, d / 2 + 0.2, 0.9, 2, 0.08);
  windowAt(b, f, -1.2, 1.5, d / 2 + 0.2, 0, lit, 0.8, 0.8);
  if (lit) b.light(f, -1.2, 1.5, d / 2 + 0.8, 0xff9a40, 0.7, 0.6);
  b.collider(f, 0, 0, w / 2 + 0.4, d / 2 + 0.4, h + 2);
}

export function warehouse(b, f, o) {
  const { w = 11, d = 22, h = 5.5, lit = false } = o;
  b.box('stone', f, 0, 0.1, 0, w + 0.3, 2.6, d + 0.3);
  b.box('woodGrey', f, 0, h / 2 + 1.2, 0, w, h - 0.2, d);
  gableRoof(b, f, w, d, h + 1.1, w * 0.22, 'shingleDark', 0.5, true);
  b.box('woodDark', f, 0, 2.6, d / 2 + 0.05, 4.4, 3.4, 0.1);
  b.box('black', f, 0, 2.6, d / 2 + 0.03, 4, 3.1, 0.06);
  for (let z = -d / 2 + 2.5; z < d / 2 - 1; z += 4) {
    windowAt(b, f, w / 2 + 0.03, 4.2, z, Math.PI / 2, lit && Math.random() < 0.3, 1.2, 1);
    windowAt(b, f, -w / 2 - 0.03, 4.2, z, Math.PI / 2, false, 1.2, 1);
  }
  if (o.sign) b.box(`sign:${o.sign}`, f, 0, h + 0.5, d / 2 + 0.1, 5, 1.1, 0.05, 0, 0, 0, 100);
  b.box('lantern', f, 2.6, 4.6, d / 2 + 0.3, 0.22, 0.3, 0.22);
  b.light(f, 2.6, 4.5, d / 2 + 0.5, 0xffa040, 1, 1);
  b.collider(f, 0, 0, w / 2 + 0.3, d / 2 + 0.3, h + 3);
}

export function station(b, f, o) {
  const { name = 'STATION', lit = true } = o;
  storefront(b, f, { w: 8, d: 7, h: 4.2, wall: 'woodRed', sign: name, lit, porch: false });
  // long platform along local x
  b.box('floor', f, 0, 0.5, 6.5, 30, 0.25, 5);
  b.box('stoneDark', f, 0, -0.3, 6.5, 30, 1.4, 5);
  for (let x = -14; x <= 14; x += 4) b.box('woodDark', f, x, 2.2, 8.5, 0.2, 3.4, 0.2);
  b.box('shingleDark', f, 0, 3.95, 7.0, 31, 0.12, 4.4, 0.08, 0, 0);
  for (let x = -12; x <= 12; x += 8) { b.box('lantern', f, x, 3.4, 8.3, 0.2, 0.28, 0.2); b.light(f, x, 3.3, 8.3, 0xffa040, 0.9, 1); }
}

export function ruinWall(b, f, o) {
  const { w = 6, h = 4, mat = 'stoneDark', rng = Math.random } = o;
  const segs = Math.ceil(w / 0.8);
  for (let i = 0; i < segs; i += 1) {
    const hh = h * (0.35 + rng() * 0.65);
    b.box(mat, f, -w / 2 + (i + 0.5) * (w / segs), hh / 2 - 0.5, 0, w / segs + 0.02, hh + 1, 0.7);
  }
  b.collider(f, 0, 0, w / 2, 0.45, h);
}

export function column(b, f, lx, lz, h, mat = 'gothic', broken = false) {
  b.box(mat, f, lx, 0.25, lz, 1.2, 0.5, 1.2);
  b.cyl(mat, f, lx, h / 2 + 0.4, lz, 0.38, 0.45, h, 10);
  if (!broken) b.box(mat, f, lx, h + 0.6, lz, 1.1, 0.4, 1.1);
  b.collider(f, lx, lz, 0.6, 0.6, h);
}

export function arch(b, f, lx, lz, w, h, mat = 'gothic') {
  column(b, f, lx - w / 2, lz, h, mat);
  column(b, f, lx + w / 2, lz, h, mat);
  const n = 9;
  for (let i = 0; i < n; i += 1) {
    const a0 = (i / n) * Math.PI;
    const a1 = ((i + 1) / n) * Math.PI;
    const am = (a0 + a1) / 2;
    const r = w / 2;
    b.box(mat, f, lx + Math.cos(am) * r, h + 0.8 + Math.sin(am) * r * 1.15, lz, r * (a1 - a0) * 1.1, 0.5, 0.9, 0, 0, am + Math.PI / 2);
  }
}

// ---------------------------------------------------------------- props
export function lampPost(b, f, lx, lz) {
  b.box('woodDark', f, lx, 1.6, lz, 0.14, 3.2, 0.14);
  b.box('woodDark', f, lx + 0.3, 3.15, lz, 0.7, 0.1, 0.1);
  b.box('lantern', f, lx + 0.6, 2.85, lz, 0.22, 0.34, 0.22);
  b.box('metal', f, lx + 0.6, 3.05, lz, 0.28, 0.06, 0.28);
  b.light(f, lx + 0.6, 2.8, lz, 0xffa040, 1.2, 1);
  b.collider(f, lx, lz, 0.15, 0.15, 3);
}

export function barrel(b, f, lx, lz, ly = 0) {
  b.cyl('woodDark', f, lx, ly + 0.45, lz, 0.33, 0.33, 0.9, 10);
  b.cyl('metal', f, lx, ly + 0.2, lz, 0.345, 0.345, 0.06, 10);
  b.cyl('metal', f, lx, ly + 0.72, lz, 0.345, 0.345, 0.06, 10);
  b.collider(f, lx, lz, 0.33, 0.33, 1);
}

export function crate(b, f, lx, lz, s = 0.9, ly = 0, ry = 0) {
  b.box('woodLight', f, lx, ly + s / 2, lz, s, s, s, 0, ry, 0, 0.9);
  b.collider(f, lx, lz, s / 2, s / 2, s, ry);
}

export function wagon(b, f, lx, lz, ry = 0, broken = false) {
  const g = new Frame(0, 0, 0, 0);
  g.m.copy(f.m).multiply(new THREE.Matrix4().compose(new THREE.Vector3(lx, 0, lz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, broken ? 0.25 : 0)), new THREE.Vector3(1, 1, 1)));
  b.box('woodLight', g, 0, 0.95, 0, 1.6, 0.12, 3.4);
  b.box('woodLight', g, 0.78, 1.25, 0, 0.06, 0.6, 3.4);
  b.box('woodLight', g, -0.78, 1.25, 0, 0.06, 0.6, 3.4);
  b.box('woodLight', g, 0, 1.25, -1.68, 1.6, 0.6, 0.06);
  for (const [x, z] of [[0.92, 1.1], [-0.92, 1.1], [0.92, -1.1], [-0.92, -1.1]]) {
    if (broken && x > 0 && z > 0) continue;
    b.addGeom('woodDark', new THREE.TorusGeometry(0.5, 0.06, 6, 14), g, x, 0.55, z, 0, Math.PI / 2, 0);
    b.cyl('woodDark', g, x, 0.55, z, 0.04, 0.04, 0.9, 5, 0, 0, Math.PI / 2);
  }
  b.box('woodDark', g, 0, 0.6, 2.4, 0.1, 0.1, 1.6);
  if (!broken) {
    // canvas bonnet hoops
    for (const z of [-1.2, 0, 1.2]) b.addGeom('cloth', new THREE.TorusGeometry(0.8, 0.03, 4, 12, Math.PI), g, 0, 1.3, z, 0, 0, 0);
    b.addGeom('cloth', new THREE.CylinderGeometry(0.8, 0.8, 2.8, 12, 1, true, -Math.PI / 2, Math.PI), g, 0, 1.3, 0, Math.PI / 2, 0, 0);
  }
  const p = g.pt(0, 0, 0);
  b.colliders.push({ x: p.x, z: p.z, hw: 0.95, hd: 1.8, rot: f.rotY + ry, top: f.y + 2, bottom: f.y - 1 });
}

export function trough(b, f, lx, lz) {
  b.box('woodDark', f, lx, 0.4, lz, 2, 0.6, 0.6);
  b.box('black', f, lx, 0.66, lz, 1.8, 0.04, 0.45);
  b.collider(f, lx, lz, 1, 0.3, 0.7);
}

export function hitchRail(b, f, lx, lz) {
  b.box('woodDark', f, lx - 1.2, 0.5, lz, 0.12, 1, 0.12);
  b.box('woodDark', f, lx + 1.2, 0.5, lz, 0.12, 1, 0.12);
  b.box('woodGrey', f, lx, 0.95, lz, 2.6, 0.1, 0.1);
}

export function fenceRun(b, f, lx, lz, len, ry = 0, broken = 0.1, rng = Math.random) {
  const n = Math.max(1, Math.floor(len / 2.5));
  const c = Math.cos(ry); const s = Math.sin(ry);
  for (let i = 0; i <= n; i += 1) {
    const t = (i / n - 0.5) * len;
    const x = lx + c * t; const z = lz - s * t;
    b.box('woodDark', f, x, 0.6, z, 0.12, 1.3 + rng() * 0.15, 0.12, 0, ry, 0);
    if (i < n && rng() > broken) {
      const t2 = ((i + 0.5) / n - 0.5) * len;
      b.box('woodGrey', f, lx + c * t2, 1.0, lz - s * t2, len / n, 0.1, 0.06, 0, ry, rng() * 0.05);
      if (rng() > broken * 2) b.box('woodGrey', f, lx + c * t2, 0.55, lz - s * t2, len / n, 0.1, 0.06, 0, ry, -rng() * 0.08);
    }
  }
}

export function telegraphPole(b, f, lx, lz, ry = 0) {
  b.cyl('woodDark', f, lx, 3.6, lz, 0.1, 0.13, 7.6, 6);
  b.box('woodDark', f, lx, 6.9, lz, 1.6, 0.12, 0.12, 0, ry, 0);
  for (const o of [-0.65, -0.25, 0.25, 0.65]) {
    const x = lx + Math.cos(ry) * o; const z = lz - Math.sin(ry) * o;
    b.cyl('glassGold', f, x, 7.05, z, 0.04, 0.05, 0.14, 5);
  }
  b.collider(f, lx, lz, 0.15, 0.15, 7);
}

export function tombstone(b, f, lx, lz, ry, rng = Math.random) {
  if (rng() < 0.5) {
    b.box('stone', f, lx, 0.45, lz, 0.6, 0.9, 0.15, rng() * 0.15 - 0.07, ry, rng() * 0.1 - 0.05);
  } else {
    b.box('woodGrey', f, lx, 0.55, lz, 0.1, 1.1, 0.08, rng() * 0.2 - 0.1, ry, 0);
    b.box('woodGrey', f, lx, 0.8, lz, 0.5, 0.08, 0.08, 0, ry, 0);
  }
}

export function campfire(b, f, lx, lz, lit = false) {
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    b.addGeom('rock', new THREE.IcosahedronGeometry(0.18, 0), f, lx + Math.cos(a) * 0.55, 0.08, lz + Math.sin(a) * 0.55, a, a * 2, 0);
  }
  for (let i = 0; i < 4; i += 1) b.cyl('black', f, lx, 0.12, lz, 0.05, 0.06, 0.9, 5, 0.3, (i / 4) * Math.PI, Math.PI / 2 - 0.25);
  b.addGeom(lit ? 'ember' : 'black', new THREE.CircleGeometry(0.4, 10), f, lx, 0.05, lz, -Math.PI / 2, 0, 0);
  if (lit) b.light(f, lx, 0.6, lz, 0xff6a20, 1.2, 2);
}

export function tent(b, f, lx, lz, ry, burnt = true) {
  const g = new THREE.ConeGeometry(1.6, 2.3, 4, 1, true);
  b.addGeom(burnt ? 'clothBurnt' : 'cloth', g, f, lx, 1.15, lz, burnt ? 0.2 : 0, ry + Math.PI / 4, burnt ? 0.15 : 0);
  b.collider(f, lx, lz, 1.0, 1.0, 2);
}

export function railTrack(b, f, x0, z0, x1, z1, y0, y1, withBed = true) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ry = Math.atan2(x1 - x0, z1 - z0);
  const n = Math.floor(len / 0.9);
  const ang = Math.atan2(y1 - y0, len);
  for (let i = 0; i < n; i += 1) {
    const t = (i + 0.5) / n;
    b.box('woodDark', f, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + 0.08, z0 + (z1 - z0) * t, 2.4, 0.14, 0.24, 0, ry, 0);
  }
  for (const o of [-0.72, 0.72]) {
    const ox = Math.cos(ry) * o; const oz = -Math.sin(ry) * o;
    b.box('rail', f, (x0 + x1) / 2 + ox, (y0 + y1) / 2 + 0.24, (z0 + z1) / 2 + oz, 0.08, 0.14, len, -ang, ry, 0);
  }
  if (withBed) b.box('stoneDark', f, (x0 + x1) / 2, (y0 + y1) / 2 - 0.25, (z0 + z1) / 2, 3.4, 0.6, len, -ang, ry, 0);
}

export function trestle(b, f, length, height, width = 4, ry = 0, depth = 12) {
  // bridge along local z, deck at y=height relative to frame
  const g = new Frame(0, 0, 0, 0);
  g.m.copy(f.m).multiply(new THREE.Matrix4().makeRotationY(ry));
  b.box('floor', g, 0, height, 0, width, 0.25, length);
  for (const x of [-width / 2, width / 2]) {
    b.box('woodDark', g, x, height + 0.6, 0, 0.12, 0.12, length);
    for (let z = -length / 2; z <= length / 2; z += 2.5) b.box('woodDark', g, x, height + 0.35, z, 0.1, 0.7, 0.1);
  }
  for (let z = -length / 2; z <= length / 2 + 0.01; z += 6) {
    for (const x of [-width / 2 + 0.3, width / 2 - 0.3]) b.box('woodDark', g, x, height - depth / 2, z, 0.35, depth, 0.35);
    for (let y = height - 3; y > height - depth; y -= 5) {
      b.box('woodGrey', g, 0, y, z, width * 1.2, 0.16, 0.16, 0, 0, 0.75);
      b.box('woodGrey', g, 0, y, z, width * 1.2, 0.16, 0.16, 0, 0, -0.75);
    }
  }
}

export function signPost(b, f, lx, lz, text, ry = 0) {
  b.box('woodDark', f, lx, 1.1, lz, 0.14, 2.2, 0.14);
  b.box(`sign:${text}`, f, lx, 1.9, lz + 0.08, 1.8, 0.45, 0.05, 0, ry, 0.04, 100);
  b.collider(f, lx, lz, 0.15, 0.15, 2);
}

export { mulberry };
