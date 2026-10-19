import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry, simplex } from './Noise';
import { getTextures } from './Textures';

// Vegetation and rock geometry + materials, plus a wind uniform shared by foliage shaders.

export const wind = { time: { value: 0 }, strength: { value: 1 } };

function colorize(g, c, jitter = 0.08, rnd = Math.random, darkenBottom = 0) {
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  let minY = Infinity; let maxY = -Infinity;
  for (let i = 0; i < pos.count; i += 1) { minY = Math.min(minY, pos.getY(i)); maxY = Math.max(maxY, pos.getY(i)); }
  for (let i = 0; i < pos.count; i += 1) {
    const j = 1 + (rnd() - 0.5) * jitter * 2;
    const h = (pos.getY(i) - minY) / Math.max(0.001, maxY - minY);
    const d = 1 - darkenBottom * (1 - h);
    col[i * 3] = c[0] * j * d; col[i * 3 + 1] = c[1] * j * d; col[i * 3 + 2] = c[2] * j * d;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function prep(g) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'color'].includes(k)) n.deleteAttribute(k);
  return n;
}

function pineGeometry(seed) {
  const rnd = mulberry(seed);
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.12, 0.28, 3.2, 6);
  trunk.translate(0, 1.6, 0);
  parts.push(prep(colorize(trunk, [0.16, 0.11, 0.08], 0.1, rnd)));
  const tiers = 5;
  for (let i = 0; i < tiers; i += 1) {
    const t = i / tiers;
    const r = 2.4 * (1 - t * 0.78);
    const h = 3.1 - t * 1.2;
    const cone = new THREE.ConeGeometry(r, h, 8, 1, false);
    const pos = cone.attributes.position;
    for (let k = 0; k < pos.count; k += 1) {
      if (pos.getY(k) < 0) {
        pos.setX(k, pos.getX(k) * (0.85 + rnd() * 0.3));
        pos.setZ(k, pos.getZ(k) * (0.85 + rnd() * 0.3));
        pos.setY(k, pos.getY(k) - rnd() * 0.35);
      }
    }
    cone.computeVertexNormals();
    cone.rotateY(rnd() * Math.PI);
    cone.translate(0, 2.2 + i * 1.55, 0);
    const g = 0.07 + rnd() * 0.03;
    parts.push(prep(colorize(cone, [0.05, g + 0.04, 0.06], 0.18, rnd, 0.45)));
  }
  return mergeGeometries(parts);
}

function deadTreeGeometry(seed) {
  const rnd = mulberry(seed);
  const parts = [];
  const col = [0.2, 0.17, 0.15];
  const trunk = new THREE.CylinderGeometry(0.1, 0.32, 5.5, 6);
  trunk.translate(0, 2.75, 0);
  parts.push(prep(colorize(trunk, col, 0.1, rnd)));
  const branch = (x, y, z, len, rad, ax, az, depth) => {
    const g = new THREE.CylinderGeometry(rad * 0.4, rad, len, 5);
    g.translate(0, len / 2, 0);
    g.rotateX(ax); g.rotateZ(az);
    g.translate(x, y, z);
    parts.push(prep(colorize(g, col, 0.1, rnd)));
    if (depth > 0) {
      const dir = new THREE.Vector3(0, len, 0).applyEuler(new THREE.Euler(ax, 0, az));
      for (let i = 0; i < 2; i += 1) {
        branch(x + dir.x, y + dir.y, z + dir.z, len * 0.6, rad * 0.55, ax + (rnd() - 0.5) * 1.2, az + (rnd() - 0.5) * 1.4, depth - 1);
      }
    }
  };
  for (let i = 0; i < 4; i += 1) {
    branch(0, 2.5 + i * 0.8, 0, 1.8 + rnd(), 0.13, (rnd() - 0.5) * 1.6, (rnd() - 0.5) * 2.2, 1);
  }
  return mergeGeometries(parts);
}

function broadleafGeometry(seed) {
  const rnd = mulberry(seed);
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.18, 0.4, 4, 7);
  trunk.translate(0, 2, 0);
  parts.push(prep(colorize(trunk, [0.15, 0.12, 0.09], 0.1, rnd)));
  for (let i = 0; i < 7; i += 1) {
    const s = 1.4 + rnd() * 1.2;
    const g = new THREE.IcosahedronGeometry(s, 1);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k += 1) {
      const f = 1 + simplex(pos.getX(k) * 2 + seed, pos.getZ(k) * 2) * 0.18;
      pos.setXYZ(k, pos.getX(k) * f, pos.getY(k) * f * 0.8, pos.getZ(k) * f);
    }
    g.computeVertexNormals();
    g.translate((rnd() - 0.5) * 3, 4.5 + rnd() * 2.2, (rnd() - 0.5) * 3);
    parts.push(prep(colorize(g, [0.07, 0.1 + rnd() * 0.03, 0.06], 0.2, rnd, 0.3)));
  }
  return mergeGeometries(parts);
}

function rockGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.attributes.position;
  for (let k = 0; k < pos.count; k += 1) {
    const x = pos.getX(k); const y = pos.getY(k); const z = pos.getZ(k);
    const f = 1 + simplex(x * 1.3 + seed, z * 1.3 + y) * 0.32;
    pos.setXYZ(k, x * f * 1.2, y * f * 0.7, z * f);
  }
  g.computeVertexNormals();
  const n = g.toNonIndexed();
  n.computeVertexNormals();
  // planar uv for the rock texture
  const p = n.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 1) { uv[i * 2] = p.getX(i) * 0.5 + p.getZ(i) * 0.3; uv[i * 2 + 1] = p.getY(i) * 0.5; }
  n.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return n;
}

function bushGeometry(seed) {
  const rnd = mulberry(seed);
  const parts = [];
  for (let i = 0; i < 5; i += 1) {
    const g = new THREE.IcosahedronGeometry(0.35 + rnd() * 0.25, 0);
    g.translate((rnd() - 0.5) * 0.8, 0.3 + rnd() * 0.25, (rnd() - 0.5) * 0.8);
    parts.push(prep(colorize(g, [0.13, 0.13, 0.09], 0.25, rnd)));
  }
  return mergeGeometries(parts);
}

function grassTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  const rnd = mulberry(77);
  for (let i = 0; i < 26; i += 1) {
    const x = 4 + rnd() * 56;
    const h = 60 + rnd() * 66;
    const bend = (rnd() - 0.5) * 18;
    const v = 120 + rnd() * 100;
    g.strokeStyle = `rgba(${v},${v},${v},1)`;
    g.lineWidth = 1.5 + rnd() * 2;
    g.beginPath(); g.moveTo(x, 128); g.quadraticCurveTo(x + bend * 0.3, 128 - h * 0.5, x + bend, 128 - h); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function addWind(mat, amount = 1, heightRef = 6) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = wind.time;
    shader.uniforms.uWindStr = wind.strength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime; uniform float uWindStr;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
          #endif
          float h = max(0.0, transformed.y) / ${heightRef.toFixed(1)};
          float sway = sin(uWindTime * 1.3 + wp.x * 0.05 + wp.z * 0.07) * 0.6 + sin(uWindTime * 3.1 + wp.x * 0.3) * 0.25;
          transformed.x += sway * h * h * ${amount.toFixed(2)} * uWindStr;
          transformed.z += sway * h * h * ${(amount * 0.6).toFixed(2)} * uWindStr;
        }`);
  };
  mat.customProgramCacheKey = () => `wind${amount}${heightRef}`;
  return mat;
}

export function createVegetationKit() {
  const t = getTextures();
  const vc = (extra = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, ...extra });
  const kit = {
    pine: [pineGeometry(1), pineGeometry(2), pineGeometry(3)],
    dead: [deadTreeGeometry(11), deadTreeGeometry(12)],
    broad: [broadleafGeometry(21), broadleafGeometry(22)],
    rock: [rockGeometry(31), rockGeometry(32), rockGeometry(33)],
    bush: [bushGeometry(41), bushGeometry(42)],
    mats: {
      pine: addWind(vc(), 0.5, 10),
      dead: addWind(vc(), 0.2, 8),
      broad: addWind(vc(), 0.45, 8),
      rock: new THREE.MeshStandardMaterial({ map: t.rock, roughness: 0.95, color: 0x8a8580 }),
      bush: addWind(vc(), 0.3, 1),
    },
  };
  // grass: crossed quads
  const q1 = new THREE.PlaneGeometry(0.9, 0.7); q1.translate(0, 0.35, 0);
  const q2 = q1.clone(); q2.rotateY(Math.PI / 2);
  const q3 = q1.clone(); q3.rotateY(Math.PI / 4);
  kit.grass = mergeGeometries([q1, q2, q3]);
  kit.mats.grass = addWind(new THREE.MeshStandardMaterial({
    map: grassTexture(), alphaTest: 0.45, side: THREE.DoubleSide, color: 0x6e6a4a, roughness: 1,
  }), 0.35, 0.7);
  return kit;
}
