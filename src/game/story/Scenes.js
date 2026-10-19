import * as THREE from 'three';
import { ui } from '../core/Store';
import { audio } from '../core/Audio';
import { instantiate } from '../assets/AssetLibrary';
import { roadX, heightAt } from '../world/Terrain';
import { SANCTUARY } from '../world/Layout';
import * as Poses from '../anim/Poses';
import { OPENING, SPEAKERS, HEAVEN_SCENE, ENDING, ENDING_VARIANTS } from './Script';
import { perform, stopPerform, nextGesture } from './Acting';

// Directed cinematics. Every scene leaves actors in a defined end state, so skipping is safe.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const R = (z, side = 0, up = 0) => { const x = roadX(z) + side; return V(x, heightAt(x, z) + up, z); };

export async function sayLines(seq, lines, opts = {}) {
  for (const [who, text] of lines) {
    const sp = SPEAKERS[who] || { name: who, color: '#fff' };
    if (opts.onLine) opts.onLine(who);
    await seq.say(sp.name, text, null, sp.color);
  }
}

function card(lines) { ui.set({ card: lines }); }

// Over-the-shoulder framing on `speaker` from behind `listener`.
export function ots(listener, speaker, side = 1, dist = 1.6) {
  const a = listener.chestWorld(new THREE.Vector3()).add(V(0, 0.2, 0));
  const b = speaker.chestWorld(new THREE.Vector3()).add(V(0, 0.25, 0));
  const dir = b.clone().sub(a).setY(0).normalize();
  const right = V(dir.z, 0, -dir.x).multiplyScalar(-side);
  return { pos: a.clone().addScaledVector(dir, -dist).addScaledVector(right, 0.7).add(V(0, 0.15, 0)), look: b };
}

// Front three-quarter close-up of the speaker (never blocked by the Stand floating behind them).
export function closeUp(speaker, listener, side = 1, dist = 2.5) {
  const head = speaker.jointWorld('head', new THREE.Vector3());
  const toL = listener.pos.clone().sub(speaker.pos).setY(0);
  if (toL.lengthSq() < 1e-4) toL.set(0, 0, 1);
  toL.normalize();
  const right = V(toL.z, 0, -toL.x).multiplyScalar(side);
  const pos = speaker.pos.clone().addScaledVector(toL, dist).addScaledVector(right, dist * 0.42);
  pos.y = head.y - 0.12;
  return { pos, look: head.clone().add(V(0, -0.08, 0)) };
}

// Side-on two-shot framing both characters.
export function twoShot(a, b, side = 1) {
  const ca = a.chestWorld(new THREE.Vector3()); const cb = b.chestWorld(new THREE.Vector3());
  const mid = ca.clone().lerp(cb, 0.5);
  const dir = cb.clone().sub(ca).setY(0);
  const sep = Math.max(1.5, Math.min(8, dir.length()));
  dir.normalize();
  const perp = V(-dir.z, 0, dir.x).multiplyScalar(side);
  return { pos: mid.clone().addScaledVector(perp, 2.6 + sep * 0.9).add(V(0, 0.25, 0)), look: mid.clone().add(V(0, 0.05, 0)) };
}

// Dialogue staging: an establishing two-shot, then over-the-shoulder shots on the speaker
// alternating with front close-ups. The speaker gestures in character, talks (jaw where the rig
// has one) and looks at the listener; the listener watches and nods. Stands step aside so they
// never block a shot, and every actor returns to the pose the scene had given them.
// Choose the first unobstructed framing among candidates (walls between lens and subject rule a
// shot out); if every option is blocked, the camera rig pulls the lens in front of the wall.
function clearShot(game, cands) {
  const w = game.world;
  if (!w) return cands[0];
  for (const s of cands) if (w.occlusion(s.look, s.pos, true) >= 0.999) return s;
  return cands[0];
}

export async function conversation(seq, a, b, lines) {
  const g = seq.game;
  const hidden = [];
  for (const c of [a, b]) if (c.stand?.summoned) { c.stand.summon(false, true); hidden.push(c.stand); }
  let n = 0;
  for (const [who, text] of lines) {
    const sp = SPEAKERS[who] || { name: who, color: '#fff' };
    const speakerIsA = who === 'DIO' || who === 'HEAVEN';
    const S = speakerIsA ? a : b; const L = speakerIsA ? b : a;
    const dur = Math.min(7, 2 + text.length * 0.045);
    let s; let fov = 34;
    const apart = a.distanceTo(b) > 7.5;   // too far apart to share a frame: single-character shots only
    if (n === 0 && !apart) { s = clearShot(g, [twoShot(a, b, 1), twoShot(a, b, -1), ots(L, S, 1, 2.2)]); fov = 40; } else if (n % 2 === 1 || (n === 0 && apart)) {
      const sd = n % 4 === 1 ? 1 : -1;
      s = clearShot(g, [ots(L, S, sd, 1.9), ots(L, S, -sd, 1.9), closeUp(S, L, sd, 2.2)]);
    } else {
      const sd = n % 4 === 2 ? 1 : -1;
      s = clearShot(g, [closeUp(S, L, sd, 2.4), closeUp(S, L, -sd, 2.4), closeUp(S, L, sd, 1.6)]);
    }
    seq.shot({ from: s.pos, to: s.pos.clone().lerp(s.look, 0.05), look: s.look, dur, fov, ease: 'linear' });
    perform(S, { gesture: n < 2 || text.length > 28 ? nextGesture(S) : null, talking: true, lookAt: L });
    perform(L, { lookAt: S, nod: true });
    n += 1;
    await seq.say(sp.name, text, null, sp.color);
  }
  stopPerform(a); stopPerform(b);
  for (const st of hidden) st.summon(true, true);
}

// ------------------------------------------------------------------------------- opening
export async function openingCinematic(game, seq, { player, horse, pucci, symbol }) {
  const fx = game.engine.fx;
  fx.uFade.value = 1;
  audio.setMusic('none');
  audio.setWeather(1, 0.8);
  game.weather.enabled = false;
  // Scene A: black, thunder, title card
  await seq.wait(0.6);
  audio.play('thunder', { distance: 0.6 });
  card(OPENING.card);
  await seq.wait(3.6);
  card(null);
  audio.setMusic('title');
  // wide valley
  const town = R(0, 0, 0);
  await seq.tween(0.01, () => {});
  seq.shot({ from: R(320, -60, 95), to: R(250, -40, 80), look: town.clone().add(V(0, -10, -200)), lookTo: town.clone().add(V(0, 0, -500)), dur: 7, fov: 42, fovTo: 38 });
  await seq.fade(0, 2.2);
  await seq.say('', OPENING.ride[0][1], 4.6, SPEAKERS.NAR.color);
  seq.lightning(R(-600, 120, 0), true);
  // Arrow vision
  const arrow = await instantiate('arrow');
  const ap = R(140, -10, 70);
  arrow.position.copy(ap);
  arrow.rotation.set(0.2, 0, 0.35);
  arrow.scale.setScalar(2.2);
  game.engine.scene.add(arrow);
  const glow = new THREE.PointLight(0xffd890, 30, 12, 1.5);
  glow.position.copy(ap).add(V(0, 1.2, 1));
  game.engine.scene.add(glow);
  await seq.shot({ from: ap.clone().add(V(-2.2, 1.2, 3.2)), to: ap.clone().add(V(1.6, 1.6, 2.8)), look: ap.clone().add(V(0, 0.9, 0)), dur: 3.6, fov: 30, roll: 0.05, rollTo: -0.05 });
  seq.flash(0xffffff, 0.9, 0.4);
  seq.lightning(ap.clone().add(V(-80, 0, -120)), true);
  game.engine.scene.remove(arrow);
  game.engine.scene.remove(glow);
  // glide along the old spur line over the rooftops
  seq.shot({ from: R(170, 27.5, 14), to: R(-40, 20, 10), look: R(110, 18, 4), lookTo: R(-140, 0, 2), dur: 6.5, fov: 46, ease: 'linear' });
  await seq.say('', OPENING.ride[1][1], 5.2, SPEAKERS.NAR.color);
  await seq.wait(1.0);
  // the lone rider
  horse.mount(player, true);
  horse.pos.copy(R(215, 0, 0));
  horse.yaw = Math.PI;
  horse.state = 'scripted';
  const ride = (z0, z1, dur) => seq.tween(dur, (k) => {
    const z = z0 + (z1 - z0) * k;
    horse.pos.x = roadX(z); horse.pos.z = z;
    horse.pos.y = game.world.groundAt(horse.pos.x, z, horse.pos.y + 1);
    const ahead = roadX(z - 2) - roadX(z);
    horse.yaw = Math.atan2(ahead, -2);
    horse.speed = Math.abs(z1 - z0) / dur;
  }, 'linear');
  seq.shot({ follow: () => horse.pos.clone().add(V(0, 1.6, 0)), from: R(212, 5, 1.0), to: R(184, 4.5, 1.2), look: R(205, 0, 1.5), dur: 5, fov: 40 });
  await Promise.all([ride(215, 180, 5), seq.say('DIO', OPENING.ride[2][1], 4.8, SPEAKERS.DIO.color)]);
  // hooves close-up
  seq.shot({ follow: () => horse.pos.clone().add(V(0, 0.4, 0)), from: R(178, 1.6, 0.25), to: R(170, 1.5, 0.3), look: R(176, 0, 0.3), dur: 2.4, fov: 34 });
  await ride(180, 168, 2.4);
  // low angle against lightning
  seq.shot({ follow: () => horse.pos.clone().add(V(0, 2.4, 0)), from: R(158, -3, 0.2), to: R(156, -3.4, 0.25), look: R(165, 0, 2), dur: 3.2, fov: 36 });
  const r3 = ride(168, 150, 3.2);
  await seq.wait(0.9);
  seq.lightning(R(80, -200, 0), true);
  await r3;
  // the sanctuary on the horizon
  const san = V(SANCTUARY.x, SANCTUARY.y + 120, SANCTUARY.z);
  seq.shot({ from: R(160, 1.2, 3.4), to: R(158, 0.9, 3.0), look: san, lookTo: san, dur: 3.6, fov: 30 });
  const r4 = ride(150, 128, 3.6);
  await seq.wait(1.2);
  seq.lightning(V(SANCTUARY.x - 300, 0, SANCTUARY.z + 200), true);
  await r4;

  // Scene B: arrival
  game.weather.enabled = true;
  audio.setMusic('tension');
  game.world.lightFlicker = 3;
  seq.shot({ follow: () => horse.pos.clone().add(V(0, 1.8, 0)), from: R(70, -6, 2.4), to: R(56, -5.5, 2.2), look: R(100, 0, 1.8), dur: 5, fov: 44 });
  const r5 = seq.tween(5, (k) => {
    const z = 128 - (128 - 66) * Math.sin(k * Math.PI / 2);
    horse.pos.x = roadX(z) + 1.5 * k; horse.pos.z = z;
    horse.pos.y = game.world.groundAt(horse.pos.x, z, horse.pos.y + 1);
    horse.speed = 7 * (1 - k);
  }, 'linear');
  await seq.say('DIO', OPENING.arrival[0][1], 4.8, SPEAKERS.DIO.color);
  await r5;
  audio.play('click');
  // dismount
  horse.speed = 0;
  horse.dismount(true);
  horse.state = 'idle';
  player.yaw = player.targetYaw = Math.PI;
  seq.place(player, R(66, -1.2, 0), Math.PI);
  // mysterious figure on the hotel balcony
  const balc = pucci.pos.clone();
  seq.shot({ from: R(-30, 3, 1.3), to: R(-36, 2.5, 1.5), look: balc.clone().add(V(0, 1.5, 0)), dur: 2.6, fov: 34 });
  pucci.override = (t) => Poses.crossArms(t);
  await seq.wait(1.2);
  seq.lightning(balc.clone().add(V(-120, 0, -150)), true);
  await seq.say('DIO', OPENING.arrival[1][1], 3.4, SPEAKERS.DIO.color);
  seq.shot({ from: balc.clone().add(V(1.5, 1.9, 2.5)), to: balc.clone().add(V(0.8, 1.8, 1.8)), look: balc.clone().add(V(0, 1.6, 0)), dur: 2.6, fov: 34 });
  await seq.wait(2.6);
  // walk to the land office door and see the symbol
  const door = game.world.landOffice.door.clone();
  const approach = door.clone().add(V(-2.5, 0, 0.6));
  seq.shot({ follow: () => player.chestWorld(new THREE.Vector3()), from: R(60, -4, 2.2), to: approach.clone().add(V(-3, 1.8, 3)), look: R(50, 10, 1.4), dur: 4.2, fov: 42 });
  await seq.moveTo(player, approach, 4.2);
  player.faceTowards(symbol.position, true);
  seq.cut(symbol.position.clone().add(V(-1.6, 0.1, 1.6)), symbol.position, 32);
  await sayLines(seq, [OPENING.arrival[2]]);
  game.world.lightFlicker = 1;
  pucci.override = null;
}

export async function journalCinematic(game, seq, { player, journalPos }) {
  const lo = game.world.landOffice;
  const F = (x, y, z) => lo.frame.pt(x, y, z);
  seq.place(player, F(2.3, 0, -2.55), lo.frame.rotY + Math.PI);
  player.pos.y = lo.frame.y + 0.22;
  seq.cut(F(-2.6, 2.3, 1.2), journalPos.clone().add(V(0, 0.4, 0)), 44);
  player.override = (t) => { const p = Poses.idle(t, 'dio'); p.head = [0.45, 0, 0]; p.uaR = [-0.3, -0.5, 0.8]; p.faR = [-0.1, -0.2, 1]; return p; };
  await sayLines(seq, OPENING.journal.slice(0, 1));
  // over DIO's shoulder onto the open journal (the look point sits on the page, above the desk)
  {
    const head = player.jointWorld('head', new THREE.Vector3());
    const toDesk = journalPos.clone().sub(player.pos).setY(0).normalize();
    const page = journalPos.clone().add(V(0, 0.45, 0));
    const cand = [1, -1].map((s) => {
      // high and wide of his shoulder so the page clears his body
      const pos = head.clone().addScaledVector(toDesk, -0.9).addScaledVector(V(-toDesk.z, 0, toDesk.x), 1.1 * s).add(V(0, 0.85, 0));
      return { pos, look: page };
    });
    const s = clearShot(game, cand);
    seq.shot({ from: s.pos, to: s.pos.clone().lerp(s.look, 0.12), look: s.look, dur: 6, fov: 42 });
  }
  await sayLines(seq, OPENING.journal.slice(1, 3));
  // time misbehaves: the rain stops mid-air, the lantern flame freezes
  const fx = game.engine.fx;
  audio.play('heartbeat');
  game.weather.sim -= 0;
  const wasEnabled = game.weather.enabled;
  game._frozenWeather = true;
  // push in on DIO's face as the world stops around him
  const cu = clearShot(game, [closeUp(player, { pos: journalPos }, 1, 1.9), closeUp(player, { pos: journalPos }, -1, 1.9), closeUp(player, { pos: journalPos }, 1, 1.3)]);
  seq.shot({ from: cu.pos, to: cu.pos.clone().lerp(cu.look, 0.15), look: cu.look, dur: 5.5, fov: 30 });
  await seq.tween(0.6, (k) => { fx.uTimeStop.value = k * 0.65; fx.uTsWave.value = k * 0.4; });
  audio.setFrozen(true);
  await seq.say('DIO', OPENING.journal[3][1], 4.2, SPEAKERS.DIO.color);
  // The World manifests for the first time
  seq.shot({ follow: () => player.chestWorld(new THREE.Vector3()).add(V(0, 0.35, 0)), from: F(0.6, 1.5, -3.4), to: F(0.9, 1.7, -3.5), look: player.pos, dur: 5, fov: 40 });
  player.override = (t) => Poses.raiseArms(Math.min(1, t * 0.6));
  player.t = 0;
  await seq.say('DIO', OPENING.manifest[0][1], 3.6, SPEAKERS.DIO.color);
  player.stand.summon(true);
  player.stand.slot = 'guard';
  game.vfx.menacing(player.pos.clone().add(V(0, 1.6, 0)), 'ゴ', 6, '#b04cff');
  seq.flash(0xffe9a0, 0.6, 0.5);
  game.camera.shake(0.6);
  await seq.say('DIO', OPENING.manifest[1][1], 2.2, SPEAKERS.DIO.color);
  const sp = player.stand.pos.clone().add(V(0, 1.6, 0));
  seq.shot({ follow: () => player.stand.chestWorld(new THREE.Vector3()).add(V(0, 0.4, 0)), from: F(1.2, 1.0, -3.5), to: F(1.6, 1.3, -3.6), look: sp, dur: 3, fov: 42 });
  await seq.wait(1.2);
  await seq.tween(0.8, (k) => { fx.uTimeStop.value = 0.65 * (1 - k); fx.uTsWave.value = 0.4 * (1 - k); });
  audio.setFrozen(false);
  audio.play('timeResume');
  game._frozenWeather = false;
  game.weather.enabled = wasEnabled;
  player.override = null;
  await sayLines(seq, [OPENING.manifest[2]]);
}

// ------------------------------------------------------------------------------- bosses
export async function bossIntro(game, seq, { player, boss, center, data, rk }) {
  audio.setMusic('tension');
  ui.set({ boss: null });
  const bc = boss.chestWorld(new THREE.Vector3());
  // establishing orbit of the arena
  const a0 = Math.random() * Math.PI * 2;
  seq.shot({ path: new THREE.CatmullRomCurve3([center.clone().add(V(Math.cos(a0) * 34, 16, Math.sin(a0) * 34)), center.clone().add(V(Math.cos(a0 + 0.6) * 28, 11, Math.sin(a0 + 0.6) * 28)), center.clone().add(V(Math.cos(a0 + 1.1) * 20, 7, Math.sin(a0 + 1.1) * 20))]), look: center.clone().add(V(0, 1, 0)), dur: 3.6, fov: 46 });
  await seq.wait(1.4);
  seq.lightning(center.clone().add(V(-150, 0, -200)), true);
  await seq.wait(2.2);
  // reveal the boss: their own stance, eyes on DIO, an entrance gesture
  perform(boss, { gesture: nextGesture(boss), lookAt: player });
  perform(player, { lookAt: boss });
  seq.shot({ from: bc.clone().addScaledVector(boss.forward(), 4.2).add(V(1.2, -0.6, 0)), to: bc.clone().addScaledVector(boss.forward(), 3.0).add(V(0.8, -0.3, 0)), look: bc.clone().add(V(0, 0.25, 0)), dur: 2.8, fov: 36 });
  ui.set({ bossCard: { name: rk.name, stand: rk.standName, color: rk.color } });
  audio.play('stinger');
  await seq.wait(2.8);
  // stand manifestation
  if (boss.stand) {
    boss.stand.summon(true);
    const sp = boss.stand.chestWorld(new THREE.Vector3());
    seq.shot({ from: sp.clone().addScaledVector(boss.forward(), 3.2).add(V(-1, -1.2, 0)), to: sp.clone().addScaledVector(boss.forward(), 2.6).add(V(-0.6, -0.6, 0)), look: sp.clone().add(V(0, 0.5, 0)), dur: 2.2, fov: 34 });
    game.vfx.menacing(sp, 'ゴ', 4, rk.color);
  }
  // DIO is brought to 9 m while the camera is on the Stand, then walks in on camera
  const toB = boss.pos.clone().sub(player.pos).setY(0);
  const far = toB.length();
  toB.normalize();
  if (far > 9) seq.place(player, boss.pos.clone().addScaledVector(toB, -9), Math.atan2(toB.x, toB.z));
  await seq.wait(2.0);
  ui.set({ bossCard: null });
  stopPerform(boss);
  const mark = boss.pos.clone().addScaledVector(toB, -5.2);
  const sideV = V(toB.z, 0, -toB.x);
  const bossChest = boss.chestWorld(new THREE.Vector3());
  seq.shot({ from: player.pos.clone().addScaledVector(toB, -3.2).addScaledVector(sideV, 1.3).add(V(0, 1.9, 0)), to: mark.clone().addScaledVector(toB, -3.0).addScaledVector(sideV, 1.2).add(V(0, 1.85, 0)), look: bossChest, dur: 2.4, fov: 40 });
  await seq.moveTo(player, mark, 2.4);
  player.faceTowards(boss.pos, true);
  stopPerform(player);
  await conversation(seq, player, boss, data.intro);
  // swing behind DIO into gameplay
  const behind = player.pos.clone().addScaledVector(player.forward(), -4).add(V(0.6, 2, 0));
  seq.shot({ from: game.engine.camera.position.clone(), to: behind, look: bc, dur: 1.0, fov: 50 });
  await seq.wait(1.0);
}

export async function bossVictory(game, seq, { player, boss, data }) {
  audio.setMusic('explore');
  game.time.end(true);
  boss.override = (t) => Poses.defeated(Math.min(1, t * 1.5));
  boss.t = 0;
  if (boss.stand) boss.stand.summon(false);
  // DIO walks up to the beaten foe (from no more than 6 m), then looks down on them
  const toB = boss.pos.clone().sub(player.pos).setY(0);
  const far = toB.length();
  toB.normalize();
  if (far > 6) seq.place(player, boss.pos.clone().addScaledVector(toB, -6), Math.atan2(toB.x, toB.z));
  if (player.anim) player.anim.lookAt = boss;
  const side = V(toB.z, 0, -toB.x);
  const mark = boss.pos.clone().addScaledVector(toB, -3.2);
  const mid = player.pos.clone().lerp(mark, 0.5).lerp(boss.pos, 0.35);
  seq.cut(mid.clone().addScaledVector(side, 5).add(V(0, 1.6, 0)), mid.clone().add(V(0, 1.0, 0)), 40);
  if (player.pos.distanceTo(mark) > 0.5) await seq.moveTo(player, mark, 1.8);
  player.faceTowards(boss.pos, true);
  player.override = (t) => Poses.idle(t, 'dio');
  await seq.wait(0.6);
  await conversation(seq, player, boss, data.defeat);
  player.override = null;
  if (player.anim) player.anim.lookAt = null;
}

// ------------------------------------------------------------------------------- heaven
export async function heavenCinematic(game, seq, { player, jotaro, altar, arrowMesh, onTransform }) {
  const fx = game.engine.fx;
  audio.setMusic('none');
  game.weather.strikeRate = 6;
  jotaro.override = (t) => Poses.kneel(1);
  // DIO walks up the altar steps
  const base = altar.clone().add(V(0, -4.4, 3.2));
  seq.shot({ follow: () => player.chestWorld(new THREE.Vector3()), from: altar.clone().add(V(-9, -1, 12)), to: altar.clone().add(V(-5, 0, 6)), look: altar, dur: 5, fov: 40 });
  await seq.moveTo(player, base, 5);
  player.faceTowards(altar, true);
  await sayLines(seq, HEAVEN_SCENE.slice(0, 1));
  // the camera circles as the storm builds
  const c = player.pos.clone().add(V(0, 1.5, 0));
  const path = [];
  // sweep around the open (south) side of the altar so the camera never enters the stonework
  for (let i = 0; i <= 8; i += 1) { const a = (0.12 + (i / 8) * 0.76) * Math.PI; path.push(c.clone().add(V(Math.cos(a) * 6.5, 0.4 + i * 0.25, Math.sin(a) * 6.5))); }
  seq.shot({ path: new THREE.CatmullRomCurve3(path), look: c, dur: 7, fov: 42, ease: 'linear' });
  for (let i = 0; i < 4; i += 1) { seq.lightning(c.clone().add(V((Math.random() - 0.5) * 120, -2, -60 - Math.random() * 80)), true); await seq.wait(0.6); }
  player.override = (t) => Poses.raiseArms(Math.min(1, t));
  player.t = 0;
  await sayLines(seq, HEAVEN_SCENE.slice(1, 2));
  // the Arrow glows, time freezes, rain hangs in the air
  const arrowLight = new THREE.PointLight(0xfff0c0, 0, 14, 1.4);
  arrowLight.position.copy(altar).add(V(0, 0.8, 0));
  game.engine.scene.add(arrowLight);
  await seq.tween(1.6, (k) => { arrowLight.intensity = k * 60; fx.uTimeStop.value = k * 0.8; });
  game._frozenWeather = true;
  audio.setFrozen(true);
  audio.play('timeStop');
  await sayLines(seq, HEAVEN_SCENE.slice(2, 3));
  // the sky fractures, space distorts
  seq.shot({ from: c.clone().add(V(0, -1.2, 3.8)), to: c.clone().add(V(0, -0.8, 2.2)), look: c.clone().add(V(0, 1, 0)), dur: 3.5, fov: 34, roll: 0, rollTo: 0.12 });
  await seq.tween(3.2, (k) => { fx.uHeaven.value = k; fx.uGravity.value = k; game.weather.heaven = k; }, 'in');
  seq.flash(0xffffff, 1, 1.2);
  arrowMesh.visible = false;
  await onTransform();
  audio.play('explosion');
  game.camera.shake(1);
  audio.setMusic('heaven');
  await seq.tween(1.2, (k) => { fx.uTimeStop.value = 0.8 * (1 - k); fx.uGravity.value = 1 - k; });
  game._frozenWeather = false;
  audio.setFrozen(false);
  game.engine.scene.remove(arrowLight);
  const hp = game.player;
  hp.faceTowards(jotaro.pos, true);
  hp.group.rotation.y = hp.yaw;
  hp.stand.summon(true);
  game.vfx.aura(hp.chestWorld(new THREE.Vector3()), 0xfff2c8, 2.5, true);
  // the reveal: a low close-up rising on the new DIO, who savours it and speaks with his hands
  const cu = closeUp(hp, jotaro, 1, 3.2);
  seq.shot({ from: cu.pos.clone().add(V(0, -0.5, 0)), to: cu.pos, look: cu.look, dur: 6.5, fov: 38 });
  hp.override = (t) => Poses.dioPose(t);
  perform(hp, { gesture: nextGesture(hp), talking: true, lookAt: jotaro });
  await sayLines(seq, HEAVEN_SCENE.slice(3, 4));
  // then over the kneeling Jotaro's shoulder, The World Over Heaven looming behind its user
  const o = clearShot(game, [ots(jotaro, hp, 1, 2.4), ots(jotaro, hp, -1, 2.4), closeUp(hp, jotaro, -1, 2.6)]);
  seq.shot({ from: o.pos, to: o.pos.clone().lerp(o.look, 0.08), look: o.look, dur: 6, fov: 36 });
  perform(hp, { gesture: nextGesture(hp), talking: true, lookAt: jotaro });
  perform(jotaro, { lookAt: hp });
  await sayLines(seq, HEAVEN_SCENE.slice(4));
  stopPerform(hp); stopPerform(jotaro);
  hp.override = null;
  jotaro.override = null;
  game.weather.strikeRate = 2;
  fx.uHeaven.value = 0.25;
}

export async function endingCinematic(game, seq, { player, jotaro, flags }) {
  const fx = game.engine.fx;
  audio.setMusic('heaven');
  jotaro.override = (t) => Poses.defeated(1);
  player.override = (t) => Poses.idle(t, 'dio');
  const mid = player.pos.clone().lerp(jotaro.pos, 0.5);
  seq.cut(mid.clone().add(V(4, 1.6, 3)), mid.clone().add(V(0, 1, 0)), 38);
  await sayLines(seq, ENDING.slice(0, 1));
  await conversation(seq, player, jotaro, ENDING.slice(1, 3));
  // rain stops mid-fall
  game._frozenWeather = true;
  audio.setFrozen(true);
  const c = player.chestWorld(new THREE.Vector3());
  seq.shot({ from: c.clone().add(V(0, 0, 6)), to: c.clone().add(V(0, 8, 14)), look: c, lookTo: c.clone().add(V(0, 30, -40)), dur: 8, fov: 44 });
  await sayLines(seq, ENDING.slice(3, 4));
  await seq.tween(3, (k) => { fx.uHeaven.value = 0.3 + k * 0.7; game.weather.heaven = 0.3 + k; fx.uSaturation.value = 1 - k * 0.5; });
  const variants = [];
  if (flags.speedwagon) variants.push(ENDING_VARIANTS.speedwagon[flags.speedwagon]);
  if (flags.vanilla) variants.push(ENDING_VARIANTS.vanilla[flags.vanilla]);
  if (flags.truth) variants.push(ENDING_VARIANTS.truth[flags.truth]);
  await sayLines(seq, variants.filter(Boolean));
  await sayLines(seq, ENDING.slice(4));
  seq.flash(0xffffff, 1, 2.5);
  await seq.fade(1, 2.5);
  fx.uSaturation.value = 1;
  fx.uHeaven.value = 0;
  game.weather.heaven = 0;
  game._frozenWeather = false;
  audio.setFrozen(false);
}
