import * as THREE from 'three';
import { ui, toast } from '../core/Store';
import { audio } from '../core/Audio';
import { Save } from '../state/Save';
import { createFighter, BossBrain, ROSTER } from '../combat/Roster';
import { PlayerController } from '../actors/PlayerController';
import { Horse } from '../actors/Horse';
import { roadX, heightAt, resolvePOI, GULCHES } from '../world/Terrain';
import { REGIONS, SANCTUARY, regionAt } from '../world/Layout';
import { preload, instantiate } from '../assets/AssetLibrary';
import { BOSSES, TUTORIAL, SPEAKERS } from './Script';
import { openingCinematic, journalCinematic, bossIntro, bossVictory, heavenCinematic, endingCinematic, sayLines } from './Scenes';
import { QUEST_HANDLERS } from './Quests';
import * as Poses from '../anim/Poses';
import { Restorable } from '../combat/kits/Diamond';

export const STEPS = [
  { id: 'prologue', chapter: 'Prologue: The Last Night' },
  { id: 'ebon', chapter: 'Prologue: Ebon Crossing' },
  { id: 'avdol', boss: 'avdol', poi: 'arenaAvdol', chapter: "I · Magician's Red" },
  { id: 'q1', quest: 'q1', chapter: 'I · Ashes on the Wire' },
  { id: 'kakyoin', boss: 'kakyoin', poi: 'arenaKakyoin', chapter: 'II · Hierophant Green' },
  { id: 'q2', quest: 'q2', chapter: "II · Bastet's Rails" },
  { id: 'polnareff', boss: 'polnareff', poi: 'arenaPolnareff', chapter: 'III · Silver Chariot' },
  { id: 'q3', quest: 'q3', chapter: "III · Emperor's Crossing" },
  { id: 'josuke', boss: 'josuke', poi: 'arenaJosuke', chapter: 'IV · Crazy Diamond' },
  { id: 'q4', quest: 'q4', chapter: "IV · The Hag's Lanterns" },
  { id: 'kira', boss: 'kira', poi: 'arenaKira', chapter: 'V · Killer Queen' },
  { id: 'q5', quest: 'q5', chapter: "V · Osiris's Wager" },
  { id: 'diavolo', boss: 'diavolo', poi: 'arenaDiavolo', chapter: 'VI · King Crimson' },
  { id: 'q6', quest: 'q6', chapter: "VI · Geb's Drowned Path" },
  { id: 'giorno', boss: 'giorno', poi: 'arenaGiorno', chapter: 'VII · Gold Experience' },
  { id: 'q7', quest: 'q7', chapter: "VII · Atum's Question" },
  { id: 'valentine', boss: 'valentine', poi: 'arenaValentine', chapter: 'VIII · D4C' },
  { id: 'q8', quest: 'q8', chapter: 'VIII · The Void Between' },
  { id: 'pucci', boss: 'pucci', poi: 'arenaPucci', chapter: 'IX · C-Moon' },
  { id: 'q9', quest: 'q9', chapter: "IX · The Last Night's Confession" },
  { id: 'jotaro', boss: 'jotaro', poi: 'arenaJotaro', chapter: 'X · Star Platinum' },
  { id: 'heaven', chapter: 'X · Heaven' },
  { id: 'jotaroFinal', boss: 'jotaro', poi: 'arenaJotaro', final: true, chapter: 'Finale · The World Over Heaven' },
  { id: 'ending', chapter: 'Epilogue' },
];

// story rewards granted on boss defeat
const STORY_UPGRADES = {
  kakyoin: { tsDuration: 1, note: 'Time stop lasts longer (3 s).' },
  josuke: { knives: true, note: 'Unlocked: Thrown Knives (T / D-Pad Right). In stopped time they hang in the air.' },
  diavolo: { tsDuration: 2, note: 'Time stop lasts longer (4 s).' },
  valentine: { tsCooldown: 1, note: 'Time stop recharges faster.' },
  pucci: { tsAwareness: true, note: 'Unlocked: move inside an enemy\'s stopped time (press R while frozen).' },
};

const BASE_HP = 260;

export class Campaign {
  constructor(game) {
    this.game = game;
    this.name = 'campaign';
    this.h = null;
    this.beacon = null;
    this.objectiveData = null;
    this.playT = 0;
    this.saveT = 0;
    this.dead = false;
  }

  get p() { return this.game.progress; }
  get step() { return STEPS[this.p.step]; }

  // ---------------------------------------------------------------- startup
  async start(fresh) {
    const g = this.game;
    ui.set({ loading: { label: 'Summoning DIO', progress: 0.25 } });
    await this.loadPlayer(this.p.step >= STEPS.findIndex((s) => s.id === 'jotaroFinal'));
    this.horse = new Horse(g);
    await this.horse.load();
    g.horse = this.horse;
    g.engine.scene.add(this.horse.group);
    ui.set({ loading: { label: 'Raising the frontier', progress: 0.55 } });
    // place the player
    let pos;
    if (fresh || this.p.step <= 0) pos = this._roadPoint(205);
    else if (this.p.pos) pos = new THREE.Vector3(...this.p.pos);
    else pos = this.stepStart(this.p.step);
    this.player.pos.copy(pos);
    this.player.pos.y = g.world.groundAt(pos.x, pos.z, pos.y + 2);
    this.player.yaw = this.player.targetYaw = Math.PI;
    const hp = this.p.horsePos ? new THREE.Vector3(...this.p.horsePos) : pos.clone().add(new THREE.Vector3(2.2, 0, 1.5));
    this.horse.pos.copy(hp); this.horse.pos.y = g.world.groundAt(hp.x, hp.z, hp.y + 2);
    this.horse.yaw = Math.PI;
    g.world.warm(this.player.pos);
    g.camera.setTarget(this.player);
    g.camera.mode = 'follow';
    g.camera.blend = 1;
    g.camera.blendDur = 0;
    // preload the cast of the next two steps
    preload(this.castFor(this.p.step).concat(this.castFor(this.p.step + 1))).catch(() => {});
    ui.set({ loading: { label: 'The road north', progress: 0.9 } });
    await new Promise((r) => setTimeout(r, 50));
    g.engine.fx.uFade.value = 1;
    ui.set({ screen: 'game', loading: null, overlay: null });
    g.input.setPointerLock(true);
    audio.setWeather(1, 0.8);
    if (this.p.hp) this.player.hp = Math.min(this.player.hpMax, this.p.hp);
    this.enterStep(this.p.step, { fresh });
    if (STEPS[this.p.step]?.id !== 'prologue') g.fadeIn(1.0);
  }

  async loadPlayer(heaven = false) {
    const g = this.game;
    if (this.player) { g.removeActor(this.player); }
    const f = await createFighter(g, heaven ? 'dioHeaven' : 'dio', { team: 0 });
    f.isPlayer = true;
    this.player = f;
    g.player = f;
    g.addActor(f);
    g.combat.add(f);
    this.ctrl = new PlayerController(g, f);
    f.onDeath = () => this.onPlayerDeath();
    this.applyUpgrades();
    return f;
  }

  applyUpgrades() {
    const f = this.player;
    const u = this.p.upgrades;
    const hpBase = f.rosterKey === 'dioHeaven' ? 360 : BASE_HP;
    const frac = f.hp / f.hpMax;
    f.hpMax = hpBase + 40 * (u.vitality || 0);
    f.hp = Math.max(1, Math.min(f.hpMax, Math.round(f.hpMax * frac)));
    f.energyMax = 100 + 20 * (u.energy || 0);
    f.counterWindow = 0.2 + 0.06 * (u.counter || 0);
    if (f.kit) f.kit.rushCost = 13 * (1 - 0.18 * (u.rush || 0));
  }

  castFor(i) {
    const s = STEPS[i];
    if (!s) return [];
    if (s.boss) { const r = ROSTER[s.boss]; return [r.part, r.stand].filter(Boolean); }
    const q = { q1: ['speedwagon'], q2: ['mariah'], q3: ['holHorse'], q4: ['enya'], q5: ['daniel', 'osiris'], q6: ['ndoul', 'geb'], q7: ['telence', 'atum'], q8: ['vanillaIce'], q9: ['speedwagon', 'enya'], heaven: ['dioHeaven', 'arrow'], ebon: ['pucci'], prologue: ['arrow', 'pucci'] }[s.id];
    return q || [];
  }

  _roadPoint(z, side = 0) {
    const x = roadX(z) + side;
    return new THREE.Vector3(x, heightAt(x, z), z);
  }

  stepStart(i) {
    const s = STEPS[i];
    if (!s) return this._roadPoint(60);
    if (s.poi) { const q = resolvePOI(s.poi); return this._roadPoint(q.z + 70, 0); }
    const prev = STEPS[i - 1];
    if (prev?.poi) { const q = resolvePOI(prev.poi); return this._roadPoint(q.z - 20, 0); }
    return this._roadPoint(60);
  }

  // ---------------------------------------------------------------- steps
  async enterStep(i, opts = {}) {
    const g = this.game;
    this.h?.dispose?.();
    this.h = null;
    this.p.step = i;
    const s = STEPS[i];
    this.p.chapterName = s.chapter;
    ui.set({ chapter: s.chapter });
    g.lockTimeStop = false;
    preload(this.castFor(i + 1)).catch(() => {});
    if (s.id === 'prologue') return this.prologue();
    if (s.id === 'ebon') return this.ebonStep(opts);
    if (s.boss) return this.bossStep(s);
    if (s.quest) {
      const handler = QUEST_HANDLERS[s.quest];
      this.h = await handler(this, opts);
      return;
    }
    if (s.id === 'heaven') return this.heavenStep();
    if (s.id === 'ending') return this.endingStep();
  }

  completeStep(extra = {}) {
    const g = this.game;
    this.h?.dispose?.();
    this.h = null;
    const next = this.p.step + 1;
    this.p.step = next;
    Object.assign(this.p.flags, extra.flags || {});
    this.clearObjective();
    audio.play('quest');
    this.autosave(true);
    if (next < STEPS.length) this.enterStep(next);
    void g;
  }

  // ---------------------------------------------------------------- objectives
  objective(title, text, pos = null) {
    this.objectiveData = { title, text, pos: pos ? pos.clone() : null };
    if (pos) this.placeBeacon(pos); else this.removeBeacon();
    this._pubObjective();
  }

  clearObjective() { this.objectiveData = null; this.removeBeacon(); ui.set({ objective: null }); }

  placeBeacon(pos) {
    const g = this.game;
    if (!this.beacon) {
      const m = new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 120, 12, 1, true), m);
      this.beacon.renderOrder = 3;
      g.engine.scene.add(this.beacon);
    }
    const y = g.world.groundAt(pos.x, pos.z, pos.y + 5);
    this.beacon.position.set(pos.x, y + 60, pos.z);
  }

  removeBeacon() { if (this.beacon) { this.beacon.removeFromParent(); this.beacon.geometry.dispose(); this.beacon = null; } }

  _pubObjective() {
    const o = this.objectiveData;
    if (!o) return;
    let distance = null; let bearing = null;
    if (o.pos && this.player) {
      const d = o.pos.clone().sub(this.player.pos);
      distance = Math.round(Math.hypot(d.x, d.z));
      const cam = this.game.camera;
      const ang = Math.atan2(d.x, d.z);
      const camFwd = Math.atan2(-Math.sin(cam.yaw), -Math.cos(cam.yaw));
      bearing = Math.atan2(Math.sin(ang - camFwd), Math.cos(ang - camFwd));
      if (this.beacon) { this.beacon.visible = distance > 9; this.beacon.material.opacity = distance < 30 ? 0.07 : 0.18; }
    }
    const cur = ui.get().objective;
    if (!cur || cur.title !== o.title || cur.text !== o.text || cur.distance !== distance || Math.abs((cur.bearing ?? 0) - (bearing ?? 0)) > 0.03) {
      ui.set({ objective: { title: o.title, text: o.text, distance, bearing } });
    }
  }

  hint(key) {
    if (this.p.flags[`hint_${key}`]) return;
    this.p.flags[`hint_${key}`] = true;
    toast(TUTORIAL[key], 'hint', 6500);
  }

  addClue(text) { if (text && !this.p.clues.includes(text)) { this.p.clues.push(text); toast(`Clue recorded: ${text}`, 'clue', 5500); } }

  // ---------------------------------------------------------------- saving
  snapshot() {
    const pl = this.player;
    const p = this.p;
    if (pl && !this.game.inCinematic && !this.game.combatActive) {
      p.pos = [pl.mounted ? pl.mounted.pos.x : pl.pos.x, pl.pos.y, pl.mounted ? pl.mounted.pos.z : pl.pos.z];
      p.hp = pl.hp;
    }
    if (this.horse) p.horsePos = [this.horse.pos.x, this.horse.pos.y, this.horse.pos.z];
    p.playtime = (p.playtime || 0) + this.playT;
    this.playT = 0;
    return p;
  }

  autosave(force = false) {
    if (!force && (this.game.inCinematic || this.game.combatActive)) return false;
    const ok = Save.save('auto', this.snapshot());
    if (ok) ui.set({ saving: Date.now() });
    return ok;
  }

  saveTo(slot) {
    if (this.game.inCinematic || this.game.combatActive) { toast('You cannot save during a fight or a scene.'); return false; }
    const ok = Save.save(slot, this.snapshot());
    toast(ok ? 'Journey saved.' : 'Saving failed (storage unavailable).');
    return ok;
  }

  // ---------------------------------------------------------------- prologue
  async prologue() {
    const g = this.game;
    const lo = g.world.landOffice;
    // the watcher on the Grand Hotel balcony
    const hz = -58;
    const bal = this._roadPoint(hz, -9.6);
    const pucci = await g.spawnNPC('pucci', bal, Math.PI / 2 + 0.2, { name: 'Enrico Pucci' });
    pucci.pinned = true;
    pucci.pos.y = heightAt(bal.x - 5, bal.z) + 4.42;
    this.pucciWatcher = pucci;
    const symbol = this.makeSymbol(lo);
    this.symbol = symbol;
    await g.seq.run((seq) => openingCinematic(g, seq, { player: this.player, horse: this.horse, pucci, symbol }));
    g.removeActor(pucci);
    this.pucciWatcher = null;
    this.completeStep();
  }

  makeSymbol(lo) {
    const g = this.game;
    if (this.symbol) return this.symbol;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const x = c.getContext('2d');
    x.strokeStyle = '#ffd890'; x.lineWidth = 7; x.shadowColor = '#ffb040'; x.shadowBlur = 18;
    x.beginPath(); x.arc(128, 128, 90, 0, Math.PI * 2); x.stroke();
    for (let i = 0; i < 12; i += 1) { const a = (i / 12) * Math.PI * 2; x.beginPath(); x.moveTo(128 + Math.cos(a) * 78, 128 + Math.sin(a) * 78); x.lineTo(128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92); x.stroke(); }
    x.beginPath();
    for (let i = 0; i < 5; i += 1) { const a = -Math.PI / 2 + i * (Math.PI * 4 / 5); x.lineTo(128 + Math.cos(a) * 60, 128 + Math.sin(a) * 60); }
    x.closePath(); x.stroke();
    x.beginPath(); x.moveTo(128, 128); x.lineTo(128, 52); x.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const p = lo.frame.pt(1.25, 1.7, 5.5 + 0.33);
    m.position.copy(p);
    m.rotation.y = lo.frame.rotY;
    g.engine.scene.add(m);
    return m;
  }

  // ---------------------------------------------------------------- Ebon Crossing (tutorial)
  async ebonStep() {
    const g = this.game;
    const lo = g.world.landOffice;
    if (!this.symbol) this.symbol = this.makeSymbol(lo);
    const sub = this.p.sub.ebon || (this.p.sub.ebon = { stage: 'office' });
    g.lockTimeStop = true;
    const journal = g.world.interactables.get('journal');
    const barricade = [];
    const mainStreet = resolvePOI('arenaAvdol');
    const setup = () => {
      if (sub.stage === 'office') {
        this.objective('The Land Office', 'Enter the Land Office and read what was left for you.', lo.desk);
        if (journal) {
          journal.enabled = true;
          journal.label = 'Read the journal';
          journal.onInteract = async () => {
            journal.enabled = false;
            await g.seq.run((seq) => journalCinematic(g, seq, { player: this.player, journalPos: lo.desk }));
            sub.stage = 'stand';
            this.addClue('A journal in DIO\'s own handwriting: "You have already won. Walk north."');
            this.autosave(true);
            setup();
          };
        }
        this.hint('move');
        setTimeout(() => this.hint('interact'), 7000);
      } else if (sub.stage === 'stand') {
        this.objective('The World', 'Break through the barricade blocking the north road.', this._roadPoint(-70));
        this.hint('stand');
        // barricade of crates across the street
        for (let i = -3; i <= 3; i += 1) {
          const p = this._roadPoint(-68, i * 1.3);
          barricade.push(new Restorable(g, 'crate', p, 0));
          if (Math.abs(i) <= 2) barricade.push(new Restorable(g, 'crate', p.clone().add(new THREE.Vector3(0, 1, 0)), 0));
        }
        this.h = {
          update: (dt) => {
            for (const b of barricade) b.update(dt, false);
            const pl = this.player;
            if (pl.action && /jab|punch|heavy|kb|rush/.test(pl.action.def.name) || pl.stand?.action) {
              for (const b of barricade) if (b.state === 'intact' && b.group.position.distanceTo(pl.pos) < 3.3) b.shatter(pl.pos, 7);
            }
            if (sub.stage === 'stand' && barricade.filter((b) => b.state !== 'intact').length >= barricade.length * 0.75) {
              for (const b of barricade) if (b.state === 'intact') b.shatter(pl.pos, 5);
              sub.stage = 'north';
              this.hint('strike');
              setup();
            }
          },
          dispose: () => { for (const b of barricade) b.dispose(); },
        };
      } else if (sub.stage === 'north') {
        this.objective('Main Street', 'Walk north to the end of Main Street.', new THREE.Vector3(mainStreet.x, 0, mainStreet.z));
        const old = this.h;
        this.h = {
          update: (dt) => {
            old?.update?.(dt);
            if (this.player.pos.distanceTo(new THREE.Vector3(mainStreet.x, this.player.pos.y, mainStreet.z)) < 45) {
              this.completeStep();
            }
          },
          dispose: () => old?.dispose?.(),
        };
      }
    };
    setup();
    await g.fadeIn(0.8);
  }

  // ---------------------------------------------------------------- bosses
  async bossStep(s) {
    const g = this.game;
    const poi = resolvePOI(s.poi);
    let center = this._roadPoint(poi.z, poi.side || 0);
    if (s.boss === 'diavolo') { const gl = GULCHES.find((q) => q.id === 'diavoloCanyon'); center = new THREE.Vector3(gl.x, gl.deckY, gl.z); }
    if (s.boss === 'jotaro') center = new THREE.Vector3(SANCTUARY.x, SANCTUARY.y || heightAt(SANCTUARY.x, SANCTUARY.z), SANCTUARY.z);
    const data = BOSSES[s.final ? 'jotaroFinal' : s.boss];
    this.objective(s.final ? 'Heaven' : `Seal: ${ROSTER[s.boss].name}`, s.final ? 'Face Jotaro one last time.' : `Find ${ROSTER[s.boss].name} at ${poi.label}.`, center);
    g.fadeIn(0.8);
    if (s.final) { this.startEncounter(s, center, data); return; }
    this.h = {
      update: () => {
        if (this.encounter) return;
        const d = Math.hypot(this.player.pos.x - center.x, this.player.pos.z - center.z);
        if (d < 46 && !g.inCinematic) this.startEncounter(s, center, data);
      },
      dispose: () => this.endEncounter(),
    };
  }

  async startEncounter(s, center, data) {
    const g = this.game;
    const key = s.boss;
    const rk = ROSTER[key];
    this.encounter = { key, center, data, phaseHp: [], step: s };
    g.combatActive = true;
    this.clearObjective();
    if (this.player.mounted) this.player.mounted.dismount(true);
    this.horse.state = 'idle';
    const boss = await createFighter(g, key, { team: 1 });
    boss.hpMax = Math.round(boss.hpMax * (g.difficulty > 1 ? 1.15 : g.difficulty < 1 ? 0.75 : 1));
    boss.hp = boss.hpMax;
    if (s.final) { boss.hpMax = 760; boss.hp = 760; }
    // placement: boss north of centre facing south, DIO approaching from the south
    const fwd = new THREE.Vector3(0, 0, -1);
    const bp = center.clone().addScaledVector(fwd, 7);
    boss.pos.copy(bp); boss.pos.y = g.world.groundAt(bp.x, bp.z, bp.y + 3);
    boss.yaw = boss.targetYaw = 0;
    const pp = center.clone().addScaledVector(fwd, -8);
    this.player.pos.copy(pp); this.player.pos.y = g.world.groundAt(pp.x, pp.z, pp.y + 3);
    this.player.yaw = this.player.targetYaw = Math.PI;
    this.player.vel.set(0, 0, 0);
    g.addActor(boss);
    g.combat.add(boss);
    if (boss.kit.setupArena) boss.kit.setupArena(center, key === 'valentine' && g.world.flagPole ? null : null);
    this.encounter.boss = boss;
    this.encounter.phaseHp = [boss.hpMax];
    boss.onDeath = () => this.onBossDefeated();
    const brain = new BossBrain(g, boss, {
      difficulty: g.difficulty,
      onPhase: (p) => this.onBossPhase(p),
    });
    if (s.final) { brain.phase = 3; boss.kit.phase = 3; brain.thresholds = [0.5, 0.25]; }
    this.encounter.brain = brain;
    brain.enabled = false;
    g.world.warm(center);
    if (!s.final) await g.seq.run((seq) => bossIntro(g, seq, { player: this.player, boss, center, data, rk }));
    else await g.seq.run(async (seq) => {
      const { conversation } = await import('./Scenes');
      await conversation(seq, this.player, boss, data.intro);
    });
    if (!this.encounter) return;
    brain.enabled = true;
    audio.setMusic('boss', 0.4);
    ui.set({ boss: { name: rk.name, stand: rk.standName, hp: boss.hp, hpMax: boss.hpMax, phase: 1, phases: (brain.thresholds.length + 1), color: rk.color } });
    this.hint('timestop');
    this.hint('defend');
    this.hint('lock');
    if (key === 'jotaro' && s.final) this.player.kit.onFinisher = (t) => this.heavenFinisher(t);
    const enc = this.encounter;
    this.h = {
      update: (dt) => {
        if (!this.encounter || this.encounter !== enc) return;
        brain.update(dt);
        // arena bounds
        const R = key === 'diavolo' ? 50 : 40;
        for (const f of [this.player, boss]) {
          const dx = f.pos.x - center.x; const dz = f.pos.z - center.z;
          const d = Math.hypot(dx, dz);
          if (d > R) { f.pos.x = center.x + dx / d * R; f.pos.z = center.z + dz / d * R; if (f === this.player && !this._boundsWarned) { this._boundsWarned = true; toast('There is no running from a Seal-bearer.'); } }
        }
        // fell off the canyon bridge: return to the deck
        if (this.player.pos.y < center.y - 8) {
          this.player.pos.copy(center).add(new THREE.Vector3(0, 0.5, 6));
          g.combat.applyHit(this.player, boss, { damage: 20, stun: 0.5, kind: 'special', unblockable: true, noCounter: true });
        }
        // Jotaro: final clash at low health (first fight)
        if (key === 'jotaro' && !s.final && !enc.clashDone && boss.hp / boss.hpMax < 0.15 && !g.time.state) this.finalClash();
        if (enc.clash) this.updateClash(dt);
      },
      dispose: () => this.endEncounter(),
    };
  }

  onBossPhase(p) {
    const e = this.encounter;
    if (!e) return;
    const g = this.game;
    e.phaseHp[p - 1] = e.boss.hp;
    const lines = e.data.phases?.[p];
    if (lines) {
      const [who, text] = lines[0];
      const sp = SPEAKERS[who];
      ui.set({ subtitle: { speaker: sp.name, text, color: sp.color } });
      setTimeout(() => { if (ui.get().subtitle?.text === text) ui.set({ subtitle: null }); }, 4200);
    }
    e.boss.invuln = 0.8;
    g.vfx.aura(e.boss.chestWorld(new THREE.Vector3()), ROSTER[e.key].aura, 1.6);
    g.vfx.menacing(e.boss.chestWorld(new THREE.Vector3()), 'ド', 4, ROSTER[e.key].color);
    audio.play('stinger');
    audio.setMusic('boss', Math.min(1, 0.4 + p * 0.2));
    g.camera.shake(0.4);
    if (e.key === 'polnareff' && p === 3) e.boss.kit.armorRelease();
  }

  publishHud() {
    const g = this.game;
    const f = this.player;
    if (!f) return;
    this.playT += 1 / 15;
    this.saveT += 1 / 15;
    if (this.saveT > 90) { this.saveT = 0; this.autosave(); }
    const k = f.kit;
    const hud = {
      hp: Math.round(f.hp), hpMax: f.hpMax, energy: Math.round(f.energy), energyMax: f.energyMax,
      stamina: Math.round(f.stamina), ts: f.tsCharge ?? 0, tsDur: k?.tsDuration ? k.tsDuration() : 0,
      stand: !!f.stand?.summoned, mounted: !!f.mounted, horseStamina: this.horse ? Math.round(this.horse.stamina) : 0,
      horseSpeed: this.horse && f.mounted ? Math.round(this.horse.speed * 3.6) : 0, gait: this.horse?.anim?.gait,
      knives: !!this.p.upgrades.knives, heaven: f.rosterKey === 'dioHeaven', fragments: this.p.fragments,
      overwriteReady: f.rosterKey === 'dioHeaven',
    };
    ui.set({ hud });
    const e = this.encounter;
    if (e?.boss && e.brain?.enabled) {
      const b = e.boss;
      const cur = ui.get().boss;
      if (!cur || cur.hp !== Math.round(b.hp) || cur.phase !== e.brain.phase) ui.set({ boss: { ...(cur || {}), name: ROSTER[e.key].name, stand: ROSTER[e.key].standName, hp: Math.round(b.hp), hpMax: b.hpMax, phase: e.brain.phase, phases: e.brain.thresholds.length + 1, color: ROSTER[e.key].color, overwritten: !!b.overwritten } });
    }
    this._pubObjective();
    void g;
  }

  async onBossDefeated() {
    const g = this.game;
    const e = this.encounter;
    if (!e || e.done) return;
    e.done = true;
    e.brain.enabled = false;
    g.combatActive = false;
    ui.set({ boss: null });
    g.slowMo(0.25, 1.2);
    g.camera.shake(0.8);
    audio.play('heavyHit');
    g.time.end(true);
    // clear hazards / projectiles
    for (const h of [...g.combat.hazards]) g.combat.removeHazard(h);
    await new Promise((r) => setTimeout(r, 1300));
    if (e.step.final) return this.finishFinal();
    e.boss.revive(1);
    e.boss.dead = true;
    if (e.key === 'avdol') { audio.setWeather(1, 0.9); }
    await g.seq.run((seq) => bossVictory(g, seq, { player: this.player, boss: e.boss, data: e.data }));
    this.addClue(e.data.clue);
    if (!this.p.defeated.includes(e.key)) this.p.defeated.push(e.key);
    this.p.fragments += 2;
    toast('+2 Stand Fragments', 'reward');
    const up = STORY_UPGRADES[e.key];
    if (up) {
      for (const [k, v] of Object.entries(up)) if (k !== 'note') this.p.upgrades[k] = typeof v === 'number' ? Math.max(this.p.upgrades[k] || 0, v) : v;
      toast(up.note, 'reward', 6500);
      this.applyUpgrades();
    }
    this.player.hp = this.player.hpMax;
    if (e.key === 'jotaro') { this.completeStep(); return; }
    g.removeActor(e.boss);
    this.encounter = null;
    this.completeStep();
  }

  onPlayerDeath() {
    const g = this.game;
    if (this.dead) return;
    this.dead = true;
    g.slowMo(0.3, 1.5);
    audio.play('stinger');
    setTimeout(() => {
      ui.set({ overlay: 'death' });
      g.overlayOpen = true;
      g.input.setPointerLock(false);
    }, 1600);
  }

  // Retry from the start of the current boss phase (or reload the checkpoint outside fights).
  retry() {
    const g = this.game;
    ui.set({ overlay: null });
    g.overlayOpen = false;
    g.input.setPointerLock(true);
    this.dead = false;
    const e = this.encounter;
    g.time.end(true);
    for (const h of [...g.combat.hazards]) { if (!h.persistent) g.combat.removeHazard(h); }
    for (const p of [...g.combat.projectiles]) p.life = 0;
    this.player.revive(this.player.hpMax);
    this.player.energy = this.player.energyMax;
    this.player.tsCharge = 1;
    if (e && e.boss && !e.done) {
      const ph = e.brain.phase;
      const hp = e.phaseHp[ph - 1] ?? e.boss.hpMax;
      e.boss.revive(Math.max(hp, 1));
      e.boss.hp = hp;
      e.boss.cancelAction();
      const pp = e.center.clone().add(new THREE.Vector3(0, 0, 8));
      this.player.pos.copy(pp); this.player.pos.y = g.world.groundAt(pp.x, pp.z, pp.y + 3);
      const bp = e.center.clone().add(new THREE.Vector3(0, 0, -7));
      e.boss.pos.copy(bp); e.boss.pos.y = g.world.groundAt(bp.x, bp.z, bp.y + 3);
      toast(`Phase ${ph} restarted.`);
      return;
    }
    // outside an encounter: back to the last checkpoint
    this.loadCheckpoint();
  }

  async loadCheckpoint() {
    const g = this.game;
    ui.set({ overlay: null });
    g.overlayOpen = false;
    this.dead = false;
    const d = Save.load('auto');
    if (d) g.progress = d;
    await g._startCampaign(false);
  }

  endEncounter() {
    const g = this.game;
    const e = this.encounter;
    if (!e) return;
    this.encounter = null;
    g.combatActive = false;
    ui.set({ boss: null, clash: null });
    if (e.boss && g.actors.includes(e.boss)) g.removeActor(e.boss);
  }

  // ---------------------------------------------------------------- Jotaro: the final clash
  finalClash() {
    const g = this.game;
    const e = this.encounter;
    e.clashDone = true;
    e.brain.enabled = false;
    const b = e.boss; const pl = this.player;
    b.cancelAction(); pl.cancelAction();
    pl.kit.ensureStand(); b.kit.ensureStand();
    const mid = pl.pos.clone().lerp(b.pos, 0.5);
    pl.faceTowards(b.pos, true); b.faceTowards(pl.pos, true);
    const dir = b.pos.clone().sub(pl.pos).setY(0).normalize();
    pl.pos.copy(mid).addScaledVector(dir, -2.4); b.pos.copy(mid).addScaledVector(dir, 2.4);
    pl.override = (t) => Poses.castBoth(1); b.override = (t) => Poses.castBoth(1);
    pl.stand.play({ name: 'clashRush', dur: 99, pose: (k, self) => Poses.rush(self.action.t, 18) });
    b.stand.play({ name: 'clashRush', dur: 99, pose: (k, self) => Poses.rush(self.action.t, 18) });
    pl.stand.slot = 'front'; b.stand.slot = 'front';
    e.clash = { meter: 0.5, t: 0, dur: 7 };
    audio.play('stinger');
    g.vfx.text(mid.clone().add(new THREE.Vector3(0, 3, 0)), 'ORA ORA / MUDA MUDA', '#ffffff', 2, 0.9);
    ui.set({ clash: { meter: 0.5, time: 7 } });
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    g.camera.setCinematic(mid.clone().addScaledVector(side, 6).add(new THREE.Vector3(0, 2.2, 0)), mid.clone().add(new THREE.Vector3(0, 1.6, 0)), 42);
  }

  updateClash(dt) {
    const g = this.game;
    const e = this.encounter;
    const c = e.clash;
    c.t += dt;
    if (g.input.pressed('light') || g.input.pressed('rush') || g.input.pressed('confirm')) c.meter += 0.035;
    c.meter -= dt * (0.11 + 0.04 * g.difficulty);
    const mid = this.player.pos.clone().lerp(e.boss.pos, 0.5).add(new THREE.Vector3(0, 1.5, 0));
    if (Math.random() < 0.7) g.vfx.impact(mid.clone().add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5))), Math.random() < 0.5 ? 0xffd34d : 0x9f8cff, 0.8);
    if (Math.random() < 0.3) audio.play('punch', { power: 0.6 });
    ui.set({ clash: { meter: Math.max(0, Math.min(1, c.meter)), time: Math.max(0, c.dur - c.t) } });
    if (c.meter >= 1 || c.meter <= 0 || c.t >= c.dur) {
      const won = c.meter >= 0.5;
      e.clash = null;
      ui.set({ clash: null });
      this.player.override = null; e.boss.override = null;
      this.player.stand.cancelAction(); e.boss.stand.cancelAction();
      this.player.stand.slot = 'guard'; e.boss.stand.slot = 'guard';
      g.camera.toGameplay(0.6);
      e.brain.enabled = true;
      if (won) g.combat.applyHit(e.boss, this.player, { damage: e.boss.hp * 0.75, stun: 2, knock: 14, launch: 6, kind: 'heavy', unblockable: true, noCounter: true });
      else g.combat.applyHit(this.player, e.boss, { damage: 45, stun: 1.2, knock: 12, launch: 4, kind: 'heavy', unblockable: true, noCounter: true });
    }
  }

  // ---------------------------------------------------------------- Heaven
  async heavenStep() {
    const g = this.game;
    g.world.warm(new THREE.Vector3(SANCTUARY.x, SANCTUARY.y, SANCTUARY.z));
    const altar = g.world.altar ? g.world.altar.clone() : new THREE.Vector3(SANCTUARY.x, SANCTUARY.y + 4.9, SANCTUARY.z - 42);
    // Jotaro kneels in the forecourt; the Arrow rests on the altar
    let jotaro = this.encounter?.boss;
    if (!jotaro || !g.actors.includes(jotaro)) {
      jotaro = await createFighter(g, 'jotaro', { team: 1 });
      jotaro.pos.set(SANCTUARY.x + 3, SANCTUARY.y, SANCTUARY.z + 2);
      g.addActor(jotaro);
    }
    jotaro.dead = false; jotaro.state = 'free'; jotaro.knockdown = 0; jotaro.hp = jotaro.hpMax;
    this.encounter = null;
    const arrow = await instantiate('arrow');
    arrow.position.copy(altar).add(new THREE.Vector3(0, 0.1, 0));
    arrow.scale.setScalar(1.4);
    g.engine.scene.add(arrow);
    if (!this.player.pos.distanceTo(altar) || this.player.pos.distanceTo(altar) > 40) {
      this.player.pos.set(SANCTUARY.x, SANCTUARY.y, SANCTUARY.z + 6);
    }
    g.engine.fx.uFade.value = 0;
    await g.seq.run((seq) => heavenCinematic(g, seq, {
      player: this.player, jotaro, altar, arrowMesh: arrow,
      onTransform: async () => {
        const old = this.player;
        const pos = old.pos.clone(); const yaw = old.yaw;
        await this.loadPlayer(true);
        this.player.pos.copy(pos); this.player.yaw = this.player.targetYaw = yaw;
        g.camera.setTarget(this.player, false);
        g.vfx.burst(this.player.chestWorld(new THREE.Vector3()), 0xfff2c8, 120, 14, 0.8, 1.2, { free: true });
        g.vfx.ring(this.player.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 0xfff2c8, 0.5, 30, 1.4, { free: true });
      },
    }));
    arrow.removeFromParent();
    g.removeActor(jotaro);
    this.completeStep();
  }

  async heavenFinisher(target) {
    const g = this.game;
    const e = this.encounter;
    if (!e || e.done) return false;
    e.brain.enabled = false;
    g.time.stop(this.player, 6, { variant: 'heaven' });
    await g.seq.run(async (seq) => {
      const pl = this.player;
      pl.kit.ensureStand();
      const b = target;
      pl.faceTowards(b.pos, true);
      const mid = pl.pos.clone().lerp(b.pos, 0.5).add(new THREE.Vector3(0, 1.4, 0));
      const side = new THREE.Vector3(b.pos.z - pl.pos.z, 0, pl.pos.x - b.pos.x).normalize();
      seq.shot({ from: mid.clone().addScaledVector(side, 5).add(new THREE.Vector3(0, 0.5, 0)), to: mid.clone().addScaledVector(side, 3.2), look: mid, dur: 3, fov: 38 });
      pl.stand.strike({ name: 'heavenRush', dur: 2.6, pose: (k, self) => Poses.rush(self.action.t, 20) });
      for (let i = 0; i < 26; i += 1) {
        await seq.wait(0.09);
        g.vfx.impact(b.chestWorld(new THREE.Vector3()).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.8, 0)), 0xfff2c8, 1);
        g.vfx.fist(pl.stand.jointWorld(i % 2 ? 'handL' : 'handR'), pl.forward(), 0xfff2c8, 0.14, 1.3);
        if (i % 3 === 0) audio.play('punch');
      }
      g.vfx.text(b.chestWorld(new THREE.Vector3()).add(new THREE.Vector3(0, 1, 0)), '無駄無駄無駄無駄', '#fff2c8', 2, 1);
      g.engine.fx.uHeaven.value = 1;
      await seq.wait(0.8);
    });
    g.time.end();
    g.combat.applyHit(target, this.player, { damage: target.hp + 10, stun: 3, knock: 14, launch: 7, kind: 'heavy', unblockable: true, noCounter: true });
    return true;
  }

  async finishFinal() {
    const g = this.game;
    const e = this.encounter;
    const jotaro = e.boss;
    jotaro.revive(1); jotaro.dead = true;
    g.combatActive = false;
    await g.seq.run((seq) => endingCinematic(g, seq, { player: this.player, jotaro, flags: this.p.flags }), { skippable: true });
    this.p.flags.completed = true;
    this.encounter = null;
    this.completeStep();
  }

  async endingStep() {
    const g = this.game;
    this.autosave(true);
    g.engine.fx.uFade.value = 1;
    audio.setMusic('credits');
    ui.set({ screen: 'credits', hud: null, boss: null, objective: null });
    g.input.setPointerLock(false);
  }

  onRegion(r) {
    if (!this.encounter && !this.game.combatActive && !this.game.inCinematic) ui.set({ region: { name: r.name, blurb: r.blurb, id: Date.now() } });
    audio.setMusic(this.encounter ? 'boss' : 'explore');
  }

  // ---------------------------------------------------------------- per-frame
  update(dt, realDt) {
    const g = this.game;
    if (this.dead) return;
    this.ctrl?.update(dt, realDt);
    this.h?.update?.(dt, realDt);
    // Heaven DIO's overwrite marks on enemies
    void realDt;
    // horse whistle hint once
    if (this.p.step >= 3 && !this.p.flags.hint_horse) this.hint('horse');
    // gentle rain/wind by region
    void g;
  }

  // region list for the map overlay
  mapData() {
    const pois = [];
    for (const s of STEPS) {
      if (!s.poi && !s.quest) continue;
      const id = s.poi || { q1: 'telegraph', q2: 'railyard', q3: 'bridgeHol', q4: 'enyaCabin', q5: 'osirisHall', q6: 'gebMarsh', q7: 'atumOverlook', q8: 'creamRuins', q9: 'sanctuaryStair' }[s.quest];
      const q = resolvePOI(id);
      if (!q) continue;
      const idx = STEPS.indexOf(s);
      pois.push({ id, label: q.label, x: q.x, z: q.z, kind: s.boss ? 'boss' : 'quest', done: idx < this.p.step, current: idx === this.p.step, name: s.boss ? ROSTER[s.boss].name : s.chapter });
    }
    const pl = this.player?.pos;
    return { regions: REGIONS.map((r) => ({ id: r.id, name: r.name, z: r.z, x: roadX(r.z) })), pois, player: pl ? { x: pl.x, z: pl.z } : null, objective: this.objectiveData?.pos ? { x: this.objectiveData.pos.x, z: this.objectiveData.pos.z } : null, current: regionAt(pl ? pl.z : 0).name };
  }

  dispose() {
    const g = this.game;
    this.h?.dispose?.();
    this.endEncounter();
    this.removeBeacon();
    if (this.symbol) this.symbol.removeFromParent();
    g.combatActive = false;
    g.player = null;
  }
}
