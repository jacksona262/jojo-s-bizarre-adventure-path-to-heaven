import * as THREE from 'three';
import { Character } from './Character';
import * as Poses from '../anim/Poses';
import { audio } from '../core/Audio';

// A Stand: a floating rigged figure bound to its user. Idles behind the user's shoulder with its
// own drift, and for melee attacks (def.lunge) dashes out to a strike point beside the target,
// faces it, attacks with IK-guided limbs, then springs back to guard. Motion is a critically
// damped spring so the Stand leans into its acceleration and trails its legs.

const OFFSETS = {
  guard: new THREE.Vector3(0.78, 0.18, -0.7),
  front: new THREE.Vector3(0.05, 0.05, 1.0),
  far: new THREE.Vector3(0, 0.1, 2.2),
  overhead: new THREE.Vector3(0, 1.4, -0.4),
};
const _want = new THREE.Vector3();
// fully materialised (not mid-summon)
const k0 = (s) => Math.min(1, s.summonT / 0.35);

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
    this.leash = opts.leash || 3.8;
    this.tint = opts.tint || null;
    this.svel = new THREE.Vector3();
    this.mode = 'guard';
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
    if (instant) { this.pos.copy(a); this.svel.set(0, 0, 0); this.anim?.springs.reset(); }
    this.yaw = this.targetYaw = this.user.yaw;
  }

  // Where the Stand wants to be this frame, and what it should face.
  _desired(out) {
    const a = this.action;
    const tgt = a?.data?.target;
    const u = this.user;
    if (a && a.def.lunge && tgt && !tgt.dead) {
      const dx = tgt.pos.x - u.pos.x; const dz = tgt.pos.z - u.pos.z;
      const d = Math.hypot(dx, dz) || 1e-3;
      const nx = dx / d; const nz = dz / d;
      const standoff = (a.def.standoff ?? 0.45) + (tgt.radius || 0.42);
      const along = Math.min(Math.max(d - standoff, 0.45), this.leash);
      const side = a.def.side ?? 0.22;
      out.set(u.pos.x + nx * along - nz * side, this.strikeHover(tgt, u.pos.y), u.pos.z + nz * along + nx * side);
      this.mode = 'strike';
      return tgt;
    }
    this.anchor(out);
    if (this.slot === 'guard' && !a) {
      // idle drift so the Stand never looks bolted to its user
      out.x += Math.sin(this.t * 0.71) * 0.07;
      out.z += Math.cos(this.t * 0.53) * 0.06;
      out.y += Math.sin(this.t * 2.2) * 0.06;
      this.mode = 'guard';
    } else this.mode = a ? 'action' : this.slot;
    return a?.def.faceTarget ? tgt : null;
  }

  // Float height that puts the Stand's shoulders just above the target's chest, so its arms
  // (which are only ~0.7 m long) can actually reach. Stands are taller than their victims.
  strikeHover(tgt, userY) {
    const sh = (this.rig?.U?.shoulderR?.y ?? this.height * 0.82) * (this.group.scale.y || 1);
    const want = tgt.pos.y + tgt.height * 0.68 + 0.25 - sh;
    return Math.min(Math.max(want, Math.max(userY, tgt.pos.y) - 0.32), Math.max(userY, tgt.pos.y) + 0.35);
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

    const face = this._desired(_want);
    // critically damped spring (sub-stepped so low frame rates do not overshoot)
    const omega = this.mode === 'strike' ? (this.action?.def.dash ?? 20) : this.mode === 'guard' ? 8 : 15;
    let rem = Math.min(dt, 0.1);
    while (rem > 1e-5) {
      const h = Math.min(rem, 1 / 120);
      rem -= h;
      const ax = (_want.x - this.pos.x) * omega * omega - this.svel.x * 2 * omega;
      const ay = (_want.y - this.pos.y) * omega * omega - this.svel.y * 2 * omega;
      const az = (_want.z - this.pos.z) * omega * omega - this.svel.z * 2 * omega;
      this.svel.x += ax * h; this.svel.y += ay * h; this.svel.z += az * h;
      this.pos.addScaledVector(this.svel, h);
    }
    if (this.pos.distanceToSquared(_want) > 64) { this.pos.copy(_want); this.svel.set(0, 0, 0); }   // teleports
    this._trail(dt);
    if (face) this.targetYaw = Math.atan2(face.pos.x - this.pos.x, face.pos.z - this.pos.z);
    else if (!this.action || !this.action.def.ownFacing) this.targetYaw = this.user.yaw;
    if (this.user.dead) this.summon(false, true);
    // Dash, then strike: hold the wind-up while the Stand is still travelling to its strike point
    // (at most 0.4 s), so the active frames happen where the target actually is.
    const a = this.action;
    let held = null;
    if (a?.def.lunge && this.mode === 'strike' && a.def.clip?.active) {
      a.data.dashT = (a.data.dashT || 0) + dt;
      const holdT = a.def.dur * a.def.clip.active[0] * 0.7;
      if (a.t >= holdT && a.data.dashT < 0.4 && this.pos.distanceTo(_want) > 0.45) held = a.t;
    }
    super.update(dt);
    if (held !== null && this.action === a) a.t = held;
  }

  // Afterimages: a dash toward a heavy blow leaves a trail of fading copies (with speed lines when
  // the player is in the fight); any fast lunge leaves a fainter one; a rush blurs into many arms.
  _trail(dt) {
    const a = this.action;
    const vfx = this.game.vfx;
    if (!a || !vfx || k0(this) < 1) return;
    const fx = this.user.kit?.fx;
    const col = fx?.ghost ?? this.auraColor;
    const sp = this.svel.length();
    this._ghostT = (this._ghostT ?? 0) - dt;
    if (a.def.rush) {
      if (this._ghostT <= 0) { this._ghostT = 0.085; vfx.afterimage(this, col, { life: 0.16, alpha: 0.2 }); }
    } else if (this.mode === 'strike' && sp > (a.def.dashFx ? 4.5 : 7.5)) {
      if (this._ghostT <= 0) {
        this._ghostT = a.def.dashFx ? 0.045 : 0.075;
        vfx.afterimage(this, col, { life: a.def.dashFx ? 0.24 : 0.18, alpha: a.def.dashFx ? 0.4 : 0.24 });
      }
      if (a.def.dashFx && this.user.kit?.onScreen) this.game.screen?.speedLines(0.32, this.chestWorld(_want), 0.08);
    }
  }

  // Stand attacks. def.lunge sends the Stand to the target; otherwise it holds `slot`.
  strike(def, slot = 'front') {
    this.slot = slot;
    const prevEnd = def.onEnd;
    const act = this.play({
      ...def,
      turn: def.turn ?? (def.lunge ? 18 : 10),
      onEnd: (self, cancelled) => { self.slot = 'guard'; if (prevEnd) prevEnd(self, cancelled); },
    });
    if (act) {
      act.data.target = def.target || (def.lunge ? this.user.kit?.meleeTarget?.() : null) || null;
      if (def.data) Object.assign(act.data, def.data);
    }
    return act;
  }

  idlePose(t) { return Poses.standFloat(t, false); }

  // Stands are placed by their spring, not by physics.
  _integrate() { this.moved = 0; this.onGround = true; }
}
