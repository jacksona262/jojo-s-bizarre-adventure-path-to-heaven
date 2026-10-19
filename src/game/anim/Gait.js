import * as THREE from 'three';
import { solveTwoBone } from './IK';
import * as Poses from './Poses';

// Procedural locomotion driven by foot placement instead of sine-wave joint angles.
// Each foot follows a stance/swing trajectory in character space whose stride length is tied to
// the distance actually travelled (phase advances by v * duty / stride), and the leg joints are
// solved with two-bone IK — so planted feet do not slide. Direction-aware: forward, backpedal,
// strafe and every blend between, plus idle stance, turn-in-place stepping, landing compression,
// wading and lean into acceleration and turns.

const { sin, cos, min, max, abs, PI, hypot, atan2 } = Math;
const TAU = PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (a) => atan2(sin(a), cos(a));

const _foot = { L: new THREE.Vector3(), R: new THREE.Vector3() };
const _hip = new THREE.Vector3();
const _t = new THREE.Vector3();
const _u = new THREE.Vector3();
const _l = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

// Upper-body styles for the idle stance (legs come from the gait solver).
const STANCE = {
  neutral: { width: 1.05, fwdL: 0.02, fwdR: -0.02, crouch: 0 },
  dio: { width: 1.25, fwdL: 0.1, fwdR: -0.08, crouch: 0, hipsYaw: 0.1 },
  boss: { width: 1.45, fwdL: 0.08, fwdR: -0.1, crouch: 0.03 },
  combat: { width: 1.55, fwdL: 0.16, fwdR: -0.14, crouch: 0.05, hipsYaw: -0.22 },
  old: { width: 0.95, fwdL: 0.06, fwdR: -0.02, crouch: 0.06 },
  stand: { width: 1.2, fwdL: 0.05, fwdR: -0.05, crouch: 0 },
};

export class Gait {
  constructor(rig) {
    this.rig = rig;
    const U = rig.U;
    this.a = rig.len.thigh;
    this.b = rig.len.shin;
    this.leg = this.a + this.b;
    this.ankleH = U.ankleH;
    this.pelvisY = U.pelvis.y;
    this.hipW = U.hipW;
    this.hipOff = { L: U.hipOffL.clone(), R: U.hipOffR.clone() };
    this.legScale = this.leg / 0.88;
    this.u = 0;
    this.dir = new THREE.Vector2(0, 1);
    this.speed = 0;
    this.moveW = 0;
    this.combatW = 0;
    this.airW = 0;
    this.feetYaw = 0;
    this.turn = null;
    this.land = 0;
    this.lean = 0;
    this.roll = 0;
    this.pose = Poses.rest();
    this._idle = Poses.rest();
    this._guard = Poses.guardStance();
  }

  reset() { this.u = 0; this.speed = 0; this.moveW = 0; this.feetYaw = 0; this.turn = null; this.land = 0; }

  landed(vy) { this.land = Math.max(this.land, clamp01(-vy / 16) * 0.9 + 0.15); }

  // ctx: { vx, vz (local m/s: +x = character's left, +z = forward), accel (local fwd m/s²),
  //        yawRate (rad/s), dYaw (rad this frame), grounded, vy, style, combat, wading, t,
  //        idlePose (optional fn -> upper body pose) }
  update(dt, ctx) {
    const p = this.pose;
    const leg = this.leg;
    const sp = hypot(ctx.vx, ctx.vz);
    this.speed += (sp - this.speed) * min(1, dt * 9);
    if (sp > 0.2) {
      const want = atan2(ctx.vx, ctx.vz);
      const cur = atan2(this.dir.x, this.dir.y);
      const a = cur + wrap(want - cur) * min(1, dt * 10);
      this.dir.set(sin(a), cos(a));
    }
    const moving = sp > 0.25 ? 1 : 0;
    this.moveW += (moving - this.moveW) * min(1, dt * (moving ? 9 : 6));
    this.combatW += ((ctx.combat ? 1 : 0) - this.combatW) * min(1, dt * 6);
    this.airW += ((ctx.grounded ? 0 : 1) - this.airW) * min(1, dt * (ctx.grounded ? 14 : 8));
    this.land = Math.max(0, this.land - dt * 3.2);

    const v = this.speed;
    const vn = v / this.legScale;
    const runK = smooth((vn - 2.5) / 1.6);
    const sprintK = smooth((vn - 5.2) / 1.4);
    const fwd = this.dir.y;
    const side = this.dir.x;
    const back = max(0, -fwd);
    const lat = abs(side);
    const beta = lerp(0.62, 0.33, runK) - 0.06 * sprintK;
    let L = min(leg * (0.36 + 0.16 * vn), leg * lerp(0.8, 0.9, runK));
    L *= 1 - 0.28 * back - 0.4 * lat * (1 - back);
    if (ctx.wading) L *= 0.8;
    if (v > 0.03) this.u = (this.u + dt * v * beta / max(0.1, L)) % 1;

    // ---------------------------------------------------------------- stance (idle) placement
    const st = STANCE[ctx.combat ? 'combat' : (ctx.style in STANCE ? ctx.style : 'neutral')];
    if (this.moveW < 0.35 && ctx.grounded) {
      this.feetYaw = wrap(this.feetYaw - (ctx.dYaw || 0));
      if (!this.turn && abs(this.feetYaw) > 0.6) this.turn = { t: 0, from: this.feetYaw, lead: this.feetYaw > 0 ? 'L' : 'R' };
    } else {
      this.feetYaw *= Math.exp(-dt * 10);
      this.turn = null;
    }
    let turnLift = { L: 0, R: 0 };
    if (this.turn) {
      const tr = this.turn;
      tr.t += dt / 0.4;
      this.feetYaw = tr.from * (1 - smooth(tr.t));
      const first = tr.lead; const second = first === 'L' ? 'R' : 'L';
      turnLift[first] = sin(clamp01(tr.t * 2) * PI) * leg * 0.08;
      turnLift[second] = sin(clamp01(tr.t * 2 - 1) * PI) * leg * 0.08;
      if (tr.t >= 1) { this.turn = null; this.feetYaw = 0; }
    }
    const fy = this.feetYaw;
    const cy = cos(fy); const sy = sin(fy);

    // ---------------------------------------------------------------- feet
    const widthK = lerp(1.0, 0.6, runK) + 0.8 * lat * this.moveW;
    const liftH = leg * (0.075 + 0.085 * runK + (ctx.wading ? 0.07 : 0)) * clamp01(L / (0.45 * leg) + 0.25);
    const heel = leg * (0.05 + 0.05 * runK);
    for (const s of ['L', 'R']) {
      const sgn = s === 'L' ? 1 : -1;
      const ul = (this.u + (s === 'L' ? 0 : 0.5)) % 1;
      let along; let lift;
      if (ul < beta) {
        along = L / 2 - (ul / beta) * L;
        // heel peels off the ground late in stance (toe-off), extending the leg's reach
        lift = heel * clamp01((-along - L * 0.15) / (L * 0.35));
      } else {
        const k = (ul - beta) / (1 - beta);
        along = -L / 2 + smooth(k) * L;
        lift = liftH * sin(PI * Math.pow(k, 0.85));
      }
      // moving placement (character space)
      const mx = sgn * this.hipW * widthK + this.dir.x * along;
      const mz = this.dir.y * along;
      // idle placement, rotated by the planted-feet yaw
      const ix0 = sgn * this.hipW * st.width; const iz0 = s === 'L' ? st.fwdL * leg : st.fwdR * leg;
      const ix = ix0 * cy + iz0 * sy; const iz = -ix0 * sy + iz0 * cy;
      const w = this.moveW;
      _foot[s].set(lerp(ix, mx, w), this.ankleH + lift * w + turnLift[s], lerp(iz, mz, w));
    }

    // ---------------------------------------------------------------- pelvis
    const crouch = leg * (0.015 + 0.05 * runK + 0.035 * sprintK) * this.moveW + leg * lerp(st.crouch, STANCE.combat.crouch, this.combatW) * (1 - this.moveW * 0.5);
    let pelvis = this.pelvisY - crouch;
    const bobAmp = leg * lerp(0.022, 0.034, runK) * this.moveW * min(1, v / 1.4);
    pelvis += lerp(1, -1, runK) * bobAmp * cos(TAU * (2 * this.u - beta));
    pelvis -= this.land * leg * 0.16;
    const sway = this.moveW < 0.5 ? sin(ctx.t * 0.55) * 0.012 * leg * (1 - this.moveW) : 0;
    for (const s of ['L', 'R']) {
      const ho = this.hipOff[s];
      const dh = hypot(_foot[s].x - (ho.x + sway), _foot[s].z - ho.z);
      const maxHip = _foot[s].y + Math.sqrt(max(0, (0.985 * leg) ** 2 - dh * dh));
      pelvis = min(pelvis, maxHip - ho.y);
    }

    // ---------------------------------------------------------------- torso
    const fwdAmt = max(0, fwd) * this.moveW;
    const cyc = cos(TAU * this.u);
    const hipsYaw = -0.11 * cyc * fwdAmt * (1 - 0.4 * runK) + fy * 0.5 + (st.hipsYaw || 0) * (1 - this.moveW);
    const accelLean = Math.max(-0.22, Math.min(0.25, (ctx.accel || 0) * 0.022));
    this.lean += ((0.04 + 0.13 * runK + 0.12 * sprintK) * this.moveW * (1 - back * 0.8) + accelLean - this.lean) * min(1, dt * 8);
    const turnRoll = Math.max(-0.28, Math.min(0.28, -(ctx.yawRate || 0) * v * 0.022)) * this.moveW;
    this.roll += (turnRoll - side * 0.07 * this.moveW - this.roll) * min(1, dt * 7);
    const walkRoll = 0.035 * sin(TAU * this.u) * this.moveW * (1 - runK);

    // upper body: idle style or combat guard, blended with the locomotion arm swing
    const idle = ctx.idlePose ? ctx.idlePose(ctx.t) : Poses.idle(ctx.t, ctx.style);
    const guard = this._guardPose(ctx.t);
    const upper = this.combatW > 0.01 ? Poses.lerpPose(idle, guard, this.combatW, this._idle) : idle;
    const armAmp = (0.34 + 0.42 * runK + 0.15 * sprintK) * (0.35 + 0.65 * fwdAmt);
    const bend = 0.25 + 1.1 * runK;
    const angL = -armAmp * cyc; const angR = armAmp * cyc;
    const armW = this.moveW * (1 - this.combatW * 0.75);
    const swing = (sx, ang, out) => {
      out[0] = sx; out[1] = -cos(ang); out[2] = sin(ang);
      return out;
    };
    p.uaL = lerp3(upper.uaL, swing(0.2 + 0.05 * lat, angL, [0, 0, 0]), armW);
    p.faL = lerp3(upper.faL, swing(0.1, angL + bend, [0, 0, 0]), armW);
    p.uaR = lerp3(upper.uaR, swing(-0.2 - 0.05 * lat, angR, [0, 0, 0]), armW);
    p.faR = lerp3(upper.faR, swing(-0.1, angR + bend, [0, 0, 0]), armW);
    if (upper.handL) p.handL = upper.handL; else delete p.handL;
    if (upper.handR) p.handR = upper.handR; else delete p.handR;
    if (upper.clavL) p.clavL = upper.clavL; else delete p.clavL;
    if (upper.clavR) p.clavR = upper.clavR; else delete p.clavR;

    const w = this.moveW;
    const us = upper.spine || ZERO; const uc = upper.chest || ZERO; const uh = upper.head || ZERO; const un = upper.neck || ZERO;
    p.hips = [this.lean * 0.35, hipsYaw, this.roll + walkRoll];
    p.spine = [lerp(us[0], 0, w) + this.lean * 0.65, lerp(us[1], 0, w) - hipsYaw * 0.55, lerp(us[2], 0, w)];
    p.chest = [lerp(uc[0], 0.02, w), lerp(uc[1], 0, w) - hipsYaw * 0.75, lerp(uc[2], 0, w) - walkRoll * 0.8];
    p.neck = [un[0] * (1 - w), un[1] * (1 - w), 0];
    p.head = [lerp(uh[0], -0.04, w) - this.lean * 0.55, lerp(uh[1], 0, w) + hipsYaw * 0.3 - fy * 0.1, lerp(uh[2], 0, w) - this.roll * 0.5];

    // ---------------------------------------------------------------- legs via IK
    _e.set(p.hips[0], p.hips[1], p.hips[2], 'YXZ');
    _q.setFromEuler(_e);
    _qi.copy(_q).invert();
    for (const s of ['L', 'R']) {
      _hip.copy(this.hipOff[s]).applyQuaternion(_q);
      _hip.x += sway; _hip.y += pelvis;
      _t.copy(_foot[s]).sub(_hip).applyQuaternion(_qi);
      _pole.set(s === 'L' ? 0.06 : -0.06, 0, 1);
      solveTwoBone(_t, this.a, this.b, _pole, _u, _l);
      const th = p[`th${s}`] || (p[`th${s}`] = [0, 0, 0]);
      const sh = p[`sh${s}`] || (p[`sh${s}`] = [0, 0, 0]);
      th[0] = _u.x; th[1] = _u.y; th[2] = _u.z;
      sh[0] = _l.x; sh[1] = _l.y; sh[2] = _l.z;
    }
    p.rootY = pelvis - this.pelvisY;
    p.rootOff = sway ? [sway, 0] : undefined;
    delete p.rootRot;

    // airborne blend
    if (this.airW > 0.01) {
      const air = Poses.airborne(ctx.t, ctx.vy || 0);
      Poses.lerpPose(p, air, this.airW, p);
      p.rootOff = undefined;
    }
    return p;
  }

  _guardPose(t) {
    const g = this._guard;
    const b = sin(t * 3.1);
    g.uaL = [0.42, -0.72 + b * 0.02, 0.4]; g.faL = [-0.05, 0.6, 0.78];
    g.uaR = [-0.42, -0.74 - b * 0.02, 0.32]; g.faR = [0.05, 0.62, 0.76];
    g.spine = [0.1, -0.12, 0]; g.chest = [0.03 + b * 0.01, 0.1, 0]; g.head = [-0.05, 0.05, 0];
    g.neck = [0, 0, 0];
    return g;
  }
}

const ZERO = [0, 0, 0];
function lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
