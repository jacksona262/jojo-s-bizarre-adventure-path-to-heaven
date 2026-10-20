import * as THREE from 'three';
import { ui, toast } from '../core/Store';
import { audio } from '../core/Audio';
import { resolvePOI, roadX, heightAt, GULCHES, chasmBridge } from '../world/Terrain';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { REGIONS } from '../world/Layout';
import { QUESTS } from './Script';
import { conversation, sayLines } from './Scenes';
import { createFighter, BossBrain, addStoryBonus } from '../combat/Roster';
import { Restorable } from '../combat/kits/Diamond';
import { railTrack, Batch, Frame } from '../world/Architecture';
import { Timer } from '../combat/Hazards';
import * as Poses from '../anim/Poses';
import { READ_PACE } from './Sequencer';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function poiPos(id, dz = 0, side = 0) {
  const q = resolvePOI(id);
  const z = q.z + dz; const x = roadX(z) + (q.side || 0) + side;
  return V(x, heightAt(x, z), z);
}

async function talk(c, npc, lines) {
  const g = c.game;
  npc.faceTowards(c.player.pos, true);
  c.player.faceTowards(npc.pos, true);
  await g.seq.run((seq) => conversation(seq, c.player, npc, lines));
}

async function choose(c, npc, ch) {
  const g = c.game;
  let id = null;
  await g.seq.run(async (seq) => { id = await seq.choice(ch.prompt, ch.options); });
  return id;
}

export function runMinigame(c, type, data) {
  const g = c.game;
  return new Promise((res) => {
    g.overlayOpen = true;
    g.input.setPointerLock(false);
    ui.set({ minigame: { type, data } });
    c.resolveMinigame = (r) => {
      ui.set({ minigame: null });
      g.overlayOpen = false;
      g.input.setPointerLock(true);
      c.resolveMinigame = null;
      res(r);
    };
  });
}

// short duel against a supporting character, resolves when they fall
function duel(c, key, pos, { hp, onPhase, difficulty = 0.9 } = {}) {
  const g = c.game;
  return new Promise(async (resolve) => {
    const f = await createFighter(g, key, { team: 1, hp });
    f.pos.copy(pos); f.pos.y = g.world.groundAt(pos.x, pos.z, pos.y + 2);
    f.faceTowards(c.player.pos, true);
    g.addActor(f);
    g.combat.add(f);
    const brain = new BossBrain(g, f, { difficulty: g.difficulty * difficulty, onPhase });
    addStoryBonus(f, key);
    g.combatActive = true;
    ui.set({ boss: { name: f.roster.name, stand: f.roster.standName, hp: f.hp, hpMax: f.hpMax, phase: 1, phases: 2, color: f.roster.color } });
    audio.setMusic('boss', 0.3);
    f.onDeath = () => {
      g.combatActive = false;
      ui.set({ boss: null });
      g.slowMo(0.35, 0.8);
      setTimeout(() => { f.revive(1); f.dead = true; resolve(f); }, 900);
    };
    c.duel = { f, brain, update: (dt) => { brain.update(dt); const b = ui.get().boss; if (b && b.hp !== Math.round(f.hp)) ui.set({ boss: { ...b, hp: Math.round(f.hp) } }); } };
  });
}

// An interaction point. `when` says whether it is offered right now: once its task is done the
// prompt disappears and pressing interact does nothing. It also can't be re-entered while its
// own conversation / scene is still running.
function interact(c, id, pos, label, onInteract, radius = 0.8, when = null) {
  const it = { id, x: pos.x, y: pos.y, z: pos.z, radius, label, priority: true, busy: false, available: when };
  it.onInteract = async (f) => {
    if (it.busy || (when && !when())) return;
    it.busy = true;
    try { await onInteract(f); } finally { it.busy = false; }
  };
  c.game.world.addInteractable(it);
  return it;
}

function lanternMesh(lit = false) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 6), new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.9 }));
  post.position.y = 1.1;
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.4, 0.28), new THREE.MeshStandardMaterial({ color: lit ? 0xffb060 : 0x30302c, emissive: lit ? 0xff9a40 : 0x000000, emissiveIntensity: 3 }));
  lamp.position.y = 2.35;
  g.add(post, lamp);
  g.userData.lamp = lamp;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// =========================================================================== Q1 · Ashes on the Wire
async function q1(c) {
  const g = c.game;
  const Q = QUESTS.q1;
  const sub = c.p.sub.q1 || (c.p.sub.q1 = { stage: 'go', found: [false, false, false] });
  const sw = await g.spawnNPC('speedwagon', poiPos('telegraph', 4, -8), -Math.PI / 2, { name: 'Speedwagon' });
  sw.idlePose = (t) => Poses.talk(t, 0.3);
  const camps = ['camp1', 'camp2', 'camp3'].map((id) => resolvePOI(id));
  const its = [];
  const setObjective = () => {
    if (sub.stage === 'go') c.objective(Q.title, 'Ride east across Ember Flats to the telegraph station.', sw.pos);
    else if (sub.stage === 'camps') {
      const n = sub.found.filter(Boolean).length;
      const next = camps.find((_, i) => !sub.found[i]);
      c.objective(Q.title, `Search the burnt camps on the flats (${n}/3).`, next ? V(next.x, 0, next.z) : null);
    } else if (sub.stage === 'report') c.objective(Q.title, 'Return to Speedwagon with what the ashes said.', sw.pos);
  };
  its.push(interact(c, 'q1_sw', sw.pos, 'Talk to Speedwagon', async () => {
    if (sub.stage === 'go') {
      await talk(c, sw, Q.meet);
      const id = await choose(c, sw, Q.choice);
      c.p.flags.speedwagon = id;
      await talk(c, sw, Q.choiceReplies[id]);
      sub.stage = 'camps';
      c.autosave(true);
      setObjective();
    } else if (sub.stage === 'report') {
      await talk(c, sw, Q.report);
      c.addClue('The burnt wire: "He is already there. He is also on his way."');
      c.p.fragments += 1;
      toast('+1 Stand Fragment', 'reward');
      c.completeStep();
    }
  }, 1.4, () => sub.stage === 'go' || sub.stage === 'report'));
  camps.forEach((p, i) => {
    const pos = V(p.x, heightAt(p.x, p.z), p.z);
    its.push(interact(c, `q1_camp${i}`, pos, 'Search the ashes', async () => {
      if (sub.stage !== 'camps' || sub.found[i]) return;
      sub.found[i] = true;
      g.vfx.smokePuff(pos.clone().add(V(0, 0.3, 0)), 0x4a4038, 6, 1.2, 1.4);
      await g.seq.run(async (seq) => { seq.cut(pos.clone().add(V(2.2, 1.8, 2.2)), pos, 40); await sayLines(seq, [Q.fragments[i]]); }, { letterbox: false });
      if (sub.found.every(Boolean)) sub.stage = 'report';
      audio.play('quest');
      c.autosave(true);
      setObjective();
    }, 3, () => sub.stage === 'camps' && !sub.found[i]));
  });
  setObjective();
  return {
    update() {},
    dispose() { for (const it of its) g.world.removeInteractable(it.id); g.removeActor(sw); },
  };
}

// =========================================================================== Q2 · Bastet's Rails
async function q2(c) {
  const g = c.game;
  const Q = QUESTS.q2;
  const sub = c.p.sub.q2 || (c.p.sub.q2 = { stage: 'go', sw: [1, 0, 1] });
  const yard = resolvePOI('railyard');
  const yz = yard.z; const yx = roadX(yz);
  // yard-local frame: +z is south
  const P = (x, z) => { const wx = yx + x; const wz = yz + z; return V(wx, heightAt(wx, wz), wz); };
  const nodes = { S: P(0, 45), A: P(0, 32), B: P(-9, 16), bump: P(9, 16), dead: P(-18, 2), C: P(0, 2), barricade: P(0, -46), side: P(11, -12) };
  const routes = { A: ['B', 'bump'], B: ['dead', 'C'], C: ['barricade', 'side'] };
  const batch = new Batch();
  const seg = (a, b) => railTrack(batch, null, a.x, a.z, b.x, b.z, a.y, b.y, true);
  seg(nodes.S, nodes.A); seg(nodes.A, nodes.B); seg(nodes.A, nodes.bump); seg(nodes.B, nodes.dead); seg(nodes.B, nodes.C); seg(nodes.C, nodes.barricade); seg(nodes.C, nodes.side);
  const tracks = batch.build(g.world.bank);
  g.engine.scene.add(tracks);
  // barricade across the road at the north of the yard
  const crates = [];
  for (let i = -6; i <= 6; i += 1) for (let j = 0; j < 2; j += 1) crates.push(new Restorable(g, 'crate', P(i * 1.25, -48).add(V(0, j, 0)), 0));
  const wall = sub.stage !== 'done' ? g.world.addCollider({ x: yx, z: yz - 48, hw: 9, hd: 0.8, rot: 0, top: 50, bottom: -50 }) : null;
  const mariah = await g.spawnNPC('mariah', P(4, -54), 0, { name: 'Mariah' });
  mariah.faceTowards(nodes.S);
  // ore cart
  const cart = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x4a4440, metalness: 0.8, roughness: 0.45 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 2), iron); body.position.y = 0.85;
  cart.add(body);
  for (const [x, z] of [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 10).rotateZ(Math.PI / 2), iron); w.position.set(x, 0.3, z); cart.add(w); }
  cart.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  cart.position.copy(nodes.S);
  g.engine.scene.add(cart);
  // switch levers
  const levers = [];
  const swKeys = ['A', 'B', 'C'];
  const pathMat = new THREE.MeshBasicMaterial({ color: 0x6a8aff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  let pathMeshes = [];
  const route = () => { const path = [nodes.S, nodes.A]; let n = 'A'; for (let i = 0; i < 3 && routes[n]; i += 1) { const nx = routes[n][sub.sw[swKeys.indexOf(n)] ?? 0]; path.push(nodes[nx]); n = nx; } return path; };
  const drawPath = () => {
    for (const m of pathMeshes) { m.removeFromParent(); m.geometry.dispose(); }
    pathMeshes = [];
    const path = route();
    for (let i = 0; i < path.length - 1; i += 1) {
      const a = path[i]; const b = path[i + 1];
      const len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.05, len), pathMat);
      m.position.copy(a).add(b).multiplyScalar(0.5).add(V(0, 0.35, 0));
      m.lookAt(b.clone().add(V(0, 0.35, 0)));
      g.engine.scene.add(m);
      pathMeshes.push(m);
    }
  };
  const its = [];
  swKeys.forEach((k, i) => {
    const n = nodes[k];
    const lp = n.clone().add(V(2.2, 0, 0));
    const lever = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), iron); base.position.y = 0.15;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), new THREE.MeshStandardMaterial({ color: 0xaa2020 })); arm.position.y = 0.7;
    lever.add(base, arm);
    lever.position.copy(lp);
    g.engine.scene.add(lever);
    levers.push({ lever, arm });
    arm.rotation.z = sub.sw[i] ? -0.5 : 0.5;
    its.push(interact(c, `q2_sw${k}`, lp, `Throw switch ${k}`, () => {
      if (sub.stage !== 'puzzle') return;
      sub.sw[i] = 1 - sub.sw[i];
      arm.rotation.z = sub.sw[i] ? -0.5 : 0.5;
      audio.play('block');
      drawPath();
    }, 1.2, () => sub.stage === 'puzzle' && !rolling));
  });
  let rolling = null;
  const post = P(-3, -40);
  const postMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0x3a4a8a, emissive: 0x2030a0, emissiveIntensity: 1 }));
  postMesh.position.copy(post).add(V(0, 0.8, 0));
  g.engine.scene.add(postMesh);
  its.push(interact(c, 'q2_post', post, 'Stand at the magnet post', () => {
    if (sub.stage !== 'puzzle' || rolling) return;
    rolling = { path: route(), i: 0, t: 0, speed: 3 };
    audio.play('click');
    toast('The ore cart lurches toward you...');
  }, 1.2, () => sub.stage === 'puzzle' && !rolling));
  its.push(interact(c, 'q2_mariah', mariah.pos, 'Talk to Mariah', async () => {
    if (sub.stage !== 'go') return;
    await talk(c, mariah, Q.meet);
    c.player.magnetism = 3;
    sub.stage = 'puzzle';
    drawPath();
    toast(Q.hint, 'hint', 9000);
    c.autosave(true);
    setObjective();
  }, 1.5, () => sub.stage === 'go'));
  const setObjective = () => {
    if (sub.stage === 'go') c.objective(Q.title, 'Find the keeper of the barricaded rail yard.', mariah.pos);
    else if (sub.stage === 'puzzle') c.objective(Q.title, 'Route the magnetised ore cart into the barricade: set the switches, then stand at the magnet post.', post);
    else if (sub.stage === 'fight') c.objective(Q.title, 'Defeat Mariah.', null);
  };
  if (sub.stage === 'puzzle') { drawPath(); c.player.magnetism = 3; }
  setObjective();
  let finished = false;
  const finish = async () => {
    if (finished) return;
    finished = true;
    sub.stage = 'fight';
    for (const cr of crates) cr.shatter(cart.position, 12);
    if (wall) g.world.removeCollider(wall);
    g.vfx.impact(cart.position.clone().add(V(0, 1, 0)), 0xffe0a0, 2.2);
    g.camera.shake(0.8);
    await talk(c, mariah, Q.fight);
    g.removeActor(mariah);
    setObjective();
    // a real fight: twice the old health (520 with the +40 every AI opponent gets) at full difficulty
    const mf = await duel(c, 'mariah', P(0, -60), { hp: 480, difficulty: 1.15 });
    c.duel = null;
    await talk(c, mf, Q.win);
    g.removeActor(mf);
    c.player.magnetism = 0;
    c.addClue('Mariah: the Seal-bearers were all told to expect DIO "by a man with his voice".');
    sub.stage = 'done';
    c.completeStep();
  };
  return {
    update(dt) {
      for (const cr of crates) cr.update(dt, false);
      c.duel?.update(dt);
      if (rolling) {
        const r = rolling;
        const a = r.path[r.i]; const b = r.path[r.i + 1];
        if (!b) {
          const end = r.path[r.path.length - 1];
          rolling = null;
          if (end === nodes.barricade) finish();
          else { toast('The cart grinds into a dead end. Mariah laughs.'); setTimeout(() => cart.position.copy(nodes.S), 1200); }
          return;
        }
        r.speed = Math.min(16, r.speed + dt * 5);
        r.t += (r.speed * dt) / a.distanceTo(b);
        if (r.t >= 1) { r.t = 0; r.i += 1; audio.play('hoof', { wood: true, power: 0.5 }); return; }
        cart.position.lerpVectors(a, b, r.t);
        cart.lookAt(b.x, cart.position.y, b.z);
        // the cart is drawn to DIO; standing on its path hurts
        if (cart.position.distanceTo(c.player.pos) < 1.4 && r.speed > 5) g.combat.applyHit(c.player, mariah, { damage: 14, stun: 0.6, knock: 8, kind: 'heavy', unblockable: true, noCounter: true });
      }
    },
    dispose() {
      for (const it of its) g.world.removeInteractable(it.id);
      for (const cr of crates) cr.dispose();
      for (const m of pathMeshes) m.removeFromParent();
      for (const l of levers) l.lever.removeFromParent();
      tracks.removeFromParent(); cart.removeFromParent(); postMesh.removeFromParent();
      if (wall && sub.stage !== 'done') g.world.removeCollider(wall);
      if (g.actors.includes(mariah)) g.removeActor(mariah);
      if (c.duel) { g.removeActor(c.duel.f); c.duel = null; }
    },
  };
}

// =========================================================================== Q3 · Emperor's Crossing
async function q3(c) {
  const g = c.game;
  const Q = QUESTS.q3;
  const gl = GULCHES.find((q) => q.id === 'holGulch');
  const south = V(gl.x, gl.deckY, gl.z + 26);
  const far = V(gl.x, gl.deckY, gl.z - 30);
  c.objective(Q.title, 'Cross the gulch trestle north of the courtyard.', south);
  let state = 'go';
  let hol = null; let brain = null; let reflects = 0;
  let unsub = null;
  const its = [];
  const begin = async () => {
    state = 'fight';
    hol = await createFighter(g, 'holHorse', { team: 1, hp: 300 });
    hol.pos.copy(far); hol.pos.y = g.world.groundAt(far.x, far.z, far.y + 2);
    hol.faceTowards(c.player.pos, true);
    g.addActor(hol); g.combat.add(hol);
    await talk(c, hol, Q.meet);
    brain = new BossBrain(g, hol, { difficulty: g.difficulty, keep: [12, 22], style: 'far' });
    addStoryBonus(hol, 'holHorse');
    g.combatActive = true;
    c.objective(Q.title, `Cross the trestle. Strike Emperor's bullets back at Hol Horse (${reflects}/3).`, far);
    toast(Q.hint, 'hint', 8000);
    ui.set({ boss: { name: 'Hol Horse', stand: 'Emperor', hp: hol.hp, hpMax: hol.hpMax, phase: 1, phases: 1, color: '#ffe0a0' } });
    unsub = g.combat.on((ev) => {
      if (ev.type === 'hit' && ev.target === hol && ev.hit.kind === 'projectile' && ev.attacker === c.player) {
        reflects += 1;
        c.objective(Q.title, `Strike Emperor's bullets back at Hol Horse (${reflects}/3).`, hol.pos);
        if (reflects >= 3) yieldNow();
      }
    });
    hol.onDeath = () => yieldNow();
  };
  let yielded = false;
  const yieldNow = async () => {
    if (yielded) return;
    yielded = true;
    brain.enabled = false;
    g.combatActive = false;
    ui.set({ boss: null });
    hol.dead = false; hol.hp = Math.max(1, hol.hp); hol.state = 'free';
    hol.override = (t) => Poses.kneel(1);
    for (const p of g.combat.projectiles) p.life = 0;
    await talk(c, hol, Q.win);
    const id = await choose(c, hol, Q.choice);
    c.p.flags.holHorse = id;
    await talk(c, hol, Q.choiceReplies[id]);
    if (id === 'spare') c.p.fragments += 1;
    await talk(c, hol, Q.clue);
    c.addClue('Hol Horse: the tattooed man who paid him "had your voice".');
    c.completeStep();
  };
  return {
    update(dt) {
      if (state === 'go' && c.player.pos.distanceTo(south) < 18) begin();
      if (brain && !yielded) {
        brain.update(dt);
        const b = ui.get().boss;
        if (b && b.hp !== Math.round(hol.hp)) ui.set({ boss: { ...b, hp: Math.round(hol.hp) } });
        if (hol.hp / hol.hpMax < 0.25) yieldNow();
      }
      // falling into the gulch: climb back onto the trestle
      if (c.player.pos.y < gl.deckY - 6) { c.player.pos.copy(south); g.combat.applyHit(c.player, hol || c.player, { damage: 12, stun: 0.3, kind: 'special', unblockable: true, noCounter: true }); }
    },
    dispose() { unsub?.(); for (const it of its) g.world.removeInteractable(it.id); if (hol) g.removeActor(hol); g.combatActive = false; ui.set({ boss: null }); },
  };
}

// =========================================================================== Q4 · The Hag's Lanterns
async function q4(c) {
  const g = c.game;
  const Q = QUESTS.q4;
  const sub = c.p.sub.q4 || (c.p.sub.q4 = { stage: 'go', lit: [false, false, false, false] });
  const cabin = poiPos('enyaCabin', 0, -4);
  const enya = await g.spawnNPC('enya', cabin.clone().add(V(4, 0, 2)), Math.PI / 2, { name: 'Enya', style: 'old' });
  enya.idlePose = (t) => Poses.idle(t, 'old');
  const spots = [V(42, 0, 30), V(-30, 0, 48), V(-50, 0, -26), V(26, 0, -52)].map((o) => { const p = cabin.clone().add(o); p.y = heightAt(p.x, p.z); return p; });
  const lamps = spots.map((p, i) => { const m = lanternMesh(sub.lit[i]); m.position.copy(p); g.engine.scene.add(m); return m; });
  const lights = [];
  const its = [];
  const setObjective = () => {
    const n = sub.lit.filter(Boolean).length;
    if (sub.stage === 'go') c.objective(Q.title, "Find Enya's cabin in the pines.", enya.pos);
    else if (sub.stage === 'lanterns') { const next = spots.find((_, i) => !sub.lit[i]); c.objective(Q.title, `Light the time-ward lanterns in the fog (${n}/4).`, next); }
    else if (sub.stage === 'return') c.objective(Q.title, 'Return to Enya.', enya.pos);
  };
  its.push(interact(c, 'q4_enya', enya.pos, 'Talk to Enya', async () => {
    if (sub.stage === 'go') { await talk(c, enya, Q.meet); sub.stage = 'lanterns'; setObjective(); c.autosave(true); }
    else if (sub.stage === 'return') {
      await talk(c, enya, Q.done);
      c.p.flags.enya = true;
      toast('Enya now offers Stand upgrades. Press U (or D-Pad Right) to open the upgrade altar.', 'reward', 8000);
      c.completeStep();
    }
  }, 1.4, () => sub.stage === 'go' || sub.stage === 'return'));
  spots.forEach((p, i) => {
    its.push(interact(c, `q4_l${i}`, p, 'Light the time-ward lantern', () => {
      if (sub.stage !== 'lanterns' || sub.lit[i]) return;
      sub.lit[i] = true;
      const lamp = lamps[i].userData.lamp;
      lamp.material.color.set(0xffb060); lamp.material.emissive.set(0xff9a40);
      lights.push(g.world.registerLight({ x: p.x, y: p.y + 2.3, z: p.z, color: 0xffa040, intensity: 1.4, flicker: 1 }));
      g.vfx.aura(p.clone().add(V(0, 2.3, 0)), 0xffb060, 0.6);
      audio.play('quest');
      toast(Q.lantern[sub.lit.filter(Boolean).length - 1]);
      if (sub.lit.every(Boolean)) sub.stage = 'return';
      c.autosave(true);
      setObjective();
    }, 1, () => sub.stage === 'lanterns' && !sub.lit[i]));
  });
  setObjective();
  let whisperT = 6;
  return {
    update(dt) {
      // Justice's fog thickens near the cabin until the wards are lit
      const near = c.player.pos.distanceTo(cabin) < 140;
      const n = sub.lit.filter(Boolean).length;
      if (near && sub.stage !== 'done') g.weather.fogTarget = sub.stage === 'go' ? 0.02 : 0.03 - n * 0.006;
      if (sub.stage === 'lanterns' && near) {
        whisperT -= dt;
        if (whisperT <= 0) { whisperT = 9 + Math.random() * 6; ui.set({ subtitle: { speaker: 'Fog', text: Q.whispers[Math.floor(Math.random() * Q.whispers.length)], color: '#c8a0ff' } }); setTimeout(() => ui.set({ subtitle: null }), 3000 * READ_PACE); }
      }
    },
    dispose() {
      for (const it of its) g.world.removeInteractable(it.id);
      for (const m of lamps) m.removeFromParent();
      for (const l of lights) { const i = g.world.lights.indexOf(l); if (i >= 0) g.world.lights.splice(i, 1); }
      g.removeActor(enya);
      g.weather.setRegion(g.world.currentRegion);
    },
  };
}

// =========================================================================== Q5 · Osiris's Wager
async function q5(c) {
  const g = c.game;
  const Q = QUESTS.q5;
  const hall = poiPos('osirisHall', 0, 0);
  const dan = await g.spawnNPC('daniel', hall.clone().add(V(-6, 0, 2)), -Math.PI / 2, { name: "Daniel J. D'Arby" });
  dan.idlePose = (t) => Poses.talk(t, 0.25);
  c.objective(Q.title, "Find the gambler at the Assay Hall in Iron Vale.", dan.pos);
  let met = false;
  const play = async () => {
    if (!met) { await talk(c, dan, Q.meet); met = true; }
    const res = await runMinigame(c, 'osiris', { rules: Q.rules });
    if (res === 'win') {
      await talk(c, dan, Q.win);
      c.addClue("Daniel J. D'Arby: the Seals hold the years apart \"like fingers in a dam\".");
      c.p.fragments += 1;
      c.completeStep();
    } else {
      await talk(c, dan, Q.lose);
      c.objective(Q.title, "Challenge D'Arby again.", dan.pos);
    }
  };
  interact(c, 'q5_dan', dan.pos, "Sit at D'Arby's table", play, 1.4);
  return { update() {}, dispose() { g.world.removeInteractable('q5_dan'); g.removeActor(dan); } };
}

// =========================================================================== Q6 · Geb's Drowned Path
async function q6(c) {
  const g = c.game;
  const Q = QUESTS.q6;
  const nodes = g.world.gebNodes || [poiPos('gebMarsh')];
  const end = nodes[nodes.length - 3] || nodes[0];
  const ndoul = await g.spawnNPC('ndoul', end.clone(), 0, { name: "N'Doul" });
  ndoul.pinned = true;
  ndoul.pos.y = end.y;
  ndoul.faceTowards(nodes[0], true);
  const start = nodes[0];
  let state = 'go';
  const geb = await createFighter(g, 'ndoul', { team: 1, hp: 200 });
  geb.group.visible = false; geb.pinned = true; geb.untargetable = true;
  geb.pos.copy(end);
  g.addActor(geb);
  const kit = geb.kit;
  let strikeCd = 0; let distractUntil = 0;
  const piles = [nodes[1], nodes[3], nodes[8] || nodes[2]].filter(Boolean);
  const its = [];
  piles.forEach((p, i) => its.push(interact(c, `q6_stone${i}`, p, 'Throw a stone (draw Geb away)', () => {
    const target = c.player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 30));
    target.y = g.world.groundAt(target.x, target.z, target.y + 2);
    kit.strikeAt(target, 0, 0.9);
    distractUntil = g.clock + 5;
    audio.play('splash', { power: 0.6 });
    toast('The stone splashes far away. Geb surges after the sound.');
  }, 1.5, () => state === 'sneak' && g.clock > distractUntil)));
  c.objective(Q.title, 'Cross the drowned boardwalks to find the blind hunter.', start);
  return {
    async update(dt) {
      const pl = c.player;
      if (state === 'go' && pl.pos.distanceTo(start) < 12) {
        state = 'sneak';
        await talk(c, ndoul, Q.meet);
        toast(Q.hint, 'hint', 9000);
        c.objective(Q.title, "Reach N'Doul quietly. Walk, don't run.", end);
      }
      if (state === 'sneak') {
        strikeCd -= dt;
        const noisy = (pl.noise || 0) >= 0.6 || pl.mounted || (pl.action && /jab|punch|heavy|rush/.test(pl.action.def.name));
        if (noisy && strikeCd <= 0 && g.clock > distractUntil) {
          strikeCd = 1.1;
          kit.strikeAt(pl.pos.clone().addScaledVector(pl.vel, 0.45), 14, 0.6);
        }
        ui.set({ noise: pl.noise || 0 });
        if (pl.pos.distanceTo(end) < 3.5) {
          state = 'done';
          ui.set({ noise: null });
          ndoul.override = (t) => Poses.kneel(Math.min(1, t));
          ndoul.t = 0;
          await talk(c, ndoul, Q.win);
          c.addClue("N'Doul heard two of DIO's footsteps at once: one far north, on a stair.");
          c.completeStep();
        }
      }
    },
    dispose() { for (const it of its) g.world.removeInteractable(it.id); g.removeActor(ndoul); g.removeActor(geb); ui.set({ noise: null }); },
  };
}

// =========================================================================== Q7 · Atum's Question
async function q7(c) {
  const g = c.game;
  const Q = QUESTS.q7;
  const ov = poiPos('atumOverlook', 0, 0);
  const tel = await g.spawnNPC('telence', ov.clone().add(V(0, 0, -1.6)), 0, { name: "Telence T. D'Arby" });
  tel.idlePose = (t) => Poses.talk(t, 0.2);
  tel.pos.y = g.world.groundAt(tel.pos.x, tel.pos.z, ov.y + 3);
  c.objective(Q.title, 'Climb to the Lantern Overlook on Bleakwater Ridge.', tel.pos);
  let met = false;
  interact(c, 'q7_tel', tel.pos, "Accept Telence's game", async () => {
    if (!met) { await talk(c, tel, Q.meet); met = true; }
    const res = await runMinigame(c, 'atum', { rules: Q.rules });
    if (res === 'win') {
      await talk(c, tel, Q.win);
      c.addClue('Atum asked "Did you write the journal?" DIO\'s soul answered "yes", in the past tense.');
      c.p.fragments += 1;
      c.completeStep();
    } else await talk(c, tel, Q.lose);
  }, 1.6);
  return { update() {}, dispose() { g.world.removeInteractable('q7_tel'); g.removeActor(tel); } };
}

// =========================================================================== Q8 · The Void Between
async function q8(c) {
  const g = c.game;
  const Q = QUESTS.q8;
  const sub = c.p.sub.q8 || (c.p.sub.q8 = { stage: 'go', lit: [false, false, false] });
  const center = poiPos('creamRuins');
  const obPos = [V(-20, 0, 18), V(22, 0, -6), V(-6, 0, -34)].map((o) => { const p = center.clone().add(o); p.y = heightAt(p.x, p.z); return p; });
  const obs = obPos.map((p, i) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.9, 6, 4), new THREE.MeshStandardMaterial({ color: 0x3a3448, roughness: 0.6, emissive: sub.lit[i] ? 0x8a5aff : 0x000000, emissiveIntensity: 1.5 }));
    m.position.copy(p).add(V(0, 3, 0));
    m.castShadow = true;
    g.engine.scene.add(m);
    return m;
  });
  const cols = obPos.map((p) => g.world.addCollider({ x: p.x, z: p.z, r: 1, top: p.y + 6, bottom: p.y - 2 }));
  let vanilla = null; let brain = null; let state = sub.stage;
  const its = [];
  const setObjective = () => {
    const n = sub.lit.filter(Boolean).length;
    if (state === 'go') c.objective(Q.title, 'Enter the Ruins of Many Hours.', center);
    else if (state === 'obelisks') c.objective(Q.title, `Light the timeline obelisks while Cream roams (${n}/3).`, obPos.find((_, i) => !sub.lit[i]));
    else if (state === 'fight') c.objective(Q.title, 'Defeat Vanilla Ice.', null);
  };
  obPos.forEach((p, i) => its.push(interact(c, `q8_ob${i}`, p, 'Light the obelisk', async () => {
    if (state !== 'obelisks' || sub.lit[i]) return;
    sub.lit[i] = true;
    obs[i].material.emissive.set(0x8a5aff);
    g.vfx.beam(p.clone().add(V(0, 6, 0)), p.clone().add(V(0, 60, 0)), 0x9a6aff, 0.6, 2.5);
    audio.play('summon');
    setObjective();
    if (sub.lit.every(Boolean)) {
      state = 'fight';
      brain.enabled = false;
      vanilla.kit.inVoid = false;
      await talk(c, vanilla, Q.confront);
      brain.enabled = true;
      brain.keep = [2, 6];
      brain.style = 'close';
      g.combatActive = true;
      ui.set({ boss: { name: 'Vanilla Ice', stand: 'Cream', hp: vanilla.hp, hpMax: vanilla.hpMax, phase: 1, phases: 2, color: '#b08aff' } });
      setObjective();
    }
  }, 1.4, () => state === 'obelisks' && !sub.lit[i])));
  const spawnVanilla = async () => {
    vanilla = await createFighter(g, 'vanillaIce', { team: 1, hp: 420 });
    vanilla.pos.copy(center).add(V(0, 0, -10)); vanilla.pos.y = heightAt(vanilla.pos.x, vanilla.pos.z);
    g.addActor(vanilla); g.combat.add(vanilla);
    brain = new BossBrain(g, vanilla, { difficulty: g.difficulty, keep: [8, 18], style: 'far' });
    addStoryBonus(vanilla, 'vanillaIce');
    vanilla.onDeath = async () => {
      g.combatActive = false; ui.set({ boss: null });
      vanilla.revive(1); vanilla.dead = true;
      vanilla.override = (t) => Poses.kneel(1);
      brain.enabled = false;
      const id = await choose(c, vanilla, Q.choice);
      c.p.flags.vanilla = id;
      await talk(c, vanilla, Q.choiceReplies[id]);
      c.addClue('Vanilla Ice: the one on the throne is DIO, but "he loves no one, not even you".');
      c.completeStep();
    };
  };
  setObjective();
  return {
    async update(dt) {
      if (state === 'go' && c.player.pos.distanceTo(center) < 40) {
        state = 'meet';
        await spawnVanilla();
        brain.enabled = false;
        await talk(c, vanilla, Q.meet);
        toast(Q.hint, 'hint', 8000);
        state = 'obelisks';
        sub.stage = 'obelisks';
        brain.enabled = true;
        setObjective();
      } else if (state === 'obelisks' && !vanilla) {
        await spawnVanilla();
      }
      if (brain) {
        // while the obelisks are dark, Vanilla Ice only travels inside Cream's void
        if (state === 'obelisks' && vanilla.canAct() && !vanilla.kit.inVoid && Math.random() < dt * 0.5) { vanilla.kit.cool.void = 0; vanilla.energy = 100; vanilla.kit.voidSphere(3, 8); }
        if (state !== 'obelisks' || vanilla.kit.inVoid) brain.update(dt);
        const b = ui.get().boss;
        if (b && b.hp !== Math.round(vanilla.hp)) ui.set({ boss: { ...b, hp: Math.round(vanilla.hp) } });
      }
    },
    dispose() {
      for (const it of its) g.world.removeInteractable(it.id);
      for (const m of obs) m.removeFromParent();
      for (const col of cols) g.world.removeCollider(col);
      if (vanilla) g.removeActor(vanilla);
      g.combatActive = false; ui.set({ boss: null });
    },
  };
}

// =========================================================================== Q9 · The Last Night's Confession
async function q9(c) {
  const g = c.game;
  const Q = QUESTS.q9;
  const ch = g.world.chasm || (() => { const gl = GULCHES.find((q) => q.id === 'heavenChasm'); return { x: gl.x, z: gl.z, y: gl.deckY, rot: 0 }; })();
  const br = chasmBridge();
  const S = V(br.S.x, br.S.y, br.S.z); const N = V(br.N.x, br.N.y, br.N.z);
  const along = N.clone().sub(S).setY(0).normalize();           // south rim -> north rim
  const side = V(along.z, 0, -along.x);
  const onRoad = (dz, lateral = 0) => { const z = ch.z + dz; const x = roadX(z); const p = V(x, 0, z).addScaledVector(side, lateral); p.y = g.world.groundAt(p.x, p.z, heightAt(p.x, p.z) + 3); return p; };
  const southEdge = onRoad(28);        // where Speedwagon and Enya wait, on solid ground
  const northEdge = onRoad(-25);
  const stairs = poiPos('sanctuaryStair', 140);
  c.objective(Q.title, 'Climb the Thousand Steps toward Heaven\'s Reach.', southEdge);
  const sw = await g.spawnNPC('speedwagon', onRoad(30, -2.4), 0, { name: 'Speedwagon' });
  const enya = await g.spawnNPC('enya', onRoad(30.5, 2.4), 0, { name: 'Enya', style: 'old' });
  enya.idlePose = (t) => Poses.idle(t, 'old');
  // The bridge: ten timber segments from rim to rim (deck of three boards on two stringers, a
  // cross-beam, posts and rope rails). Each segment is one merged mesh per material and falls as a
  // unit once the crossing begins; each has its own sloped walkable platform.
  const wood = g.world.bank.get('floor'); const dark = g.world.bank.get('woodDark'); const rope = g.world.bank.get('cloth');
  const n = br.segments; const L = br.len / n; const W = br.width;
  const yAt = (t) => br.S.y + (br.N.y - br.S.y) * t + 0.08;
  const segGeo = (() => {
    const parts = { wood: [], dark: [], rope: [] };
    const box = (arr, w, h, d, x, y, z) => { const geo = new THREE.BoxGeometry(w, h, d); geo.translate(x, y, z); arr.push(geo); };
    for (const x of [-1.3, 0, 1.3]) box(parts.wood, 1.22, 0.12, L - 0.12, x + (Math.random() - 0.5) * 0.02, 0, 0);
    for (const x of [-1.55, 1.55]) box(parts.dark, 0.26, 0.32, L, x, -0.22, 0);
    box(parts.dark, W, 0.22, 0.3, 0, -0.42, -L / 2 + 0.2);
    for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) {
      box(parts.dark, 0.16, 1.15, 0.16, x, 0.55, -L / 2 + 0.1);
      const r = new THREE.CylinderGeometry(0.035, 0.035, L, 5); r.rotateX(Math.PI / 2); r.translate(x, 1.02, 0); parts.rope.push(r);
      const r2 = new THREE.CylinderGeometry(0.03, 0.03, L, 5); r2.rotateX(Math.PI / 2); r2.translate(x, 0.55, 0); parts.rope.push(r2);
    }
    return { wood: mergeGeometries(parts.wood), dark: mergeGeometries(parts.dark), rope: mergeGeometries(parts.rope) };
  })();
  const planks = [];
  const place = (p) => {
    p.m.position.set(...p.home); p.m.rotation.set(-br.pitch, br.yaw, 0, 'YXZ');
    p.pl = g.world.addPlatform({ x: p.home[0], z: p.home[2], hw: W / 2 - 0.05, hd: L / 2 + 0.02, rot: br.yaw, y: yAt(p.t0), y1: yAt(p.t1) });
  };
  for (let i = 0; i < n; i += 1) {
    const t0 = i / n; const t1 = (i + 1) / n; const tm = (t0 + t1) / 2;
    const m = new THREE.Group();
    for (const [geo, mat] of [[segGeo.wood, wood], [segGeo.dark, dark], [segGeo.rope, rope]]) { const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; mesh.receiveShadow = true; m.add(mesh); }
    const home = [S.x + (N.x - S.x) * tm, yAt(tm) - 0.06, S.z + (N.z - S.z) * tm];
    const p = { m, pl: null, t0, t1, home, fall: -1, vy: 0, spin: (Math.random() - 0.5) * 1.6 };
    g.engine.scene.add(m);
    place(p);
    planks.push(p);
  }
  const lowest = Math.min(br.S.y, br.N.y);
  let state = 'climb';
  let collapseT = 0;
  return {
    async update(dt) {
      const pl = c.player;
      if (state === 'climb' && pl.pos.distanceTo(southEdge) < 16) {
        state = 'talk';
        if (pl.mounted) pl.mounted.dismount(true);
        g.horseForbidden = true;
        await talk(c, sw, Q.meet.slice(0, 1));
        await talk(c, enya, Q.meet.slice(1, 2));
        await talk(c, sw, Q.meet.slice(2, 3));
        await talk(c, enya, Q.meet.slice(3, 4));
        await talk(c, sw, Q.meet.slice(4, 5));
        await talk(c, enya, Q.meet.slice(5, 6));
        await talk(c, sw, Q.meet.slice(6));
        const id = await choose(c, sw, Q.choice);
        c.p.flags.truth = id;
        await talk(c, sw, Q.choiceReplies[id]);
        c.addClue('The truth: the journal, the symbol and the voice were all DIO, from after.');
        await talk(c, enya, Q.bridge);
        state = 'cross';
        collapseT = -2.5;
        c.objective(Q.title, 'Cross the collapsing bridge. Stop time if you must.', northEdge);
      }
      if (state === 'cross') {
        // planks give way from the south end, accelerating
        if (!g.time.stopped) collapseT += dt;
        const front = Math.floor(collapseT * 1.0);
        planks.forEach((p, i) => {
          if (i < front && p.fall < 0) { p.fall = 0; g.world.removePlatform(p.pl); audio.play('heavyHit', { power: 0.3 }); }
          if (p.fall >= 0 && !g.time.stopped && p.fall < 6) { p.vy -= 20 * dt; p.m.position.y += p.vy * dt; p.m.rotation.x += dt * 0.8; p.m.rotation.z += dt * p.spin; p.fall += dt; }
        });
        if (pl.pos.y < lowest - 6) {
          pl.pos.copy(southEdge); pl.vel.set(0, 0, 0);
          g.combat.applyHit(pl, sw, { damage: 18, stun: 0.3, kind: 'special', unblockable: true, noCounter: true });
          // rebuild the bridge for another attempt
          planks.forEach((p) => { if (p.fall >= 0) { p.fall = -1; p.vy = 0; place(p); } });
          collapseT = -2.5;
          toast('The bridge knits itself back together. Again.');
        }
        // across once past the north rim (measured along the bridge)
        if (pl.pos.clone().sub(N).setY(0).dot(along) > 2) {
          state = 'done';
          c.completeStep();
        }
      }
    },
    dispose() {
      g.removeActor(sw); g.removeActor(enya);
      for (const p of planks) { p.m.removeFromParent(); if (p.fall < 0) g.world.removePlatform(p.pl); }
      for (const geo of Object.values(segGeo)) geo.dispose();
      g.horseForbidden = false;
      void stairs;
    },
  };
}

export const QUEST_HANDLERS = { q1, q2, q3, q4, q5, q6, q7, q8, q9 };
export { Timer, Frame, REGIONS };
