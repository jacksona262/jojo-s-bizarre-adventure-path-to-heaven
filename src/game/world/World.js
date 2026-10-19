import * as THREE from 'three';
import { heightAt, roadX, roadWeight, initFlats, regionWeight, waterLevelAt, lateralLimit, normalAt } from './Terrain';
import { REGIONS, WORLD, regionAt, regionBlend, SANCTUARY } from './Layout';
import { hash2, smoothstep, fbm } from './Noise';
import { getTextures } from './Textures';
import { createVegetationKit, wind } from './Nature';
import { MaterialBank } from './Architecture';
import { buildRegion, buildRoadside } from './Settlements';
import { buildSanctuary, buildSanctuaryImpostor } from './Landmarks';

const CHUNK = 96;
const RES = 40;
const RADIUS = 3; // chunks each side
const CELL = 16;

function terrainMaterial(far = false) {
  const t = getTextures();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  m.userData.uniforms = { uCenter: { value: new THREE.Vector2() }, uRadius: { value: 280 }, uGround: { value: t.ground } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWet;\nvarying float vWet;\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWet = aWet;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uGround; uniform vec2 uCenter; uniform float uRadius;\nvarying float vWet;\nvarying vec3 vWPos;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${far ? 'if (distance(vWPos.xz, uCenter) < uRadius) discard;' : ''}
        float dA = texture2D(uGround, vWPos.xz * 0.21).r;
        float dB = texture2D(uGround, vWPos.xz * 0.033 + 0.37).r;
        diffuseColor.rgb *= (0.62 + dA * 0.55 + (dB - 0.5) * 0.35) * 0.55;
        float puddle = smoothstep(0.56, 0.6, texture2D(uGround, vWPos.xz * 0.045).r) * vWet;
        diffuseColor.rgb *= 1.0 - puddle * 0.45 - vWet * 0.18;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.5, vWet * 0.7);
        roughnessFactor = mix(roughnessFactor, 0.04, puddle);`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        float specK = mix(0.12, 1.0, max(puddle, vWet * 0.3));
        material.specularColor *= specK;
        material.specularF90 = mix(0.12, 1.0, puddle);`);
  };
  m.customProgramCacheKey = () => (far ? 'terrainFar' : 'terrain');
  return m;
}

function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

function colorAt(x, z, h, ny, out) {
  const { a, b, t } = regionBlend(z);
  const n = fbm(x / 40, z / 40, 2) * 0.5 + 0.5;
  let c = mixc(mixc(a.ground, a.ground2, n), mixc(b.ground, b.ground2, n), t);
  const rock = mixc(a.rock, b.rock, t);
  const slope = 1 - ny;
  c = mixc(c, rock, smoothstep(0.18, 0.42, slope));
  const rw = roadWeight(x, z);
  c = mixc(c, [0.12, 0.09, 0.065], rw * 0.92);
  const wl = waterLevelAt(z);
  if (wl > -1e6) c = mixc(c, [0.05, 0.05, 0.04], smoothstep(wl + 0.8, wl - 0.2, h));
  // snow dusting high on the ridge and the sanctuary mountain
  c = mixc(c, [0.55, 0.57, 0.62], smoothstep(185, 260, h) * smoothstep(0.35, 0.1, slope) * 0.8);
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  return rw;
}

export class World {
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.root = new THREE.Group();
    this.root.name = 'world';
    this.scene.add(this.root);
    initFlats();
    this.mat = terrainMaterial(false);
    this.farMat = terrainMaterial(true);
    this.chunks = new Map();
    this.queue = [];
    this.center = new THREE.Vector3();
    this.kit = createVegetationKit();
    this.bank = new MaterialBank();
    this.colliderGrid = new Map();
    this.platformGrid = new Map();
    this.lights = [];
    this.interactables = new Map();
    this.regions = new Map(); // loaded settlement content
    this.animated = [];
    this.quality = engine.settings;
    this._buildInstancing();
    this._buildFar();
    this._buildLightPool(engine.settings.maxLights);
    this._buildWater();
    this.sanctuary = null;
    this.impostor = buildSanctuaryImpostor();
    this.scene.add(this.impostor);
    this.time = 0;
    this.lastVegKey = '';
  }

  // ---------------------------------------------------------- queries
  groundAt(x, z, yHint = Infinity) {
    let h = heightAt(x, z);
    const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    const list = this.platformGrid.get(key);
    if (list) {
      for (const p of list) {
        const top = this._platformTop(p, x, z);
        if (top !== null && top > h && top <= yHint + 0.75) h = top;
      }
    }
    return h;
  }

  _platformTop(p, x, z) {
    const dx = x - p.x; const dz = z - p.z;
    const c = Math.cos(p.rot); const s = Math.sin(p.rot);
    const lx = dx * c - dz * s; const lz = dx * s + dz * c;
    if (Math.abs(lx) > p.hw || Math.abs(lz) > p.hd) return null;
    if (p.y1 !== undefined) return p.y + (p.y1 - p.y) * ((lz + p.hd) / (2 * p.hd));
    return p.y;
  }

  // inside a roofed interior (rain and wind are suppressed there)
  isIndoor(p) {
    for (const z of this.indoor || []) {
      const dx = p.x - z.x; const dz = p.z - z.z;
      const c = Math.cos(z.rot); const s = Math.sin(z.rot);
      const lx = dx * c - dz * s; const lz = dx * s + dz * c;
      if (Math.abs(lx) < z.hw && Math.abs(lz) < z.hd && p.y < z.top && p.y > z.bottom) return true;
    }
    return false;
  }

  waterAt(x, z) {
    const wl = waterLevelAt(z);
    return wl;
  }

  addPlatform(p) {
    const r = Math.hypot(p.hw, p.hd);
    for (let cx = Math.floor((p.x - r) / CELL); cx <= Math.floor((p.x + r) / CELL); cx += 1) {
      for (let cz = Math.floor((p.z - r) / CELL); cz <= Math.floor((p.z + r) / CELL); cz += 1) {
        const k = `${cx},${cz}`;
        if (!this.platformGrid.has(k)) this.platformGrid.set(k, []);
        this.platformGrid.get(k).push(p);
      }
    }
    return p;
  }

  removePlatform(p) {
    for (const [k, list] of this.platformGrid) {
      const i = list.indexOf(p);
      if (i >= 0) { list.splice(i, 1); if (!list.length) this.platformGrid.delete(k); }
    }
  }

  addCollider(c) {
    const r = c.r !== undefined ? c.r : Math.hypot(c.hw, c.hd);
    c._cells = [];
    for (let cx = Math.floor((c.x - r) / CELL); cx <= Math.floor((c.x + r) / CELL); cx += 1) {
      for (let cz = Math.floor((c.z - r) / CELL); cz <= Math.floor((c.z + r) / CELL); cz += 1) {
        const k = `${cx},${cz}`;
        if (!this.colliderGrid.has(k)) this.colliderGrid.set(k, []);
        this.colliderGrid.get(k).push(c);
        c._cells.push(k);
      }
    }
    return c;
  }

  removeCollider(c) {
    if (!c._cells) return;
    for (const k of c._cells) {
      const list = this.colliderGrid.get(k);
      if (!list) continue;
      const i = list.indexOf(c);
      if (i >= 0) list.splice(i, 1);
      if (!list.length) this.colliderGrid.delete(k);
    }
    c._cells = null;
  }

  // Push a circle (x,z,radius) out of colliders. Mutates pos. Returns true if hit.
  collide(pos, radius, y = null) {
    let hit = false;
    const key = `${Math.floor(pos.x / CELL)},${Math.floor(pos.z / CELL)}`;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oz = -1; oz <= 1; oz += 1) {
        const k = ox === 0 && oz === 0 ? key : `${Math.floor(pos.x / CELL) + ox},${Math.floor(pos.z / CELL) + oz}`;
        const list = this.colliderGrid.get(k);
        if (!list) continue;
        for (const c of list) {
          if (seen.has(c) || c.disabled) continue;
          seen.add(c);
          if (y !== null && c.top !== undefined && (y > c.top || (c.bottom !== undefined && y + 1.8 < c.bottom))) continue;
          if (c.r !== undefined) {
            const dx = pos.x - c.x; const dz = pos.z - c.z;
            const d = Math.hypot(dx, dz);
            const m = c.r + radius;
            if (d < m && d > 1e-5) { pos.x = c.x + dx / d * m; pos.z = c.z + dz / d * m; hit = true; }
          } else {
            const cs = Math.cos(c.rot); const sn = Math.sin(c.rot);
            const dx = pos.x - c.x; const dz = pos.z - c.z;
            let lx = dx * cs - dz * sn; let lz = dx * sn + dz * cs;
            const ex = c.hw + radius; const ez = c.hd + radius;
            if (Math.abs(lx) < ex && Math.abs(lz) < ez) {
              const px = ex - Math.abs(lx); const pz = ez - Math.abs(lz);
              if (px < pz) lx = Math.sign(lx || 1) * ex; else lz = Math.sign(lz || 1) * ez;
              pos.x = c.x + lx * cs + lz * sn;
              pos.z = c.z - lx * sn + lz * cs;
              hit = true;
            }
          }
        }
      }
    }
    // keep inside the long valley
    const rx = roadX(pos.z);
    const lim = lateralLimit(pos.z);
    if (pos.x > rx + lim) { pos.x = rx + lim; hit = true; }
    if (pos.x < rx - lim) { pos.x = rx - lim; hit = true; }
    if (pos.z > WORLD.zStart - 20) { pos.z = WORLD.zStart - 20; hit = true; }
    if (pos.z < WORLD.zEnd + 60) { pos.z = WORLD.zEnd + 60; hit = true; }
    return hit;
  }

  // Camera occlusion: march from a to b, return the safe fraction.
  occlusion(a, b, ignoreTerrain = false) {
    const steps = 14;
    const p = new THREE.Vector3();
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      p.lerpVectors(a, b, t);
      if (!ignoreTerrain && p.y < heightAt(p.x, p.z) + 0.35) return Math.max(0, (i - 1) / steps);
      const key = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`;
      const list = this.colliderGrid.get(key);
      if (!list) continue;
      for (const c of list) {
        if (c.r !== undefined || c.noCam || c.disabled) continue;
        if (c.top !== undefined && (p.y > c.top || p.y < c.bottom)) continue;
        const cs = Math.cos(c.rot); const sn = Math.sin(c.rot);
        const dx = p.x - c.x; const dz = p.z - c.z;
        const lx = dx * cs - dz * sn; const lz = dx * sn + dz * cs;
        if (Math.abs(lx) < c.hw + 0.2 && Math.abs(lz) < c.hd + 0.2) return Math.max(0, (i - 1) / steps);
      }
    }
    return 1;
  }

  // Line of sight between two points (walls, buildings, terrain). Used so blows and lock-on never
  // pass through solid geometry.
  segmentBlocked(a, b) { return this.occlusion(a, b) < 0.999; }

  // Is a point (with radius) inside solid world geometry? Used to stop projectiles at walls.
  pointBlocked(p, r = 0) {
    const list = this.colliderGrid.get(`${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`);
    if (!list) return false;
    for (const c of list) {
      if (c.disabled || c.noCam) continue;
      if (c.top !== undefined && (p.y > c.top + r || (c.bottom !== undefined && p.y < c.bottom - r))) continue;
      if (c.r !== undefined) {
        if (Math.hypot(p.x - c.x, p.z - c.z) < c.r + r && p.y < (c.top ?? p.y + 1)) return true;
        continue;
      }
      const cs = Math.cos(c.rot); const sn = Math.sin(c.rot);
      const dx = p.x - c.x; const dz = p.z - c.z;
      if (Math.abs(dx * cs - dz * sn) < c.hw + r && Math.abs(dx * sn + dz * cs) < c.hd + r) return true;
    }
    return false;
  }

  addInteractable(it) { this.interactables.set(it.id, it); return it; }
  removeInteractable(id) { this.interactables.delete(id); }

  nearestInteractable(pos, maxDist = 2.6) {
    let best = null; let bd = maxDist;
    for (const it of this.interactables.values()) {
      if (it.enabled === false) continue;
      const d = Math.hypot(pos.x - it.x, pos.z - it.z) - (it.radius || 0);
      if (d < bd && Math.abs(pos.y - (it.y ?? pos.y)) < 3) { bd = d; best = it; }
    }
    return best;
  }

  // ---------------------------------------------------------- far terrain
  _buildFar() {
    const sx = 64; const step = 26;
    const x0 = -WORLD.halfWidth * 1.1; const x1 = WORLD.halfWidth * 1.1;
    const z0 = WORLD.zStart + 200; const z1 = WORLD.zEnd - 400;
    const nz = Math.ceil((z0 - z1) / step);
    const nx = sx;
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
    const col = new Float32Array((nx + 1) * (nz + 1) * 3);
    const wet = new Float32Array((nx + 1) * (nz + 1));
    const c = [0, 0, 0];
    for (let j = 0; j <= nz; j += 1) {
      const z = z0 - j * step;
      const rx = roadX(z);
      for (let i = 0; i <= nx; i += 1) {
        // denser columns near the road
        const u = i / nx * 2 - 1;
        const x = rx + Math.sign(u) * Math.abs(u) ** 1.6 * (x1 - x0) / 2;
        const h = heightAt(x, z) - 1.6;
        const k = j * (nx + 1) + i;
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
        const n = normalAt(x, z);
        colorAt(x, z, h, n.y, c);
        col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
      }
    }
    const idx = [];
    for (let j = 0; j < nz; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const a = j * (nx + 1) + i; const b = a + 1; const d = a + nx + 1; const e = d + 1;
        idx.push(a, b, d, b, e, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aWet', new THREE.BufferAttribute(wet, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.far = new THREE.Mesh(g, this.farMat);
    this.far.receiveShadow = false;
    this.far.frustumCulled = false;
    this.root.add(this.far);
  }

  // ---------------------------------------------------------- chunks
  _buildChunk(cx, cz) {
    const x0 = cx * CHUNK; const z0 = cz * CHUNK;
    const n = RES + 1;
    const step = CHUNK / RES;
    // height grid with a one-sample border for normals
    const G = n + 2;
    const hg = new Float32Array(G * G);
    for (let j = 0; j < G; j += 1) for (let i = 0; i < G; i += 1) hg[j * G + i] = heightAt(x0 + (i - 1) * step, z0 + (j - 1) * step);
    const pos = new Float32Array(n * n * 3);
    const nor = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    const wet = new Float32Array(n * n);
    const c = [0, 0, 0];
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        const k = j * n + i;
        const x = x0 + i * step; const z = z0 + j * step;
        const h = hg[(j + 1) * G + i + 1];
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
        const hl = hg[(j + 1) * G + i]; const hr = hg[(j + 1) * G + i + 2];
        const hd = hg[j * G + i + 1]; const hu = hg[(j + 2) * G + i + 1];
        let nx = hl - hr; let ny = 2 * step; let nz = hd - hu;
        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
        const rw = colorAt(x, z, h, ny, c);
        col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
        const wl = waterLevelAt(z);
        wet[k] = Math.min(1, rw * 0.9 + (wl > -1e6 ? smoothstep(wl + 1.2, wl, h) : 0) + 0.12);
      }
    }
    const idx = new Uint32Array(RES * RES * 6);
    let q = 0;
    for (let j = 0; j < RES; j += 1) {
      for (let i = 0; i < RES; i += 1) {
        const a = j * n + i; const b = a + 1; const d = a + n; const e = d + 1;
        idx[q++] = a; idx[q++] = d; idx[q++] = b; idx[q++] = b; idx[q++] = d; idx[q++] = e;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aWet', new THREE.BufferAttribute(wet, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const mesh = new THREE.Mesh(g, this.mat);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.root.add(mesh);
    const veg = this._scatter(cx, cz, x0, z0);
    this._bakeVeg(veg, x0, z0, g.boundingBox);
    const roadside = buildRoadside(this, cx, cz, x0, z0, CHUNK);
    return { mesh, veg, roadside, cx, cz };
  }

  // Precompute this chunk's instance matrices once (per vegetation kind) plus a bounding box, so
  // per-frame visibility culling is a cheap buffer copy instead of re-composing matrices.
  _bakeVeg(veg, x0, z0, gbox) {
    const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler();
    const p = new THREE.Vector3(); const s = new THREE.Vector3();
    veg.mats = {};
    for (const [key, arr] of Object.entries(veg.inst)) {
      const n = arr.length / 6;
      const out = new Float32Array(n * 16);
      for (let i = 0; i < n; i += 1) {
        const o = i * 6;
        e.set(0, arr[o + 4], 0); q.setFromEuler(e);
        m4.compose(p.set(arr[o], arr[o + 1], arr[o + 2]), q, s.set(arr[o + 3], arr[o + 5], arr[o + 3]));
        m4.toArray(out, i * 16);
      }
      veg.mats[key] = out;
    }
    const pad = 10;   // canopies overhang the chunk edge
    veg.box = new THREE.Box3(new THREE.Vector3(x0 - pad, gbox.min.y - 2, z0 - pad), new THREE.Vector3(x0 + CHUNK + pad, gbox.max.y + 28, z0 + CHUNK + pad));
  }

  _disposeChunk(ch) {
    this.root.remove(ch.mesh);
    ch.mesh.geometry.dispose();
    for (const c of ch.veg.colliders) this.removeCollider(c);
    if (ch.roadside) {
      this.root.remove(ch.roadside.group);
      ch.roadside.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      for (const c of ch.roadside.colliders) this.removeCollider(c);
      for (const l of ch.roadside.lights) this.lights.splice(this.lights.indexOf(l), 1);
    }
  }

  // Deterministic scatter of trees/rocks/bushes in a chunk.
  _scatter(cx, cz, x0, z0) {
    const out = { inst: {}, colliders: [] };
    const push = (key, x, y, z, s, ry, sy = s) => {
      if (!out.inst[key]) out.inst[key] = [];
      out.inst[key].push(x, y, z, s, ry, sy);
    };
    const q = this.quality;
    const tries = Math.floor(150 * q.trees);
    const zc = z0 + CHUNK / 2;
    const { a, b, t } = regionBlend(zc);
    const dens = (k) => a[k] + (b[k] - a[k]) * t;
    const wl = waterLevelAt(zc);
    for (let i = 0; i < tries; i += 1) {
      const r1 = hash2(cx * 1000 + i, cz * 7 + 3);
      const r2 = hash2(cx * 13 + 7, cz * 1000 + i);
      const r3 = hash2(i * 31 + cx, i * 17 + cz);
      const x = x0 + r1 * CHUNK; const z = z0 + r2 * CHUNK;
      const rd = Math.abs(x - roadX(z));
      if (rd < 9) continue;
      const h = heightAt(x, z);
      if (wl > -1e6 && h < wl + 0.1 && r3 > 0.15) continue;
      const nrm = normalAt(x, z);
      if (nrm.y < 0.78) { if (r3 < 0.25 * dens('rocks')) push(`rock${i % 3}`, x, h - 0.3, z, 1 + r3 * 5, r1 * 6.28, 0.6 + r2 * 2); continue; }
      if (this._inSettlementZone(x, z)) continue;
      // forest clumping
      const clump = fbm(x / 120, z / 120, 2) * 0.5 + 0.5;
      const sel = r3;
      const pPine = dens('pines') * 0.22 * clump * (0.4 + smoothstep(12, 60, rd));
      const pDead = dens('dead') * 0.04;
      const pBroad = dens('trees') * 0.08 * clump;
      const pRock = dens('rocks') * 0.06;
      const pBush = dens('grass') * 0.12;
      let acc = 0;
      if (sel < (acc += pPine)) {
        const s = 0.8 + r1 * 0.7;
        push(`pine${i % 3}`, x, h - 0.2, z, s, r2 * 6.28, s * (0.9 + r3 * 0.4));
        out.colliders.push(this.addCollider({ x, z, r: 0.35 * s, top: h + 12, bottom: h - 2, noCam: true }));
      } else if (sel < (acc += pDead)) {
        const s = 0.8 + r1 * 0.6;
        push(`dead${i % 2}`, x, h - 0.2, z, s, r2 * 6.28);
        out.colliders.push(this.addCollider({ x, z, r: 0.3 * s, top: h + 8, bottom: h - 2, noCam: true }));
      } else if (sel < (acc += pBroad)) {
        const s = 0.8 + r1 * 0.6;
        push(`broad${i % 2}`, x, h - 0.2, z, s, r2 * 6.28);
        out.colliders.push(this.addCollider({ x, z, r: 0.4 * s, top: h + 10, bottom: h - 2, noCam: true }));
      } else if (sel < (acc += pRock)) {
        const s = 0.4 + r1 * r1 * 2.6;
        push(`rock${i % 3}`, x, h - s * 0.25, z, s, r2 * 6.28, s * (0.6 + r3));
        if (s > 0.9) out.colliders.push(this.addCollider({ x, z, r: s * 0.9, top: h + s, bottom: h - 2, noCam: true }));
      } else if (sel < (acc += pBush)) {
        const s = 0.6 + r1 * 0.9;
        push(`bush${i % 2}`, x, h, z, s, r2 * 6.28);
      }
    }
    return out;
  }

  _inSettlementZone(x, z) {
    for (const zone of this.noScatter || []) {
      if (Math.hypot(x - zone.x, z - zone.z) < zone.r) return true;
    }
    return false;
  }

  _buildInstancing() {
    const k = this.kit;
    this.inst = {};
    const make = (key, geom, mat, cap, shadow = true) => {
      const m = new THREE.InstancedMesh(geom, mat, cap);
      m.count = 0;
      m.castShadow = shadow;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.root.add(m);
      this.inst[key] = m;
    };
    k.pine.forEach((g, i) => make(`pine${i}`, g, k.mats.pine, 5000));
    k.dead.forEach((g, i) => make(`dead${i}`, g, k.mats.dead, 2500));
    k.broad.forEach((g, i) => make(`broad${i}`, g, k.mats.broad, 2500));
    k.rock.forEach((g, i) => make(`rock${i}`, g, k.mats.rock, 3000));
    k.bush.forEach((g, i) => make(`bush${i}`, g, k.mats.bush, 4000, false));
    // grass follows the camera
    this.grass = new THREE.InstancedMesh(k.grass, k.mats.grass, 9000);
    this.grass.count = 0;
    this.grass.frustumCulled = false;
    this.grass.receiveShadow = true;
    this.root.add(this.grass);
    this.grassCells = new Map();
    this.grassKey = '';
  }

  // Fill the shared instanced meshes with only the chunks that can matter this frame: inside the
  // camera frustum, or close enough to cast a shadow into view. Runs ~5x a second (and whenever
  // chunks stream); copying pre-baked matrices keeps it well under a millisecond.
  _rebuildInstances() {
    const cam = this.engine.camera;
    cam.updateMatrixWorld();
    this._vp = this._vp || new THREE.Matrix4();
    this._frustum = this._frustum || new THREE.Frustum();
    this._frustum.setFromProjectionMatrix(this._vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const fx = this.center.x; const fz = this.center.z;
    const counts = this._vegCounts || (this._vegCounts = {});
    for (const key of Object.keys(this.inst)) counts[key] = 0;
    let drawn = 0;
    for (const ch of this.chunks.values()) {
      const v = ch.veg;
      if (!v?.mats) continue;
      const cxm = (v.box.min.x + v.box.max.x) / 2; const czm = (v.box.min.z + v.box.max.z) / 2;
      const near = Math.hypot(cxm - fx, czm - fz) < 90;
      if (!near && !this._frustum.intersectsBox(v.box)) continue;
      drawn += 1;
      for (const key in v.mats) {
        const im = this.inst[key];
        if (!im) continue;
        const src = v.mats[key];
        const room = im.instanceMatrix.count - counts[key];
        const n = Math.min(room, src.length / 16);
        if (n <= 0) continue;
        im.instanceMatrix.array.set(n * 16 === src.length ? src : src.subarray(0, n * 16), counts[key] * 16);
        counts[key] += n;
      }
    }
    for (const [key, im] of Object.entries(this.inst)) {
      im.count = counts[key];
      im.instanceMatrix.clearUpdateRanges();
      im.instanceMatrix.addUpdateRange(0, Math.max(16, counts[key] * 16));
      im.instanceMatrix.needsUpdate = true;
    }
    this.vegChunksDrawn = drawn;
  }

  _updateGrass(pos) {
    const cs = 10;
    const gx = Math.floor(pos.x / cs); const gz = Math.floor(pos.z / cs);
    const key = `${gx},${gz}`;
    if (key === this.grassKey) return;
    this.grassKey = key;
    const R = Math.max(2, Math.round(4 * Math.sqrt(this.quality.grass)));
    const per = Math.floor(26 * this.quality.grass);
    const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler();
    const p = new THREE.Vector3(); const sc = new THREE.Vector3();
    let n = 0;
    const keep = new Set();
    for (let j = -R; j <= R; j += 1) {
      for (let i = -R; i <= R; i += 1) {
        const cx = gx + i; const cz = gz + j;
        const ck = `${cx},${cz}`;
        keep.add(ck);
        let cell = this.grassCells.get(ck);
        if (!cell) {
          cell = [];
          const zc = cz * cs;
          const dens = (() => { const { a, b, t } = regionBlend(zc); return a.grass + (b.grass - a.grass) * t; })();
          const wl = waterLevelAt(zc);
          for (let k = 0; k < per; k += 1) {
            const r1 = hash2(cx * 977 + k, cz * 31 + 5); const r2 = hash2(cx * 7 + k * 13, cz * 977 + 1); const r3 = hash2(k, cx + cz * 3);
            if (r3 > dens * 0.7) continue;
            const x = (cx + r1) * cs; const z = (cz + r2) * cs;
            if (roadWeight(x, z) > 0.1) continue;
            if (this._inSettlementZone(x, z) && r3 > 0.15) continue;
            const h = heightAt(x, z);
            if (wl > -1e6 && h < wl - 0.3) continue;
            cell.push(x, h, z, 0.7 + r3 * 0.9, r1 * 6.28);
          }
          this.grassCells.set(ck, cell);
        }
        for (let k = 0; k < cell.length && n < this.grass.instanceMatrix.count; k += 5) {
          e.set(0, cell[k + 4], 0); q.setFromEuler(e);
          m4.compose(p.set(cell[k], cell[k + 1], cell[k + 2]), q, sc.set(cell[k + 3], cell[k + 3], cell[k + 3]));
          this.grass.setMatrixAt(n, m4);
          n += 1;
        }
      }
    }
    for (const k of this.grassCells.keys()) if (!keep.has(k)) this.grassCells.delete(k);
    this.grass.count = n;
    this.grass.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------- lights
  // A fixed number of point lights (the quality preset's maxLights), always in the scene. Unused
  // ones sit at intensity 0 rather than being hidden: changing the visible light count forces
  // every lit material to recompile, which caused 100+ ms hitches while travelling (V2 audit).
  _buildLightPool(n) {
    for (const l of this.pool || []) l.removeFromParent();
    this.pool = [];
    for (let i = 0; i < n; i += 1) {
      const l = new THREE.PointLight(0xffa040, 0, 18, 1.6);
      l.castShadow = false;
      l.position.set(0, -500, 0);
      this.scene.add(l);
      this.pool.push(l);
    }
    this.poolSize = n;
    this.lightTimer = 0;
  }

  registerLight(l) { this.lights.push(l); return l; }

  _updateLights(dt, focus) {
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.25;
      const sorted = this.lights
        .map((l) => ({ l, d: (l.x - focus.x) ** 2 + (l.z - focus.z) ** 2 }))
        .filter((o) => o.d < 120 * 120)
        .sort((a, b) => a.d - b.d)
        .slice(0, this.poolSize);
      this.active = sorted.map((o) => o.l);
    }
    const act = this.active || [];
    for (let i = 0; i < this.pool.length; i += 1) {
      const pl = this.pool[i];
      const l = act[i];
      if (!l || i >= this.poolSize) { pl.intensity = 0; continue; }
      pl.position.set(l.x, l.y, l.z);
      pl.color.setHex(l.color);
      const fl = l.flicker ? (0.88 + Math.sin(this.time * 13 + l.x) * 0.06 + Math.sin(this.time * 31 + l.z) * 0.05 * l.flicker) : 1;
      pl.intensity = (l.intensity ?? 1) * 16 * fl * (this.frozen ? 0.7 : 1);
      pl.distance = l.range || 24;
    }
  }

  onQuality(s) {
    this.quality = s;
    if (s.maxLights !== this.pool?.length) this._buildLightPool(s.maxLights);
    this.grassKey = '';
    this.grassCells.clear();
  }

  // ---------------------------------------------------------- water
  _buildWater() {
    const wr = REGIONS.find((r) => r.id === 'gravewater');
    const g = new THREE.PlaneGeometry(1600, 1900, 1, 1);
    g.rotateX(-Math.PI / 2);
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x0b1411, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.88 });
    this.waterMat.onBeforeCompile = (sh) => {
      sh.uniforms.uT = wind.time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uT; varying vec3 vW;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          float rip = sin(vW.x*1.7 + uT*2.0)*sin(vW.z*1.3 - uT*1.6) + sin((vW.x+vW.z)*3.1 + uT*3.3)*0.5;
          normal = normalize(normal + vec3(rip*0.06, 0.0, rip*0.05));`);
    };
    this.water = new THREE.Mesh(g, this.waterMat);
    this.water.position.set(roadX(wr.z), wr.water, wr.z);
    this.water.receiveShadow = true;
    this.root.add(this.water);
  }

  // ---------------------------------------------------------- settlements
  _updateRegions(focus) {
    for (const r of REGIONS) {
      const d = Math.abs(focus.z - r.z);
      const loaded = this.regions.get(r.id);
      if (!loaded && d < 1050) {
        const content = buildRegion(this, r);
        this.regions.set(r.id, content);
        this.grassKey = '';
        this.grassCells.clear();
        // chunks scattered before this region loaded need re-scatter to avoid trees inside buildings
        for (const [k, ch] of this.chunks) {
          if (Math.abs(ch.cz * CHUNK - r.z) < 700) { this._disposeChunk(ch); this.chunks.delete(k); }
        }
      } else if (loaded && d > 1500) {
        loaded.dispose();
        this.regions.delete(r.id);
      }
    }
    // sanctuary (real geometry) near the end
    const ds = Math.hypot(focus.x - SANCTUARY.x, focus.z - SANCTUARY.z);
    if (!this.sanctuary && ds < 1300) {
      this.sanctuary = buildSanctuary(this);
    } else if (this.sanctuary && ds > 1700) {
      this.sanctuary.dispose();
      this.sanctuary = null;
    }
  }

  _updateImpostor(cam) {
    const target = new THREE.Vector3(SANCTUARY.x, SANCTUARY.y || heightAt(SANCTUARY.x, SANCTUARY.z), SANCTUARY.z - 40);
    const dist = cam.distanceTo(target);
    const D = 1300;
    const show = dist > 520;
    this.impostor.visible = show;
    if (!show) return;
    const dir = target.clone().sub(cam).normalize();
    const place = Math.min(dist, D);
    // exaggerate the far silhouette so the sanctuary reads as a landmark from the start of the road
    const boost = 1 + 2.6 * smoothstep(1500, 11000, dist);
    this.impostor.position.copy(cam).addScaledVector(dir, place);
    this.impostor.position.y -= 40 * (boost - 1) * (place / dist);
    this.impostor.scale.setScalar((place / dist) * boost);
    const vis = smoothstep(11500, 2500, dist);
    this.impostor.userData.setVisibility?.(vis, this.flash || 0);
  }

  // ---------------------------------------------------------- update
  update(dt, realDt, focus, cam) {
    this.time += realDt;
    if (!this.frozen) wind.time.value += dt;
    this.center.copy(focus);
    const ccx = Math.floor(focus.x / CHUNK); const ccz = Math.floor(focus.z / CHUNK);
    this._updateRegions(focus);
    const want = new Set();
    for (let j = -RADIUS; j <= RADIUS; j += 1) {
      for (let i = -RADIUS; i <= RADIUS; i += 1) {
        const cx = ccx + i; const cz = ccz + j;
        const z = cz * CHUNK;
        if (z > WORLD.zStart + 200 || z < WORLD.zEnd - 300) continue;
        const rx = roadX(z);
        if (Math.abs(cx * CHUNK + CHUNK / 2 - rx) > 700) continue;
        want.add(`${cx},${cz}`);
      }
    }
    let changed = false;
    for (const [k, ch] of this.chunks) {
      if (!want.has(k)) { this._disposeChunk(ch); this.chunks.delete(k); changed = true; }
    }
    // build missing chunks nearest-first, a few per frame
    const missing = [...want].filter((k) => !this.chunks.has(k)).map((k) => {
      const [cx, cz] = k.split(',').map(Number);
      return { k, cx, cz, d: (cx - ccx) ** 2 + (cz - ccz) ** 2 };
    }).sort((a, b) => a.d - b.d);
    const budget = this.forceBuild ? missing.length : 2;
    for (let i = 0; i < Math.min(budget, missing.length); i += 1) {
      const m = missing[i];
      this.chunks.set(m.k, this._buildChunk(m.cx, m.cz));
      changed = true;
    }
    this.forceBuild = false;
    this._vegT = (this._vegT || 0) - realDt;
    // re-cull on a timer, on streaming, and immediately after a fast camera turn (no pop-in)
    const cd = this._camDir || (this._camDir = new THREE.Vector3(0, 0, -1));
    const nd = this._camDirNow || (this._camDirNow = new THREE.Vector3());
    this.engine.camera.getWorldDirection(nd);
    const turned = nd.dot(cd) < 0.966;
    if (changed || turned || this._vegT <= 0) { this._vegT = 0.2; cd.copy(nd); this._rebuildInstances(); }
    this._updateGrass(focus);
    this.farMat.userData.uniforms.uCenter.value.set(focus.x, focus.z);
    this.farMat.userData.uniforms.uRadius.value = (RADIUS - 0.25) * CHUNK;
    this._updateLights(realDt, focus);
    for (const a of this.animated) a.update(this.time, this.frozen ? 0 : dt);
    for (const r of this.regions.values()) for (const a of r.animated || []) a.update(this.time, this.frozen ? 0 : dt);
    if (cam) this._updateImpostor(cam);
    const reg = regionAt(focus.z);
    if (reg !== this.currentRegion) {
      this.currentRegion = reg;
      if (this.onRegion) this.onRegion(reg);
    }
  }

  isReady(focus) {
    const ccx = Math.floor(focus.x / CHUNK); const ccz = Math.floor(focus.z / CHUNK);
    return this.chunks.has(`${ccx},${ccz}`);
  }

  // Build everything around a point synchronously (used behind loading screens).
  warm(focus) {
    this.forceBuild = true;
    this.update(0, 0, focus, null);
  }

  regionWeight(z, id) { return regionWeight(z, id); }
}
