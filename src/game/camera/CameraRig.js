import * as THREE from 'three';

// Over-the-shoulder gameplay camera + cinematic camera with blending between them.

const ease = {
  linear: (t) => t,
  inOut: (t) => t * t * (3 - 2 * t),
  out: (t) => 1 - (1 - t) ** 3,
  in: (t) => t * t * t,
  inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2),
};
export { ease };

export class CameraRig {
  constructor(game) {
    this.game = game;
    this.cam = game.engine.camera;
    this.mode = 'follow';
    this.target = null;
    this.lock = null;
    this.yaw = Math.PI;
    this.pitch = -0.12;
    this.dist = 4.2;
    this.curDist = 4.2;
    this.shoulder = 0.62;
    this.fov = 55;
    this.trauma = 0;
    this.pivot = new THREE.Vector3();
    this.smoothPivot = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.shot = null;
    this.blend = 0;
    this.blendDur = 0;
    this.blendFrom = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 55 };
    this.cine = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 50, roll: 0 };
    this.sensitivity = 1;
    this.recenter = 0;
    this.idleTime = 0;
  }

  shake(a) { this.trauma = Math.min(1, this.trauma + a); }

  setTarget(c, snap = true) {
    this.target = c;
    if (snap && c) {
      this.yaw = c.yaw + Math.PI;
      this.smoothPivot.copy(c.pos).add(new THREE.Vector3(0, 1.55, 0));
    }
  }

  // ---------------------------------------------------------------- cinematic API
  setCinematic(pos, look, fov = 45, roll = 0) {
    this.mode = 'cinematic';
    this.cine.pos.copy(pos);
    this.cine.look.copy(look);
    this.cine.fov = fov;
    this.cine.roll = roll;
    this.shot = null;
  }

  // animated shot: { from, to, look, lookTo, dur, fov, fovTo, ease, roll }
  playShot(s) {
    this.mode = 'cinematic';
    this.shot = { ...s, t: 0, ease: ease[s.ease || 'inOut'] || ease.inOut };
    this._applyShot(0);
    return new Promise((res) => { this.shot.done = res; });
  }

  _applyShot(k) {
    const s = this.shot;
    const e = s.ease(k);
    if (s.path) {
      s.path.getPoint(e, this.cine.pos);
    } else {
      this.cine.pos.lerpVectors(s.from, s.to || s.from, e);
    }
    const lookTarget = s.follow ? s.follow() : null;
    if (lookTarget) this.cine.look.copy(lookTarget);
    else this.cine.look.lerpVectors(s.look, s.lookTo || s.look, e);
    this.cine.fov = (s.fov ?? 45) + ((s.fovTo ?? s.fov ?? 45) - (s.fov ?? 45)) * e;
    this.cine.roll = (s.roll ?? 0) + ((s.rollTo ?? s.roll ?? 0) - (s.roll ?? 0)) * e;
  }

  finishShot() {
    if (!this.shot) return;
    this._applyShot(1);
    const d = this.shot.done;
    this.shot = null;
    if (d) d();
  }

  // smoothly return from the current cinematic framing to the follow camera
  toGameplay(dur = 1.2) {
    this.blendFrom.pos.copy(this.cam.position);
    this.blendFrom.look.copy(this.look);
    this.blendFrom.fov = this.cam.fov;
    this.blend = 0;
    this.blendDur = dur;
    this.mode = 'follow';
    this.shot = null;
    if (this.target) this.yaw = this.target.yaw + Math.PI;
  }

  // ---------------------------------------------------------------- update
  update(dt, realDt, input) {
    const cam = this.cam;
    if (this.mode === 'cinematic') {
      if (this.shot) {
        this.shot.t += realDt;
        const k = Math.min(1, this.shot.t / this.shot.dur);
        this._applyShot(k);
        if (k >= 1) this.finishShot();
      }
      cam.position.copy(this.cine.pos);
      this.look.copy(this.cine.look);
      cam.fov += (this.cine.fov - cam.fov) * Math.min(1, realDt * 8);
      if (Math.abs(this.cine.fov - cam.fov) < 0.05) cam.fov = this.cine.fov;
      cam.lookAt(this.look);
      if (this.cine.roll) cam.rotateZ(this.cine.roll);
    } else if (this.mode === 'follow' && this.target) {
      this._follow(dt, realDt, input);
    }
    // shake (applied after framing)
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma;
      const t = this.game.engine.time * 40;
      cam.position.x += Math.sin(t * 1.1) * 0.12 * s;
      cam.position.y += Math.sin(t * 1.7 + 2) * 0.1 * s;
      cam.rotateZ(Math.sin(t * 0.9 + 4) * 0.02 * s);
      this.trauma = Math.max(0, this.trauma - realDt * 1.6);
    }
    cam.updateProjectionMatrix();
  }

  _follow(dt, realDt, input) {
    const c = this.target;
    const cam = this.cam;
    const mounted = !!c.mounted;
    const lx = input ? input.axes.lookX : 0;
    const ly = input ? input.axes.lookY : 0;
    if (lx || ly) this.idleTime = 0; else this.idleTime += realDt;
    this.yaw -= lx;
    this.pitch = Math.max(-0.95, Math.min(0.55, this.pitch - ly));
    // lock-on framing: keep target in view across the shoulder
    if (this.lock && !this.lock.dead) {
      const want = Math.atan2(c.pos.x - this.lock.pos.x, c.pos.z - this.lock.pos.z);
      let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, realDt * 6);
      const dz = this.lock.pos.y - c.pos.y;
      this.pitch += ((-0.14 - Math.atan2(dz, 8) * 0.5) - this.pitch) * Math.min(1, realDt * 3);
    } else if (mounted && this.idleTime > 1.2 && c.mounted.speed > 3) {
      // auto-follow behind the horse when riding
      const want = c.mounted.yaw + Math.PI;
      let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, realDt * 1.6);
    }
    const height = mounted ? 2.75 : 1.58;
    this.pivot.copy(c.pos); this.pivot.y += height;
    const k = Math.min(1, realDt * (mounted ? 10 : 14));
    this.smoothPivot.lerp(this.pivot, k);
    const targetDist = (mounted ? 6.2 : this.lock ? 4.8 : 4.0) + (c.mounted ? Math.min(2, c.mounted.speed * 0.1) : 0);
    this.dist += (targetDist - this.dist) * Math.min(1, realDt * 3);
    const cp = Math.cos(this.pitch); const sp = Math.sin(this.pitch);
    const back = new THREE.Vector3(Math.sin(this.yaw) * cp, -sp, Math.cos(this.yaw) * cp);
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const shoulder = mounted ? 0.35 : this.shoulder;
    const origin = this.smoothPivot.clone().addScaledVector(right, shoulder * 0.0);
    const desired = this.smoothPivot.clone().addScaledVector(back, this.dist).addScaledVector(right, shoulder);
    // collision: pull in when occluded
    let frac = 1;
    if (this.game.world) frac = this.game.world.occlusion(origin, desired);
    const wantDist = Math.max(0.6, this.dist * frac);
    if (wantDist < this.curDist) this.curDist = wantDist; else this.curDist += (wantDist - this.curDist) * Math.min(1, realDt * 2.5);
    const pos = this.smoothPivot.clone().addScaledVector(back, this.curDist).addScaledVector(right, shoulder * Math.min(1, this.curDist / this.dist));
    if (this.game.world) {
      const g = this.game.world.groundAt(pos.x, pos.z, pos.y) + 0.4;
      if (pos.y < g) pos.y = g;
    }
    const look = this.smoothPivot.clone().addScaledVector(right, shoulder * 0.55);
    if (this.lock && !this.lock.dead) look.lerp(this.lock.chestWorld(new THREE.Vector3()), 0.25);
    look.addScaledVector(back, -2);
    // fov
    let fov = 55;
    if (mounted) fov = 56 + Math.min(10, c.mounted.speed * 0.6);
    else if (c.sprinting) fov = 61;
    if (this.game.time?.stopped) fov -= 4;
    this.fov += (fov - this.fov) * Math.min(1, realDt * 4);
    // blend from cinematic
    if (this.blend < 1 && this.blendDur > 0) {
      this.blend = Math.min(1, this.blend + realDt / this.blendDur);
      const e = ease.inOut(this.blend);
      pos.lerpVectors(this.blendFrom.pos, pos, e);
      look.lerpVectors(this.blendFrom.look, look, e);
      this.fov = this.blendFrom.fov + (this.fov - this.blendFrom.fov) * e;
    }
    cam.position.copy(pos);
    this.look.copy(look);
    cam.fov = this.fov;
    cam.lookAt(look);
  }

  // camera-relative movement basis for controllers
  basis() {
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return { f, r };
  }
}
