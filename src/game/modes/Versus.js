import * as THREE from 'three';
import { ui, toast } from '../core/Store';
import { audio } from '../core/Audio';
import { Save, newProgress } from '../state/Save';
import { createFighter, BossBrain, ROSTER } from '../combat/Roster';
import { PlayerController } from '../actors/PlayerController';
import { resolvePOI, roadX, heightAt, GULCHES } from '../world/Terrain';
import { SANCTUARY } from '../world/Layout';

// Standalone CPU duels. Uses its own throwaway progress profile; campaign saves are untouched.

export const ARENAS = [
  { id: 'street', name: 'Ebon Crossing · Main Street', poi: 'arenaAvdol' },
  { id: 'courtyard', name: 'Ashgrove Courtyard', poi: 'arenaPolnareff' },
  { id: 'bridge', name: 'Canyon Rail Bridge', gulch: 'diavoloCanyon' },
  { id: 'estate', name: 'Verdant Estate', poi: 'arenaGiorno' },
  { id: 'cloister', name: 'Inverted Cloister', poi: 'arenaPucci' },
  { id: 'sanctum', name: "Heaven's Reach Sanctum", sanctum: true },
];

export const DIFFICULTIES = { easy: 0.6, normal: 1, hard: 1.4 };

function arenaCenter(a) {
  if (a.gulch) { const g = GULCHES.find((q) => q.id === a.gulch); return new THREE.Vector3(g.x, g.deckY, g.z); }
  if (a.sanctum) return new THREE.Vector3(SANCTUARY.x, SANCTUARY.y || heightAt(SANCTUARY.x, SANCTUARY.z), SANCTUARY.z);
  const q = resolvePOI(a.poi);
  const x = roadX(q.z) + (q.side || 0);
  return new THREE.Vector3(x, heightAt(x, q.z), q.z);
}

export class VersusMode {
  constructor(game) {
    this.game = game;
    this.name = 'versus';
    this.round = 1;
    this.wins = [0, 0];
    this.state = 'intro';
  }

  async start(sel) {
    const g = this.game;
    this.sel = sel;
    g.progress = newProgress();
    g.progress.upgrades = { ...g.progress.upgrades, tsDuration: 2, tsCooldown: 1, knives: true, tsAwareness: true };
    const arena = ARENAS.find((a) => a.id === sel.arena) || ARENAS[0];
    this.arena = arena;
    this.center = arenaCenter(arena);
    ui.set({ loading: { label: arena.name, progress: 0.3 } });
    g.world.warm(this.center);
    this.p1 = await createFighter(g, sel.p1, { team: 0, versus: true });
    ui.set({ loading: { label: arena.name, progress: 0.6 } });
    this.p2 = await createFighter(g, sel.cpu, { team: 1, versus: true });
    for (const f of [this.p1, this.p2]) { g.addActor(f); g.combat.add(f); }
    this.p1.isPlayer = true;
    g.player = this.p1;
    this.ctrl = new PlayerController(g, this.p1, { allowHorse: false, allowInteract: false });
    // a duelist, not a boss: lighter poise so combos still reward the player
    this.brain = new BossBrain(g, this.p2, { difficulty: DIFFICULTIES[sel.difficulty] || 1, phases: [0.5], poiseScale: 0.55 });
    for (const f of [this.p1, this.p2]) if (f.kit.setupArena) f.kit.setupArena(this.center);
    if (this.p1.kit.onFinisher === undefined && this.p1.rosterKey === 'dioHeaven') this.p1.kit.onFinisher = null;
    this.p1.onDeath = () => this.onKO(1);
    this.p2.onDeath = () => this.onKO(0);
    g.camera.setTarget(this.p1);
    ui.set({ screen: 'versus', loading: null, overlay: null });
    g.input.setPointerLock(true);
    audio.setMusic('versus', 0.5);
    audio.setWeather(1, 0.8);
    g.fadeIn(0.8);
    await this.beginRound();
  }

  place() {
    const g = this.game;
    const c = this.center;
    const along = this.arena.gulch ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 0, 1);
    const a = c.clone().addScaledVector(along, 6); const b = c.clone().addScaledVector(along, -6);
    for (const [f, p] of [[this.p1, a], [this.p2, b]]) {
      f.revive(f.hpMax);
      f.energy = f.energyMax;
      f.stamina = f.staminaMax;
      f.tsCharge = 1;
      f.pos.copy(p); f.pos.y = g.world.groundAt(p.x, p.z, p.y + 3);
      f.vel.set(0, 0, 0);
      f.cancelAction();
      f.overwritten = false; f.overwrite = 0;
      if (f.stand?.summoned) f.stand.summon(false, true);
    }
    this.p1.faceTowards(this.p2.pos, true);
    this.p2.faceTowards(this.p1.pos, true);
    g.camera.setTarget(this.p1);
  }

  async beginRound() {
    const g = this.game;
    g.time.end(true);
    for (const h of [...g.combat.hazards]) if (!h.persistent && !h.owner) g.combat.removeHazard(h);
    for (const p of g.combat.projectiles) p.life = 0;
    this.place();
    this.state = 'intro';
    this.brain.enabled = false;
    const side = new THREE.Vector3(1, 0, 0);
    const mid = this.p1.pos.clone().lerp(this.p2.pos, 0.5);
    g.camera.setCinematic(mid.clone().addScaledVector(side, 9).add(new THREE.Vector3(0, 2.4, 0)), mid.clone().add(new THREE.Vector3(0, 1.2, 0)), 46);
    g.inCinematic = true;
    ui.set({ announce: { text: `ROUND ${this.round}`, sub: `${ROSTER[this.sel.p1].name}  vs  ${ROSTER[this.sel.cpu].name}` } });
    audio.play('stinger');
    await new Promise((r) => setTimeout(r, 1600));
    ui.set({ announce: { text: 'FIGHT', sub: '' } });
    audio.play('heavyHit');
    g.camera.toGameplay(0.6);
    g.inCinematic = false;
    this.brain.enabled = true;
    this.state = 'fight';
    this.timer = 99;
    setTimeout(() => ui.set({ announce: null }), 800);
  }

  async onKO(winner) {
    const g = this.game;
    if (this.state !== 'fight') return;
    // dev combat arena: no rounds, the fallen fighter simply gets back up
    if (this.sel.dev) {
      const f = winner === 0 ? this.p2 : this.p1;
      setTimeout(() => { f.revive(f.hpMax); f.energy = f.energyMax; }, 1200);
      return;
    }
    this.state = 'ko';
    this.brain.enabled = false;
    g.slowMo(0.25, 1.5);
    g.camera.shake(0.9);
    ui.set({ announce: { text: 'K.O.', sub: winner === 0 ? ROSTER[this.sel.p1].name : ROSTER[this.sel.cpu].name } });
    this.wins[winner] += 1;
    await new Promise((r) => setTimeout(r, 2400));
    if (this.wins[winner] >= 2) return this.endMatch(winner);
    this.round += 1;
    await this.beginRound();
  }

  endMatch(winner) {
    const g = this.game;
    this.state = 'done';
    const rec = Save.versusRecord();
    if (winner === 0) rec.wins += 1; else rec.losses += 1;
    rec.last = { p1: this.sel.p1, cpu: this.sel.cpu, won: winner === 0, at: Date.now() };
    Save.saveVersusRecord(rec);
    ui.set({ announce: null, overlay: 'results', versusResult: { winner, p1: this.sel.p1, cpu: this.sel.cpu, wins: [...this.wins], record: rec } });
    g.overlayOpen = true;
    g.input.setPointerLock(false);
  }

  async rematch() {
    const g = this.game;
    ui.set({ overlay: null });
    g.overlayOpen = false;
    this.round = 1;
    this.wins = [0, 0];
    g.input.setPointerLock(true);
    await this.beginRound();
  }

  update(dt, realDt) {
    if (this.state === 'fight' || this.state === 'ko') {
      this.ctrl.update(dt, realDt);
      this.brain.update(dt);
      // ring out guard
      for (const f of [this.p1, this.p2]) {
        const d = Math.hypot(f.pos.x - this.center.x, f.pos.z - this.center.z);
        if (d > 30) { const k = 30 / d; f.pos.x = this.center.x + (f.pos.x - this.center.x) * k; f.pos.z = this.center.z + (f.pos.z - this.center.z) * k; }
        if (f.pos.y < this.center.y - 10) { f.pos.copy(this.center); this.game.combat.applyHit(f, f === this.p1 ? this.p2 : this.p1, { damage: 20, kind: 'special', unblockable: true, noCounter: true }); }
      }
      if (this.state === 'fight' && !this.sel.dev) {
        this.timer -= realDt;
        if (this.timer <= 0) {
          const w = this.p1.hp / this.p1.hpMax >= this.p2.hp / this.p2.hpMax ? 0 : 1;
          (w === 0 ? this.p2 : this.p1).die();
        }
      }
    }
  }

  publishHud() {
    const f1 = this.p1; const f2 = this.p2;
    if (!f1 || !f2) return;
    const pack = (f) => ({ name: f.roster.name, stand: f.roster.standName, hp: Math.round(f.hp), hpMax: f.hpMax, energy: Math.round(f.energy), energyMax: f.energyMax, ts: f.tsCharge ?? null, color: f.roster.color, overwritten: !!f.overwritten });
    ui.set({ versus: { p1: pack(f1), p2: pack(f2), round: this.round, wins: [...this.wins], timer: Math.max(0, Math.ceil(this.timer || 0)) }, hud: { hp: Math.round(f1.hp), hpMax: f1.hpMax, energy: Math.round(f1.energy), energyMax: f1.energyMax, stamina: Math.round(f1.stamina), ts: f1.tsCharge ?? null, stand: !!f1.stand?.summoned, versus: true } });
  }

  dispose() {
    const g = this.game;
    g.player = null;
    ui.set({ versus: null, announce: null, versusResult: null });
    void toast;
  }
}
