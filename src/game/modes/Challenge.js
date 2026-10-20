import * as THREE from 'three';
import { ui, toast } from '../core/Store';
import { audio } from '../core/Audio';
import { Save, newProgress } from '../state/Save';
import { createFighter, BossBrain, ROSTER, addStoryBonus } from '../combat/Roster';
import { PlayerController } from '../actors/PlayerController';
import { arenaCenter } from './Versus';
import { MAIN_BOSSES, newRun, registerRun, submitRun, unlockAchievement, formatRunTime } from '../online/Progress';
import { Account } from '../online/Account';

// Boss rematches, single-boss time trials and Boss Rush (the ten Seal-bearers back to back).
// Reuses the story bosses, their arenas, their AI and their story health, with DIO carrying the
// Stand upgrades of the player's furthest journey. Nothing here reads or writes campaign saves:
// it runs on a throwaway profile and only records personal bests / Hall of Fame times.
//
// Optional modifiers (no-hit, two time stops per fight, aggressive bosses) are kept off the
// standard leaderboards.

export const BOSS_ARENAS = {
  avdol: { poi: 'arenaAvdol' }, kakyoin: { poi: 'arenaKakyoin' }, polnareff: { poi: 'arenaPolnareff' }, josuke: { poi: 'arenaJosuke' },
  kira: { poi: 'arenaKira' }, diavolo: { gulch: 'diavoloCanyon' }, giorno: { poi: 'arenaGiorno' }, valentine: { poi: 'arenaValentine' },
  pucci: { poi: 'arenaPucci' }, jotaro: { sanctum: true },
};

// bosses this player has beaten in any journey (rematches unlock as the story is played)
export function unlockedBosses() {
  const set = new Set(Account.profile?.stats?.bosses || []);
  for (const { data } of Save.list()) for (const k of data?.defeated || []) set.add(k);
  return MAIN_BOSSES.filter((k) => set.has(k));
}

function bestUpgrades() {
  let best = null;
  for (const { data } of Save.list()) if (data && (!best || (data.step || 0) > (best.step || 0))) best = data;
  return best?.upgrades || newProgress().upgrades;
}

export class ChallengeMode {
  constructor(game) {
    this.game = game;
    this.name = 'challenge';
    this.state = 'loading';
  }

  // cfg: { type: 'boss' | 'rush', bosses: [...], mods: { nohit, limitTs, aggro } }
  async start(cfg) {
    const g = this.game;
    this.cfg = cfg;
    this.list = cfg.type === 'rush' ? [...MAIN_BOSSES] : [cfg.bosses[0]];
    this.mods = cfg.mods || {};
    this.modded = !!(this.mods.nohit || this.mods.limitTs || this.mods.aggro);
    this.difficulty = g.settings?.difficulty || 'normal';
    g.progress = newProgress();
    g.progress.upgrades = { ...bestUpgrades() };
    this.splits = [];
    this.deaths = 0;
    this.totalMs = 0;
    this.index = 0;
    const dev = Save.sandboxed || !!g.dev;
    this.run = newRun({ difficulty: this.difficulty, dev });
    if (!this.modded) registerRun(this.run, cfg.type === 'rush' ? 'bossrush' : 'boss');
    ui.set({ loading: { label: cfg.type === 'rush' ? 'Boss Rush' : `Rematch · ${ROSTER[this.list[0]].name}`, progress: 0.3 } });
    const f = await createFighter(g, 'dio', { team: 0 });
    f.isPlayer = true;
    const u = g.progress.upgrades;
    f.hpMax = 360 + 40 * (u.vitality || 0); f.hp = f.hpMax;
    f.energyMax = 100 + 20 * (u.energy || 0);
    f.counterWindow = 0.2 + 0.06 * (u.counter || 0);
    if (f.kit) f.kit.rushCost = 13 * (1 - 0.18 * (u.rush || 0));
    this.player = f;
    g.player = f;
    g.addActor(f); g.combat.add(f);
    this.ctrl = new PlayerController(g, f, { allowHorse: false, allowInteract: false });
    f.onDeath = () => this.onPlayerDown();
    f.onDamaged = (d) => { if (d > 0) { this.hurt = true; if (this.mods.nohit && this.state === 'fight') this.failNoHit(); } };
    this._unsub = g.combat.on((ev) => { if (ev.type === 'playerTimeStop') this.tsUsed = (this.tsUsed || 0) + 1; });
    if (this.mods.limitTs && f.kit?.timeStop) {
      const orig = f.kit.timeStop.bind(f.kit);
      f.kit.timeStop = (...a) => { if ((this.tsUsed || 0) >= 2) { toast('Time stop limit reached for this fight.'); return false; } return orig(...a); };
    }
    ui.set({ screen: 'versus', overlay: null });
    g.input.setPointerLock(true);
    audio.setMusic('boss', 0.4);
    await this.loadBoss(0);
  }

  async loadBoss(i) {
    const g = this.game;
    this.state = 'loading';
    this.index = i;
    const key = this.list[i];
    if (this.boss) { g.removeActor(this.boss); this.boss = null; }
    for (const h of [...g.combat.hazards]) g.combat.removeHazard(h);
    for (const p of g.combat.projectiles) p.life = 0;
    g.time.end(true);
    ui.set({ loading: { label: `${this.cfg.type === 'rush' ? `Seal ${i + 1} of ${this.list.length} · ` : ''}${ROSTER[key].name}`, progress: 0.5 }, boss: null });
    await g.fadeOut(0.35);
    this.center = arenaCenter(BOSS_ARENAS[key]);
    const c = this.center;
    g.world.warm(c);
    const boss = await createFighter(g, key, { team: 1 });
    boss.hpMax = Math.round(boss.hpMax * (g.difficulty > 1 ? 1.15 : g.difficulty < 1 ? 0.75 : 1));
    boss.hp = boss.hpMax;
    const bp = c.clone().add(new THREE.Vector3(0, 0, -7));
    boss.pos.copy(bp); boss.pos.y = g.world.groundAt(bp.x, bp.z, bp.y + 3);
    const pp = c.clone().add(new THREE.Vector3(0, 0, 8));
    const pl = this.player;
    pl.revive(pl.hpMax); pl.energy = pl.energyMax; pl.stamina = pl.staminaMax; pl.tsCharge = 1;
    pl.pos.copy(pp); pl.pos.y = g.world.groundAt(pp.x, pp.z, pp.y + 3); pl.vel.set(0, 0, 0);
    pl.faceTowards(boss.pos, true); boss.faceTowards(pl.pos, true);
    if (pl.stand?.summoned) pl.stand.summon(false, true);
    g.addActor(boss); g.combat.add(boss);
    if (boss.kit.setupArena) boss.kit.setupArena(c);
    this.brain = new BossBrain(g, boss, { difficulty: g.difficulty * (this.mods.aggro ? 1.35 : 1), onPhase: (p) => this.onPhase(p) });
    addStoryBonus(boss, key);
    boss.onDeath = () => this.onBossDown();
    this.boss = boss;
    this.key = key;
    this.hurt = false;
    this.tsUsed = 0;
    this.bossMs = 0;
    g.camera.setTarget(pl);
    ui.set({ loading: null });
    g.fadeIn(0.5);
    this.state = 'intro';
    this.brain.enabled = false;
    ui.set({ announce: { text: ROSTER[key].name.toUpperCase(), sub: `「${ROSTER[key].standName}」${this.cfg.type === 'rush' ? ` · ${i + 1} / ${this.list.length}` : ''}` } });
    audio.play('stinger');
    await new Promise((r) => setTimeout(r, 1500));
    if (this.state !== 'intro') return;
    ui.set({ announce: { text: 'FIGHT', sub: '' } });
    setTimeout(() => { if (ui.get().announce?.text === 'FIGHT') ui.set({ announce: null }); }, 700);
    this.brain.enabled = true;
    this.state = 'fight';
  }

  onPhase(p) {
    const b = this.boss;
    if (!b) return;
    this.game.vfx.aura(b.chestWorld(new THREE.Vector3()), ROSTER[this.key].aura, 1.4);
    audio.play('stinger');
    if (this.key === 'polnareff' && p === 3) b.kit.armorRelease?.();
  }

  failNoHit() {
    this.state = 'over';
    this.brain.enabled = false;
    ui.set({ announce: { text: 'HIT', sub: 'No-hit challenge failed' } });
    setTimeout(() => this.finish(false), 1400);
  }

  async onBossDown() {
    if (this.state !== 'fight') return;
    this.state = 'down';
    this.brain.enabled = false;
    const g = this.game;
    g.slowMo(0.25, 1.2);
    const key = this.key;
    const ms = Math.round(this.bossMs);
    this.splits.push({ key, ms, at: Math.round(this.totalMs), noHit: !this.hurt });
    if (!this.hurt) unlockAchievement('untouched');
    const bestKey = `boss:${key}:${this.difficulty}${this.modded ? ':mod' : ''}`;
    const isPb = Account.recordBest(bestKey, ms) || this._localBest(bestKey, ms);
    ui.set({ announce: { text: 'SEAL BROKEN', sub: `${formatRunTime(ms)}${isPb ? ' · personal best' : ''}` } });
    await new Promise((r) => setTimeout(r, 1800));
    ui.set({ announce: null });
    if (this.index + 1 < this.list.length) { await this.loadBoss(this.index + 1); return; }
    this.finish(true);
  }

  _localBest(key, ms) {
    const cur = Save.raw(`meta.pb.${key}`);
    if (cur && cur.ms <= ms) return false;
    Save.writeRaw(`meta.pb.${key}`, { ms, at: Date.now() });
    return true;
  }

  async onPlayerDown() {
    if (this.state !== 'fight') return;
    this.deaths += 1;
    if (this.cfg.type === 'rush') {
      // Boss Rush: the clock keeps running; the fight restarts
      this.state = 'down';
      ui.set({ announce: { text: 'RETRY', sub: `Deaths: ${this.deaths}` } });
      await new Promise((r) => setTimeout(r, 1500));
      ui.set({ announce: null });
      await this.loadBoss(this.index);
      return;
    }
    this.state = 'over';
    this.brain.enabled = false;
    setTimeout(() => this.finish(false), 1500);
  }

  async finish(cleared) {
    const g = this.game;
    this.state = 'done';
    this.brain && (this.brain.enabled = false);
    const total = Math.round(this.totalMs);
    const rush = this.cfg.type === 'rush';
    let submit = null;
    let isPb = false;
    if (cleared) {
      if (rush) {
        unlockAchievement('bossrush');
        Account.updateProfile((p) => { p.stats.bossrush = (p.stats.bossrush || 0) + 1; });
        isPb = Account.recordBest(`bossrush:${this.difficulty}${this.modded ? ':mod' : ''}`, total) || this._localBest(`bossrush:${this.difficulty}`, total);
      }
      this.run.done = true;
      this.run.finishMs = rush ? total : this.splits[0]?.ms;
      this.run.deaths = this.deaths;
      this.run.splits = Object.fromEntries(this.splits.map((s) => [s.key, s.at + s.ms]));
      if (!this.modded) {
        const r = await submitRun(this.run, { category: rush ? 'bossrush' : `boss:${this.list[0]}`, extra: { bosses: this.splits.length } });
        submit = r.ok ? 'ok' : r.reason;
      } else submit = 'Challenge modifiers are on: this run is not ranked.';
    }
    ui.set({
      overlay: 'challengeResults',
      challengeResults: { cleared, rush, total, deaths: this.deaths, splits: this.splits, difficulty: this.difficulty, submit, isPb, mods: this.mods, boss: this.list[0] },
    });
    g.overlayOpen = true;
    g.input.setPointerLock(false);
  }

  update(dt, realDt) {
    if (this.state === 'fight' || this.state === 'down' || this.state === 'intro') {
      if (this.state === 'fight') { this.bossMs += realDt * 1000; this.totalMs += realDt * 1000; } else if (this.cfg.type === 'rush' && this.state !== 'done') this.totalMs += realDt * 1000;
      this.ctrl.update(dt, realDt);
      this.brain?.update(dt);
      const c = this.center;
      for (const f of [this.player, this.boss]) {
        if (!f || !c) continue;
        const d = Math.hypot(f.pos.x - c.x, f.pos.z - c.z);
        const R = this.key === 'diavolo' ? 50 : 40;
        if (d > R) { f.pos.x = c.x + (f.pos.x - c.x) / d * R; f.pos.z = c.z + (f.pos.z - c.z) / d * R; }
        if (f.pos.y < c.y - 8 && !f.dead) { f.pos.copy(c).add(new THREE.Vector3(0, 0.5, f === this.player ? 6 : -6)); f.vel.set(0, 0, 0); f.group.visible = true; }
      }
    }
  }

  publishHud() {
    const f = this.player; const b = this.boss;
    if (!f) return;
    ui.set({
      hud: { hp: Math.round(f.hp), hpMax: f.hpMax, energy: Math.round(f.energy), energyMax: f.energyMax, stamina: Math.round(f.stamina), ts: f.tsCharge ?? null, stand: !!f.stand?.summoned },
      boss: b && this.state !== 'loading' ? { name: ROSTER[this.key].name, stand: ROSTER[this.key].standName, hp: Math.round(b.hp), hpMax: b.hpMax, phase: this.brain?.phase || 1, phases: (this.brain?.thresholds?.length || 0) + 1, color: ROSTER[this.key].color } : null,
      challenge: { timer: this.cfg.type === 'rush' ? this.totalMs : this.bossMs, index: this.index, count: this.list.length, deaths: this.deaths, rush: this.cfg.type === 'rush', mods: this.mods },
    });
  }

  dispose() {
    const g = this.game;
    this._unsub?.();
    g.player = null;
    ui.set({ challenge: null, challengeResults: null, boss: null, announce: null });
  }
}
