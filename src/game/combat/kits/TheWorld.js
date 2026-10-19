import * as THREE from 'three';
import { Kit, v3 } from '../Kit';
import * as Poses from '../../anim/Poses';
import * as Clips from '../../anim/Clips';
import { audio } from '../../core/Audio';
import { areaDamage } from '../Combat';

// DIO / The World and Heaven Ascension DIO / The World Over Heaven.

export const TS_DURATION = [2, 3, 4, 5, 6];      // by upgrade level
export const TS_COOLDOWN = [22, 19, 16, 13, 11];

function knifeMesh() {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.32, 4), new THREE.MeshStandardMaterial({ color: 0xd8dde4, metalness: 0.95, roughness: 0.2 }));
  blade.rotation.x = Math.PI / 2;
  blade.position.z = 0.12;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), new THREE.MeshStandardMaterial({ color: 0x2a1a10 }));
  handle.rotation.x = Math.PI / 2;
  handle.position.z = -0.08;
  g.add(blade, handle);
  return g;
}

export class TheWorldKit extends Kit {
  constructor(f, game) {
    super(f, game, { color: 0xffd34d, reach: 2.1, name: 'The World', rushCost: 13 });
    this.rushShout = '無駄無駄';
    this.rushShoutColor = '#ffd34d';
    f.tsCharge = 1;
  }

  get up() { return this.game.progress?.upgrades || {}; }
  tsDuration() { return TS_DURATION[Math.min(4, this.up.tsDuration || 0)]; }
  tsCooldown() { return TS_COOLDOWN[Math.min(4, this.up.tsCooldown || 0)]; }

  signature() { return this.timeStop(); }

  timeStop() {
    const f = this.f;
    const tc = this.game.time;
    // Moving inside an enemy's stopped time (late-game upgrade)
    if (tc.stopped && tc.state.user !== f) {
      if (this.up.tsAwareness && f.tsCharge >= 0.5) {
        f.tsCharge -= 0.5;
        tc.allow(f, 2.2);
        this.vfx.text(f.chestWorld(new THREE.Vector3()).add(v3(0, 0.8, 0)), 'ザ・ワールド', '#ffd34d', 1.4, 0.8);
        audio.play('summon');
        this.game.combat.emit({ type: 'tsAwareness', user: f });
        return true;
      }
      return false;
    }
    if (tc.state || f.tsCharge < 1 || f.dead || f.stun > 0 || f.knockdown > 0 || f.mounted) return false;
    if (this.game.lockTimeStop) { this.game.notify?.('The World cannot stop time yet.'); return false; }
    f.tsCharge = 0;
    // time stop always wins: it cuts through a rush, a guard or any recovery
    if (this.rushing) { this.rushing = 0; this.onRushEnd?.(); }
    f.guarding = false;
    this.buffered = null;
    this.ensureStand();
    f.cancelAction();
    this.stand?.cancelAction();
    // ZA WARUDO: DIO throws his arms wide as The World rises behind him in the same pose
    f.play({ name: 'tsPose', dur: 0.7, upper: true, clip: Clips.timeStop });
    this.stand?.strike({ name: 'tsStand', dur: 0.7, clip: Clips.timeStop }, 'overhead');
    this.vfx.text(f.chestWorld(new THREE.Vector3()).add(v3(0, 1.0, 0)), 'ザ・ワールド', '#ffd34d', 1.6, 1);
    tc.stop(f, this.tsDuration(), { variant: this.tsVariant || 'theWorld' });
    this.game.combat.emit({ type: 'playerTimeStop' });
    return true;
  }

  // Unlockable: a fan of knives. In stopped time they hang in the air until time resumes.
  specialB() {
    const f = this.f;
    if (!this.up.knives) return false;
    if (!f.canAct() || !this.ready('knives') || !this.spend(15)) return false;
    this.setCool('knives', 2.5);
    const t = this.faceTarget(true);
    f.play({ name: 'throw', dur: 0.45, upper: true, pose: (k) => Poses.cast('R', k, 0.2), events: [{ t: 0.4, fn: () => {
      const origin = f.jointWorld('handR');
      const aim = t ? t.chestWorld(new THREE.Vector3()) : origin.clone().addScaledVector(f.forward(), 10);
      for (let i = -2; i <= 2; i += 1) {
        const dir = aim.clone().sub(origin).normalize();
        dir.applyAxisAngle(v3(0, 1, 0), i * 0.07);
        const p = this.combat.spawnProjectile({ owner: f, pos: origin, vel: dir.multiplyScalar(26), radius: 0.25, damage: 4, stun: 0.25, knock: 1, life: 2, mesh: knifeMesh(), color: 0xd8e0ff });
        p.freeInStop = true;
      }
      audio.play('whoosh');
    } }] });
    return true;
  }

  update(dt) {
    super.update(dt);
    const f = this.f;
    if (!this.game.time.state || this.game.time.state.user !== f) {
      f.tsCharge = Math.min(1, f.tsCharge + dt / this.tsCooldown());
    }
  }

  get abilities() {
    return [
      { name: 'light', weight: 3, min: 0, max: 2.4, cool: 0.4, fn: () => this.light() },
      { name: 'heavy', weight: 1.2, min: 0, max: 2.6, cool: 1.5, fn: () => this.heavy() },
      { name: 'knock', weight: 0.7, min: 0, max: 2.8, cool: 4, fn: () => this.knockback() },
      { name: 'rush', weight: 1, min: 0, max: 2.6, cool: 4, fn: () => this.aiRush(1.2) },
      { name: 'ts', weight: 0.6, min: 0, max: 12, cool: 14, phase: 2, fn: () => this.timeStop() },
    ];
  }

  aiRush(dur) {
    if (!this.rush(true, 0)) return false;
    this.aiRushT = dur;
    return true;
  }
}

// ---------------------------------------------------------------------------------------------
export class HeavenKit extends TheWorldKit {
  constructor(f, game) {
    super(f, game);
    this.color = new THREE.Color(0xfff2c8);
    this.reach = 2.4;
    this.name = 'The World Over Heaven';
    this.rushShout = '無駄無駄無駄';
    this.rushShoutColor = '#fff2c8';
    this.history = new Map(); // fighter -> [{t, pos}]
    this.defenseUntil = 0;
  }

  tsDuration() { return 9; }
  tsCooldown() { return 14; }

  mark(target, n = 1) {
    target.overwrite = Math.min(5, (target.overwrite || 0) + n);
    target.overwriteUntil = this.clock + 8;
    const p = target.chestWorld(new THREE.Vector3());
    this.vfx.burst(p, 0xfff2c8, 6, 3, 0.25, 0.5);
    if (target.overwrite >= 3 && !target.overwritten) {
      target.overwritten = true;
      target.overwrittenUntil = this.clock + 6;
      this.vfx.text(p.clone().add(v3(0, 0.8, 0)), 'OVERWRITTEN', '#fff2c8', 1.4, 0.7);
      audio.play('counter');
      this.game.combat.emit({ type: 'overwritten', target });
    }
  }

  hit(spec) {
    const res = super.hit({ ...spec, onHit: (t) => { this.mark(t, spec.kind === 'heavy' ? 2 : 1); spec.onHit?.(t); } });
    return res;
  }

  // Reality Break: a heavy that fractures the ground in a line and launches everything on it.
  heavy() {
    const f = this.f;
    if (!f.canAct() || !this.spend(16)) return false;
    this.faceTarget(true);
    this.ensureStand();
    f.play({ name: 'rbCmd', dur: 0.75, upper: true, pose: (t) => Poses.cast('R', t, -0.3) });
    this.stand.strike({ name: 'rb', dur: 0.75, pose: (t) => Poses.heavy(t), events: [{ t: 0.55, fn: () => {
      const fwd = f.forward();
      const struck = new Set();
      for (let i = 1; i <= 6; i += 1) {
        const p = f.pos.clone().addScaledVector(fwd, i * 1.6);
        p.y = this.game.world.groundAt(p.x, p.z, p.y + 2) + 0.1;
        setTimeout(() => {
          this.vfx.ring(p, 0xfff2c8, 0.2, 1.8, 0.4);
          this.vfx.sparkBurst(p, 0xfff2c8, 10, 8, v3(0, 1, 0));
          areaDamage(this.combat, f, p, 1.6, { damage: 14, stun: 0.7, knock: 3, launch: 7, kind: 'heavy', color: 0xfff2c8 }, (t) => { if (struck.has(t)) return false; struck.add(t); this.mark(t, 2); return true; });
        }, i * 45);
      }
      this.game.engine.fx.uHeaven.value = 0.8;
      this.game.camera.shake(0.7);
      audio.play('heavyHit');
    } }] });
    return true;
  }

  // Overwritten Defense: for a short window, an incoming blow is rewritten out of existence,
  // the attacker is returned to where they stood 1.5 s ago and suffers their own strike.
  specialA() {
    const f = this.f;
    if (!f.canAct() || !this.ready('owd') || !this.spend(20)) return false;
    this.setCool('owd', 5);
    this.defenseUntil = this.clock + 0.7;
    f.play({ name: 'owd', dur: 0.7, pose: (t) => Poses.castBoth(Math.min(1, t * 3), 0.3) });
    this.vfx.ring(f.chestWorld(new THREE.Vector3()), 0xfff2c8, 0.4, 1.8, 0.7, { vertical: true, face: this.game.engine.camera.position });
    audio.play('summon');
    return true;
  }

  // Reality Overwrite: contact technique; instantly overwrites a marked target.
  specialB() {
    const f = this.f;
    if (!f.canAct() || !this.ready('ovr') || !this.spend(30)) return false;
    this.setCool('ovr', 7);
    this.faceTarget(true);
    this.ensureStand();
    f.play({ name: 'ovrCmd', dur: 0.6, upper: true, pose: (t) => Poses.point('R', t) });
    this.stand.strike({ name: 'ovr', dur: 0.6, pose: (t) => Poses.cast('R', t), events: [{ t: 0.45, fn: () => {
      const hits = this.combat.strike(f, { origin: this.strikeOrigin(), range: this.reach + 0.8, damage: 10, stun: 0.9, knock: 2, kind: 'special', color: 0xfff2c8 });
      for (const h of hits) this.mark(h.target, 3);
      this.game.engine.fx.uHeaven.value = 1;
    } }] });
    return true;
  }

  signature() {
    const t = this.target();
    if (t && t.hp / t.hpMax < 0.15 && t.overwritten && this.onFinisher) return this.onFinisher(t);
    return this.timeStop();
  }

  update(dt) {
    super.update(dt);
    // record positions for rewinds
    for (const o of this.combat.enemiesOf(this.f)) {
      if (!this.history.has(o)) this.history.set(o, []);
      const h = this.history.get(o);
      h.push({ t: this.clock, p: o.pos.clone() });
      while (h.length && h[0].t < this.clock - 2) h.shift();
      if (o.overwritten && this.clock > o.overwrittenUntil) { o.overwritten = false; o.overwrite = 0; }
    }
    const fx = this.game.engine.fx;
    fx.uHeaven.value = Math.max(0.05, fx.uHeaven.value - dt * 1.5);
  }

  // called by the player character when struck
  interceptHit(hit, attacker) {
    if (this.clock < this.defenseUntil) {
      const h = this.history.get(attacker);
      const back = h && h.length ? h[0].p : null;
      if (back) { attacker.pos.copy(back); attacker.vel.set(0, 0, 0); }
      this.game.combat.applyHit(attacker, this.f, { damage: hit.damage * 1.2, stun: 1.0, knock: 3, kind: 'heavy', color: 0xfff2c8, noCounter: true, unblockable: true });
      this.vfx.text(this.f.chestWorld(new THREE.Vector3()).add(v3(0, 0.9, 0)), 'REWRITTEN', '#fff2c8', 1.2, 0.7);
      this.game.engine.fx.uHeaven.value = 1;
      this.defenseUntil = 0;
      return true;
    }
    return false;
  }
}
