import * as THREE from 'three';
import { Character } from '../actors/Character';
import { Stand } from '../actors/Stand';
import { TheWorldKit, HeavenKit } from './kits/TheWorld';
import { MagiciansRedKit, HierophantKit, SilverChariotKit, StarPlatinumKit } from './kits/Stardust';
import { CrazyDiamondKit, KillerQueenKit } from './kits/Diamond';
import { KingCrimsonKit, GoldExperienceKit } from './kits/Golden';
import { D4CKit, CMoonKit } from './kits/SBR';
import { EmperorKit, CreamKit, GebKit, BastetKit } from './kits/Support';
import { SIGNATURE } from '../anim/Poses';

// Every playable/boss fighter. hp: campaign boss HP; vhp: Versus HP.
export const ROSTER = {
  dio: { name: 'DIO', part: 'dio', stand: 'theWorld', standName: 'The World', kit: TheWorldKit, hp: 260, vhp: 300, power: 1, speed: 4.4, aura: 0xffd34d, color: '#ffd34d', style: 'dio' },
  dioHeaven: { name: 'DIO (Heaven Ascension)', part: 'dioHeaven', stand: 'theWorld', standName: 'The World Over Heaven', standTint: { color: 0xf4f6ff, amount: 0.8, emissive: 0xb89a50, emissiveIntensity: 0.55 }, kit: HeavenKit, hp: 360, vhp: 340, power: 1.25, speed: 4.8, aura: 0xfff2c8, color: '#fff2c8', style: 'dio' },
  avdol: { name: 'Muhammad Avdol', part: 'avdol', stand: 'magiciansRed', standName: "Magician's Red", kit: MagiciansRedKit, hp: 520, vhp: 290, power: 1, speed: 4, aura: 0xff6a20, color: '#ff8a40', boss: { style: 'medium', keep: [7, 12], phases: [0.66, 0.33] } },
  kakyoin: { name: 'Noriaki Kakyoin', part: 'kakyoin', stand: 'hierophant', standName: 'Hierophant Green', kit: HierophantKit, hp: 560, vhp: 270, power: 1, speed: 4.4, aura: 0x3cff8a, color: '#5cffa0', boss: { style: 'far', keep: [12, 19], phases: [0.66, 0.33] } },
  polnareff: { name: 'Jean Pierre Polnareff', part: 'polnareff', stand: null, standName: 'Silver Chariot', kit: SilverChariotKit, hp: 600, vhp: 280, power: 1, speed: 5, aura: 0xcfe0ff, color: '#d8e6ff', boss: { style: 'close', keep: [1.6, 3.5], phases: [0.66, 0.33] } },
  josuke: { name: 'Josuke Higashikata', part: 'josuke', stand: 'crazyDiamond', standName: 'Crazy Diamond', kit: CrazyDiamondKit, hp: 660, vhp: 300, power: 1.05, speed: 4.6, aura: 0xff8ad8, color: '#ff9ae0', boss: { style: 'close', keep: [1.5, 2.6], phases: [0.66, 0.33] } },
  kira: { name: 'Yoshikage Kira', part: 'kira', stand: 'killerQueen', standName: 'Killer Queen', kit: KillerQueenKit, hp: 680, vhp: 280, power: 1, speed: 4.4, aura: 0xff7ab8, color: '#ff8ac0', boss: { style: 'skirmish', keep: [7, 14], phases: [0.7, 0.4, 0.15] } },
  diavolo: { name: 'Diavolo', part: 'diavolo', stand: 'kingCrimson', standName: 'King Crimson', kit: KingCrimsonKit, hp: 720, vhp: 300, power: 1.1, speed: 4.6, aura: 0xff2a3a, color: '#ff5060', boss: { style: 'medium', keep: [2.5, 6], phases: [0.66, 0.33] } },
  giorno: { name: 'Giorno Giovanna', part: 'giorno', stand: 'goldExperience', standName: 'Gold Experience', kit: GoldExperienceKit, hp: 740, vhp: 290, power: 1.05, speed: 4.6, aura: 0xffd040, color: '#ffe060', boss: { style: 'skirmish', keep: [3, 9], phases: [0.66, 0.33] } },
  valentine: { name: 'Funny Valentine', part: 'valentine', stand: 'd4c', standName: 'D4C', kit: D4CKit, hp: 780, vhp: 300, power: 1.1, speed: 4.5, aura: 0x9fd8ff, color: '#b0e0ff', boss: { style: 'skirmish', keep: [3, 10], phases: [0.66, 0.33] } },
  pucci: { name: 'Enrico Pucci', part: 'pucci', stand: 'cmoon', standName: 'C-Moon', kit: CMoonKit, hp: 820, vhp: 300, power: 1.1, speed: 4.5, aura: 0x6aff7a, color: '#8aff9a', boss: { style: 'medium', keep: [4, 9], phases: [0.66, 0.33] } },
  jotaro: { name: 'Jotaro Kujo', part: 'jotaro', stand: 'starPlatinum', standName: 'Star Platinum', kit: StarPlatinumKit, hp: 900, vhp: 310, power: 1.15, speed: 4.7, aura: 0x8f7cff, color: '#a99cff', boss: { style: 'close', keep: [1.6, 3], phases: [0.75, 0.5, 0.25] } },
  holHorse: { name: 'Hol Horse', part: 'holHorse', stand: null, standName: 'Emperor', kit: EmperorKit, hp: 300, vhp: 240, power: 1, speed: 4.6, aura: 0xffe0a0, color: '#ffe0a0', boss: { style: 'far', keep: [9, 16], phases: [0.5] } },
  vanillaIce: { name: 'Vanilla Ice', part: 'vanillaIce', stand: null, standName: 'Cream', kit: CreamKit, hp: 420, vhp: 270, power: 1.1, speed: 4.4, aura: 0x9a6aff, color: '#b08aff', boss: { style: 'medium', keep: [5, 12], phases: [0.5] } },
  ndoul: { name: "N'Doul", part: 'ndoul', stand: null, standName: 'Geb', kit: GebKit, hp: 300, vhp: 240, power: 1, speed: 3.8, aura: 0x4ab8ff, color: '#6ac8ff', boss: { style: 'far', keep: [10, 20], phases: [0.5] } },
  mariah: { name: 'Mariah', part: 'mariah', stand: null, standName: 'Bastet', kit: BastetKit, hp: 280, vhp: 230, power: 1, speed: 4.8, aura: 0x6a8aff, color: '#8aa0ff', boss: { style: 'skirmish', keep: [5, 12], phases: [0.5] } },
};

export const VERSUS_ROSTER = ['dio', 'dioHeaven', 'avdol', 'kakyoin', 'polnareff', 'josuke', 'kira', 'diavolo', 'giorno', 'valentine', 'pucci', 'jotaro', 'holHorse', 'vanillaIce', 'ndoul', 'mariah'];

export async function createFighter(game, key, { team = 1, versus = false, hp = null } = {}) {
  const r = ROSTER[key];
  const f = new Character(game, { id: key + (team === 0 ? '_p' : '_e'), partKey: r.part, name: r.name, team, hp: hp ?? (versus ? r.vhp : r.hp), power: r.power, speed: r.speed, style: r.style || 'neutral', energy: 100 });
  f.rosterKey = key;
  f.roster = r;
  // signature body language (DIO keeps his own 'dio' idle style)
  if (SIGNATURE[key]) f.idlePose = SIGNATURE[key];
  await f.load();
  // afterimage pools are built with the fighter so their shaders are compiled by prewarm
  game.vfx?.afterimages.prepare(f, 2);
  if (r.stand) {
    const s = new Stand(game, f, { partKey: r.stand, name: r.standName, aura: r.aura, tint: r.standTint || null });
    await s.load();
    f.stand = s;
    game.vfx?.afterimages.prepare(s, 4);
  }
  f.kit = new r.kit(f, game);
  return f;
}

// ------------------------------------------------------------------------------------- brain
const _pv = new THREE.Vector3();
const _ps = new THREE.Vector3();

export class BossBrain {
  constructor(game, f, { difficulty = 1, phases = null, onPhase = null, style = null, keep = null, poiseScale = 1 } = {}) {
    this.game = game;
    this.f = f;
    this.kit = f.kit;
    const b = f.roster?.boss || { style: 'medium', keep: [3, 8], phases: [0.5] };
    this.style = style || b.style;
    this.keep = keep || b.keep;
    this.thresholds = phases || b.phases;
    this.phase = 1;
    this.onPhase = onPhase;
    this.difficulty = difficulty;
    this.think = 1.2;
    this.strafeDir = 1;
    this.strafeT = 0;
    this.used = {};
    this.enabled = true;
    this.reactCool = 0;
    this.punishCool = 0;
    this.guardT = 0;
    this.lastHp = f.hp;
    // AI perfect counters are rare (a short window), more common on harder phases/difficulty
    f.counterWindow = 0.04 + 0.02 * difficulty;
    // poise: how much punishment the boss absorbs before staggering (close-range fighters are sturdier)
    f.poiseMax = ({ close: 36, medium: 30, skirmish: 26, far: 22 }[this.style] ?? 28) * (0.8 + 0.2 * difficulty) * poiseScale;
    f.poise = f.poiseMax;
    this.poiseBase = f.poiseMax;
    // Diavolo as an opponent hits 35% harder (his blows are meant to be the most punishing in the game)
    if (f.rosterKey === 'diavolo') f.damageBonus = 1.35;
    // every AI opponent (bosses, quest duels, Versus CPU) fights with 40 extra health
    f.hpMax += 40;
    f.hp = Math.min(f.hpMax, f.hp + 40);
    this.lastHp = f.hp;
    // what the AI has learned about the player this fight
    this.read = { guards: 0, attacks: 0, dodges: 0, lastSeen: null };
    this.projCool = 0;
    this.comboN = 0;
  }

  // back to the opening of the fight (used by a rematch after the player dies)
  reset() {
    this.phase = 1;
    this.kit.phase = 1;
    this.f.poiseMax = this.poiseBase;
    this.f.poise = this.poiseBase;
    this.used = {};
    this.think = 1.2;
    this.reactCool = 0;
    this.punishCool = 0;
    this.guardT = 0;
    this.lastHp = this.f.hp;
    this.read = { guards: 0, attacks: 0, dodges: 0, lastSeen: null };
    this.comboN = 0;
  }

  // Track the player's habits (decaying counts): how often they guard, attack and dodge, so the AI
  // can answer a turtle with guard breaks, an aggressive player with guards/counters and a
  // dodger with delayed strikes.
  _observe(t, dt) {
    const r = this.read;
    const k = Math.exp(-dt / 6);
    r.guards *= k; r.attacks *= k; r.dodges *= k;
    const name = t.action?.def.name || null;
    if (t.guarding) r.guards += dt;
    if (name && name !== r.lastSeen) {
      if (name === 'dodge') r.dodges += 1;
      else if (/jab|punch|heavy|kb|rush|thrust|command|hook|upper|kick|knockback/.test(name)) r.attacks += 1;
    }
    r.lastSeen = name;
  }

  // Sidestep projectiles about to hit (knives, emeralds, bullets...), perpendicular to their flight.
  _evadeProjectiles() {
    if (this.projCool > 0) return false;
    const f = this.f;
    for (const p of this.game.combat.projectiles) {
      if (p.team === f.team || p.life <= 0) continue;
      const rel = _pv.copy(f.pos).sub(p.pos); rel.y = 0;
      const dist = rel.length();
      const sp = Math.hypot(p.vel.x, p.vel.z);
      if (dist > 9 || sp < 4) continue;
      // closing in, and the line of flight passes within reach
      const along = (rel.x * p.vel.x + rel.z * p.vel.z) / sp;
      if (along <= 0 || along / sp > 0.5) continue;
      const miss = Math.abs(rel.x * p.vel.z - rel.z * p.vel.x) / sp;
      if (miss > 1.1 + (p.radius || 0.3)) continue;
      this.projCool = 0.9;
      if (Math.random() > 0.45 + 0.3 * this.difficulty) return false;
      const side = _ps.set(-p.vel.z, 0, p.vel.x).normalize();
      if (side.dot(rel) < 0) side.negate();
      if (this.kit.dodge(side.clone())) return true;
      if (!this.kit.rushing) { this.kit.guard(true); this.guardT = 0.35; return true; }
    }
    return false;
  }

  get clock() { return this.game.clock; }

  setPhaseFromHp() {
    const frac = this.f.hp / this.f.hpMax;
    let p = 1;
    for (const t of this.thresholds) if (frac <= t) p += 1;
    if (p > this.phase) {
      this.phase = p;
      this.kit.phase = p;
      this.f.poiseMax += 6;
      if (this.onPhase) this.onPhase(p);
    }
  }

  update(dt) {
    const f = this.f;
    if (!this.enabled || f.dead || this.game.inCinematic || f.isFrozen()) { if (this.f.kit.rushing && this.game.inCinematic) this.f.kit.rush(false, dt); return; }
    this.kit.phase = this.phase;
    this.setPhaseFromHp();
    const t = this.kit.target();
    if (!t) { f.steer(0, 0, dt); return; }
    const d = f.distanceTo(t);
    this._observe(t, dt);
    this.projCool -= dt;
    // sustained rush
    if (this.kit.rushing) {
      this.kit.aiRushT = (this.kit.aiRushT || 0) - dt;
      this.kit.rush(this.kit.aiRushT > 0 && d < 3.2, dt);
      f.steer(0, 0, dt);
      return;
    }
    // holding a reactive guard
    if (this.guardT > 0) {
      this.guardT -= dt;
      if (this.guardT <= 0 || f.stun > 0) { this.guardT = 0; this.kit.guard(false); } else { f.faceTowards(t.pos); f.steer(0, 0, dt); return; }
    }
    if (f.busy()) { if (!f.action?.def.move && !f.action?.def.tick) f.steer(0, 0, dt); return; }
    if (this._evadeProjectiles()) return;

    // reactions to the player's offence (their own strike or their Stand's): dodge or guard
    this.reactCool -= dt;
    this.punishCool -= dt;
    const tDef = t.action?.def;
    const sAct = t.stand?.action; const sDef = sAct?.def;
    const threat = (tDef && (tDef.clip?.active || /jab|punch|heavy|kb|rush|thrust|rb|ovr|command|knockback/.test(tDef.name)))
      || (sDef && (sDef.clip?.active || sDef.rush));
    if (threat && d < 5 && this.reactCool <= 0 && !f.rootedUntil) {
      // reads: an aggressive player gets blocked more; a guard-breaking blow is dodged, not blocked;
      // when hurt the AI plays safer
      const aggro = Math.min(1, this.read.attacks / 6);
      const hurt = f.hp / f.hpMax < 0.35 ? 1.35 : 1;
      const breaker = !!(tDef && (/heavy|kb|knockback|command/.test(tDef.name))) || t.action?.opts?.guardBreak;
      let dodgeP = (0.1 + 0.05 * this.phase) * this.difficulty * (this.style === 'far' ? 1.6 : 1) * hurt;
      let guardP = ({ close: 0.3, medium: 0.23, skirmish: 0.17, far: 0.1 }[this.style] ?? 0.2) * this.difficulty * (0.75 + 0.15 * this.phase) * (1 + aggro * 0.6) * hurt;
      if (breaker) { dodgeP += guardP * 0.7; guardP *= 0.3; }
      const r = Math.random();
      if (r < dodgeP) {
        const side = f.forward().applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
        if (this.style === 'far') side.add(f.forward().multiplyScalar(-1));
        this.kit.dodge(side);
        this.reactCool = 1.4 / this.difficulty;
        return;
      }
      if (r < dodgeP + guardP && !this.kit.rushing) {
        this.kit.guard(true);
        this.guardT = 0.45 + Math.random() * 0.4;
        this.reactCool = 1.1 / this.difficulty;
        return;
      }
      this.reactCool = 0.3;
    }
    // punish: the player's Stand (or the player) is stuck in recovery after a whiffed or blocked blow
    const recovering = (sDef?.clip?.active && sAct.t / sDef.dur > sDef.clip.active[1]) || (tDef?.clip?.active && t.action.t / tDef.dur > tDef.clip.active[1]);
    const whiffed = recovering || (t.action?.def.name === 'dodge' && t.action.t > 0.25);
    if (whiffed && d < 4.2 && !(t.invuln > 0.1) && this.punishCool <= 0 && Math.random() < 0.55 * this.difficulty) {
      this.punishCool = 1.2;
      if ((this.phase >= 2 && this.kit.heavy()) || this.kit.light()) { this.think = 0.35; return; }
    }

    // movement: keep the preferred distance band, strafe inside it
    f.faceTowards(t.pos);
    const [lo, hi] = this.keep;
    const toT = t.pos.clone().sub(f.pos).setY(0).normalize();
    const side = new THREE.Vector3(-toT.z, 0, toT.x);
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeT = 1.5 + Math.random() * 2.5; this.strafeDir = Math.random() < 0.5 ? -1 : 1; }
    let vx = 0; let vz = 0;
    const sp = f.moveSpeed * (f.slowUntil > this.clock ? 0.5 : 1);
    let [bandLo, bandHi] = [lo, hi];
    // hurt and being pressed: give ground; the player hurt: close in for the kill
    if (f.hp / f.hpMax < 0.3 && this.read.attacks > 3) { bandLo += 1.5; bandHi += 2; }
    if (t.hp / t.hpMax < 0.25) { bandLo = Math.max(0.8, bandLo - 1); bandHi = Math.max(bandLo + 1, bandHi - 2); }
    if (d > bandHi) { vx = toT.x * sp; vz = toT.z * sp; } else if (d < bandLo) { vx = -toT.x * sp * 0.85; vz = -toT.z * sp * 0.85; }
    // circle toward the player's back while they are committed to an action
    let strafe = 0.45;
    if (t.busy?.() && d < 6) {
      const tf = t.forward();
      const behind = side.dot(tf) > 0 ? -1 : 1;
      this.strafeDir = behind;
      strafe = 0.75;
    }
    vx += side.x * sp * strafe * this.strafeDir;
    vz += side.z * sp * strafe * this.strafeDir;
    if (f.rootedUntil > this.clock) { vx = 0; vz = 0; }
    f.steer(vx, vz, dt, 10);

    // decide
    this.think -= dt;
    if (this.think > 0) return;
    // don't waste blows on a target that is rising from the ground (invulnerable)
    if (t.invuln > 0.15) { this.think = 0.15; return; }
    // keep a string going while the target is reeling
    const chaining = t.stun > 0 && this.kit.lastAttackT > this.clock - 0.6;
    this.think = chaining ? 0.16 : (0.9 - this.phase * 0.12) / (0.6 + this.difficulty * 0.4) * (0.7 + Math.random() * 0.6);
    // Stand users strike from further away now that their Stand lunges to the target
    const lunge = f.stand ? 1.4 : 0;
    const opts = this.kit.abilities.filter((a) => {
      const max = a.max + (/^(light|heavy|knock|kb|rush)$/.test(a.name) ? lunge : 0);
      return (a.phase || 1) <= this.phase && d >= a.min && d <= max && (this.used[a.name] || 0) <= this.clock && !(f.overwritten && a.name !== 'light')
        && (!chaining || a.name === 'light' || a.name === 'heavy');
    });
    if (!opts.length) return;
    // a blocking player is cracked open with heavies / specials, not fed light jabs; a player
    // who dodges a lot is waited out (strike slightly later); a staggered player gets the finisher
    const turtling = t.guarding || this.read.guards > 1.5;
    const weightOf = (a) => {
      let w = a.weight;
      const light = a.name === 'light';
      const big = /heavy|kb|knock|precision|prec|conc|shot|fence|splash|crossfire/.test(a.name);
      if (turtling) { if (light) w *= 0.25; if (big) w *= 2.4; }
      if (chaining && this.comboN >= 2 && a.name === 'heavy') w *= 3;
      if (t.stun > 0.4 && big) w *= 1.6;
      return w;
    };
    if (!chaining) this.comboN = 0;
    if (this.read.dodges > 2 && !chaining && Math.random() < 0.3) { this.think = 0.25; return; }
    let total = 0;
    for (const a of opts) total += weightOf(a);
    let r = Math.random() * total;
    for (const a of opts) {
      r -= weightOf(a);
      if (r <= 0) {
        const ok = a.fn();
        if (ok) { this.used[a.name] = this.clock + a.cool / Math.max(0.5, this.difficulty); this.comboN += 1; }
        break;
      }
    }
  }
}
