import * as THREE from 'three';
import * as Poses from './Poses';
import * as Clips from './Clips';
import { Gait } from './Gait';
import { SpringBones, FaceRig } from './Secondary';

// Layered animation state machine for every humanoid.
//   base       gait (idle / walk / jog / run / sprint / strafe / backpedal / turn / jump / land),
//              ride, float (Stands), knockdown -> lie -> get up, death, launch tumble
//   action     the character's current action (clip or legacy pose function), full or upper body
//   reaction   full-body reaction clips (stagger, guard impact, guard break)
//   additive   hit-reaction springs (direction + strength), head look-at, guard overlay
//   post       fist/foot IK onto the attack target, foot planting on terrain, spring bones, face
// The controller exposes `state` and layer weights for the dev animation viewer.

const { min, max, abs, sin, cos, atan2, hypot, PI } = Math;
const wrap = (a) => atan2(sin(a), cos(a));
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _ank = { L: new THREE.Vector3(), R: new THREE.Vector3() };
const ZERO3 = [0, 0, 0];

export class AnimController {
  constructor(char) {
    this.c = char;
    this.rig = char.rig;
    this.rig.measure(Poses.rest());
    this.gait = new Gait(this.rig);
    this.springs = new SpringBones(this.rig);
    this.face = new FaceRig(this.rig);
    this.out = Poses.rest();
    this.tmp = Poses.rest();
    this.clipOut = Poses.rest();
    this.actOut = Poses.rest();
    this.react = { p: 0, r: 0, y: 0, vp: 0, vr: 0, vy: 0 };
    this.reaction = null;       // { clip, t }
    this.state = 'idle';
    this.actionW = 0;
    this._actPose = null;
    this.prevPos = char.pos.clone();
    this.prevYaw = char.yaw;
    this.vLocal = { x: 0, z: 0 };
    this.vfwdPrev = 0;
    this.accel = 0;
    this.yawRate = 0;
    this.gOff = { L: 0, R: 0, pelvis: 0 };
    this.lean = { p: 0, r: 0 };
    this.wasGrounded = true;
    this.airT = 0;
    this.lookAt = null;
    this.lookW = 0;
    this.knockDir = -1;
    this.deathT = 0;
    this.launched = false;
    this.tumble = 0;
    this.skip = 0;
    this.scale = (char.height || 1.9) / 1.9;
    this.ikEnabled = true;
  }

  // ------------------------------------------------------------------ events from gameplay
  // dirWorld: direction the blow travels (attacker -> victim). strength 0..3.
  hit(dirWorld, strength = 1) {
    const c = this.c;
    const fx = Math.sin(c.yaw); const fz = Math.cos(c.yaw);
    const fwd = dirWorld.x * fx + dirWorld.z * fz;
    const left = dirWorld.x * fz - dirWorld.z * fx;
    const k = 4.5 * strength;
    this.react.vp += fwd * k;
    this.react.vr += -left * k;
    this.react.vy += left * k * 0.6 + (Math.random() - 0.5) * k * 0.3;
    if (strength >= 2.5 && !c.knockdown && !c.dead) this.playReaction(Clips.staggerBack);
  }

  knock(dirWorld) {
    const c = this.c;
    const fwd = dirWorld.x * Math.sin(c.yaw) + dirWorld.z * Math.cos(c.yaw);
    this.knockDir = fwd <= 0 ? -1 : 1;   // -1: thrown backwards (lands on back)
    this.reaction = null;
  }

  blocked() { this.playReaction(Clips.guardImpact); }
  guardBroken() { this.playReaction(Clips.guardBreak); }
  playReaction(clip) { this.reaction = { clip, t: 0 }; }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    const c = this.c;
    if (!this.rig?.valid) return;
    // distance LOD: far characters animate at a reduced rate
    const cam = c.game.engine?.camera?.position;
    const dist = cam ? Math.hypot(cam.x - c.pos.x, cam.z - c.pos.z) : 0;
    this.near = dist < 42;
    if (dist > 85) {
      this.skip += dt;
      if (this.skip < 1 / 15) return;
      dt = this.skip; this.skip = 0;
    }
    this._kinematics(dt);

    let base;
    let groundIK = false;
    if (c.override) {
      base = c.override(c.t, c);
      if (!base) return;
      this.state = 'cinematic';
      Poses.assignPose(base, this.out);
      this._additive(dt, this.out, false);
      this._finish(dt, this.out, false);
      return;
    }
    if (c.dead) {
      this.deathT += dt;
      base = this.knockdownLying ? this._lying(dt) : Clips.death.sample(min(1, this.deathT / Clips.death.dur), this.clipOut);
      this.state = 'dead';
    } else if (c.knockdown > 0) {
      this.deathT = 0;
      base = this._knockdown(dt);
    } else if (c.mounted || (c.mountK || 0) > 0.001) {
      // riding, or climbing on/off (mountK 0..1 blends from the ground pose, right leg swings over)
      this.knockdownLying = false;
      const h = c.mounted || this.lastHorse;
      if (c.mounted) this.lastHorse = c.mounted;
      const k = c.mounted ? (c.mountK ?? 1) : (c.mountK || 0);
      const ride = h ? Poses.ride(h.anim.phase * PI * 2, min(1, h.speed / 10), h.turn || 0) : Poses.rest();
      if (k < 0.999) {
        const stand = Poses.guardStance();
        base = Poses.lerpPose(stand, ride, k, this.tmp);
        const swing = sin(k * PI);
        base.thR = [base.thR[0] - 0.7 * swing, base.thR[1] + 0.5 * swing, base.thR[2] + 0.25 * swing];
        base.shR = [base.shR[0] - 0.3 * swing, base.shR[1], base.shR[2] - 0.4 * swing];
        base.spine = [(base.spine?.[0] || 0) + 0.25 * swing, base.spine?.[1] || 0, (base.spine?.[2] || 0) + 0.15 * swing];
        this.state = c.mounted ? 'mount' : 'dismount';
      } else {
        base = ride;
        this.state = 'ride';
      }
    } else if (c.floating) {
      this.knockdownLying = false;
      base = this._float(dt);
    } else {
      this.knockdownLying = false;
      this.deathT = 0;
      base = this._ground(dt);
      groundIK = true;
    }

    // ------------------------------------------------ action layer
    const a = c.action;
    const def = a?.def;
    const has = !!(def && (def.pose || def.clip || def.rush));
    this.actionW += ((has ? 1 : 0) - this.actionW) * min(1, dt * (has ? (def.blendIn || 24) : 10));
    let t01 = 0;
    if (has) {
      const dur = a.opts.dur || def.dur;
      t01 = min(1, a.t / dur);
      this._actPose = def.clip ? def.clip.sample(t01, this.actOut) : (def.rush ? Clips.rushPose(a.t, def.rate || 15, this.actOut) : def.pose(t01, c, a));
      this._actDef = def;
    }
    const out = this.out;
    if (this.actionW > 0.01 && this._actPose && !c.dead && !(c.knockdown > 0)) {
      Poses.lerpPose(base, this._actPose, this.actionW, out);
      const upper = this._actDef?.upper;
      if (upper && !c.floating) {
        for (const k of ['thL', 'shL', 'thR', 'shR']) { const s = base[k]; const o = out[k]; o[0] = s[0]; o[1] = s[1]; o[2] = s[2]; }
        out.rootY = base.rootY;
        if (base.rootOff) out.rootOff = base.rootOff; else delete out.rootOff;
        if (base.hips) out.hips = [base.hips[0], base.hips[1], base.hips[2]];
      } else groundIK = groundIK && this.actionW < 0.5;
      this.state = `action:${this._actDef?.name || '?'}`;
    } else {
      Poses.assignPose(base, out);
      if (!has) this._actPose = null;
    }

    // ------------------------------------------------ reaction clips (stagger, guard impact)
    if (this.reaction && !c.dead && !(c.knockdown > 0)) {
      const r = this.reaction;
      r.t += dt / r.clip.dur;
      if (r.t >= 1) this.reaction = null;
      else {
        const w = min(1, r.t * 8, (1 - r.t) * 5);
        const rp = r.clip.sample(r.t, this.tmp);
        Poses.lerpPose(out, rp, w, out);
        this.state = `react:${r.clip.name}`;
      }
    }

    // ------------------------------------------------ guard overlay (upper body)
    if (c.guarding && !has && !c.floating && !(c.knockdown > 0)) {
      const blk = Poses.block();
      for (const k of ['uaL', 'faL', 'uaR', 'faR']) out[k] = blk[k];
      out.spine = [blk.spine[0], out.spine?.[1] || 0, 0];
      out.head = blk.head;
      if (this.state === 'idle' || this.state.startsWith('move')) this.state = 'guard';
    }

    this._additive(dt, out, true);
    this._finish(dt, out, groundIK, has ? t01 : 0);
  }

  // ------------------------------------------------------------------ base states
  _kinematics(dt) {
    const c = this.c;
    const d = Math.max(dt, 1e-4);
    let vx = (c.pos.x - this.prevPos.x) / d;
    let vz = (c.pos.z - this.prevPos.z) / d;
    if (vx * vx + vz * vz > 900) { vx = 0; vz = 0; this.springs.reset(); }   // teleport
    this.prevPos.copy(c.pos);
    const fx = sin(c.yaw); const fz = cos(c.yaw);
    const lz = vx * fx + vz * fz;
    const lx = vx * fz - vz * fx;
    const k = min(1, dt * 14);
    this.vLocal.x += (lx - this.vLocal.x) * k;
    this.vLocal.z += (lz - this.vLocal.z) * k;
    const acc = (this.vLocal.z - this.vfwdPrev) / d;
    this.vfwdPrev = this.vLocal.z;
    this.accel += (clamp(acc, -30, 30) - this.accel) * min(1, dt * 6);
    this.dYaw = wrap(c.yaw - this.prevYaw);
    this.prevYaw = c.yaw;
    this.yawRate += (this.dYaw / d - this.yawRate) * min(1, dt * 8);
  }

  _ground(dt) {
    const c = this.c;
    const g = this.gait;
    if (!this.wasGrounded && c.onGround) g.landed(this._lastVy || -8);
    this.wasGrounded = c.onGround;
    this._lastVy = c.vel.y;
    const combat = !!(c.lockTarget && !c.lockTarget.dead) || (c.combatStance?.() ?? false);
    const pose = g.update(dt, {
      vx: this.vLocal.x, vz: this.vLocal.z, accel: this.accel, yawRate: this.yawRate, dYaw: this.dYaw,
      grounded: c.onGround, vy: c.vel.y, style: c.style, combat, combatArms: !(c.stand && c.stand.summoned), wading: c.inWater, t: c.t,
      idlePose: c.idlePose ? (t) => c.idlePose(t, c) : null,
    });
    const sp = hypot(this.vLocal.x, this.vLocal.z);
    if (!c.onGround) this.state = c.vel.y > 0 ? 'jump' : 'fall';
    else if (g.land > 0.2) this.state = 'land';
    else if (g.turn) this.state = 'turn';
    else if (sp < 0.25) this.state = combat ? 'idle:combat' : 'idle';
    else {
      const dir = atan2(this.vLocal.x, this.vLocal.z);
      const lbl = abs(dir) < 0.6 ? (sp > 6 ? 'sprint' : sp > 3.2 ? 'run' : 'walk') : abs(dir) > 2.4 ? 'backpedal' : dir > 0 ? 'strafeL' : 'strafeR';
      this.state = `move:${lbl}`;
    }
    // launched by a heavy hit: tumble while airborne
    if (this.launched && !c.onGround) {
      this.tumble += dt * 7;
      pose.rootRot = [-this.tumble, 0, 0];
      this.state = 'launched';
    } else if (c.onGround) { this.launched = false; this.tumble = 0; }
    return pose;
  }

  _float(dt) {
    const c = this.c;
    const lv = this.vLocal;
    const p = c.idlePose ? c.idlePose(c.t, c) : Poses.standFloat(c.t, hypot(lv.x, lv.z) > 2);
    const tp = clamp(lv.z * 0.06, -0.35, 0.5);
    const tr = clamp(-lv.x * 0.06, -0.4, 0.4);
    this.lean.p += (tp - this.lean.p) * min(1, dt * 6);
    this.lean.r += (tr - this.lean.r) * min(1, dt * 6);
    if (abs(this.lean.p) > 0.01 || abs(this.lean.r) > 0.01) {
      p.rootRot = [this.lean.p, 0, this.lean.r];
      p.rootPivot = (this.rig.U?.chest?.y ?? 1.3);
      // legs trail behind the motion
      const trail = clamp(lv.z * 0.05, -0.3, 0.45);
      if (p.thL) { p.thL = [p.thL[0], p.thL[1], p.thL[2] - trail]; p.thR = [p.thR[0], p.thR[1], p.thR[2] - trail * 1.2]; }
    }
    this.state = hypot(lv.x, lv.z) > 1.5 ? 'float:dash' : 'float';
    return p;
  }

  _knockdown(dt) {
    const c = this.c;
    const total = c.knockTotal || 1.75;
    const el = total - c.knockdown;
    const fall = this.knockDir < 0 ? Clips.knockdownBack : Clips.knockdownFront;
    const getUp = this.knockDir < 0 ? Clips.getUpBack : Clips.getUpFront;
    const gu = min(getUp.dur, total * 0.45);
    if (el < fall.dur) {
      this.state = 'knockdown';
      return fall.sample(el / fall.dur, this.clipOut);
    }
    if (c.knockdown > gu) { this.state = 'lying'; this.knockdownLying = true; return this._lying(dt); }
    this.state = 'getUp';
    this.knockdownLying = false;
    return getUp.sample(1 - c.knockdown / gu, this.clipOut);
  }

  _lying() {
    const fall = this.knockDir < 0 ? Clips.knockdownBack : Clips.knockdownFront;
    const p = fall.sample(1, this.clipOut);
    const br = sin(this.c.t * 2.2) * 0.02;
    p.chest = [(p.chest?.[0] || 0) + br, p.chest?.[1] || 0, p.chest?.[2] || 0];
    return p;
  }

  // ------------------------------------------------------------------ layers
  _additive(dt, out, combatLayers) {
    const c = this.c;
    // hit springs (underdamped so blows whip the torso and head)
    const r = this.react;
    const w = 15; const z = 0.42;
    const h = min(dt, 1 / 30);
    r.vp += (-w * w * r.p - 2 * z * w * r.vp) * h; r.p += r.vp * h;
    r.vr += (-w * w * r.r - 2 * z * w * r.vr) * h; r.r += r.vr * h;
    r.vy += (-w * w * r.y - 2 * z * w * r.vy) * h; r.y += r.vy * h;
    if (combatLayers && (abs(r.p) + abs(r.r) + abs(r.y) > 0.002)) {
      const add = (k, kp, ky, kr) => { const s = out[k] || ZERO3; out[k] = [s[0] + r.p * kp, s[1] + r.y * ky, s[2] + r.r * kr]; };
      add('spine', 0.5, 0.35, 0.45); add('chest', 0.35, 0.35, 0.3); add('head', 0.7, 0.6, 0.5);
    }
    // look-at: head and neck turn towards a point (cinematics, lock-on, conversation)
    const tgt = this.lookAt?.isVector3 ? this.lookAt : (this.lookAt?.pos ? this.lookAt.chestWorld?.(_v2) : null);
    this.lookW += ((tgt ? 1 : 0) - this.lookW) * min(1, dt * 5);
    if (this.lookW > 0.01 && tgt) {
      const head = c.jointWorld('head', _v);
      const dx = tgt.x - head.x; const dz = tgt.z - head.z; const dy = tgt.y - head.y;
      const fx = sin(c.yaw); const fz = cos(c.yaw);
      const lz = dx * fx + dz * fz; const lx = dx * fz - dz * fx;
      let yaw = atan2(lx, lz);
      const torsoYaw = (out.hips?.[1] || 0) + (out.spine?.[1] || 0) + (out.chest?.[1] || 0);
      yaw = clamp(wrap(yaw - torsoYaw), -1.15, 1.15);
      const pitch = clamp(atan2(-dy, hypot(lx, lz)), -0.6, 0.7);
      const lw = this.lookW;
      const n = out.neck || ZERO3; const hd = out.head || ZERO3;
      out.neck = [n[0] + pitch * 0.35 * lw, n[1] + (yaw * 0.4 - n[1]) * lw, n[2]];
      out.head = [hd[0] + (pitch * 0.65 - hd[0]) * lw * 0.8, hd[1] + (yaw * 0.6 - hd[1]) * lw, hd[2]];
    }
  }

  _finish(dt, out, groundIK, t01 = 0) {
    const c = this.c;
    const rig = this.rig;
    if (out.drop) out.rootY = (out.rootY || 0) - out.drop * max(0, (rig.U?.pelvis.y ?? 1) - 0.14 * this.scale);
    rig.apply(out);
    // fist / foot reaching the attack target
    const a = c.action;
    const def = a?.def;
    if (def && this.actionW > 0.3 && this.ikEnabled) {
      if (def.rush && a.data.aimL) {
        const rr = Clips.rushReach(a.t, def.rate || 15);
        rig.reach('L', 'arm', a.data.aimL, rr.L * 0.9 * this.actionW);
        rig.reach('R', 'arm', a.data.aimR, rr.R * 0.9 * this.actionW);
      } else if (def.clip?.reach && a.data.aim) {
        const w = def.clip.reachW(t01) * this.actionW;
        const limb = def.clip.limb || 'handR';
        const side = limb.endsWith('L') ? 'L' : 'R';
        if (w > 0.01) rig.reach(side, limb.startsWith('foot') ? 'leg' : 'arm', a.data.aim, w * (def.reachMax ?? 1));
      }
    }
    // feet planted on uneven ground
    if (groundIK && this.near && this.ikEnabled && c.onGround && c.game.world) this._groundIK(dt);
    else { this.gOff.L *= 0.8; this.gOff.R *= 0.8; this.gOff.pelvis *= 0.8; }
    if (this.near) {
      this.springs.update(dt, this.scale * (c.group.scale.x || 1));
      this.face.update(dt, !!c.talking);
    }
  }

  _groundIK(dt) {
    const c = this.c;
    const rig = this.rig;
    const world = c.game.world;
    rig.root.updateMatrixWorld(true);
    const k = min(1, dt * 14);
    let any = false;
    for (const s of ['L', 'R']) {
      const fb = rig.bones[`foot${s}`];
      if (!fb) return;
      fb.getWorldPosition(_ank[s]);
      const gy = world.groundAt(_ank[s].x, _ank[s].z, c.pos.y + 0.7);
      const delta = clamp(gy - c.pos.y, -0.42, 0.42);
      this.gOff[s] += (delta - this.gOff[s]) * k;
      if (abs(this.gOff[s]) > 0.006) any = true;
    }
    const drop = min(0, this.gOff.L, this.gOff.R);
    this.gOff.pelvis += (drop - this.gOff.pelvis) * k;
    if (!any && abs(this.gOff.pelvis) < 0.004) return;
    rig.root.position.y += this.gOff.pelvis;
    rig.root.updateMatrixWorld(true);
    for (const s of ['L', 'R']) {
      if (abs(this.gOff[s] - this.gOff.pelvis) < 0.004) continue;
      _aim.copy(_ank[s]);
      _aim.y += this.gOff[s];
      rig.reach(s, 'leg', _aim, 1);
    }
  }
}
