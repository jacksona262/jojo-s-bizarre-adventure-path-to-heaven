import * as THREE from 'three';

// Manga screen language, drawn by the final post shader (Engine FinalShader):
//  - impactFrame: a one-or-two-frame flash of inverted colour on the heaviest blows
//  - speedLines: radial streaks converging on the action (rushes, dashes, a full gallop)
//  - shockwave: a refractive ring expanding from an impact point
// Everything decays in real time, so hitstop and time stop never leave an effect stuck on screen.
// `level` follows the player's "Screen effects" setting: full | reduced (no inversion, half
// strength) | off. Impact frames are rate-limited so they punctuate a fight and never strobe.

const _p = new THREE.Vector3();

export class ScreenFX {
  constructor(engine) {
    this.engine = engine;
    this.fx = engine.fx;
    this.level = 'full';
    this.clock = 0;
    this.invT = 0; this.invA = 0; this.lastInv = -10;
    this.speed = 0; this.speedAmt = 0; this.speedHold = 0;
    this.speedWorld = new THREE.Vector3(); this.speedHasWorld = false;
    this.shockT = -1; this.shockA = 0; this.shockDur = 0.5; this.shockWorld = new THREE.Vector3();
    this.counts = { impactFrame: 0, shockwave: 0, speedLines: 0 };
  }

  _project(world, out) {
    _p.copy(world).project(this.engine.camera);
    if (_p.z > 1 || _p.z < -1) return false;
    out.set(_p.x * 0.5 + 0.5, _p.y * 0.5 + 0.5);
    return true;
  }

  impactFrame(strength = 1, dur = 0.05) {
    if (this.level === 'off' || this.clock - this.lastInv < 0.5) return false;
    this.lastInv = this.clock;
    this.counts.impactFrame += 1;
    if (this.level === 'reduced') { this.fx.uFlash.value = Math.max(this.fx.uFlash.value, 0.16 * strength); return true; }
    this.invT = dur;
    this.invA = Math.min(1, strength) * 0.9;
    return true;
  }

  speedLines(amount, world = null, hold = 0.12) {
    if (this.level === 'off') return;
    const a = this.level === 'reduced' ? amount * 0.5 : amount;
    if (this.speedHold <= 0 || a >= this.speedAmt) this.speedAmt = a;
    this.speedHold = Math.max(this.speedHold, hold);
    this.speedHasWorld = !!world;
    if (world) this.speedWorld.copy(world);
    this.counts.speedLines += 1;
  }

  shockwave(world, strength = 1, dur = 0.5) {
    if (this.level === 'off') return;
    this.shockWorld.copy(world);
    if (!this._project(world, this.fx.uShockCenter.value)) return;
    this.shockT = 0;
    this.shockDur = dur;
    this.shockA = Math.min(1.4, strength) * (this.level === 'reduced' ? 0.5 : 1);
    this.counts.shockwave += 1;
  }

  update(realDt) {
    this.clock += realDt;
    const fx = this.fx;
    if (this.invT > 0) { this.invT -= realDt; fx.uInvert.value = this.invT > 0 ? this.invA : 0; } else fx.uInvert.value = 0;

    this.speedHold -= realDt;
    const want = this.speedHold > 0 ? this.speedAmt : 0;
    this.speed += (want - this.speed) * Math.min(1, realDt * (want > this.speed ? 20 : 7));
    if (this.speed < 0.004) this.speed = 0;
    fx.uSpeed.value = this.speed;
    if (this.speed > 0 && !(this.speedHasWorld && this._project(this.speedWorld, fx.uSpeedCenter.value))) fx.uSpeedCenter.value.set(0.5, 0.5);

    if (this.shockT >= 0) {
      this.shockT += realDt;
      const k = this.shockT / this.shockDur;
      if (k >= 1) { this.shockT = -1; fx.uShockA.value = 0; } else {
        this._project(this.shockWorld, fx.uShockCenter.value);
        fx.uShockR.value = 0.03 + 0.6 * (1 - (1 - k) ** 2);
        fx.uShockA.value = this.shockA * (1 - k) ** 1.5;
      }
    }
  }

  reset() {
    this.invT = 0; this.speedHold = 0; this.speed = 0; this.shockT = -1;
    this.fx.uInvert.value = 0; this.fx.uSpeed.value = 0; this.fx.uShockA.value = 0;
  }
}
