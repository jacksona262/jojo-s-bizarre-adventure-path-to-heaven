import * as THREE from 'three';
import { Engine } from './core/Engine';
import { Input } from './core/Input';
import { audio } from './core/Audio';
import { ui, toast } from './core/Store';
import { World } from './world/World';
import { Weather } from './world/Weather';
import { VFX } from './vfx/VFX';
import { ScreenFX } from './vfx/ScreenFX';
import { Combat } from './combat/Combat';
import { TimeControl } from './combat/TimeControl';
import { CameraRig } from './camera/CameraRig';
import { Sequencer } from './story/Sequencer';
import { Save, newProgress } from './state/Save';
import { onAssetProgress, preload } from './assets/AssetLibrary';
import { TitleScene } from './modes/TitleScene';
import { Campaign } from './story/Campaign';
import { VersusMode } from './modes/Versus';
import { Character } from './actors/Character';
import { prof } from './dev/Profiler';
import { installFoeFX } from './vfx/FoeFX';
import { Account } from './online/Account';
import { CloudSaves } from './online/CloudSaves';
import { DebugDraw } from './dev/DebugDraw';

// Top-level orchestrator. One instance lives for the lifetime of the page.

export class Game {
  constructor(mount) {
    this.mount = mount;
    this.engine = new Engine(mount);
    this.input = new Input(this.engine.renderer.domElement);
    this.settings = Save.settings();
    this.vfx = new VFX(this.engine.scene);
    this.screen = new ScreenFX(this.engine);
    this.combat = new Combat(this);
    this.time = new TimeControl(this);
    this.camera = new CameraRig(this);
    this.seq = new Sequencer(this);
    this.actors = [];
    this.clock = 0;
    this.mode = null;
    this.paused = false;
    this.overlayOpen = false;
    this.inCinematic = false;
    this.progress = newProgress();
    this.hudT = 0;
    this.slow = null;
    this.applySettings(this.settings);
    this.engine.add(this);
    window.__game = this;
    // developer tools are opt-in (?dev, ?arena, or localStorage pth.dev = 1); players never see them
    const qsDev = new URLSearchParams(window.location.search);
    let devFlag = false;
    try { devFlag = localStorage.getItem('pth.dev') === '1'; } catch { /* storage blocked */ }
    this.dev = qsDev.has('dev') || qsDev.has('arena') || devFlag;
    // dev and QA sessions never touch the player's real saves
    Save.setSandbox(this.dev || qsDev.has('step') || qsDev.has('qa'));
    this.debugDraw = new DebugDraw(this.engine.scene);
    this.devHitboxes = false;
    // combo counter for the HUD: consecutive blows the player lands without being hit back
    this.combo = { n: 0, dmg: 0, t: 0, id: 0 };
    this.combat.on((ev) => {
      const pl = this.player;
      if (!pl || ev.type !== 'hit') return;
      if (ev.attacker === pl && ev.target !== pl) {
        const c = this.combo;
        if (this.clock - c.t > 1.6) { c.n = 0; c.dmg = 0; }
        c.n += ev.released || 1; c.dmg += ev.hit?.damage || 0; c.t = this.clock; c.id += 1;
        if (c.n >= 2) ui.set({ combo: { n: c.n, dmg: Math.round(c.dmg), id: c.id } });
      } else if (ev.target === pl && this.combo.n) {
        this.combo.n = 0; this.combo.dmg = 0;
        ui.set({ combo: null });
      }
    });
    this._unsubAssets = onAssetProgress((p) => {
      const l = ui.get().loading;
      if (l) ui.set({ loading: { ...l, assets: p } });
    });
  }

  // ---------------------------------------------------------------- lifecycle
  async boot() {
    ui.set({ screen: 'loading', loading: { label: 'Gathering the storm', progress: 0.05 } });
    this.engine.start();
    await new Promise((r) => setTimeout(r, 30));
    this.world = new World(this.engine);
    this._applyRenderDistance();
    this.weather = new Weather(this.engine);
    this.engine.add({ onQuality: (s) => { this.world.onQuality(s); this.weather.onQuality(s); } });
    installFoeFX(this);
    this.world.onRegion = (r) => {
      this.weather.setRegion(r);
      audio.setRegion(r?.id);
      if (this.mode?.onRegion) this.mode.onRegion(r);
    };
    ui.set({ loading: { label: 'Raising Ebon Crossing', progress: 0.35 } });
    // account + cloud saves load alongside the title assets (never blocks on the network for long)
    const accountReady = this.initAccount();
    await preload(['dioHome', 'theWorld']);
    await Promise.race([accountReady, new Promise((r) => setTimeout(r, 6000))]);
    ui.set({ loading: { label: 'DIO awaits', progress: 0.8 } });
    await this.toTitle(true);
    // QA: ?step=<story step id> starts the campaign at that beat with a fresh profile
    const qs = new URLSearchParams(window.location.search);
    const stepId = qs.get('step');
    if (stepId || qs.has('qa') || this.dev) import('./dev/QA').then((m) => m.attachQA());
    if (this.dev) ui.set({ dev: true });
    // dev combat arena: ?arena=<fighter>[&p1=dio][&map=street]
    const arenaKey = qs.get('arena');
    if (arenaKey) {
      await this.startVersus({ p1: qs.get('p1') || 'dio', cpu: arenaKey, difficulty: qs.get('diff') || 'normal', arena: qs.get('map') || 'street', dev: true });
      return;
    }
    if (stepId) {
      const { STEPS } = await import('./story/Campaign');
      const i = STEPS.findIndex((s) => s.id === stepId);
      if (i >= 0) {
        this.progress = newProgress();
        this.progress.step = i;
        if (qs.get('upgrades')) this.progress.upgrades = { ...this.progress.upgrades, tsDuration: 2, tsCooldown: 2, knives: true, tsAwareness: true };
        await this._startCampaign(false);
      }
    }
  }

  async toTitle(first = false) {
    await this._leaveMode();
    this.weather.fogTarget = 0.0026;
    this.engine.scene.fog.density = 0.0026;
    const title = new TitleScene(this);
    await title.load();
    this.mode = { name: 'title', scene: title, update: (dt, raw) => title.update(dt, raw), dispose: () => title.dispose() };
    this.title = title;
    this.input.setPointerLock(false);
    audio.setMusic('title');
    audio.setWeather(0.9, 0.7);
    ui.set({ screen: 'title', loading: null, overlay: null, hud: null, boss: null, objective: null, letterbox: false, subtitle: null });
    if (!first) this.fadeIn(1.2);
  }

  async _leaveMode() {
    if (this.mode) { try { this.mode.dispose?.(); } catch (e) { console.error(e); } }
    this.mode = null;
    this.title = null;
    this.time.end(true);
    this.combat.clear();
    for (const a of [...this.actors]) this.removeActor(a, true);
    this.actors = [];
    this.vfx.clear();
    this.screen.reset();
    this.player = null;
    this.paused = false;
    this.overlayOpen = false;
    this.engine.timeScale = 1;
    this.camera.lock = null;
    if (this.horse) { this.horse.group.removeFromParent(); this.horse = null; }
    // nothing on screen belongs to the mode being left (a stale "Dismount" prompt from riding in
    // the story used to follow the player into Versus)
    ui.set({ prompt: null, subtitle: null, choice: null, boss: null, objective: null, timeStop: null, region: null, letterbox: false, noise: null, combo: null, bossCard: null });
  }

  async newGame() {
    audio.init();
    audio.play('uiSelect');
    this.progress = newProgress();
    await this._startCampaign(true);
  }

  async continueGame(slot = null) {
    audio.init();
    const pick = slot ? { slot, data: Save.load(slot) } : Save.latest();
    if (!pick || !pick.data) { toast('No saved journey found.'); return; }
    this.progress = Save.load(pick.slot);
    await this._startCampaign(false);
  }

  async _startCampaign(fresh) {
    const fromTitle = this.mode?.name === 'title';
    if (fromTitle) {
      // fade the UI, keep the storm, glide the camera toward the valley
      ui.set({ screen: 'transition' });
      await this.fadeOut(1.4);
    }
    ui.set({ screen: 'loading', loading: { label: fresh ? 'The night the Arrow fell' : 'Returning to the road', progress: 0.1 } });
    await this._leaveMode();
    const campaign = new Campaign(this);
    this.mode = campaign;
    try {
      await campaign.start(fresh);
    } catch (e) {
      console.error('[campaign start]', e);
      toast('Failed to start the campaign: ' + e.message, 'error', 6000);
    }
    this.prewarm();
  }

  // Compile every shader the mode can use up front (including hidden Stands and pooled effects),
  // so the first summon, hit flash or time stop never stalls a frame on shader compilation.
  prewarm() {
    const scene = this.engine.scene;
    const hidden = [];
    scene.traverse((o) => { if (!o.visible && (o.isMesh || o.isPoints || o.isGroup || o.isSprite)) { hidden.push(o); o.visible = true; } });
    try { this.engine.renderer.compile(scene, this.engine.camera); } catch (e) { console.warn('[prewarm]', e); }
    for (const o of hidden) o.visible = false;
  }

  async startVersus(sel) {
    audio.init();
    ui.set({ screen: 'loading', loading: { label: 'Preparing the duel', progress: 0.1 } });
    await this.fadeOut(0.5);
    await this._leaveMode();
    const vs = new VersusMode(this);
    this.mode = vs;
    await vs.start(sel);
    this.prewarm();
  }

  openVersusSelect() {
    audio.init();
    audio.play('uiSelect');
    ui.set({ screen: 'versusSelect' });
  }

  // ---------------------------------------------------------------- helpers
  addActor(a) { if (!this.actors.includes(a)) this.actors.push(a); if (!a.group.parent) this.engine.scene.add(a.group); if (a.stand && !a.stand.group.parent) this.engine.scene.add(a.stand.group); return a; }
  removeActor(a, quiet = false) {
    this.actors = this.actors.filter((x) => x !== a);
    this.combat.remove(a);
    a.kit?.dispose?.();
    a.remove();
    this.vfx.afterimages.release(a);
    if (a.stand) this.vfx.afterimages.release(a.stand);
    void quiet;
  }

  async spawnNPC(partKey, pos, yaw = 0, opts = {}) {
    const c = new Character(this, { partKey, name: opts.name || partKey, team: 2, style: opts.style || 'neutral' });
    await c.load();
    c.pos.copy(pos);
    c.pos.y = this.world.groundAt(pos.x, pos.z, pos.y + 2);
    c.yaw = c.targetYaw = yaw;
    c.group.rotation.y = yaw;
    if (opts.idle) c.idlePose = opts.idle;
    this.addActor(c);
    return c;
  }

  notify(text, kind = 'info') { toast(text, kind); }

  slowMo(scale, dur) {
    this.engine.timeScale = scale;
    this.slow = { t: dur };
  }

  fadeOut(dur = 0.8) { return this._fade(1, dur); }
  fadeIn(dur = 0.8) { return this._fade(0, dur); }
  _fade(to, dur) {
    const fx = this.engine.fx.uFade;
    const from = fx.value;
    return new Promise((res) => {
      let t = 0;
      const step = { update: (dt, raw) => { t += raw; const k = Math.min(1, t / dur); fx.value = from + (to - from) * k; if (k >= 1) { this.engine.remove(step); res(); } } };
      this.engine.add(step);
    });
  }

  // Signed-in players: switch saves to their account, pull cloud copies, then ask for a username
  // (mandatory) and offer to bring a signed-out journey along. Signed-out players play as guests.
  async initAccount() {
    try {
      await Account.init();
      if (!Account.loggedIn || Save.sandboxed) { ui.set({ account: { loggedIn: Account.loggedIn, username: Account.username } }); return; }
      Save.setAccount(Account.id);
      CloudSaves.enable(true);
      await CloudSaves.pull();
      const pend = { loggedIn: true, username: Account.username, needsUsername: Account.needsUsername };
      const guest = Save.guestSaves();
      if (guest.length && !Save.raw('meta.guestOffer')) pend.guestImport = guest.map((x) => ({ slot: x.slot, chapter: x.data.chapterName, savedAt: x.data.savedAt }));
      ui.set({ account: pend });
      Account.on(() => ui.set({ account: { ...ui.get().account, loggedIn: Account.loggedIn, username: Account.username, needsUsername: Account.needsUsername } }));
    } catch (e) {
      console.warn('[account] init failed', e);
      ui.set({ account: { loggedIn: false, error: true } });
    }
  }

  applySettings(s) {
    // changing difficulty in the middle of a timed run takes it out of the ranked categories
    if (s.difficulty && this.mode?.name === 'campaign') {
      const run = this.progress?.run;
      if (run && !run.done && run.difficulty !== s.difficulty) run.difficulty = 'mixed';
    }
    this.settings = { ...this.settings, ...s };
    const st = this.settings;
    this.engine.setQuality(st.quality);
    this._applyRenderDistance();
    if (this.screen) this.screen.level = st.screenFx || 'full';
    audio.applyVolumes({ master: st.master, music: st.music, sfx: st.sfx, ambience: st.ambience });
    this.input.sensitivity = st.sensitivity;
    this.input.invertY = st.invertY;
    const diff = { story: [0.55, 0.7], normal: [1, 1], hard: [1.35, 1.25] }[st.difficulty] || [1, 1];
    this.combat.damageMul = { 0: 1, 1: diff[0] };
    this.difficulty = diff[1];
    Save.saveSettings(this.settings);
  }

  // trees and bushes beyond this are not drawn; everything else stays in sight
  _applyRenderDistance() {
    const d = { near: 150, medium: 230, far: 330, max: Infinity }[this.settings.renderDistance] ?? 230;
    if (this.world) { this.world.vegDistance = d; this.world._vegT = 0; }
  }

  setPaused(p, overlay = 'pause') {
    if (!this.mode || this.mode.name === 'title') return;
    this.paused = p;
    this.overlayOpen = p;
    ui.set({ overlay: p ? overlay : null });
    this.input.setPointerLock(!p && this.mode?.name !== 'title');
    if (p) audio.applyVolumes({ music: this.settings.music * 0.4 }); else audio.applyVolumes({ music: this.settings.music });
  }

  openOverlay(name) {
    if (this.inCinematic) return;
    if (ui.get().overlay === name) { this.setPaused(false); return; }
    this.setPaused(true, name);
  }

  // ---------------------------------------------------------------- frame
  update(dt, realDt) {
    const input = this.input;
    input.update(realDt);
    if (input.lastDevice !== ui.get().device) ui.set({ device: input.lastDevice });

    // global input
    const scr = ui.get().screen;
    if (scr === 'game' || scr === 'versus') {
      if (this.inCinematic) {
        if (input.pressed('skip')) this.seq.skip();
      } else if (!ui.get().minigame) {
        if (input.pressed('pause')) { if (this.paused) this.setPaused(false); else this.setPaused(true, 'pause'); }
        if (this.mode?.name === 'campaign' && !this.paused) {
          if (input.pressed('journal')) this.openOverlay('journal');
          if (input.pressed('map')) this.openOverlay('map');
          if (input.pressed('upgrades')) this.openOverlay('upgrades');
        } else if (this.paused && this.mode?.name === 'campaign') {
          if (input.pressed('journal') && ui.get().overlay === 'journal') this.setPaused(false);
          if (input.pressed('map') && ui.get().overlay === 'map') this.setPaused(false);
          if (input.pressed('upgrades') && ui.get().overlay === 'upgrades') this.setPaused(false);
        }
      }
    }

    if (this.slow) { this.slow.t -= realDt; if (this.slow.t <= 0) { this.slow = null; this.engine.timeScale = 1; } }
    this.screen.update(realDt);
    // (an online match can't be paused: the opponent keeps playing while your menu is open)
    if (this.paused && !this.mode?.online) {
      this.camera.update(0, realDt, null);
      return;
    }
    this.clock += dt;
    // a cinematic never plays inside someone's stopped or erased time
    if (this.inCinematic && this.time.state && !this.time.state.cinematic) this.time.end(true);
    this.time.update(realDt);
    prof.begin('mode');
    if (this.mode?.update) this.mode.update(dt, realDt);
    prof.end('mode');

    prof.begin('actors');
    for (const a of this.actors) {
      if (a.kit) a.kit.update(a.isFrozen() && !this.time.allowed.has(a) ? 0 : dt);
      a.update(dt);
      if (a.stand) a.stand.update(dt);
    }
    if (this.horse) this.horse.update(dt);
    prof.end('actors');
    prof.begin('combat');
    this.combat.update(dt, realDt);
    prof.end('combat');
    const camPos = this.engine.camera.position;
    prof.begin('vfx');
    this.vfx.update(dt, realDt, camPos);
    prof.end('vfx');
    if (this.world) {
      const focus = this.player ? this.player.pos : (this.title?.balcony || camPos);
      prof.begin('world');
      this.world.update(dt, realDt, focus, camPos);
      prof.end('world');
      prof.begin('weather');
      this.weather.update(this.time.stopped || this._frozenWeather ? 0 : dt, realDt, focus);
      prof.end('weather');
      const indoor = this.world.isIndoor(camPos);
      this.weather.rain.visible = !indoor && this.weather.rainIntensity > 0.05;
      this.weather.atmo.points.visible = !indoor;
      if (indoor !== this._indoor) { this._indoor = indoor; audio.setWeather(indoor ? 0.35 : 1, indoor ? 0.2 : 0.8); }
      this.world.flash = this.weather.flash;
      this.engine.fx.uFlash.value = Math.max(this.engine.fx.uFlash.value * Math.exp(-realDt * 8), this.weather.flash * 0.05);
    }
    prof.begin('camera');
    this.camera.update(dt, realDt, (this.inCinematic || this.overlayOpen) ? null : input);
    prof.end('camera');
    this.debugDraw.update(realDt);
    this.seq.update(realDt);
    audio.tickMusic();
    audio.tickAmbience(this.engine.time);

    // HUD at 15 Hz
    this.hudT -= realDt;
    if (this.hudT <= 0) {
      this.hudT = 1 / 15;
      if (this.combo.n && this.clock - this.combo.t > 1.6) { this.combo.n = 0; this.combo.dmg = 0; ui.set({ combo: null }); }
      this.mode?.publishHud?.();
      if (this.settings.showFps) ui.set({ debug: `${this.engine.fps.toFixed(0)} fps` });
    }
  }

  dispose() {
    this._unsubAssets?.();
    this._leaveMode();
    this.input.dispose();
    this.engine.dispose();
    audio.setMusic('none');
    if (window.__game === this) window.__game = null;
  }
}

export { THREE };
