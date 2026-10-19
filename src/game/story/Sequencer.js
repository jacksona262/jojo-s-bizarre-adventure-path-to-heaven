import * as THREE from 'three';
import { ui } from '../core/Store';
import { audio } from '../core/Audio';
import { ease } from '../camera/CameraRig';

// Async cinematic scripting. Scripts are `async (seq) => { ... }` and use seq.* helpers.
// Skipping resolves every wait instantly, so a skipped scene still reaches its exact end state.

// how much longer than the original pacing each spoken line stays on screen
export const READ_PACE = 1.5;

export class Sequencer {
  constructor(game) {
    this.game = game;
    this.waits = [];
    this.tweens = [];
    this.running = false;
    this.skipping = false;
    this.skippable = true;
    this.choiceResolve = null;
  }

  async run(script, { skippable = true, letterbox = true, keepCamera = false } = {}) {
    const g = this.game;
    this.running = true;
    this.skipping = false;
    this.skippable = skippable;
    g.inCinematic = true;
    ui.set({ letterbox, prompt: null });
    try {
      await script(this);
    } catch (e) {
      console.error('[cinematic]', e);
    }
    this.skipping = false;
    this.running = false;
    g.inCinematic = false;
    ui.set({ letterbox: false, subtitle: null, choice: null });
    if (!keepCamera && g.player) g.camera.toGameplay(1.0);
  }

  skip() {
    if (!this.running || !this.skippable || this.choiceResolve) return;
    this.skipping = true;
    for (const w of this.waits) w.resolve();
    this.waits = [];
    for (const t of this.tweens) { t.fn(1); t.resolve(); }
    this.tweens = [];
    this.game.camera.finishShot();
    ui.set({ subtitle: null });
  }

  wait(sec) {
    if (this.skipping || sec <= 0) return Promise.resolve();
    return new Promise((resolve) => this.waits.push({ remaining: sec, resolve }));
  }

  tween(dur, fn, easing = 'inOut') {
    const e = ease[easing] || ease.inOut;
    if (this.skipping || dur <= 0) { fn(1); return Promise.resolve(); }
    return new Promise((resolve) => this.tweens.push({ t: 0, dur, fn: (k) => fn(e(k)), resolve }));
  }

  // Camera
  shot(opts) {
    const p = this.game.camera.playShot(opts);
    if (this.skipping) this.game.camera.finishShot();
    return p;
  }

  async shotAndWait(opts, extra = 0) { await this.shot(opts); await this.wait(extra); }

  cut(pos, look, fov = 42, roll = 0) { this.game.camera.setCinematic(pos, look, fov, roll); }

  // Subtitled line. Duration scales with text length unless given; every line is held READ_PACE
  // times as long so there is time to read it (scenes without dialogue keep their pace).
  async say(speaker, text, dur = null, color = null) {
    if (this.skipping) return;
    const d = (dur ?? Math.min(7.5, 1.8 + text.length * 0.045)) * READ_PACE;
    ui.set({ subtitle: { speaker, text, color } });
    await this.wait(d);
    if (!this.skipping && ui.get().subtitle?.text === text) ui.set({ subtitle: null });
  }

  // Dialogue choice: never skipped. Resolves with the chosen option id.
  choice(prompt, options) {
    this.skipping = false;
    return new Promise((resolve) => {
      ui.set({ choice: { prompt, options }, subtitle: null });
      this.choiceResolve = (id) => { this.choiceResolve = null; ui.set({ choice: null }); audio.play('uiSelect'); resolve(id); };
    });
  }

  pick(id) { if (this.choiceResolve) this.choiceResolve(id); }

  async fade(to, dur = 0.8) {
    const fx = this.game.engine.fx.uFade;
    const from = fx.value;
    await this.tween(dur, (k) => { fx.value = from + (to - from) * k; ui.set({ fade: fx.value }); }, 'linear');
  }

  flash(color = 0xffffff, amount = 0.8, dur = 0.25) {
    const fx = this.game.engine.fx;
    fx.uFlashColor.value.set(color);
    fx.uFlash.value = amount;
    this.tweens.push({ t: 0, dur, fn: (k) => { fx.uFlash.value = amount * (1 - k); }, resolve: () => {} });
  }

  lightning(at = null, big = false) { this.game.weather?.strike(at, big); }

  // Walk an actor to a mark: the pace eases in and out (so the gait starts, carries and settles
  // with weight), the actor faces the way they walk and looks where they are going.
  async moveTo(actor, to, dur, faceMove = true) {
    const from = actor.pos.clone();
    if (faceMove) actor.faceTowards(to, true);
    const target = to.clone();
    if (actor.anim && !actor.anim.lookAt) { actor.anim.lookAt = target.clone().setY(target.y + 1.6); actor._walkLook = true; }
    await this.tween(dur, (k) => {
      const x = from.x + (target.x - from.x) * k;
      const z = from.z + (target.z - from.z) * k;
      actor.cinePos = new THREE.Vector3(x, this.game.world ? this.game.world.groundAt(x, z, actor.pos.y + 1) : target.y, z);
      actor.pos.copy(actor.cinePos);
    }, 'inOut');
    actor.cinePos = null;
    if (actor._walkLook && actor.anim) { actor.anim.lookAt = null; actor._walkLook = false; }
  }

  place(actor, pos, yaw = null) {
    actor.pos.copy(pos);
    if (this.game.world) actor.pos.y = this.game.world.groundAt(pos.x, pos.z, pos.y + 1);
    if (yaw !== null) { actor.yaw = yaw; actor.targetYaw = yaw; actor.group.rotation.y = yaw; }
    actor.vel.set(0, 0, 0);
  }

  update(realDt) {
    for (let i = this.waits.length - 1; i >= 0; i -= 1) {
      const w = this.waits[i];
      w.remaining -= realDt;
      if (w.remaining <= 0) { this.waits.splice(i, 1); w.resolve(); }
    }
    for (let i = this.tweens.length - 1; i >= 0; i -= 1) {
      const t = this.tweens[i];
      t.t += realDt;
      const k = Math.min(1, t.t / t.dur);
      t.fn(k);
      if (k >= 1) { this.tweens.splice(i, 1); t.resolve(); }
    }
  }
}
