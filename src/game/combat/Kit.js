import * as THREE from 'three';
import * as Poses from '../anim/Poses';
import * as Clips from '../anim/Clips';
import { segmentDistance } from '../anim/IK';
import { audio } from '../core/Audio';

const _fist = new THREE.Vector3();
const _fore = new THREE.Vector3();
const _capA = new THREE.Vector3();
const _capB = new THREE.Vector3();

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
    return this.f.lockTarget || this.combat.nearestEnemy(this.f, 90);
  }

  // Target for melee aim assist: the lock-on target when close, else the nearest enemy in range.
  meleeTarget() {
    const f = this.f;
    const lt = f.lockTarget;
    if (lt && !lt.dead && f.distanceTo(lt) < (this.assistLock ?? 9)) return lt;
    return this.combat.nearestEnemy(f, this.assistRange ?? 6.5);
  }

  // Build an action that plays `clip` and tests the striking limb against enemy capsules during
  // the clip's active window (swept, so fast limbs cannot tunnel through a target).
  // spec: hit spec for Combat.applyHit; opts: { target, lunge, standoff, radius, dur, onContact }
  melee(clip, spec, opts = {}) {
    const kit = this;
    const hitSet = new Set();
    const dur = opts.dur || clip.dur;
    return {
      name: opts.name || clip.name, dur, clip, lunge: opts.lunge ?? true, standoff: opts.standoff, side: opts.side,
      turn: 18, upper: opts.upper, comboWindow: opts.comboWindow, move: opts.move, events: opts.events,
      data: { target: opts.target || null },
      tick: (self, t01, dt, a) => {
        const tgt = a.data.target;
        if (tgt && !tgt.dead) {
          a.data.aim = a.data.aim || new THREE.Vector3();
          tgt.chestWorld(a.data.aim);
          if (!self.floating) {
            self.faceTowards(tgt.pos);
            // a fighter punching with their own fists closes the last gap during startup
            const gap = self.distanceTo(tgt) - tgt.radius - self.radius - 0.3;
            if (t01 < clip.active[0] && gap > 0.05 && gap < 2.2) {
              const sp = Math.min(5.5, gap * 9);
              const dx = tgt.pos.x - self.pos.x; const dz = tgt.pos.z - self.pos.z; const d = Math.hypot(dx, dz) || 1;
              self.vel.x = dx / d * sp; self.vel.z = dz / d * sp;
            }
          }
        }
        if (t01 >= clip.active[0] && t01 <= clip.active[1]) kit._contact(self, clip.limb, spec, hitSet, a, opts);
        else a.data.prevLimb = null;
      },
      onEnd: opts.onEnd,
    };
  }

  limbPoint(striker, limb, out) {
    striker.jointWorld(limb, out);
    const parent = limb === 'handL' ? 'foreArmL' : limb === 'handR' ? 'foreArmR' : limb === 'footL' ? 'shinL' : 'shinR';
    striker.jointWorld(parent, _fore);
    const d = out.clone().sub(_fore);
    const len = d.length();
    if (len > 1e-4) out.addScaledVector(d, (limb.startsWith('foot') ? 0.12 : 0.09) * (striker.height / 1.9) / len);
    return out;
  }

  _contact(striker, limb, spec, hitSet, a, opts = {}) {
    const f = this.f;
    const p = this.limbPoint(striker, limb, _fist);
    const prev = a.data.prevLimb || p;
    const r = (opts.radius ?? (striker.floating ? 0.26 : 0.2)) * (striker.height / 1.9);
    for (const t of this.combat.enemiesOf(f)) {
      if (hitSet.has(t)) continue;
      _capA.set(t.pos.x, t.pos.y + 0.25, t.pos.z);
      _capB.set(t.pos.x, t.pos.y + t.height - 0.12, t.pos.z);
      if (segmentDistance(prev, p, _capA, _capB) > t.radius + r) continue;
      if (this.game.world?.segmentBlocked?.(f.chestWorld(new THREE.Vector3()), t.chestWorld(new THREE.Vector3()))) continue;
      hitSet.add(t);
      const res = this.combat.applyHit(t, f, { color: this.color, ...spec, at: p.clone() });
      opts.onContact?.(t, res, p);
      this.onContact?.(t, res, spec);
    }
    // fists also bat away projectiles they pass through
    for (const pr of this.combat.projectiles) {
      if (pr.team === f.team || (!pr.reflectable && !pr.destructible)) continue;
      if (pr.pos.distanceTo(p) > r + pr.radius + 0.35) continue;
      if (pr.reflectable) this.combat.reflect(pr, f);
      else { pr.life = 0; pr.smashed = true; this.vfx?.burst(pr.pos, pr.color, 10, 4, 0.35, 0.3); }
    }
    if (!a.data.prevLimb) a.data.prevLimb = new THREE.Vector3();
    a.data.prevLimb.copy(p);
  }

  // Aim assist: snap to the melee target before an attack starts.
  assist() {
    const t = this.meleeTarget();
    if (t) this.f.faceTowards(t.pos, true);
    return t;
  }

  // Buffered input: a press that arrives a little early fires as soon as the fighter can act.
  buffer(move) { this.buffered = { move, until: this.clock + 0.28 }; return false; }

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
  // 4-hit string: jab L, jab R, hook L, rising uppercut (launches). Each hit lands on contact of
  // the actual fist; the Stand dashes to the target when one is in range.
  standReady() {
    const sa = this.stand?.action;
    if (!sa || !sa.def.clip) return true;
    return sa.t / sa.def.dur >= sa.def.clip.active[1];
  }

  light() {
    const f = this.f;
    const withStand = this.stand && this.stand.summoned;
    const chain = f.action && (f.action.def.name === 'command' || (f.action.def.comboWindow && f.action.t > f.action.def.comboWindow));
    if ((!f.canAct() && !chain) || (withStand && !this.standReady())) return this.buffer('light');
    const t = this.assist();
    this.combo = this.comboTimer > this.clock ? (this.combo + 1) % 4 : 0;
    this.comboTimer = this.clock + 0.9;
    const step = this.combo;
    const clip = [Clips.jabL, Clips.jabR, Clips.hookL, Clips.uppercutR][step];
    const spec = {
      damage: [5, 5, 6, 8][step] * (withStand ? 1 : 0.6), stun: step === 3 ? 0.5 : 0.3, knock: step === 3 ? 2.5 : 1.1,
      launch: step === 3 ? 4.2 : 0, kind: 'light', fxPower: step === 3 ? 1.35 : 1,
    };
    audio.play('whoosh', { power: 0.6 });
    if (withStand) {
      if (f.action?.def.name === 'command') f.cancelAction();
      f.play({ name: 'command', dur: 0.26, upper: true, clip: Clips.command, move: () => 0.5 });
      this.stand.strike(this.melee(clip, spec, { target: t }), 'front');
    } else {
      if (chain) f.cancelAction();
      f.play(this.melee(clip, { ...spec, damage: spec.damage }, { target: t, lunge: false, comboWindow: clip.dur * clip.active[1], move: (k) => (k > 0.2 && k < 0.5 ? 2.6 : 0) }));
    }
    this.lastAttackT = this.clock;
    this.game.combat.emit({ type: 'attack', attacker: f, move: 'light' });
    return true;
  }

  heavy() {
    const f = this.f;
    if (!f.canAct() || (this.stand?.summoned && !this.standReady())) return this.buffer('heavy');
    if (!this.spend(10)) return false;
    const t = this.assist();
    const withStand = this.ensureStand();
    const spec = {
      damage: 15, stun: 0.65, knock: 7, launch: 1.5, kind: 'heavy', guardDamage: 18, fxPower: 1.6,
    };
    const onContact = (tg, res, p) => {
      audio.play('punch', { power: 1.4 });
      this.vfx.ring(p, this.color, 0.2, 1.6, 0.3, { vertical: true, face: this.game.engine.camera.position });
    };
    f.play({ name: 'heavyCmd', dur: 0.6, upper: true, clip: Clips.sweep, move: (k) => (k > 0.4 && k < 0.6 ? 3 : 0) });
    if (withStand) this.stand.strike(this.melee(Clips.heavyR, spec, { target: t, onContact, standoff: 0.5 }), 'front');
    this.game.combat.emit({ type: 'attack', attacker: f, move: 'heavy' });
    return true;
  }

  // Call every frame while the rush button is held. The Stand plants itself in front of the
  // target and throws alternating straights; each fist that actually reaches the target lands.
  rush(holding, dt) {
    const f = this.f;
    if (holding && !this.rushing) {
      if (!f.canAct() || f.energy < 15) return false;
      this.ensureStand();
      this.rushing = 0.0001;
      const t = this.assist();
      f.play({ name: 'rushCmd', dur: 99, upper: true, pose: (k, self) => Poses.castBoth(Math.min(1, self.action.t * 3)), state: 'action' });
      const kit = this;
      const hits = { L: new Set(), R: new Set() };
      const rate = this.rushRate || 15;
      const def = {
        name: 'rush', dur: 99, rush: true, rate, lunge: true, standoff: 0.4, dash: 24,
        tick: (self, t01, dtt, a) => {
          const tg = a.data.target;
          a.data.aimL = a.data.aimL || new THREE.Vector3();
          a.data.aimR = a.data.aimR || new THREE.Vector3();
          const rr = Clips.rushReach(a.t, rate);
          for (const s of ['L', 'R']) {
            const ext = rr[s] > 0.82;
            if (!ext && a.data[`ext${s}`]) { a.data[`ext${s}`] = false; hits[s].clear(); a.data[`jit${s}`] = null; }
            if (tg && !tg.dead) {
              if (!a.data[`jit${s}`]) a.data[`jit${s}`] = v3((Math.random() - 0.5) * 0.5, (Math.random() - 0.4) * 0.55, (Math.random() - 0.5) * 0.3);
              tg.chestWorld(a.data[`aim${s}`]).add(a.data[`jit${s}`]);
            } else self.chestWorld(a.data[`aim${s}`]).addScaledVector(self.forward(), 1.6);
            if (ext) {
              a.data[`ext${s}`] = true;
              const before = hits[s].size;
              a.data.prevLimb = a.data[`prev${s}`] || null;
              kit._contact(self, `hand${s}`, { damage: 1.5, stun: 0.3, knock: 0.22, kind: 'rush', sfx: 'punch', fxPower: 0.7 }, hits[s], a, { radius: 0.3 });
              a.data[`prev${s}`] = a.data.prevLimb;
              if (hits[s].size === before && Math.random() < 0.35) kit.vfx.fist(kit.limbPoint(self, `hand${s}`, new THREE.Vector3()), self.forward(), kit.color, 0.1, 0.9);
            } else a.data[`prev${s}`] = null;
          }
          if (Math.random() < dtt * 3) audio.play('whoosh', { power: 0.45 });
          if (kit.rushShout && Math.random() < dtt * 0.9) kit.vfx.text(self.chestWorld(new THREE.Vector3()).add(v3(0, 0.8, 0)), kit.rushShout, kit.rushShoutColor || '#ffd34d', 0.9, 0.8);
        },
      };
      if (this.stand) this.stand.strike({ ...def, target: t }, 'front');
      this.onRushStart?.();
      return true;
    }
    if (!this.rushing) return false;
    this.rushing += dt;
    f.energy -= this.rushCost * dt;
    const mt = this.meleeTarget();
    if (mt) f.faceTowards(mt.pos);
    if (this.stand?.action?.def.rush && mt && this.stand.action.data.target !== mt) this.stand.action.data.target = mt;
    if (!holding || f.energy <= 0 || this.rushing > 2.6 || f.stun > 0) {
      // finisher
      const fin = holding === false && this.rushing > 0.5;
      this.rushing = 0;
      f.cancelAction();
      this.stand?.cancelAction();
      if (fin || this.rushing === 0) {
        f.play({ name: 'rushEnd', dur: 0.45, upper: true, clip: Clips.sweep });
        const spec = { damage: 9, stun: 0.6, knock: 10, launch: 3, kind: 'heavy', fxPower: 1.8 };
        if (this.stand) this.stand.strike(this.melee(Clips.rushFinish, spec, { target: mt, standoff: 0.45, onContact: () => this.game.camera.shake(0.6) }), 'front');
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
    const t = this.assist();
    this.ensureStand();
    const spec = { damage: 17, stun: 0.8, knock: 14, launch: 4.5, kind: 'heavy', guardBreak: true, fxPower: 2 };
    const onContact = (tg, res, p) => {
      this.vfx.ring(p, 0xffffff, 0.3, 3, 0.4, { vertical: true, face: this.game.engine.camera.position });
      this.game.camera.shake(0.5);
    };
    f.play({ name: 'kbCmd', dur: 0.8, upper: true, pose: (k) => Poses.cast('R', k, 0.1) });
    if (this.stand) this.stand.strike(this.melee(Clips.knockback, spec, { target: t, onContact, standoff: 0.5, radius: 0.36 }), 'front');
    else f.play(this.melee(Clips.knockback, spec, { target: t, lunge: false, onContact }));
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
    if (this.buffered) {
      const b = this.buffered;
      if (this.clock > b.until) this.buffered = null;
      else if ((f.canAct() || f.action?.def.name === 'command') && (!this.stand?.summoned || this.standReady())) {
        this.buffered = null;
        this[b.move]?.();
      }
    }
    if (!f.isFrozen() && !this.rushing && f.action?.def.name !== 'rushCmd') {
      f.energy = Math.min(f.energyMax, f.energy + this.energyRegen * dt * (this.clock - this.lastAttackT > 1.2 ? 1.6 : 0.6));
    }
    if (f.guarding) this.faceTarget(false);
  }

  // AI ability table: [{ name, weight, min, max, cool, phase, fn }]
  get abilities() { return []; }

  dispose() {}
}
