import * as THREE from 'three';
import { Batch, Frame, column, arch, lampPost, house, storefront } from './Architecture';
import { heightAt } from './Terrain';
import { SANCTUARY } from './Layout';

// Heaven's Reach sanctuary (real geometry), its distant silhouette, and the title-screen mansion.

function cathedral(b, f, scale = 1, detail = true) {
  const s = scale;
  const g = 'gothic';
  // nave
  const nw = 34 * s; const nd = 90 * s; const nh = 34 * s;
  b.box(g, f, 0, nh / 2, -nd / 2 - 10 * s, nw, nh, nd, 0, 0, 0, 3);
  // steep roof
  b.box('shingleDark', f, -nw / 4 - 1 * s, nh + 9 * s, -nd / 2 - 10 * s, nw / 2 + 4 * s, 0.6 * s, nd + 2 * s, 0, 0, 0.95);
  b.box('shingleDark', f, nw / 4 + 1 * s, nh + 9 * s, -nd / 2 - 10 * s, nw / 2 + 4 * s, 0.6 * s, nd + 2 * s, 0, 0, -0.95);
  // transept
  b.box(g, f, 0, nh * 0.45, -60 * s, 70 * s, nh * 0.9, 22 * s, 0, 0, 0, 3);
  // facade with twin towers
  b.box(g, f, 0, nh * 0.75, -8 * s, nw + 4 * s, nh * 1.5, 6 * s, 0, 0, 0, 3);
  for (const x of [-1, 1]) {
    const tx = x * (nw / 2 + 5 * s);
    b.box(g, f, tx, 30 * s, -9 * s, 12 * s, 60 * s, 12 * s, 0, 0, 0, 3);
    b.box(g, f, tx, 62 * s, -9 * s, 9 * s, 6 * s, 9 * s, 0, 0, 0, 3);
    b.cone('shingleDark', f, tx, 84 * s, -9 * s, 6.5 * s, 38 * s, 8, Math.PI / 8);
    for (const cx of [-1, 1]) for (const cz of [-1, 1]) b.cone(g, f, tx + cx * 5 * s, 68 * s, -9 * s + cz * 5 * s, 1.2 * s, 9 * s, 6);
    if (detail) {
      for (let k = 0; k < 3; k += 1) b.box('glassGold', f, tx, 18 * s + k * 13 * s, -2.9 * s, 2.2 * s, 7 * s, 0.3 * s);
    }
  }
  // central spire over the crossing
  b.box(g, f, 0, nh + 12 * s, -60 * s, 14 * s, 24 * s, 14 * s, 0, 0, 0, 3);
  b.cone('shingleDark', f, 0, nh + 52 * s, -60 * s, 8 * s, 58 * s, 8, Math.PI / 8);
  // rose window + portal
  b.cyl('glassRose', f, 0, nh * 0.95, -4.8 * s, 7 * s, 7 * s, 0.6 * s, 24, Math.PI / 2, 0, 0);
  b.box('black', f, 0, 7 * s, -4.9 * s, 9 * s, 14 * s, 0.4 * s);
  b.box('glassGold', f, 0, 15.5 * s, -4.85 * s, 6 * s, 2.2 * s, 0.3 * s);
  if (detail) {
    // buttresses + lancet windows down the nave
    for (let z = -20; z >= -100; z -= 12) {
      for (const x of [-1, 1]) {
        b.box(g, f, x * (nw / 2 + 4 * s), 14 * s, z * s, 3 * s, 28 * s, 3.5 * s, 0, 0, x * 0.08);
        b.box(g, f, x * (nw / 2 + 1.6 * s), 26 * s, z * s, 6 * s, 1.5 * s, 2 * s, 0, 0, x * -0.5);
        b.box('glassGold', f, x * (nw / 2 + 0.1 * s), 18 * s, (z - 6) * s, 0.3 * s, 14 * s, 3 * s);
      }
    }
  }
}

export function buildSanctuary(world) {
  const b = new Batch();
  const y = SANCTUARY.y || heightAt(SANCTUARY.x, SANCTUARY.z);
  const f = new Frame(SANCTUARY.x, y, SANCTUARY.z - 60, 0);
  cathedral(b, f, 1, true);
  // forecourt arena (60 x 60) in front of the facade with the Arrow altar on the steps
  const af = new Frame(SANCTUARY.x, y, SANCTUARY.z, 0);
  b.box('gothic', af, 0, -0.5, 0, 64, 1.2, 64, 0, 0, 0, 3);
  world.addPlatform({ x: af.x, z: af.z, hw: 32, hd: 32, rot: 0, y: y + 0.1 });
  for (let i = 0; i < 6; i += 1) b.box('gothic', af, 0, 0.2 + i * 0.45, -33 - i * 1.4, 26, 0.45, 1.4);
  world.addPlatform({ x: af.x, z: af.z - 37, hw: 13, hd: 4.5, rot: 0, y: y + 0.1, y1: y + 2.8 });
  b.box('gothic', af, 0, 2.8, -42, 6, 1.6, 4);
  b.cyl('gothic', af, 0, 4.2, -42, 0.8, 1.1, 1.4, 12);
  for (const x of [-28, -14, 14, 28]) {
    column(b, af, x, 30, 9, 'gothic', x === 14);
    column(b, af, x, -26, 9, 'gothic');
  }
  for (const x of [-30, 30]) for (const z of [-16, 0, 16]) column(b, af, x, z, 9, 'gothic', z === 0 && x > 0);
  arch(b, af, 0, 31, 12, 8);
  for (const [x, z] of [[-20, 20], [20, 20], [-20, -18], [20, -18]]) lampPost(b, af, x, z);
  b.light(af, 0, 6, -42, 0xffd890, 1.4, 0.3);
  const group = b.build(world.bank);
  group.name = 'sanctuary';
  world.root.add(group);
  const cols = b.colliders.map((c) => world.addCollider({ ...c }));
  // nave walls block the north side of the arena
  cols.push(world.addCollider({ x: SANCTUARY.x, z: SANCTUARY.z - 115, hw: 40, hd: 55, rot: 0, top: y + 80, bottom: y - 5 }));
  const lights = b.lights.map((l) => world.registerLight(l));
  world.altar = new THREE.Vector3(SANCTUARY.x, y + 4.9, SANCTUARY.z - 42);
  return {
    group,
    dispose() {
      world.root.remove(group);
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      for (const c of cols) world.removeCollider(c);
      for (const l of lights) { const i = world.lights.indexOf(l); if (i >= 0) world.lights.splice(i, 1); }
    },
  };
}

// Distant silhouette: same massing, lit windows, unaffected by fog so it reads through the storm.
export function buildSanctuaryImpostor() {
  const b = new Batch();
  const f = new Frame(0, 0, 0, 0);
  cathedral(b, f, 1, false);
  const tmpBank = {
    get: (k) => {
      if (k === 'glassRose') return new THREE.MeshBasicMaterial({ color: 0xb59aff, fog: false });
      if (k === 'glassGold') return new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false });
      return null;
    },
  };
  const silhouette = new THREE.MeshBasicMaterial({ color: 0x0c1018, fog: false });
  const mats = new Map();
  const bank = { get: (k) => tmpBank.get(k) || silhouette };
  void mats;
  const group = b.build(bank);
  group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.renderOrder = -5; o.frustumCulled = false; } });
  // mountain mass behind it
  const mtn = new THREE.Mesh(new THREE.ConeGeometry(420, 420, 7, 1), silhouette);
  mtn.position.set(0, 120, -420);
  mtn.renderOrder = -6;
  group.add(mtn);
  group.userData.setVisibility = (v, flash) => {
    const c = 0.03 + flash * 0.25;
    silhouette.color.setRGB(c * 0.9 + 0.02, c + 0.025, c * 1.25 + 0.04);
    group.traverse((o) => { if (o.isMesh && o.material !== silhouette) { o.material.transparent = true; o.material.opacity = 0.35 + v * 0.65; } });
    silhouette.transparent = true;
    silhouette.opacity = 0.35 + v * 0.6;
  };
  return group;
}

// Title-screen mansion balcony set (placed above Ebon Crossing, looking north up the valley).
export function buildMansion(world, x, z, y, rotY) {
  const b = new Batch();
  const f = new Frame(x, y, z, rotY);
  // main house body behind the balcony
  b.box('stoneDark', f, 0, -3, -9, 26, 8, 16);
  b.box('woodGrey', f, 0, 5, -9, 24, 10, 14);
  b.box('shingleDark', f, -6.5, 12.8, -9, 13.5, 0.3, 15, 0, 0, 0.7);
  b.box('shingleDark', f, 6.5, 12.8, -9, 13.5, 0.3, 15, 0, 0, -0.7);
  b.prism('woodGrey', f, 0, 10, -1.95, 24, 7.2, 0.1);
  // gothic windows on the facade
  for (const xx of [-8.5, -3, 3, 8.5]) {
    b.box('windowLit', f, xx, 6.5, -1.9, 1.6, 3.8, 0.08, 0, 0, 0, 10);
    b.box('woodDark', f, xx, 8.6, -1.85, 1.9, 0.3, 0.2);
    b.cone('woodDark', f, xx, 9.1, -1.85, 1.0, 1.0, 4, Math.PI / 4);
  }
  // open doorway into darkness
  b.box('black', f, 0, 5.4, -1.88, 2.4, 3.6, 0.06);
  b.box('woodDark', f, 0, 7.4, -1.8, 2.9, 0.35, 0.25);
  // balcony
  b.box('floor', f, 0, 3.3, 1.5, 14, 0.3, 7);
  b.box('woodDark', f, 0, 1.6, 1.5, 13.6, 3.2, 6.6);
  for (let xx = -6.8; xx <= 6.8; xx += 0.55) b.box('woodDark', f, xx, 3.95, 4.9, 0.08, 1.0, 0.08);
  b.box('woodDark', f, 0, 4.5, 4.9, 14, 0.12, 0.16);
  for (const xx of [-6.8, 6.8]) b.box('woodDark', f, xx, 4.5, 1.5, 0.12, 0.12, 6.8);
  for (const xx of [-6.6, -2.2, 2.2, 6.6]) b.box('woodDark', f, xx, 6.3, 4.7, 0.35, 6, 0.35);
  b.box('shingleDark', f, 0, 9.4, 2.2, 14.6, 0.2, 7.6, 0.18, 0, 0);
  for (const xx of [-4.4, 4.4]) { b.box('lantern', f, xx, 8.2, 4.4, 0.24, 0.36, 0.24); b.light(f, xx, 8.0, 4.4, 0xffa040, 1.3, 1); }
  b.light(f, 0, 6, -3, 0xff8a30, 0.6, 0.6);
  // side wings
  storefront(b, new Frame(...f.pt(-17, 0, -9).toArray(), rotY + Math.PI / 2), { w: 10, d: 9, h: 7, wall: 'woodGrey', porch: false, lit: true });
  house(b, new Frame(...f.pt(17, 0, -10).toArray(), rotY - Math.PI / 2), { w: 10, d: 8, h: 6, wall: 'woodGrey', lit: true });
  const group = b.build(world ? world.bank : null);
  return { group, lights: b.lights, balcony: f.pt(0, 3.45, 2.5), frame: f };
}
