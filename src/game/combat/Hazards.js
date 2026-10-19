import * as THREE from 'three';
import { areaDamage } from './Combat';

// Reusable arena hazards. Each exposes update(dt, realDt, frozen) -> done, and dispose().

export class FireZone {
  constructor(game, owner, pos, radius, life, dps = 10) {
    Object.assign(this, { game, owner, pos: pos.clone(), radius, life, dps });
    this.tick = 0;
    this.ring = game.vfx.warn(pos, radius, life, 0xff5a10);
  }
  update(dt) {
    if (dt === 0) return false;
    this.life -= dt;
    this.tick -= dt;
    if (Math.random() < dt * 30) {
      const a = Math.random() * Math.PI * 2; const r = Math.sqrt(Math.random()) * this.radius;
      this.game.vfx.flame(this.pos.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)), 1, 0.7);
    }
    if (this.tick <= 0) {
      this.tick = 0.4;
      areaDamage(this.game.combat, this.owner, this.pos, this.radius, { damage: this.dps * 0.4, stun: 0.15, knock: 1.5, kind: 'special', color: 0xff6020, sfx: 'fire', noCounter: true, unblockable: true });
    }
    return this.life <= 0;
  }
  dispose() {}
}

export class FireWall {
  constructor(game, owner, a, b, life = 5) {
    Object.assign(this, { game, owner, a: a.clone(), b: b.clone(), life });
    this.mesh = game.vfx.fireWall(a, b, 2.8, life);
    this.tick = 0;
    this.blocker = game.world.addCollider({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, hw: a.distanceTo(b) / 2, hd: 0.35, rot: Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2, top: a.y + 3, bottom: a.y - 2, noCam: true });
  }
  update(dt) {
    if (dt === 0) return false;
    this.life -= dt;
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.35;
      for (const f of this.game.combat.enemiesOf(this.owner)) {
        const d = distToSegment(f.pos, this.a, this.b);
        if (d < 1.1) this.game.combat.applyHit(f, this.owner, { damage: 5, stun: 0.2, knock: 4, kind: 'special', color: 0xff6020, sfx: 'fire', unblockable: true, noCounter: true });
      }
    }
    return this.life <= 0;
  }
  dispose() { this.game.world.removeCollider(this.blocker); }
}

export function distToSegment(p, a, b) {
  const abx = b.x - a.x; const abz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / (abx * abx + abz * abz || 1)));
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
}

// Delayed eruption at a point (telegraphed).
export class Eruption {
  constructor(game, owner, pos, radius, delay, hit, onBoom) {
    Object.assign(this, { game, owner, pos: pos.clone(), radius, delay, hit, onBoom });
    this.t = 0;
    game.vfx.warn(pos, radius, delay, hit.color ?? 0xff3020);
  }
  update(dt) {
    if (dt === 0) return false;
    this.t += dt;
    if (this.t >= this.delay) {
      areaDamage(this.game.combat, this.owner, this.pos, this.radius, { noCounter: true, ...this.hit });
      if (this.onBoom) this.onBoom(this.pos);
      return true;
    }
    return false;
  }
}

// A timed callback that respects time stop.
export class Timer {
  constructor(delay, fn) { this.t = delay; this.fn = fn; }
  update(dt) {
    if (dt === 0) return false;
    this.t -= dt;
    if (this.t <= 0) { this.fn(); return true; }
    return false;
  }
}
