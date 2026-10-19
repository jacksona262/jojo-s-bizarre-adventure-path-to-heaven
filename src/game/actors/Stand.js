import * as THREE from 'three';
import { Character } from './Character';
import * as Poses from '../anim/Poses';
import { audio } from '../core/Audio';

// A Stand: a floating rigged figure bound to its user. Positions itself relative to the user
// (guard position behind the shoulder, strike position in front), never intersecting the body.

const OFFSETS = {
  guard: new THREE.Vector3(0.78, 0.18, -0.7),
  front: new THREE.Vector3(0.05, 0.05, 1.0),
  far: new THREE.Vector3(0, 0.1, 2.2),
  overhead: new THREE.Vector3(0, 1.4, -0.4),
};

export class Stand extends Character {
  constructor(game, user, opts) {
    super(game, { ...opts, team: user.team, floating: true, gravity: 0 });
    this.user = user;
    this.ghost = true;
    this.summoned = false;
    this.summonT = 0;
    this.slot = 'guard';
    this.customOffset = null;
    this.auraColor = new THREE.Color(opts.aura || 0xffd060);
    this.hoverHeight = 0;
    this.style = 'stand';
    this.scaleBase = 1;
    this.reach = opts.reach || 1.6;
    this.tint = opts.tint || null;
  }

  async load() {
    await super.load();
    this.group.visible = false;
    if (this.tint) {
      for (const m of this.materials) {
        if (m.color) m.color.lerp(new THREE.Color(this.tint.color), this.tint.amount);
        if (m.emissive) { m.emissive.set(this.tint.emissive || 0x000000); m.emissiveIntensity = this.tint.emissiveIntensity || 1; m.userData.baseEmissive = m.emissive.clone(); }
      }
    }
    return this;
  }

  summon(on = !this.summoned, quiet = false) {
    if (on === this.summoned) return;
    this.summoned = on;
    this.summonT = 0;
    if (on) {
      this.group.visible = true;
      this._placeAtAnchor(true);
      if (!quiet) {
        audio.play('summon');
        this.game.vfx?.aura(this.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), this.auraColor, 1.2);
      }
    } else if (!quiet) {
      audio.play('whoosh', { power: 0.6 });
    }
  }

  anchor(out = new THREE.Vector3()) {
    const u = this.user;
    const off = this.customOffset || OFFSETS[this.slot] || OFFSETS.guard;
    const c = Math.cos(u.yaw); const s = Math.sin(u.yaw);
    out.set(u.pos.x + off.x * c + off.z * s, u.pos.y + off.y, u.pos.z - off.x * s + off.z * c);
    return out;
  }

  _placeAtAnchor(instant) {
    const a = this.anchor();
    if (instant) this.pos.copy(a);
    this.yaw = this.targetYaw = this.user.yaw;
  }

  update(dt) {
    if (!this.summoned) {
      if (this.group.visible) {
        this.summonT += dt;
        const k = 1 - Math.min(1, this.summonT / 0.25);
        this.group.scale.setScalar(this.scaleBase * (0.7 + 0.3 * k));
        this.setOpacity(k);
        if (k <= 0) { this.group.visible = false; this.setOpacity(1); }
      }
      return;
    }
    if (this.isFrozen()) return;
    this.summonT += dt;
    const k = Math.min(1, this.summonT / 0.35);
    this.group.scale.setScalar(this.scaleBase * (0.65 + 0.35 * k));
    if (k < 1) this.setOpacity(k); else if (this._opa !== 1) { this.setOpacity(1); this._opa = 1; }
    if (k < 1) this._opa = k;
    // follow anchor with a soft spring; snap harder when striking
    const a = this.anchor();
    const bob = Math.sin(this.t * 2.2) * 0.06;
    a.y += bob;
    const stiff = this.slot === 'guard' ? 8 : 18;
    this.pos.lerp(a, Math.min(1, dt * stiff));
    if (!this.action || !this.action.def.ownFacing) this.targetYaw = this.user.yaw;
    if (this.user.dead) this.summon(false, true);
    super.update(dt);
  }

  // Stand strikes are positioned in front of the user for their duration.
  strike(def, slot = 'front') {
    this.slot = slot;
    const prevEnd = def.onEnd;
    return this.play({
      ...def,
      onEnd: (self, cancelled) => { self.slot = 'guard'; if (prevEnd) prevEnd(self, cancelled); },
    });
  }

  idlePose(t) { return Poses.standFloat(t, false); }

  // Stands are placed by their anchor spring, not by physics.
  _integrate() { this.moved = 0; this.onGround = true; }
}
