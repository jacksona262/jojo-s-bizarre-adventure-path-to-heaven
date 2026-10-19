import * as THREE from 'three';
import { instantiate } from '../assets/AssetLibrary';
import * as Poses from '../anim/Poses';

// Base class for every humanoid in the game: DIO, bosses, supporting cast and Versus fighters.
// Handles model + procedural animation layering, kinematic movement, health/energy and hit reactions.

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
let uid = 0;

export class Character {
  constructor(game, opts) {
    this.game = game;
    this.id = opts.id || `char${uid += 1}`;
    this.partKey = opts.partKey;
    this.name = opts.name || opts.partKey;
    this.team = opts.team ?? 1;
    this.group = new THREE.Group();
    this.group.name = `char:${this.id}`;
    this.pos = this.group.position;
    this.vel = new THREE.Vector3();
    this.yaw = opts.yaw || 0;
    this.targetYaw = this.yaw;
    this.radius = opts.radius || 0.42;
    this.height = opts.height || 1.9;
    this.onGround = true;
    this.hpMax = opts.hp || 100;
    this.hp = this.hpMax;
    this.energyMax = opts.energy || 100;
    this.energy = this.energyMax;
    this.staminaMax = opts.stamina || 100;
    this.stamina = this.staminaMax;
    this.power = opts.power || 1;
    this.moveSpeed = opts.speed || 4.2;
    this.style = opts.style || 'neutral';
    this.state = 'free';
    this.action = null;
    this.phase = 0;
    this.speedParam = 0;
    this.pose = Poses.rest();
    this.basePose = Poses.rest();
    this.blendPose = Poses.rest();
    this.actionWeight = 0;
    this.lastAction = null;
    this.stun = 0;
    this.invuln = 0;
    this.guarding = false;
    this.guardStart = -10;
    this.hitFlash = 0;
    this.dead = false;
    this.t = 0;
    this.override = null;       // cinematic pose function (t) => pose
    this.frozenVisual = false;
    this.mounted = null;
    this.stand = null;
    this.tags = new Set(opts.tags || []);
    this.controller = null;
    this.gravity = opts.gravity ?? 1;
    this.floating = !!opts.floating;
    this.ghost = false;
    this.knockdown = 0;
    this.pendingDamage = [];
    this.visible = true;
  }

  async load() {
    this.model = await instantiate(this.partKey);
    this.rig = this.model.userData.rig || null;
    this.materials = this.model.userData.materials || [];
    this.group.add(this.model);
    this.group.rotation.y = this.yaw;
    return this;
  }

  addTo(scene) { scene.add(this.group); return this; }

  remove() {
    this.group.removeFromParent();
    if (this.stand) this.stand.remove();
  }

  get alive() { return !this.dead; }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  faceTowards(p, instant = false) {
    this.targetYaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    if (instant) this.yaw = this.targetYaw;
  }

  distanceTo(o) { return Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z); }

  isFrozen() { return this.game.time?.isFrozen(this) || false; }

  // ---------------------------------------------------------------- actions
  // def: { name, dur, pose(t01, self), upper?, move?(t01) -> forward speed, events: [{t, fn}], lock?, armor?, onEnd? }
  play(def, opts = {}) {
    if (this.dead) return null;
    if (this.action && this.action.def.uninterruptible && !opts.force) return null;
    this.action = { def, t: 0, fired: new Set(), opts, data: {} };
    this.state = def.state || 'action';
    return this.action;
  }

  cancelAction() {
    if (this.action?.def.onEnd) this.action.def.onEnd(this, true);
    this.action = null;
    if (this.state === 'action') this.state = 'free';
  }

  busy() { return !!this.action || this.stun > 0 || this.knockdown > 0 || this.dead; }

  canAct() { return !this.busy() && this.state === 'free'; }

  // ---------------------------------------------------------------- damage
  takeHit(hit, attacker) {
    if (this.dead) return 'none';
    const dmg = hit.damage;
    this.hp = Math.max(0, this.hp - dmg);
    this.hitFlash = 0.12;
    if (this.onDamaged) this.onDamaged(dmg, attacker, hit);
    if (this.hp <= 0) { this.die(attacker); return 'kill'; }
    if (this.action?.def.armor && !hit.breaksArmor) return 'armored';
    if (hit.stun > 0) {
      this.cancelAction();
      this.stun = Math.max(this.stun, hit.stun);
      this.stunTotal = this.stun;
    }
    if (hit.knock) {
      const dir = tmpV.copy(this.pos).sub(attacker.pos).setY(0).normalize();
      this.vel.x += dir.x * hit.knock;
      this.vel.z += dir.z * hit.knock;
      if (hit.launch) { this.vel.y = hit.launch; this.onGround = false; }
      if (hit.knock > 8 || hit.launch > 5) { this.knockdown = 1.2; this.knockTotal = 1.2; this.cancelAction(); }
    }
    return 'hit';
  }

  die(killer) {
    this.dead = true;
    this.state = 'dead';
    this.action = null;
    this.knockdown = 9999;
    if (this.onDeath) this.onDeath(killer);
  }

  revive(hp = this.hpMax) {
    this.dead = false;
    this.hp = hp;
    this.state = 'free';
    this.knockdown = 0;
    this.stun = 0;
    this.action = null;
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    if (this.override) {
      this.t += dt;
      const p = this.override(this.t, this);
      if (p && this.rig) this.rig.apply(p);
      this.group.rotation.y = this.yaw;
      this._flash(dt);
      return;
    }
    if (this.isFrozen()) {
      this.frozenVisual = true;
      return;
    }
    this.frozenVisual = false;
    this.t += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.stamina = Math.min(this.staminaMax, this.stamina + dt * (this.action ? 6 : 18));

    // action timeline
    let moveFwd = 0;
    if (this.action) {
      const a = this.action;
      a.t += dt * (a.def.speed || 1) * (a.opts.speed || 1);
      const dur = a.opts.dur || a.def.dur;
      const t01 = Math.min(1, a.t / dur);
      if (a.def.events) {
        for (let i = 0; i < a.def.events.length; i += 1) {
          const ev = a.def.events[i];
          if (!a.fired.has(i) && t01 >= ev.t) { a.fired.add(i); ev.fn(this, a); if (this.action !== a) break; }
        }
      }
      if (this.action === a) {
        if (a.def.move) moveFwd = a.def.move(t01, this);
        if (a.def.tick) a.def.tick(this, t01, dt, a);
        if (a.t >= dur) {
          if (a.def.onEnd) a.def.onEnd(this, false);
          if (this.action === a) { this.action = null; if (this.state === 'action') this.state = 'free'; }
          this.lastAction = a.def.name;
        }
      }
    }
    if (this.stun > 0) this.stun -= dt;
    if (this.knockdown > 0 && !this.dead) {
      this.knockdown -= dt;
      if (this.knockdown <= 0) this.invuln = Math.max(this.invuln, 0.5);
    }

    // facing
    let dy = this.targetYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const turnRate = this.action?.def.turn ?? 10;
    this.yaw += dy * Math.min(1, dt * turnRate);
    this.group.rotation.y = this.yaw;

    // physics
    if (moveFwd) {
      this.vel.x += (Math.sin(this.yaw) * moveFwd - this.vel.x) * Math.min(1, dt * 14);
      this.vel.z += (Math.cos(this.yaw) * moveFwd - this.vel.z) * Math.min(1, dt * 14);
    }
    this._integrate(dt);

    // animation
    this._animate(dt);
    this._flash(dt);
  }

  // desired horizontal velocity from a controller (m/s, world space)
  steer(vx, vz, dt, accel = 12) {
    const k = Math.min(1, dt * (this.onGround ? accel : accel * 0.25));
    this.vel.x += (vx - this.vel.x) * k;
    this.vel.z += (vz - this.vel.z) * k;
  }

  _integrate(dt) {
    const world = this.game.world;
    if (!this.floating) this.vel.y -= 25 * this.gravity * dt;
    else this.vel.y *= Math.exp(-dt * 4);
    // friction when no controller input / during stun
    if (this.stun > 0 || this.knockdown > 0 || this.dead) {
      const f = Math.exp(-dt * (this.onGround ? 6 : 0.5));
      this.vel.x *= f; this.vel.z *= f;
    }
    const ox = this.pos.x; const oz = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    if (world) {
      if (!this.ghost) world.collide(this.pos, this.radius, this.pos.y);
      if (this.game.combat) this.game.combat.separate(this);
      const g = world.groundAt(this.pos.x, this.pos.z, this.pos.y);
      const floatH = this.floating ? (this.hoverHeight ?? 0) : 0;
      if (this.pos.y <= g + floatH + 0.02 || (this.onGround && this.pos.y - (g + floatH) < 0.35 && this.vel.y <= 0)) {
        this.pos.y = g + floatH;
        if (this.vel.y < -12 && this.onLand) this.onLand(this.vel.y);
        this.vel.y = 0;
        this.onGround = true;
      } else {
        this.onGround = false;
      }
      // water slows
      const wl = world.waterAt(this.pos.x, this.pos.z);
      this.inWater = wl > -1e6 && this.pos.y < wl - 0.15;
      if (this.inWater) { this.vel.x *= Math.exp(-dt * 2.5); this.vel.z *= Math.exp(-dt * 2.5); }
    }
    this.moved = Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, 1e-4);
  }

  _animate(dt) {
    if (!this.rig) return;
    const sp = this.moved || 0;
    const norm = sp < 0.2 ? 0 : sp < this.moveSpeed * 0.6 ? sp / (this.moveSpeed * 0.6) : 1 + Math.min(2, (sp - this.moveSpeed * 0.6) / (this.moveSpeed * 0.7));
    this.speedParam += (norm - this.speedParam) * Math.min(1, dt * 10);
    const stride = this.speedParam < 1 ? 1.6 : 1.5 + this.speedParam * 0.55;
    this.phase += dt * stride * Math.PI * (0.8 + this.speedParam * 0.55);

    let base;
    if (this.dead) base = Poses.defeated(Math.min(1, this.t));
    else if (this.knockdown > 0) base = Poses.knockedDown(1 - this.knockdown / (this.knockTotal || 1));
    else if (this.stun > 0) base = Poses.hitReact(1 - this.stun / (this.stunTotal || 0.3), 1);
    else if (this.mounted) base = Poses.ride(this.mounted.anim.phase * Math.PI * 2, Math.min(1, this.mounted.speed / 10), this.mounted.turn || 0);
    else if (!this.onGround && !this.floating) base = Poses.airborne(this.t, this.vel.y);
    else if (this.guarding) base = Poses.block();
    else if (this.speedParam < 0.05) base = this.idlePose ? this.idlePose(this.t, this) : Poses.idle(this.t, this.style);
    else base = Poses.locomotion(this.phase, this.speedParam, this.t);
    if (this.floating && !this.action && !this.dead && this.knockdown <= 0) base = Poses.standFloat(this.t, this.speedParam > 0.5);

    const a = this.action;
    const target = a && a.def.pose ? 1 : 0;
    this.actionWeight += (target - this.actionWeight) * Math.min(1, dt * (target ? 22 : 10));
    if (a && a.def.pose) {
      const dur = a.opts.dur || a.def.dur;
      this._actPose = a.def.pose(Math.min(1, a.t / dur), this, a);
    }
    if (this.actionWeight > 0.01 && this._actPose) {
      const ap = this._actPose;
      Poses.lerpPose(base, ap, this.actionWeight, this.blendPose);
      if (a?.def.upper && this.speedParam > 0.1) {
        for (const k of ['thL', 'shL', 'thR', 'shR']) this.blendPose[k] = base[k];
        this.blendPose.rootY = base.rootY;
      }
      this.rig.apply(this.blendPose);
    } else {
      this.rig.apply(base);
    }
  }

  _flash(dt) {
    if (this.hitFlash > 0 || this._flashOn) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      const on = this.hitFlash > 0;
      const k = on ? this.hitFlash / 0.12 : 0;
      for (const m of this.materials) {
        if (!m.emissive) continue;
        if (on) m.emissive.setRGB(k * 1.2, k * 0.9, k * 0.7);
        else if (m.userData.baseEmissive) m.emissive.copy(m.userData.baseEmissive);
      }
      this._flashOn = on;
    }
  }

  setTint(color, amount) {
    for (const m of this.materials) {
      if (!m.emissive) continue;
      if (amount > 0) m.emissive.copy(color).multiplyScalar(amount);
      else if (m.userData.baseEmissive) m.emissive.copy(m.userData.baseEmissive);
    }
  }

  setOpacity(o) {
    for (const m of this.materials) {
      m.transparent = o < 0.999;
      m.opacity = o;
      m.depthWrite = o > 0.5;
    }
  }

  jointWorld(j, out = new THREE.Vector3()) {
    if (this.rig) return this.rig.jointWorld(j, out);
    return out.copy(this.pos).add(new THREE.Vector3(0, this.height * 0.6, 0));
  }

  chestWorld(out = new THREE.Vector3()) {
    return out.copy(this.pos).addScaledVector(UP, this.height * 0.68);
  }
}
