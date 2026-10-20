import * as THREE from 'three';
import { ui, toast } from '../core/Store';
import { audio } from '../core/Audio';
import { Save, newProgress } from '../state/Save';
import { createFighter, BossBrain, ROSTER } from '../combat/Roster';
import { PlayerController } from '../actors/PlayerController';
import { resolvePOI, roadX, heightAt, GULCHES } from '../world/Terrain';
import { SANCTUARY } from '../world/Layout';
import { RemoteInput, encodeFrame } from '../net/Net';
import { unlockAchievement, statAdd } from '../online/Progress';
import { Account } from '../online/Account';

// Standalone duels: against the CPU, or online against another player (sel.online).
// Uses its own throwaway progress profile; campaign saves are untouched.
//
// Online model: both machines simulate the whole duel. Each player is authoritative over their
// own fighter's movement and meters and streams their inputs every frame; the other machine
// replays those inputs on a RemoteInput (so attacks, Stands and effects play out identically) and
// eases the fighter toward the reported position. The host is authoritative over health,
// knockouts, the round timer and the match flow.

export const ARENAS = [
  { id: 'street', name: 'Ebon Crossing · Main Street', poi: 'arenaAvdol' },
  { id: 'courtyard', name: 'Ashgrove Courtyard', poi: 'arenaPolnareff' },
  { id: 'bridge', name: 'Canyon Rail Bridge', gulch: 'diavoloCanyon' },
  { id: 'estate', name: 'Verdant Estate', poi: 'arenaGiorno' },
  { id: 'cloister', name: 'Inverted Cloister', poi: 'arenaPucci' },
  { id: 'sanctum', name: "Heaven's Reach Sanctum", sanctum: true },
];

export const DIFFICULTIES = { easy: 0.6, normal: 1, hard: 1.4 };
// Versus CPU opponents are tuned 25% above the story bosses at every difficulty: more health,
// harder hits, sharper reactions, faster meter and their ultimate (signature) far more often.
const CPU_BOOST = 1.25;

export function arenaCenter(a) {
  if (a.gulch) { const g = GULCHES.find((q) => q.id === a.gulch); return new THREE.Vector3(g.x, g.deckY, g.z); }
  if (a.sanctum) return new THREE.Vector3(SANCTUARY.x, SANCTUARY.y || heightAt(SANCTUARY.x, SANCTUARY.z), SANCTUARY.z);
  const q = resolvePOI(a.poi);
  const x = roadX(q.z) + (q.side || 0);
  return new THREE.Vector3(x, heightAt(x, q.z), q.z);
}

const _t = new THREE.Vector3();
const angleTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const NO_INPUT = { down: () => false, pressed: () => false, axes: { moveX: 0, moveY: 0 } };

export class VersusMode {
  constructor(game) {
    this.game = game;
    this.name = 'versus';
    this.round = 1;
    this.wins = [0, 0];
    this.state = 'intro';
    this.online = null;
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
    // online: the host fights as p1, the guest as p2; offline the player is always p1
    if (sel.online && g.net && !g.net.closed) {
      this.online = { role: sel.online.role, net: g.net, snapT: 0, snap: null, standMismatch: 0 };
    }
    const guest = this.online?.role === 'guest';
    this.local = guest ? this.p2 : this.p1;
    this.remote = guest ? this.p1 : this.p2;
    this.local.isPlayer = true;
    g.player = this.local;
    this.ctrl = new PlayerController(g, this.local, { allowHorse: false, allowInteract: false });
    if (this.online) {
      this.rin = new RemoteInput();
      this.remoteCtrl = new PlayerController(g, this.remote, { allowHorse: false, allowInteract: false, input: this.rin, remote: true });
      this.brain = null;
      this.remote.netRemote = true;
      if (guest) for (const f of [this.p1, this.p2]) f.netShadow = true;
      this.online.net.onClose = (reason) => this.onDisconnect(reason);
      this.online.net.setHandler((m) => this.onNet(m));
    } else {
      // a duelist, not a boss: lighter poise so combos still reward the player
      this.brain = new BossBrain(g, this.p2, { difficulty: DIFFICULTIES[sel.difficulty] || 1, phases: [0.5], poiseScale: 0.55 });
      const cpu = this.p2;
      cpu.hpMax = Math.round(cpu.hpMax * CPU_BOOST);
      cpu.hp = cpu.hpMax;
      cpu.damageBonus = (cpu.damageBonus || 1) * CPU_BOOST;
      cpu.kit.energyRegen *= CPU_BOOST;
      this.brain.difficulty *= CPU_BOOST;
      this.ultT = 5;
    }
    for (const f of [this.p1, this.p2]) if (f.kit.setupArena) f.kit.setupArena(this.center);
    if (this.p1.kit.onFinisher === undefined && this.p1.rosterKey === 'dioHeaven') this.p1.kit.onFinisher = null;
    if (!guest) {
      this.p1.onDeath = () => this.onKO(1);
      this.p2.onDeath = () => this.onKO(0);
    }
    g.camera.setTarget(this.local);
    ui.set({ screen: 'versus', loading: null, overlay: null });
    g.input.setPointerLock(true);
    audio.setMusic('versus', 0.5);
    audio.setWeather(1, 0.8);
    g.fadeIn(0.8);
    if (!this.online) { await this.beginRound(); return; }
    this.place();
    if (guest) {
      // the host starts each round; tell it we're loaded and wait
      this.online.net.send({ t: 'loaded' });
      if (this.state === 'intro' && !this.online.started) ui.set({ announce: { text: 'READY', sub: `Waiting for ${this.online.net.peerName || 'the host'}…` } });
      return;
    }
    ui.set({ announce: { text: 'READY', sub: `Waiting for ${this.online.net.peerName || 'your opponent'} to load…` } });
    const ok = await new Promise((resolve) => {
      if (this.online.peerLoaded) { resolve(true); return; }
      this.online.onLoaded = () => resolve(true);
      setTimeout(() => resolve(false), 60000);
    });
    if (!this.online || this.online.net.closed) return;
    if (!ok) { this.onDisconnect('Your opponent never finished loading.'); return; }
    await this.beginRound();
  }

  get localIndex() { return this.local === this.p1 ? 0 : 1; }
  nameOf(i) { return ROSTER[i === 0 ? this.sel.p1 : this.sel.cpu].name; }

  place() {
    const g = this.game;
    const c = this.center;
    const along = new THREE.Vector3(0, 0, 1);
    const a = c.clone().addScaledVector(along, 6); const b = c.clone().addScaledVector(along, -6);
    for (const [f, p] of [[this.p1, a], [this.p2, b]]) {
      f.revive(f.hpMax);
      f.energy = f.energyMax;
      f.stamina = f.staminaMax;
      f.tsCharge = 1;
      f.pos.copy(p); f.pos.y = g.world.groundAt(p.x, p.z, p.y + 3);
      f.vel.set(0, 0, 0);
      f.cancelAction();
      f.lockTarget = null;
      f.overwritten = false; f.overwrite = 0;
      if (f.stand?.summoned) f.stand.summon(false, true);
    }
    this.p1.faceTowards(this.p2.pos, true);
    this.p2.faceTowards(this.p1.pos, true);
    if (this.rin) this.rin.state = null;
    if (this.online) this.online.snap = null;
    g.camera.setTarget(this.local);
  }

  async beginRound() {
    const g = this.game;
    if (this.online) {
      this.online.started = true;
      if (this.online.role === 'host') this.online.net.send({ t: 'round', round: this.round, wins: this.wins });
    }
    g.time.end(true);
    for (const h of [...g.combat.hazards]) if (!h.persistent && !h.owner) g.combat.removeHazard(h);
    for (const p of g.combat.projectiles) p.life = 0;
    this.place();
    this.state = 'intro';
    const token = (this.roundToken = (this.roundToken || 0) + 1);
    if (this.brain) this.brain.enabled = false;
    const side = new THREE.Vector3(1, 0, 0);
    const mid = this.p1.pos.clone().lerp(this.p2.pos, 0.5);
    g.camera.setCinematic(mid.clone().addScaledVector(side, 9).add(new THREE.Vector3(0, 2.4, 0)), mid.clone().add(new THREE.Vector3(0, 1.2, 0)), 46);
    g.inCinematic = true;
    const me = this.localIndex;
    const vs = this.online ? `${this.nameOf(me)}  vs  ${this.nameOf(1 - me)} · ${this.online.net.peerName}` : `${ROSTER[this.sel.p1].name}  vs  ${ROSTER[this.sel.cpu].name}`;
    ui.set({ announce: { text: `ROUND ${this.round}`, sub: vs } });
    audio.play('stinger');
    await new Promise((r) => setTimeout(r, 1600));
    if (this.state !== 'intro' || token !== this.roundToken) return;
    ui.set({ announce: { text: 'FIGHT', sub: '' } });
    audio.play('heavyHit');
    g.camera.toGameplay(0.6);
    g.inCinematic = false;
    if (this.brain) this.brain.enabled = true;
    this.state = 'fight';
    this.timer = 99;
    this.ultT = 5;
    setTimeout(() => { if (ui.get().announce?.text === 'FIGHT') ui.set({ announce: null }); }, 800);
  }

  // winner: 0 = p1, 1 = p2
  async onKO(winner) {
    if (this.state !== 'fight') return;
    // dev combat arena: no rounds, the fallen fighter simply gets back up
    if (this.sel.dev) {
      const f = winner === 0 ? this.p2 : this.p1;
      setTimeout(() => { f.revive(f.hpMax); f.energy = f.energyMax; }, 1200);
      return;
    }
    this.state = 'ko';
    if (this.brain) this.brain.enabled = false;
    this.wins[winner] += 1;
    if (this.online) { this._sendSnap(); this.online.net.send({ t: 'ko', winner, wins: this.wins }); }
    this._koFx(winner);
    await new Promise((r) => setTimeout(r, 2400));
    if (this.state !== 'ko') return;
    if (this.wins[winner] >= 2) {
      if (this.online) this.online.net.send({ t: 'end', winner, wins: this.wins });
      this.endMatch(winner);
      return;
    }
    this.round += 1;
    await this.beginRound();
  }

  _koFx(winner) {
    const g = this.game;
    g.slowMo(0.25, 1.5);
    g.camera.shake(0.9);
    ui.set({ announce: { text: 'K.O.', sub: this.nameOf(winner) } });
  }

  endMatch(winner, note = null) {
    const g = this.game;
    this.state = 'done';
    const won = winner === this.localIndex;
    const saved = Save.versusRecord();
    let rec;
    if (this.online) {
      saved.online = saved.online || { wins: 0, losses: 0 };
      if (won) saved.online.wins += 1; else saved.online.losses += 1;
      rec = { wins: saved.online.wins, losses: saved.online.losses };
    } else {
      if (won) saved.wins += 1; else saved.losses += 1;
      saved.last = { p1: this.sel.p1, cpu: this.sel.cpu, won, at: Date.now() };
      rec = saved;
    }
    Save.saveVersusRecord(saved);
    if (!this.sel.dev) {
      statAdd(won ? 'versus_wins' : 'versus_losses');
      const mine = this.localIndex === 0 ? this.sel.p1 : this.sel.cpu;
      Account.updateProfile((p) => { p.fighter_usage[mine] = (p.fighter_usage[mine] || 0) + 1; });
      if (won) unlockAchievement('versus_win');
    }
    // the results screen is written from the local player's side
    const me = this.localIndex;
    ui.set({
      announce: null,
      overlay: 'results',
      versusResult: {
        winner: won ? 0 : 1, p1: me === 0 ? this.sel.p1 : this.sel.cpu, cpu: me === 0 ? this.sel.cpu : this.sel.p1,
        wins: [this.wins[me], this.wins[1 - me]], record: rec, online: !!this.online, opponent: this.online?.net.peerName,
        note, waiting: false, canRematch: !this.online || !this.online.net.closed,
      },
    });
    g.overlayOpen = true;
    g.inCinematic = false;
    g.input.setPointerLock(false);
  }

  async rematch() {
    const o = this.online;
    if (o) {
      // both players have to ask; the host then starts round one
      if (o.net.closed) return;
      o.wantRematch = true;
      o.net.send({ t: 'rematch' });
      if (!o.peerRematch) { ui.set({ versusResult: { ...ui.get().versusResult, waiting: true } }); return; }
      if (o.role === 'guest') { ui.set({ versusResult: { ...ui.get().versusResult, waiting: true } }); return; }
    }
    this._resetMatch();
    await this.beginRound();
  }

  _resetMatch() {
    const g = this.game;
    ui.set({ overlay: null });
    g.overlayOpen = false;
    this.round = 1;
    this.wins = [0, 0];
    if (this.online) { this.online.wantRematch = false; this.online.peerRematch = false; }
    g.input.setPointerLock(true);
  }

  // ---------------------------------------------------------------- online messages
  onNet(m) {
    const o = this.online;
    if (!o) return;
    switch (m.t) {
      case 'in': this.rin.receive(m); break;
      case 'loaded': o.peerLoaded = true; o.onLoaded?.(); break;
      case 's': o.snap = m; break;
      case 'round':
        if (o.role !== 'guest') break;
        if (this.state === 'done') this._resetMatch();
        this.round = m.round; this.wins = m.wins;
        this.beginRound();
        break;
      case 'ko': {
        if (o.role !== 'guest') break;
        this.state = 'ko';
        this.wins = m.wins;
        const loser = m.winner === 0 ? this.p2 : this.p1;
        if (!loser.dead) { loser.netShadow = false; loser.hp = 0; loser.die(); loser.netShadow = true; }
        this._koFx(m.winner);
        break;
      }
      case 'end': if (o.role === 'guest') { this.wins = m.wins; this.endMatch(m.winner); } break;
      case 'rematch':
        o.peerRematch = true;
        if (this.state === 'done' && o.wantRematch && o.role === 'host') this.rematch();
        break;
      default: break;
    }
  }

  onDisconnect(reason) {
    const g = this.game;
    if (!this.online) return;
    toast(reason || 'Your opponent disconnected.', 'hint', 6000);
    if (this.state === 'done') { ui.set({ versusResult: { ...ui.get().versusResult, canRematch: false, waiting: false, note: reason } }); return; }
    // a match abandoned mid-fight goes to whoever stayed
    g.inCinematic = false;
    this.endMatch(this.localIndex, reason || 'Your opponent disconnected.');
  }

  _sendSnap() {
    const r = (v) => Math.round(v * 10) / 10;
    this.online.net.send({ t: 's', hp: [r(this.p1.hp), r(this.p2.hp)], timer: r(this.timer || 0) });
  }

  // remote fighter: ease toward where its owner says it is (extrapolated by its velocity), and
  // take its meters; local copies diverge only by small amounts between updates
  _syncRemote(dt) {
    const s = this.rin.state;
    const f = this.remote;
    if (!s || f.dead) return;
    const age = Math.min(0.15, (performance.now() - s.at) / 1000);
    _t.copy(s.pos).addScaledVector(s.vel, age);
    const err = _t.distanceTo(f.pos);
    if (err > 3) f.pos.copy(_t);
    else if (err > 0.02) f.pos.lerp(_t, Math.min(1, dt * 10));
    const dy = angleTo(f.yaw, s.yaw);
    if (Math.abs(dy) > 0.02) f.yaw += dy * Math.min(1, dt * 12);
    f.energy = s.en; f.stamina = s.st; f.tsCharge = s.ts;
    // a Stand toggle that one side refused (busy, stunned): settle on the owner's state
    const want = !!s.sd; const has = !!f.stand?.summoned;
    if (f.stand && want !== has) {
      this.online.standMismatch += dt;
      if (this.online.standMismatch > 0.35 && !f.busy()) { f.stand.summon(want); this.online.standMismatch = 0; }
    } else this.online.standMismatch = 0;
  }

  update(dt, realDt) {
    const o = this.online;
    const g = this.game;
    if (o && !o.net.closed) {
      // stream our inputs + own fighter state every frame
      const live = this.state === 'fight' && !g.overlayOpen && !g.inCinematic;
      o.net.send(encodeFrame(live ? g.input : NO_INPUT, g.camera.yaw, this.local));
      this.rin.step();
      if (o.role === 'host') {
        o.snapT -= realDt;
        if (o.snapT <= 0) { o.snapT = 0.05; this._sendSnap(); }
      } else if (o.snap && this.state === 'fight') {
        // health and the clock are the host's
        this.p1.hp = Math.max(1, Math.min(this.p1.hpMax, o.snap.hp[0]));
        this.p2.hp = Math.max(1, Math.min(this.p2.hpMax, o.snap.hp[1]));
        this.timer = o.snap.timer;
      }
    }
    if (this.state === 'fight' || this.state === 'ko') {
      this.ctrl.update(dt, realDt);
      if (this.remoteCtrl) { this.remoteCtrl.update(dt, realDt); this._syncRemote(dt); }
      this.brain?.update(dt);
      // the CPU reaches for its ultimate every ~9-13 s whenever it is close enough to use it
      if (this.brain?.enabled && this.state === 'fight') {
        this.ultT -= dt;
        const cpu = this.p2;
        if (this.ultT <= 0) {
          const ready = !cpu.dead && cpu.canAct() && !g.time.state && cpu.distanceTo(this.p1) < 14;
          this.ultT = ready && cpu.kit.signature() ? 9 + Math.random() * 4 : 1;
        }
      }
      const authority = !o || o.role === 'host';
      // ring out guard
      for (const f of [this.p1, this.p2]) {
        const d = Math.hypot(f.pos.x - this.center.x, f.pos.z - this.center.z);
        if (d > 30) { const k = 30 / d; f.pos.x = this.center.x + (f.pos.x - this.center.x) * k; f.pos.z = this.center.z + (f.pos.z - this.center.z) * k; }
        if (authority && f.pos.y < this.center.y - 10) { f.pos.copy(this.center); g.combat.applyHit(f, f === this.p1 ? this.p2 : this.p1, { damage: 20, kind: 'special', unblockable: true, noCounter: true }); }
      }
      if (this.state === 'fight' && !this.sel.dev && authority) {
        this.timer -= realDt;
        if (this.timer <= 0) {
          const w = this.p1.hp / this.p1.hpMax >= this.p2.hp / this.p2.hpMax ? 0 : 1;
          (w === 0 ? this.p2 : this.p1).die();
        }
      }
    }
  }

  publishHud() {
    const f1 = this.local; const f2 = this.remote;
    if (!f1 || !f2) return;
    const pack = (f) => ({ name: f.roster.name, stand: f.roster.standName, hp: Math.round(f.hp), hpMax: f.hpMax, energy: Math.round(f.energy), energyMax: f.energyMax, ts: f.tsCharge ?? null, color: f.roster.color, overwritten: !!f.overwritten, poise: f.poiseMax ? Math.round((f.poise / f.poiseMax) * 100) : null });
    const me = this.localIndex;
    const p2 = pack(f2);
    if (this.online) p2.player = this.online.net.peerName;
    ui.set({ versus: { p1: pack(f1), p2, round: this.round, wins: [this.wins[me], this.wins[1 - me]], timer: Math.max(0, Math.ceil(this.timer || 0)), online: !!this.online, ping: this.online ? Math.round(this.online.net.rtt) : null }, hud: { hp: Math.round(f1.hp), hpMax: f1.hpMax, energy: Math.round(f1.energy), energyMax: f1.energyMax, stamina: Math.round(f1.stamina), ts: f1.tsCharge ?? null, stand: !!f1.stand?.summoned, versus: true } });
  }

  dispose() {
    const g = this.game;
    g.player = null;
    if (this.online) {
      this.online.net.onClose = null;
      this.online.net.setHandler(null);
      this.online.net.close();
      if (g.net === this.online.net) g.net = null;
      this.state = 'done';
    }
    ui.set({ versus: null, announce: null, versusResult: null });
  }
}
