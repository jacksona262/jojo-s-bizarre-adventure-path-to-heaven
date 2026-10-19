import * as THREE from 'three';
import * as Poses from '../anim/Poses';
import { audio } from '../core/Audio';

// Base moveset shared by Stand users. Character-specific kits extend this and add abilities.
// Uniform interface (used by the player controller, Versus and the boss AI):
//   light(), heavy(), rush(holding), knockback(), specialA(), specialB(), signature(), dodge(dir), guard(on)

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Kit {
  constructor(fighter, game, opts = {}) {
    this.f = fighter;
    this.game = game;
    this.combo = 0;
    this.comboTimer = 0;
    this.cool = {};
    this.color = new THREE.Color(opts.color ?? 0xffe0a0);
    this.reach = opts.reach ?? 2.0;
    this.rushCost = opts.rushCost ?? 14;
    this.rushing = 0;
    this.name = opts.name || 'Stand';
    this.phase = 1;
    this.energyRegen = opts.energyRegen ?? 14;
    this.lastAttackT = -10;
  }

  get stand() { return this.f.stand; }
  get combat() { return this.game.combat; }
  get vfx() { return this.game.vfx; }
  get clock() { return this.game.clock; }

  ready(key) { return (this.cool[key] || 0) <= this.clock; }
  setCool(key, s) { this.cool[key] = this.clock + s; }
  coolLeft(key) { return Math.max(0, (this.cool[key] || 0) - this.clock); }

  spend(n) {
    if (this.f.energy < n) return false;
    this.f.energy -= n;
    this.lastAttackT = this.clock;
    return true;
  }

  target() {
    return this.f.lockTarget || this.combat.nearestEnemy(this.f, 40);
  }

  faceTarget(instant = false) {
    const t = this.target();
    if (t) this.f.faceTowards(t.pos, instant);
    return t;
  }

  ensureStand() {
    if (this.stand && !this.stand.summoned) this.stand.summon(true);
    return this.stand;
  }

  // origin for Stand strikes (in front of the user)
  strikeOrigin() {
    const fwd = this.f.forward();
    return this.f.pos.clone().addScaledVector(fwd, 0.3);
  }

  hit(spec) {
    return this.combat.strike(this.f, { origin: this.strikeOrigin(), range: this.reach, color: this.color, ...spec });
  }

  // ---------------------------------------------------------------- shared moves
  light() {
    const f = this.f;
    if (!f.canAct() && !(f.action && f.action.def.comboWindow && f.action.t > f.action.def.comboWindow)) return false;
    this.faceTarget();
    this.combo = this.comboTimer > this.clock ? (this.combo + 1) % 3 : 0;
    this.comboTimer = this.clock + 0.75;
    const step = this.combo;
    const side = step === 1 ? 'L' : 'R';
    const withStand = this.stand && this.stand.summoned;
    const hitSet = new Set();
    const dmg = [5, 5, 8][step] * (withStand ? 1 : 0.6);
    const fire = () => {
      this.hit({ damage: dmg, stun: step === 2 ? 0.45 : 0.28, knock: step === 2 ? 4 : 1.2, kind: 'light', hitSet, range: withStand ? this.reach : 1.4 });
      audio.play('whoosh', { power: 0.7 });
      if (withStand) this.vfx.fist(this.stand.jointWorld(side === 'L' ? 'handL' : 'handR'), f.forward(), this.color, 0.12, 1.1);
    };
    if (withStand) {
      f.play({ name: 'command', dur: 0.32, upper: true, pose: (t) => Poses.point('R', t), move: () => 0.6 });
      this.stand.strike({ name: `jab${step}`, dur: step === 2 ? 0.42 : 0.3, pose: (t) => (step === 2 ? Poses.heavy(Math.min(1, t * 1.1)) : Poses.punch(side, t)), events: [{ t: step === 2 ? 0.48 : 0.35, fn: fire }] });
    } else {
      f.play({ name: `punch${step}`, dur: step === 2 ? 0.5 : 0.36, comboWindow: 0.18, pose: (t) => (step === 2 ? Poses.heavy(t) : Poses.punch(side, t)), move: (t) => (t < 0.4 ? 2.4 : 0), events: [{ t: step === 2 ? 0.5 : 0.4, fn: fire }] });
    }
    this.lastAttackT = this.clock;
    this.game.combat.emit({ type: 'attack', attacker: f, move: 'light' });
    return true;
  }

  heavy() {
    const f = this.f;
    if (!f.canAct()) return false;
    if (!this.spend(10)) return false;
    this.faceTarget();
    const withStand = this.ensureStand();
    const hitSet = new Set();
    const fire = () => {
      this.hit({ damage: 15, stun: 0.65, knock: 7, launch: 1.5, kind: 'heavy', hitSet, guardDamage: 18 });
      audio.play('punch', { power: 1.4 });
      this.vfx.ring(this.strikeOrigin().add(v3(0, 1.2, 0)).addScaledVector(f.forward(), 1.2), this.color, 0.2, 1.4, 0.3, { vertical: true, face: this.game.engine.camera.position });
    };
    f.play({ name: 'heavyCmd', dur: 0.6, upper: true, pose: (t) => Poses.cast('R', t), move: (t) => (t > 0.4 && t < 0.6 ? 3 : 0) });
    if (withStand) this.stand.strike({ name: 'heavy', dur: 0.62, pose: (t) => Poses.heavy(t), events: [{ t: 0.55, fn: fire }] });
    this.game.combat.emit({ type: 'attack', attacker: f, move: 'heavy' });
    return true;
  }

  // Call every frame while the rush button is held.
  rush(holding, dt) {
    const f = this.f;
    if (holding && !this.rushing) {
      if (!f.canAct() || f.energy < 15) return false;
      this.ensureStand();
      this.rushing = 0.0001;
      this.rushHit = 0;
      this.faceTarget();
      f.play({ name: 'rushCmd', dur: 99, upper: true, pose: (t, self) => Poses.castBoth(Math.min(1, self.action.t * 3)), state: 'action' });
      this.stand?.strike({ name: 'rush', dur: 99, pose: (t, self) => Poses.rush(self.action.t, 15) });
      this.onRushStart?.();
      return true;
    }
    if (!this.rushing) return false;
    this.rushing += dt;
    f.energy -= this.rushCost * dt;
    this.faceTarget();
    this.rushHit -= dt;
    if (this.rushHit <= 0) {
      this.rushHit = 0.075;
      this.hit({ damage: 1.7, stun: 0.3, knock: 0.25, kind: 'rush', sfx: 'punch', range: this.reach + 0.2 });
      const s = this.stand || f;
      for (let i = 0; i < 2; i += 1) {
        const hand = s.jointWorld(Math.random() < 0.5 ? 'handL' : 'handR');
        hand.add(v3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.6));
        this.vfx.fist(hand, f.forward(), this.color, 0.12, 0.9 + Math.random() * 0.4);
      }
      if (Math.random() < 0.25) audio.play('whoosh', { power: 0.5 });
      if (Math.random() < 0.08 && this.rushShout) this.vfx.text(s.chestWorld(new THREE.Vector3()).add(v3(0, 0.8, 0)), this.rushShout, this.rushShoutColor || '#ffd34d', 0.9, 0.8);
    }
    if (!holding || f.energy <= 0 || this.rushing > 2.6 || f.stun > 0) {
      // finisher
      const fin = holding === false && this.rushing > 0.5;
      this.rushing = 0;
      f.cancelAction();
      this.stand?.cancelAction();
      if (fin || this.rushing === 0) {
        f.play({ name: 'rushEnd', dur: 0.45, upper: true, pose: (t) => Poses.cast('R', t) });
        this.stand?.strike({ name: 'rushFin', dur: 0.45, pose: (t) => Poses.heavy(Math.min(1, 0.3 + t)), events: [{ t: 0.3, fn: () => this.hit({ damage: 9, stun: 0.6, knock: 10, launch: 3, kind: 'heavy' }) }] });
      }
      this.onRushEnd?.();
    }
    return true;
  }

  knockback() {
    const f = this.f;
    if (!f.canAct() || !this.ready('knock')) return false;
    if (!this.spend(25)) return false;
    this.setCool('knock', 4);
    this.faceTarget();
    this.ensureStand();
    const fire = () => {
      this.hit({ damage: 17, stun: 0.8, knock: 14, launch: 4.5, kind: 'heavy', guardBreak: true, range: this.reach + 0.6 });
      this.vfx.ring(this.strikeOrigin().add(v3(0, 1.1, 0)).addScaledVector(f.forward(), 1.4), 0xffffff, 0.3, 3, 0.4, { vertical: true, face: this.game.engine.camera.position });
      this.game.camera.shake(0.5);
    };
    f.play({ name: 'kbCmd', dur: 0.8, upper: true, pose: (t) => Poses.cast('R', t, 0.1) });
    this.stand?.strike({ name: 'kb', dur: 0.85, pose: (t) => Poses.heavy(t), events: [{ t: 0.6, fn: fire }] });
    if (!this.stand) f.play({ name: 'kb', dur: 0.8, pose: (t) => Poses.heavy(t), events: [{ t: 0.6, fn: fire }] });
    return true;
  }

  dodge(dir) {
    const f = this.f;
    if (f.dead || f.knockdown > 0 || (f.action && f.action.def.name === 'dodge')) return false;
    if (f.stamina < 18) return false;
    if (f.stun > 0 && !this.allowStunDodge) return false;
    f.cancelAction();
    this.stand?.cancelAction();
    this.rushing = 0;
    f.stamina -= 18;
    const d = dir && dir.lengthSq() > 0.01 ? dir.clone().normalize() : f.forward().multiplyScalar(-1);
    f.invuln = 0.32;
    f.invulnStart = this.clock;
    const fwd = f.forward();
    const side = d.x * Math.cos(f.yaw) - d.z * Math.sin(f.yaw);
    f.play({ name: 'dodge', dur: 0.42, pose: (t) => Poses.dodge(t, side), tick: (self, t) => { const s = t < 0.6 ? 12 : 3; self.vel.x = d.x * s; self.vel.z = d.z * s; }, turn: 0 });
    void fwd;
    audio.play('dodge');
    this.vfx.smokePuff(f.pos.clone().add(v3(0, 0.2, 0)), 0x3a342c, 4, 1, 0.8, 0.3);
    return true;
  }

  guard(on) {
    const f = this.f;
    if (on && !f.guarding) {
      if (f.busy() && !(f.action && f.action.def.name === 'command')) return;
      f.guarding = true;
      f.guardStart = this.clock;
      this.faceTarget(false);
    } else if (!on && f.guarding) {
      f.guarding = false;
    }
  }

  specialA() { return this.knockback(); }
  specialB() { return false; }
  signature() { return false; }

  update(dt) {
    const f = this.f;
    if (!f.isFrozen() && !this.rushing && f.action?.def.name !== 'rushCmd') {
      f.energy = Math.min(f.energyMax, f.energy + this.energyRegen * dt * (this.clock - this.lastAttackT > 1.2 ? 1.6 : 0.6));
    }
    if (f.guarding) this.faceTarget(false);
  }

  // AI ability table: [{ name, weight, min, max, cool, phase, fn }]
  get abilities() { return []; }

  dispose() {}
}
