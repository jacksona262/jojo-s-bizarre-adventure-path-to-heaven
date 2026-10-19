import * as THREE from 'three';
import {
  Batch, Frame, storefront, house, barn, church, waterTower, windmill, cabin, warehouse, station, ruinWall, column, arch,
  lampPost, barrel, crate, wagon, trough, hitchRail, fenceRun, telegraphPole, tombstone, campfire, tent, railTrack, trestle, signPost,
} from './Architecture';
import { heightAt, roadX, roadY, resolvePOI, GULCHES, ROAD_HALF } from './Terrain';
import { REGIONS, SPACING } from './Layout';
import { mulberry, hash2 } from './Noise';

// Hand-placed content for each region. Everything is resolved against the road curve so the
// layouts stay coherent with the terrain.

function tangent(z) {
  const dx = roadX(z - 1) - roadX(z + 1);
  const l = Math.hypot(dx, 2);
  return { x: dx / l, z: -2 / l };
}

function makeCtx(world, region) {
  const b = new Batch();
  const ctx = {
    world, region, b, platforms: [], interactables: [], noScatter: [], dyn: [], animated: b.animated,
    rng: mulberry(region.id.length * 7919 + 13),
    // position relative to the road at region-centre offset dz (north negative) and lateral side (east positive)
    at(dz, side = 0) {
      const z = region.z + dz;
      const t = tangent(z);
      const ex = -t.z; const ez = t.x; // east-pointing normal
      const x = roadX(z) + ex * side;
      const zz = z + ez * side;
      return { x, z: zz, y: heightAt(x, zz), t, e: { x: ex, z: ez } };
    },
    // frame whose local +z faces the road (or 'north'/'south'/angle)
    frame(dz, side, face = 'road', yOff = 0) {
      const p = ctx.at(dz, side);
      let fx; let fz;
      if (face === 'road') { const s = Math.sign(side) || 1; fx = -p.e.x * s; fz = -p.e.z * s; } else if (face === 'north') { fx = p.t.x; fz = p.t.z; } else if (face === 'south') { fx = -p.t.x; fz = -p.t.z; } else { fx = Math.sin(face); fz = Math.cos(face); }
      const f = new Frame(p.x, p.y + yOff, p.z, Math.atan2(fx, fz));
      f.base = p;
      return f;
    },
    ground(x, z) { return heightAt(x, z); },
    clear(dz, side, r) { const p = ctx.at(dz, side); ctx.noScatter.push({ x: p.x, z: p.z, r }); },
    platform(p) { ctx.platforms.push(p); },
    interact(it) { ctx.interactables.push(it); },
  };
  return ctx;
}

function finalize(ctx) {
  const { world, b } = ctx;
  world.noScatter = world.noScatter || [];
  world.noScatter.push(...ctx.noScatter);
  const group = b.build(world.bank);
  group.name = `region:${ctx.region.id}`;
  world.root.add(group);
  const colliders = b.colliders.map((c) => world.addCollider({ ...c }));
  const lights = b.lights.map((l) => world.registerLight(l));
  const platforms = ctx.platforms.map((p) => world.addPlatform(p));
  for (const it of ctx.interactables) world.addInteractable(it);
  return {
    group, colliders, platforms, animated: ctx.animated, dyn: ctx.dyn,
    dispose() {
      world.root.remove(group);
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      for (const c of colliders) world.removeCollider(c);
      for (const l of lights) { const i = world.lights.indexOf(l); if (i >= 0) world.lights.splice(i, 1); }
      for (const p of platforms) world.removePlatform(p);
      for (const it of ctx.interactables) world.removeInteractable(it.id);
      world.noScatter = world.noScatter.filter((z) => !ctx.noScatter.includes(z));
    },
  };
}

// ------------------------------------------------------------------ shared pieces
function streetDressing(ctx, dz0, dz1, offset = 8.5) {
  const { b, rng } = ctx;
  for (let dz = dz0; dz >= dz1; dz -= 17) {
    for (const s of [-1, 1]) {
      const f = ctx.frame(dz + (s > 0 ? 6 : 0), s * offset, 'road');
      lampPost(b, f, 0, 0.5);
      if (rng() < 0.45) barrel(b, f, 1.6, 0.4);
      if (rng() < 0.3) crate(b, f, -1.8, 0.3, 0.8, 0, rng());
      if (rng() < 0.25) hitchRail(b, f, 3.5, -0.6);
      if (rng() < 0.18) trough(b, f, -4, -0.4);
    }
  }
}

function graveyard(ctx, dz, side, rows = 4, cols = 6) {
  const f = ctx.frame(dz, side, 'road');
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) tombstone(ctx.b, f, (c - cols / 2) * 1.8, -r * 2.2 - 2, 0, ctx.rng);
  fenceRun(ctx.b, f, 0, 0.5, cols * 1.8 + 3, 0, 0.3, ctx.rng);
}

function trackAlong(ctx, dzA, dzB, side) {
  const a = ctx.at(dzA, side); const c = ctx.at(dzB, side);
  const seg = 24;
  const n = Math.max(1, Math.round(Math.abs(dzB - dzA) / seg));
  for (let i = 0; i < n; i += 1) {
    const p0 = ctx.at(dzA + (dzB - dzA) * (i / n), side);
    const p1 = ctx.at(dzA + (dzB - dzA) * ((i + 1) / n), side);
    railTrack(ctx.b, null, p0.x, p0.z, p1.x, p1.z, p0.y, p1.y);
  }
  void a; void c;
}

function forestGrove(ctx, dz, side, radius, count, kind = 'pine') {
  // dedicated instanced grove (independent of chunk scatter)
  const kit = ctx.world.kit;
  const geoms = kind === 'pine' ? kit.pine : kind === 'dead' ? kit.dead : kit.broad;
  const mat = kit.mats[kind];
  const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const v = new THREE.Vector3(); const s = new THREE.Vector3();
  const c = ctx.at(dz, side);
  geoms.forEach((g, gi) => {
    const im = new THREE.InstancedMesh(g, mat, Math.ceil(count / geoms.length));
    let n = 0;
    for (let i = 0; i < count / geoms.length; i += 1) {
      const a = ctx.rng() * Math.PI * 2; const r = Math.sqrt(ctx.rng()) * radius;
      const x = c.x + Math.cos(a) * r; const z = c.z + Math.sin(a) * r;
      if (Math.abs(x - roadX(z)) < 7) continue;
      const y = heightAt(x, z);
      const sc = 0.9 + ctx.rng() * 0.6;
      q.setFromAxisAngle(v.set(0, 1, 0), ctx.rng() * 6.28);
      m4.compose(v.set(x, y - 0.2, z), q, s.set(sc, sc * (0.9 + ctx.rng() * 0.3), sc));
      im.setMatrixAt(n, m4);
      n += 1;
      ctx.b.colliders.push({ x, z, r: 0.35 * sc, top: y + 10, bottom: y - 2, noCam: true });
    }
    im.count = n;
    im.castShadow = true; im.receiveShadow = true;
    im.name = `grove${gi}`;
    ctx.b.extra.push(im);
  });
}

// ------------------------------------------------------------------ regions
function ebon(ctx) {
  const { b, rng } = ctx;
  ctx.clear(0, 0, 150);
  const W = 11.5; // building setback from road centre
  const west = [
    [72, { w: 10, d: 14, h: 5 }, 'barn'],
    [46, { w: 7, d: 10, sign: 'BLACKSMITH', wall: 'woodDark' }],
    [22, { w: 8, d: 11, sign: 'GENERAL STORE', wall: 'woodLight', lit: true }],
    [-6, { w: 10, d: 13, sign: 'BLACK STALLION SALOON', wall: 'woodRed', twoStory: true, balcony: true, lit: true }],
    [-33, { w: 7.5, d: 10, sign: 'FRONTIER BANK', wall: 'woodGrey' }],
    [-58, { w: 10, d: 12, sign: 'GRAND HOTEL', wall: 'woodLight', twoStory: true, balcony: true, lit: true }],
    [-84, { w: 6.5, d: 9, sign: 'UNDERTAKER', wall: 'woodDark' }],
  ];
  const east = [
    [60, { w: 7, d: 10, sign: 'SHERIFF', wall: 'woodGrey', lit: true }],
    [36, { w: 6.5, d: 9, sign: 'BARBER', wall: 'woodLight' }],
    [12, { w: 7, d: 10, sign: 'GUNSMITH', wall: 'woodDark', lit: true }],
    [-12, { w: 8, d: 11, sign: 'TELEGRAPH & POST', wall: 'woodRed' }],
    [-64, { w: 7.5, d: 10, sign: 'DRY GOODS', wall: 'woodGrey', lit: true }],
    [-88, { w: 7, d: 9, sign: 'ASSAYER', wall: 'woodLight' }],
  ];
  for (const [dz, o, kind] of west) {
    const f = ctx.frame(dz, -(W + (o.d || 10) / 2), 'road');
    if (kind === 'barn') barn(b, f, o); else storefront(b, f, { ...o, rng });
  }
  for (const [dz, o] of east) {
    const f = ctx.frame(dz, W + (o.d || 10) / 2, 'road');
    storefront(b, f, { ...o, rng });
  }
  landOffice(ctx, -40, W + 5.5);
  // north end
  church(b, ctx.frame(-132, -24, 'road'), { lit: true });
  graveyard(ctx, -128, -46, 4, 7);
  waterTower(b, ctx.frame(-112, 26, 'road'));
  windmill(b, ctx.frame(30, -36, 'road'));
  // back row houses
  for (const [dz, side] of [[58, -36], [8, -38], [-30, -40], [70, 34], [40, 36], [-36, 38], [-100, 40], [-10, 42]]) {
    house(b, ctx.frame(dz, side, 'road'), { w: 7 + rng() * 2, d: 5.5 + rng(), lit: rng() < 0.5, rng });
  }
  streetDressing(ctx, 80, -110);
  for (const [dz, side, ry, br] of [[18, 4.2, 0.2, false], [-22, -5, 2.8, true], [-74, 4.8, 1.2, false], [96, -6, 0.5, true]]) wagon(b, ctx.frame(dz, side, 'north'), 0, 0, ry, br);
  signPost(b, ctx.frame(118, 6, 'south'), 0, 0, 'EBON CROSSING');
  signPost(b, ctx.frame(-150, 6, 'north'), 0, 0, "HEAVEN'S REACH 7 MI");
  // fences out of town
  for (const s of [-1, 1]) fenceRun(b, ctx.frame(105, s * 9, 'north'), 0, 0, 30, Math.PI / 2, 0.15, rng);
}

function landOffice(ctx, dz, side) {
  // The enterable building from the opening: real interior, door gap, collision walls.
  const { b } = ctx;
  const f = ctx.frame(dz, side, 'road');
  const w = 9; const d = 11; const h = 4.4;
  b.box('stoneDark', f, 0, -0.9, 0, w + 0.2, 2.1, d + 0.2);
  b.box('floor', f, 0, 0.16, 0, w - 0.3, 0.12, d - 0.3);
  const t = 0.25;
  // walls with a doorway on the road side (+z)
  b.box('woodRed', f, 0, h / 2, -d / 2, w, h, t);
  b.box('woodRed', f, w / 2, h / 2, 0, t, h, d);
  b.box('woodRed', f, -w / 2, h / 2, 0, t, h, d);
  b.box('woodRed', f, -w / 4 - 0.4, h / 2, d / 2, w / 2 - 0.8, h, t);
  b.box('woodRed', f, w / 4 + 0.4, h / 2, d / 2, w / 2 - 0.8, h, t);
  b.box('woodRed', f, 0, h - 0.6, d / 2, 1.6, 1.2, t);
  b.box('woodDark', f, 0, h + 0.05, 0, w + 0.3, 0.12, d + 0.3); // ceiling
  // roof + false front
  b.box('shingle', f, -w / 4 - 0.1, h + 1.2, 0, w / 2 + 0.6, 0.14, d + 0.6, 0, 0, 0.45);
  b.box('shingle', f, w / 4 + 0.1, h + 1.2, 0, w / 2 + 0.6, 0.14, d + 0.6, 0, 0, -0.45);
  b.prism('woodGrey', f, 0, h, d / 2 - 0.01, w, 2.3, 0.02);
  b.prism('woodGrey', f, 0, h, -d / 2 + 0.01, w, 2.3, 0.02);
  b.box('woodRed', f, 0, (h + 3.2) / 2, d / 2 + 0.2, w + 0.5, h + 3.2, 0.2);
  b.box('black', f, 0, 1.15, d / 2 + 0.2, 1.6, 2.3, 0.24); // the dark doorway (non-colliding)
  b.box('sign:LAND OFFICE', f, 0, h + 1.5, d / 2 + 0.32, 5, 1.2, 0.05, 0, 0, 0, 100);
  b.box('floor', f, 0, 0.18, d / 2 + 1.5, w + 0.6, 0.2, 2.6);
  // interior: counter, shelves, desk, map table, hanging lantern
  b.box('woodDark', f, 0, 0.6, -1.2, w - 2.5, 1.0, 0.6);
  b.box('woodDark', f, -w / 2 + 0.5, 1.4, -2, 0.5, 2.6, 4);
  for (let y = 0.6; y < 2.6; y += 0.6) b.box('woodLight', f, -w / 2 + 0.6, y, -2, 0.55, 0.06, 4);
  b.box('woodDark', f, 2.4, 0.45, -3.8, 2, 0.1, 1.1);
  for (const [x, z] of [[1.5, -4.2], [3.3, -4.2], [1.5, -3.4], [3.3, -3.4]]) b.box('woodDark', f, x, 0.2, z, 0.08, 0.5, 0.08);
  b.box('cloth', f, 2.3, 0.52, -3.8, 0.4, 0.05, 0.3); // the journal
  b.box('lantern', f, 0, h - 0.6, -1, 0.22, 0.3, 0.22);
  b.light(f, 0, h - 0.8, -1, 0xffa050, 0.9, 1);
  windowAt2(b, f, w / 2 + 0.03, -2.5);
  windowAt2(b, f, -w / 2 - 0.03, 2.5);
  // colliders: four walls with a doorway gap
  const T = 0.3;
  b.collider(f, 0, -d / 2, w / 2, T, h);
  b.collider(f, w / 2, 0, T, d / 2, h);
  b.collider(f, -w / 2, 0, T, d / 2, h);
  b.collider(f, -w / 4 - 0.4, d / 2, w / 4 - 0.4, T, h);
  b.collider(f, w / 4 + 0.4, d / 2, w / 4 - 0.4, T, h);
  b.collider(f, 0, -1.2, (w - 2.5) / 2, 0.35, 1.1);
  b.collider(f, 2.4, -3.8, 1.0, 0.6, 1);
  ctx.platform({ x: f.x, z: f.z, hw: w / 2, hd: d / 2 + 2.8, rot: f.rotY, y: f.y + 0.22 });
  const jp = f.pt(2.3, 0.6, -3.8);
  ctx.interact({ id: 'journal', x: jp.x, y: jp.y, z: jp.z, radius: 0.8, label: 'Read the journal', enabled: false });
  const ip = f.pt(0, 1, -2);
  ctx.world.landOffice = { frame: f, inside: ip, door: f.pt(0, 0, d / 2 + 1.5), desk: jp };
}

function windowAt2(b, f, x, z) {
  b.box('windowDark', f, x, 1.7, z, 0.06, 1.2, 0.9, 0, 0, 0, 10);
}

function ember(ctx) {
  const { b, rng } = ctx;
  const tel = resolvePOI('telegraph');
  ctx.clear(tel.z - ctx.region.z, 40, 40);
  storefront(b, ctx.frame(300, 46, 'road'), { w: 7, d: 9, sign: 'TELEGRAPH', wall: 'woodGrey', lit: true, rng });
  windmill(b, ctx.frame(318, 62, 'road'));
  waterTower(b, ctx.frame(284, 64, 'road'));
  trough(b, ctx.frame(300, 30, 'road'), 0, 0);
  for (const id of ['camp1', 'camp2', 'camp3']) {
    const p = resolvePOI(id);
    const dz = p.z - ctx.region.z; const side = p.side;
    ctx.clear(dz, side, 16);
    const f = ctx.frame(dz, side, 'road');
    campfire(b, f, 0, 0, false);
    tent(b, f, -3.5, -2, rng() * 6, true);
    tent(b, f, 3, -3, rng() * 6, true);
    wagon(b, f, 4.5, 3, rng() * 3, true);
    crate(b, f, -2.5, 2.4, 0.8, 0, 0.4);
    barrel(b, f, -3.4, 3.1);
  }
  // railway station (Kakyoin)
  const st = ctx.frame(-480, 44, 'road');
  station(b, st, { name: 'EMBER FLATS', lit: true });
  ctx.clear(-480, 40, 60);
  trackAlong(ctx, -280, -700, 34);
  forestGrove(ctx, -500, 95, 45, 70, 'pine');
  // ranch fences along the flats
  for (let dz = 450; dz > -400; dz -= 90) {
    for (const s of [-1, 1]) if (rng() < 0.6) fenceRun(b, ctx.frame(dz, s * (16 + rng() * 10), 'north'), 0, 0, 40 + rng() * 30, Math.PI / 2, 0.25, rng);
  }
  barn(b, ctx.frame(120, -58, 'road'), { w: 9, d: 12 });
  house(b, ctx.frame(100, -50, 'road'), { lit: false, rng });
  signPost(b, ctx.frame(560, 6, 'south'), 0, 0, 'EMBER FLATS');
}

function redstone(ctx) {
  const { b, rng } = ctx;
  // rail yard (Mariah): several sidings and a barricade across the road
  ctx.clear(520, 0, 50);
  for (const s of [-14, -8, 8, 14]) trackAlong(ctx, 580, 460, s);
  for (const [dz, s] of [[560, -20], [500, 20], [540, 22]]) warehouse(b, ctx.frame(dz, s + Math.sign(s) * 6, 'road'), { w: 8, d: 14, h: 4.5 });
  signPost(b, ctx.frame(600, 6, 'south'), 0, 0, 'REDSTONE YARD');
  // trestle over Hol Horse's gulch
  const g = GULCHES.find((q) => q.id === 'holGulch');
  const f = new Frame(g.x, g.deckY - 0.3, g.z, Math.atan2(tangent(g.z).x, tangent(g.z).z));
  trestle(b, f, 40, 0, 7, 0, 30);
  ctx.platform({ x: g.x, z: g.z, hw: 3.5, hd: 20, rot: f.rotY, y: g.deckY - 0.05 });
  for (const sx of [-3.6, 3.6]) {
    const p = f.pt(sx, 0, 0);
    b.colliders.push({ x: p.x, z: p.z, hw: 0.15, hd: 20, rot: f.rotY, top: g.deckY + 1.2, bottom: g.deckY - 0.5, noCam: true });
  }
  // Ashgrove estate courtyard (Polnareff)
  const cf = ctx.frame(-260, 26, 'road');
  ctx.clear(-260, 26, 48);
  b.box('stone', cf, 0, -0.3, 0, 36, 0.8, 36, 0, 0, 0, 2.5);
  ctx.platform({ x: cf.x, z: cf.z, hw: 18, hd: 18, rot: cf.rotY, y: cf.y + 0.1 });
  for (const [x, z, w, rot] of [[0, -18, 36, 0], [-18, 0, 36, Math.PI / 2], [18, -6, 24, Math.PI / 2]]) {
    const wf = new Frame(0, 0, 0, 0);
    wf.m.copy(cf.m).multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)), new THREE.Vector3(1, 1, 1)));
    wf.rotY = cf.rotY + rot; wf.y = cf.y;
    ruinWall(b, wf, { w, h: 3.6, mat: 'stone', rng });
  }
  // fountain
  b.cyl('stone', cf, 0, 0.5, 0, 3, 3.2, 0.8, 16);
  b.cyl('black', cf, 0, 0.92, 0, 2.6, 2.6, 0.05, 16);
  b.cyl('stone', cf, 0, 1.6, 0, 0.4, 0.5, 2, 8);
  b.collider(cf, 0, 0, 2.3, 2.3, 1.2);
  for (const [x, z] of [[-12, -12], [12, -12], [-12, 10], [12, 10]]) column(b, cf, x, z, 4.5, 'stone', rng() < 0.4);
  storefront(b, new Frame(...cf.pt(0, 0, -26).toArray(), cf.rotY), { w: 14, d: 10, h: 5, wall: 'woodGrey', twoStory: true, lit: true, porch: true, rng });
  for (const [x, z] of [[-8, 8], [8, 8], [-8, -8], [8, -8]]) lampPost(b, cf, x, z);
  // scattered mesas dressing
  for (let i = 0; i < 6; i += 1) wagon(b, ctx.frame(300 - i * 160, (rng() < 0.5 ? -1 : 1) * (8 + rng() * 6), 'north'), 0, 0, rng() * 6, true);
}

function hollow(ctx) {
  const { b, rng } = ctx;
  // Enya's cabin with a lantern path
  ctx.clear(-420, -30, 22);
  cabin(b, ctx.frame(-420, -34, 'road'), { w: 7, d: 6, lit: true });
  for (let i = 0; i < 5; i += 1) lampPost(b, ctx.frame(-420, -8 - i * 4.5, 'north'), 0.6, 0);
  // more cabins along the trail
  for (const [dz, s] of [[520, 24], [380, -28], [-60, -26], [-260, 30], [-560, 28]]) cabin(b, ctx.frame(dz, s, 'road'), { lit: rng() < 0.4 });
  // The splintered hamlet (Josuke): half-ruined houses ring the clearing
  ctx.clear(160, 0, 44);
  const ring = [[-16, 20], [17, 18], [-21, -6], [23, -10], [-14, -24], [15, -24]];
  ring.forEach(([s, dzo], i) => {
    const f = ctx.frame(160 + dzo, s, 'road');
    if (i % 2 === 0) house(b, f, { w: 7, d: 6, lit: false, rng });
    else { ruinWall(b, f, { w: 7, h: 3.2, mat: 'woodGrey', rng }); }
  });
  forestGrove(ctx, 160, 0, 90, 60, 'pine');
  forestGrove(ctx, -420, -40, 60, 50, 'pine');
  signPost(b, ctx.frame(600, 6, 'south'), 0, 0, 'HOLLOW PINES');
}

function iron(ctx) {
  const { b, rng } = ctx;
  ctx.clear(250, 0, 200);
  ctx.clear(-300, 34, 40);
  warehouse(b, ctx.frame(-300, 42, 'road'), { w: 12, d: 18, sign: 'ASSAY HALL', lit: true });
  warehouse(b, ctx.frame(300, -40, 'road'), { w: 12, d: 24, sign: 'IRON VALE MINING CO.' });
  warehouse(b, ctx.frame(80, 44, 'road'), { w: 10, d: 20 });
  warehouse(b, ctx.frame(220, 44, 'road'), { w: 11, d: 22 });
  for (const [dz, s, o] of [[400, -18, { sign: 'SALOON', twoStory: true, balcony: true, lit: true }], [372, 18, { sign: 'COMPANY STORE', lit: true }], [344, -18, { sign: 'BUNKHOUSE' }], [316, 18, { sign: 'DOCTOR', lit: true }]]) {
    storefront(b, ctx.frame(dz, s + Math.sign(s) * 5, 'road'), { w: 8, d: 10, wall: 'woodGrey', rng, ...o });
  }
  waterTower(b, ctx.frame(260, -30, 'road'));
  // mine entrance cut into the west wall
  const mf = ctx.frame(40, -70, 'road');
  b.box('woodDark', mf, -2.4, 2.5, 0, 0.5, 5, 0.5);
  b.box('woodDark', mf, 2.4, 2.5, 0, 0.5, 5, 0.5);
  b.box('woodDark', mf, 0, 5, 0, 5.6, 0.6, 0.6);
  b.box('black', mf, 0, 2.4, -0.4, 4.4, 4.8, 0.1);
  b.box('rock', mf, 0, 4, -3, 14, 10, 6);
  b.collider(mf, 0, -2, 7, 3, 10);
  trackAlong(ctx, 40, -200, -18);
  trackAlong(ctx, 300, -120, 22);
  // Kira's yard: crates and barrels ring the open lot (the arena interior stays clear)
  for (let i = 0; i < 14; i += 1) {
    const f = ctx.frame(150 + (rng() - 0.5) * 70, (rng() < 0.5 ? -1 : 1) * (26 + rng() * 12), 'road');
    if (rng() < 0.5) crate(b, f, 0, 0, 1 + rng() * 0.4, 0, rng()); else barrel(b, f, 0, 0);
  }
  streetDressing(ctx, 420, 300, 9);
  // Diavolo's canyon rail bridge
  const g = GULCHES.find((q) => q.id === 'diavoloCanyon');
  const t = tangent(g.z);
  const bf = new Frame(g.x, g.deckY - 0.3, g.z, Math.atan2(t.x, t.z));
  trestle(b, bf, 96, 0, 12, 0, 54);
  ctx.platform({ x: g.x, z: g.z, hw: 6, hd: 48, rot: bf.rotY, y: g.deckY - 0.05 });
  railTrack(b, bf, 3, -48, 3, 48, 0.1, 0.1, false);
  for (const sx of [-6.1, 6.1]) {
    const p = bf.pt(sx, 0, 0);
    b.colliders.push({ x: p.x, z: p.z, hw: 0.15, hd: 48, rot: bf.rotY, top: g.deckY + 1.2, bottom: g.deckY - 0.5, noCam: true });
  }
  for (const z of [-40, -20, 0, 20, 40]) { lampPost(b, bf, -5.6, z); }
  signPost(b, ctx.frame(600, 6, 'south'), 0, 0, 'IRON VALE');
}

function gravewater(ctx) {
  const { b, rng } = ctx;
  const wl = REGIONS.find((r) => r.id === 'gravewater').water;
  // boardwalk road surface across the marsh
  for (let dz = 650; dz > -650; dz -= 10) {
    const p = ctx.at(dz, 0);
    const y = Math.max(wl + 0.45, heightAt(p.x, p.z));
    if (heightAt(p.x, p.z) < wl + 0.3) {
      const f = new Frame(p.x, y, p.z, Math.atan2(p.t.x, p.t.z));
      b.box('floor', f, 0, 0, 0, 8.4, 0.22, 10.2);
      for (const sx of [-4, 4]) { b.box('woodDark', f, sx, -1, -4.8, 0.2, 2.5, 0.2); b.box('woodDark', f, sx, -1, 4.8, 0.2, 2.5, 0.2); }
      ctx.platform({ x: p.x, z: p.z, hw: 4.2, hd: 5.2, rot: f.rotY, y: y + 0.11 });
    }
  }
  // Geb's drowned boardwalk: a branching maze of planks over open water
  ctx.clear(300, 60, 70);
  const base = ctx.at(300, 0);
  const t = base.t; const e = base.e;
  const walk = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const rot = Math.atan2(x1 - x0, z1 - z0);
    const f = new Frame((x0 + x1) / 2, wl + 0.45, (z0 + z1) / 2, rot);
    b.box('floor', f, 0, 0, 0, 2.2, 0.18, len);
    for (let s = -len / 2; s <= len / 2; s += 3) for (const sx of [-1, 1]) b.box('woodDark', f, sx, -0.9, s, 0.15, 2, 0.15);
    ctx.platform({ x: f.x, z: f.z, hw: 1.1, hd: len / 2, rot, y: wl + 0.54 });
  };
  const P = (side, dz) => ({ x: base.x + e.x * side + t.x * -dz, z: base.z + e.z * side + t.z * -dz });
  const nodes = [P(5, 0), P(25, 0), P(25, 20), P(45, 20), P(45, -10), P(70, -10), P(70, 18), P(95, 18), P(25, -25), P(55, -35)];
  const links = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [1, 8], [8, 9], [9, 5]];
  for (const [i, j] of links) walk(nodes[i].x, nodes[i].z, nodes[j].x, nodes[j].z);
  ctx.world.gebNodes = nodes.map((n) => ({ ...n, y: wl + 0.54 }));
  for (const n of [nodes[3], nodes[5], nodes[7]]) lampPost(b, new Frame(n.x, wl + 0.5, n.z, 0), 0.6, 0.6);
  // Verdant estate (Giorno): greenhouse + overgrown terrace
  const vf = ctx.frame(-320, 70, 'road');
  ctx.clear(-320, 70, 52);
  b.box('stone', vf, 0, -0.4, 0, 40, 1.4, 40, 0, 0, 0, 2.4);
  ctx.platform({ x: vf.x, z: vf.z, hw: 20, hd: 20, rot: vf.rotY, y: vf.y + 0.3 });
  greenhouse(b, ctx, vf);
  for (const [x, z] of [[-14, 12], [14, 12], [-14, -2], [14, -2]]) { b.box('stone', vf, x, 1.2, z, 1, 2.4, 1); b.collider(vf, x, z, 0.5, 0.5, 2.4); }
  for (const [x, z] of [[-6, 16], [6, 16]]) lampPost(b, vf, x, z);
  forestGrove(ctx, -320, 70, 60, 40, 'broad');
  for (let dz = 500; dz > -600; dz -= 70) if (rng() < 0.5) forestGrove(ctx, dz, (rng() < 0.5 ? -1 : 1) * (40 + rng() * 100), 18, 8, 'dead');
  signPost(b, ctx.frame(640, 6, 'south'), 0, 0, 'GRAVEWATER');
}

function greenhouse(b, ctx, vf) {
  const f = new Frame(...vf.pt(0, 0.3, -12).toArray(), vf.rotY);
  const w = 16; const d = 10; const h = 5;
  const glass = 'windowDark';
  for (let x = -w / 2; x <= w / 2 + 0.01; x += 2) {
    b.box('metal', f, x, h / 2, d / 2, 0.12, h, 0.12);
    b.box('metal', f, x, h / 2, -d / 2, 0.12, h, 0.12);
  }
  b.box(glass, f, 0, h / 2, -d / 2, w, h, 0.05, 0, 0, 0, 2);
  b.box(glass, f, w / 2, h / 2, 0, 0.05, h, d, 0, 0, 0, 2);
  b.box(glass, f, -w / 2, h / 2, 0, 0.05, h, d, 0, 0, 0, 2);
  b.box(glass, f, -w / 4 - 1, h / 2, d / 2, w / 2 - 2, h, 0.05, 0, 0, 0, 2);
  b.box(glass, f, w / 4 + 1, h / 2, d / 2, w / 2 - 2, h, 0.05, 0, 0, 0, 2);
  b.box(glass, f, 0, h + 1.2, -d / 4, w, 0.05, d / 2 + 0.6, -0.45, 0, 0, 2);
  b.box(glass, f, 0, h + 1.2, d / 4, w, 0.05, d / 2 + 0.6, 0.45, 0, 0, 2);
  b.box('metal', f, 0, h + 2.3, 0, w + 0.2, 0.15, 0.15);
  b.box('woodDark', f, 0, 0.5, -2, w - 3, 1, 1.4);
  b.light(f, 0, 3, 0, 0x9fffb0, 0.6, 0.2);
  b.collider(f, 0, 0, w / 2, d / 2, h + 2);
}

function bleak(ctx) {
  const { b, rng } = ctx;
  // lantern overlook (Telence): ruined waystation on the cliff edge, ringed by lanterns
  const of = ctx.frame(380, 28, 'road');
  ctx.clear(380, 28, 34);
  b.box('stone', of, 0, -0.3, 0, 22, 0.8, 18, 0, 0, 0, 2.5);
  ctx.platform({ x: of.x, z: of.z, hw: 11, hd: 9, rot: of.rotY, y: of.y + 0.1 });
  house(b, new Frame(...of.pt(0, 0, -9).toArray(), of.rotY), { w: 9, d: 6, wall: 'stone', roof: 'shingleDark', lit: true, rng });
  b.box('woodDark', of, 0, 0.6, 1, 2.4, 0.1, 1.4);
  b.box('woodDark', of, 0, 0.3, 1, 0.2, 0.6, 0.2);
  b.collider(of, 0, 1, 1.2, 0.7, 0.8);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    lampPost(b, of, Math.cos(a) * 9, Math.sin(a) * 7 + 1);
  }
  for (let x = -10; x <= 10; x += 2.5) b.box('woodDark', of, x, 0.6, 9.3, 0.12, 1.2, 0.12);
  b.box('woodGrey', of, 0, 1.05, 9.3, 21, 0.1, 0.1);
  b.collider(of, 0, 9.3, 11, 0.2, 1.2);
  // waystation ruins along the switchbacks
  for (const dz of [520, 150, -120, -520]) ruinWall(b, ctx.frame(dz, -16, 'road'), { w: 8, h: 3.5, mat: 'stoneDark', rng });
  // Fracture basin (Valentine) with a flagpole
  const ff = ctx.frame(-330, -70, 'road');
  ctx.clear(-330, -70, 50);
  b.cyl('metal', ff, 0, 7, -10, 0.12, 0.15, 14, 6);
  b.collider(ff, 0, -10, 0.3, 0.3, 14);
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2;
    b.addGeom('rock', new THREE.DodecahedronGeometry(1.4 + rng() * 2.2, 0), ff, Math.cos(a) * 30, 0.5, Math.sin(a) * 30, rng(), rng(), rng());
    b.collider(ff, Math.cos(a) * 30, Math.sin(a) * 30, 1.8, 1.8, 3);
  }
  ctx.world.flagPole = ff.pt(0, 13, -10);
  signPost(b, ctx.frame(640, 6, 'south'), 0, 0, 'BLEAKWATER RIDGE');
}

function rift(ctx) {
  const { b, rng } = ctx;
  // Ruins of Many Hours (Vanilla Ice)
  ctx.clear(360, 0, 70);
  const rf = ctx.frame(360, 0, 'north');
  for (let i = -3; i <= 3; i += 1) {
    column(b, rf, -14, i * 9, 7, 'gothic', rng() < 0.35);
    column(b, rf, 14, i * 9, 7, 'gothic', rng() < 0.35);
  }
  arch(b, rf, 0, 30, 10, 6, 'gothic');
  arch(b, rf, 0, -30, 10, 6, 'gothic');
  for (const [x, z, rot] of [[-26, 10, 0.3], [24, -14, -0.4], [-22, -24, 1.2], [28, 20, 0.8]]) {
    ruinWall(b, new Frame(...rf.pt(x, 0, z).toArray(), rf.rotY + rot), { w: 10, h: 5, mat: 'gothic', rng });
  }
  // floating fragments of other times
  for (let i = 0; i < 18; i += 1) {
    const geo = new THREE.DodecahedronGeometry(1 + rng() * 3, 0);
    const mesh = new THREE.Mesh(geo, ctx.world.bank.get('gothic'));
    const p = rf.pt((rng() - 0.5) * 120, 10 + rng() * 30, (rng() - 0.5) * 160);
    mesh.position.copy(p);
    mesh.castShadow = true;
    const ph = rng() * 6;
    ctx.b.extra.push(mesh);
    ctx.animated.push({ update: (tm, dt) => { mesh.position.y = p.y + Math.sin(tm * 0.4 + ph) * 1.5; mesh.rotation.y += dt * 0.1; mesh.rotation.x += dt * 0.05; } });
  }
  // Inverted cloister (Pucci)
  const cf = ctx.frame(-340, 0, 'north');
  ctx.clear(-340, 0, 50);
  b.box('gothic', cf, 0, -0.3, 0, 44, 0.8, 44, 0, 0, 0, 3);
  ctx.platform({ x: cf.x, z: cf.z, hw: 22, hd: 22, rot: cf.rotY, y: cf.y + 0.1 });
  for (let i = -2; i <= 2; i += 1) {
    if (i !== 0) { arch(b, cf, i * 8, -20, 6, 6); arch(b, cf, i * 8, 20, 6, 6); }
  }
  for (const s of [-1, 1]) for (let i = -2; i <= 2; i += 1) column(b, cf, s * 20, i * 8, 7);
  b.cyl('gothic', cf, 0, 0.6, 0, 4, 4.5, 1, 20);
  b.collider(cf, 0, 0, 3.4, 3.4, 1);
  signPost(b, ctx.frame(640, 6, 'south'), 0, 0, 'THE RIFT');
}

function heavenRegion(ctx) {
  const { b, rng } = ctx;
  // The Thousand Steps: stone stairs lining the climb, with lanterns
  for (let dz = 560; dz > 160; dz -= 3) {
    const p = ctx.at(dz, 0);
    const f = new Frame(p.x, heightAt(p.x, p.z) - 0.15, p.z, Math.atan2(p.t.x, p.t.z));
    b.box('gothic', f, 0, 0, 0, 9, 0.35, 3.1, 0, 0, 0, 2);
    if (dz % 30 === 0) for (const s of [-5.2, 5.2]) lampPost(b, f, s, 0);
  }
  // the chasm and its bridge supports (bridge planks are dynamic, see the quest)
  const g = GULCHES.find((q) => q.id === 'heavenChasm');
  const t = tangent(g.z);
  const cf = new Frame(g.x, g.deckY, g.z, Math.atan2(t.x, t.z));
  for (const z of [-34, 34]) { b.box('gothic', cf, 0, -1, z, 10, 3, 4); }
  ctx.world.chasm = { x: g.x, z: g.z, y: g.deckY, rot: cf.rotY, frame: cf };
  for (let i = 0; i < 6; i += 1) ruinWall(b, ctx.frame(500 - i * 70, (i % 2 ? -1 : 1) * 14, 'road'), { w: 6, h: 4, mat: 'gothic', rng });
  signPost(b, ctx.frame(640, 6, 'south'), 0, 0, "HEAVEN'S REACH");
}

const BUILDERS = { ebon, ember, redstone, hollow, iron, gravewater, bleak, rift, heaven: heavenRegion };

export function buildRegion(world, region) {
  const ctx = makeCtx(world, region);
  BUILDERS[region.id]?.(ctx);
  return finalize(ctx);
}

// ------------------------------------------------------------------ roadside (per terrain chunk)
const wireMat = new THREE.LineBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.85 });

function inSettlement(world, x, z) {
  for (const zn of world.noScatter || []) if (Math.hypot(x - zn.x, z - zn.z) < zn.r) return true;
  return false;
}

function onBridge(z) {
  for (const g of GULCHES) if (Math.abs(z - g.z) < 60) return true;
  return false;
}

export function buildRoadside(world, cx, cz, x0, z0, size) {
  const b = new Batch();
  const POLE = 48;
  const wire = [];
  const zA = Math.ceil(z0 / POLE) * POLE;
  for (let z = zA; z < z0 + size; z += POLE) {
    const side = 7.5;
    const x = roadX(z) + side;
    if (x < x0 || x >= x0 + size) continue;
    if (inSettlement(world, x, z) || onBridge(z) || z > 230 || z < -SPACING * 8 + 120) continue;
    const y = heightAt(x, z);
    const f = new Frame(x, y, z, 0);
    const t = tangent(z);
    telegraphPole(b, f, 0, 0, Math.atan2(-t.z, t.x) + Math.PI / 2);
    // wires to the next pole north
    const zn = z - POLE;
    const xn = roadX(zn) + side;
    if (!inSettlement(world, xn, zn) && !onBridge(zn)) {
      const yn = heightAt(xn, zn);
      for (const o of [-0.65, -0.25, 0.25, 0.65]) {
        const ox = t.z * -o; const oz = t.x * o;
        const segs = 8;
        for (let i = 0; i < segs; i += 1) {
          const s0 = i / segs; const s1 = (i + 1) / segs;
          const sag = (s) => -Math.sin(s * Math.PI) * 0.9;
          wire.push(
            x + (xn - x) * s0 + ox, y + 7.05 + (yn - y) * s0 + sag(s0), z + (zn - z) * s0 + oz,
            x + (xn - x) * s1 + ox, y + 7.05 + (yn - y) * s1 + sag(s1), z + (zn - z) * s1 + oz,
          );
        }
      }
    }
    // occasional roadside clutter
    const r = hash2(cx * 31 + z, cz);
    if (r < 0.08) wagon(b, new Frame(roadX(z) - 9, heightAt(roadX(z) - 9, z + 6), z + 6, 0), 0, 0, r * 40, true);
    else if (r < 0.16) { const fx = roadX(z) - 8; barrel(b, new Frame(fx, heightAt(fx, z), z, 0), 0, 0); }
  }
  const group = b.build(world.bank);
  if (wire.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    const lines = new THREE.LineSegments(g, wireMat);
    group.add(lines);
  }
  world.root.add(group);
  const colliders = b.colliders.map((c) => world.addCollider({ ...c, noCam: true }));
  const lights = b.lights.map((l) => world.registerLight(l));
  return { group, colliders, lights };
}

export { ROAD_HALF, roadY };
