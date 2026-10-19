import * as THREE from 'three';
import { audio } from '../core/Audio';
import { ui } from '../core/Store';

// Time stop (The World / Star Platinum) and time erasure (King Crimson) are different systems:
//  - stop: everything except the user (and anyone explicitly allowed) is frozen in place; hits on
//          frozen targets are stored and land the instant time resumes.
//  - erase: nobody is frozen, but the interval is skipped. Only the King Crimson user acts with
//          consequence: the victim's actions during the interval do not land, and the user is
//          untouchable and repositions. A destination marker shows where he will reappear.

const _v = new THREE.Vector3();

export class TimeControl {
  constructor(game) {
    this.game = game;
    this.state = null;
    this.allowed = new Set();
    this.allowTimers = new Map();
    this.waveT = 0;
    this.fx = 0;
    this.eraseFx = 0;
  }

  get stopped() { return this.state?.kind === 'stop'; }
  get erasing() { return this.state?.kind === 'erase'; }

  isFrozen(e) {
    if (!this.state || this.state.kind !== 'stop' || !e) return false;
    if (this.allowed.has(e)) return false;
    if (e.user && this.allowed.has(e.user)) return false;
    if (e.owner && this.allowed.has(e.owner) && e.freeInStop) return false;
    return true;
  }

  isFrozenProjectile(p, dt = 1 / 60) {
    if (!this.stopped) return false;
    // projectiles launched by the time-stopper travel briefly, then hang in the air
    if (this.allowed.has(p.owner) && (p.stopAge = (p.stopAge || 0) + dt) < 0.3) return false;
    return true;
  }

  stop(user, duration, opts = {}) {
    if (this.state) this.end(true);
    const kind = opts.variant || 'theWorld';
    this.state = { kind: 'stop', variant: kind, user, remaining: duration, total: duration, nextTick: 1, cinematic: !!opts.cinematic };
    this.allowed.clear();
    this.allowed.add(user);
    if (user.stand) this.allowed.add(user.stand);
    for (const e of opts.allow || []) this.allowed.add(e);
    this.waveT = 0;
    const g = this.game;
    g.engine.fx.uTsTint.value.set(kind === 'starPlatinum' ? 0x8f9cff : kind === 'heaven' ? 0xffe8b0 : 0x9effd0);
    audio.play('timeStop');
    audio.setFrozen(true);
    g.vfx.frozen = true;
    if (g.world) g.world.frozen = true;
    g.vfx.timeDome(user.chestWorld(_v.set(0, 0, 0)), kind === 'starPlatinum' ? 0xa0b0ff : 0xd8ffe8, 70, 1.2);
    // signature: a clock face behind the user whose hands whirl and freeze, a refractive
    // shockwave, speed lines converging on the user and the menacing ゴゴゴ
    const c = user.chestWorld(new THREE.Vector3());
    g.vfx.clockDial(c, kind === 'starPlatinum' ? 0xb8b0ff : kind === 'heaven' ? 0xfff2c8 : 0xffd34d, 1.9, 3.6);
    g.screen?.shockwave(c, 1.3, 0.75);
    g.screen?.speedLines(0.85, c, 0.45);
    g.vfx.menacing(c, 'ゴ', 3, kind === 'starPlatinum' ? '#9f8cff' : '#ffd34d');
    g.camera?.shake(0.4);
    ui.set({ timeStop: { remaining: duration, total: duration, user: user.name, variant: kind } });
    if (opts.onEnd) this.state.onEnd = opts.onEnd;
    g.combat?.emit({ type: 'timeStop', user, duration });
  }

  // let an entity move inside someone else's stopped time (DIO in Star Platinum's world)
  allow(e, seconds) {
    if (!this.stopped) return;
    this.allowed.add(e);
    if (e.stand) this.allowed.add(e.stand);
    this.allowTimers.set(e, seconds);
  }

  erase(user, duration, opts = {}) {
    if (this.state) this.end(true);
    this.state = { kind: 'erase', user, remaining: duration, total: duration, dest: opts.dest || null, onEnd: opts.onEnd };
    user.untargetable = true;
    user.ghost = true;
    user.setOpacity?.(0.25);
    audio.play('erase');
    this.game.combat?.emit({ type: 'erase', user, duration });
    ui.set({ timeStop: { remaining: duration, total: duration, user: user.name, variant: 'erase' } });
  }

  end(silent = false) {
    const s = this.state;
    if (!s) return;
    this.state = null;
    const g = this.game;
    if (s.kind === 'stop') {
      this.allowed.clear();
      this.allowTimers.clear();
      audio.setFrozen(false);
      g.vfx.frozen = false;
      if (g.world) g.world.frozen = false;
      if (!silent) { audio.play('timeResume'); if (!s.user.dead) g.screen?.shockwave(s.user.chestWorld(_v), 0.8, 0.55); }
      g.combat?.releaseQueued();
      this.waveT = -0.5;
    } else if (s.kind === 'erase') {
      s.user.untargetable = false;
      s.user.ghost = false;
      s.user.setOpacity?.(1);
      if (!silent) audio.play('timeResume');
    }
    ui.set({ timeStop: null });
    if (s.onEnd) s.onEnd(silent);
    g.combat?.emit({ type: 'timeResume', kind: s.kind, user: s.user });
  }

  update(realDt) {
    const g = this.game;
    const fx = g.engine.fx;
    const s = this.state;
    if (s) {
      s.remaining -= realDt;
      if (s.kind === 'stop') {
        s.nextTick -= realDt;
        if (s.nextTick <= 0) { s.nextTick = 1; audio.play('tick'); }
        for (const [e, t] of this.allowTimers) {
          const nt = t - realDt;
          if (nt <= 0) { this.allowed.delete(e); if (e.stand) this.allowed.delete(e.stand); this.allowTimers.delete(e); } else this.allowTimers.set(e, nt);
        }
      }
      ui.set({ timeStop: { remaining: Math.max(0, s.remaining), total: s.total, user: s.user.name, variant: s.kind === 'erase' ? 'erase' : s.variant } });
      if (s.remaining <= 0 || s.user.dead) this.end();
    }
    // screen effects
    const stopping = this.state?.kind === 'stop';
    this.fx += ((stopping ? 1 : 0) - this.fx) * Math.min(1, realDt * (stopping ? 3 : 6));
    fx.uTimeStop.value = this.fx;
    if (stopping) this.waveT = Math.min(1.6, this.waveT + realDt * 2.4);
    else if (this.waveT < 0) this.waveT = Math.min(0, this.waveT + realDt * 2);
    fx.uTsWave.value = stopping ? this.waveT : Math.max(0, -this.waveT * 2.2);
    if (s && s.kind === 'stop') {
      const p = s.user.chestWorld(_v).project(g.engine.camera);
      fx.uTsCenter.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    }
    const erasing = this.state?.kind === 'erase';
    this.eraseFx += ((erasing ? 1 : 0) - this.eraseFx) * Math.min(1, realDt * 8);
    fx.uErase.value = this.eraseFx;
  }
}
