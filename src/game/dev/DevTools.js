import * as THREE from 'three';
import { REGIONS, POIS } from '../world/Layout';
import { roadX, resolvePOI } from '../world/Terrain';
import { Save } from '../state/Save';
import { ROSTER, createFighter, BossBrain } from '../combat/Roster';
import { toast } from '../core/Store';

// Developer actions behind the dev panel (only reachable with the dev flag). Saves made here go
// to the sandboxed dev namespace (Save.setSandbox), never to a player's journey.

export const DEV_REGIONS = REGIONS.map((r) => ({ id: r.id, name: r.name }));
export const DEV_POIS = POIS.map((p) => ({ id: p.id, label: `${p.label} (${p.region})` }));

// Cutscenes are tied to campaign state, so each entry jumps to the step that plays it.
export const DEV_SCENES = [
  { label: 'Opening (prologue)', step: 'prologue' },
  { label: 'Journal (Ebon Crossing)', step: 'ebon' },
  { label: "Boss intro: Avdol", step: 'avdol', encounter: true },
  { label: 'Boss intro: Jotaro', step: 'jotaro', encounter: true },
  { label: 'Heaven ascension', step: 'heaven' },
  { label: 'Final clash', step: 'jotaroFinal', encounter: true },
  { label: 'Ending', step: 'ending' },
];

export function teleport(g, x, z, y = null) {
  const pl = g.player;
  if (!pl) return false;
  if (pl.mounted) pl.mounted.dismount(true);
  const gy = g.world.groundAt(x, z, (y ?? 400) + 2);
  pl.pos.set(x, gy + 0.05, z);
  pl.vel.set(0, 0, 0);
  if (pl.stand) pl.stand._placeAtAnchor?.(true);
  g.camera.setTarget(pl, true);
  return true;
}

export function toRegion(g, id) {
  const r = REGIONS.find((q) => q.id === id);
  if (!r) return false;
  return teleport(g, roadX(r.z), r.z);
}

export function toPOI(g, id) {
  const p = resolvePOI(id);
  if (!p) return false;
  // stand on the road beside it, facing it
  const ok = teleport(g, p.x + (p.side ? -Math.sign(p.side) * 6 : 0), p.z + 12);
  if (ok) g.player.faceTowards(new THREE.Vector3(p.x, g.player.pos.y, p.z), true);
  return ok;
}

export async function jumpToStep(g, stepId, { encounter = false } = {}) {
  const { STEPS } = await import('../story/Campaign');
  const i = STEPS.findIndex((s) => s.id === stepId);
  if (i < 0) return false;
  g.progress.step = i;
  g.progress.pos = null;
  g.progress.sub = {};
  await g._startCampaign(false);
  if (encounter) {
    const { startEncounter } = await import('./QA');
    await startEncounter({ skipIntro: false });
  }
  return true;
}

export function grant(g, key, value) {
  const u = g.progress?.upgrades;
  if (!u) return;
  u[key] = value;
  g.mode?.applyUpgrades?.();
}

export function grantAll(g) {
  const u = g.progress?.upgrades;
  if (!u) return;
  Object.assign(u, { tsDuration: 4, tsCooldown: 4, energy: 3, vitality: 3, rush: 3, counter: 3, knives: true, tsAwareness: true });
  g.mode?.applyUpgrades?.();
  toast('Dev: all abilities granted.');
}

export function devSave(g) {
  if (!g.mode?.snapshot) { toast('Dev saves need the campaign.'); return false; }
  const ok = Save.save('devslot', g.mode.snapshot());
  toast(ok ? `Dev checkpoint saved${Save.sandboxed ? ' (sandbox)' : ''}.` : 'Dev save failed.');
  return ok;
}

export async function devLoad(g) {
  const d = Save.load('devslot');
  if (!d) { toast('No dev checkpoint yet.'); return false; }
  g.progress = d;
  await g._startCampaign(false);
  return true;
}

export function resetEncounter(g) {
  const m = g.mode;
  if (m?.encounter && m.retry) { m.retry(); return true; }
  if (m?.name === 'versus' && m.p2) { m.p2.revive?.(m.p2.hpMax); m.p2.hp = m.p2.hpMax; g.player?.revive?.(g.player.hpMax); return true; }
  return false;
}

// A sparring partner anywhere in the campaign world: any roster fighter with its boss AI, 6 m
// ahead of the player. Removed automatically when it falls or when the mode changes.
export async function spawnSparring(g, key) {
  const pl = g.player;
  if (!pl || !ROSTER[key]) return null;
  const f = await createFighter(g, key, { team: 1, versus: true });
  const p = pl.pos.clone().addScaledVector(pl.forward(), 6);
  f.pos.set(p.x, g.world.groundAt(p.x, p.z, p.y + 3), p.z);
  f.faceTowards(pl.pos, true);
  g.addActor(f);
  g.combat.add(f);
  const brain = new BossBrain(g, f, { difficulty: 1 });
  const sys = {
    update: (dt) => {
      if (!g.actors.includes(f)) { g.engine.remove(sys); return; }
      if (f.dead) { g.engine.remove(sys); setTimeout(() => g.removeActor(f), 2500); return; }
      if (!g.paused && !g.inCinematic) brain.update(dt);
    },
  };
  g.engine.add(sys);
  g.devSparring = { f, brain };
  return f;
}

export function openAnimLab(g) {
  const part = g.player?.partKey || 'dio';
  window.open(`/animlab?part=${encodeURIComponent(part)}`, '_blank', 'noopener');
}

export function memory(g) {
  const info = g.engine.renderer.info;
  const heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
  return { heapMB: heap, geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0 };
}
