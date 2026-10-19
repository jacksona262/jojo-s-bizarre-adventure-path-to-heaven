import * as THREE from 'three';
import { audio } from '../core/Audio';

// Hit resolution, guarding/countering, projectiles and arena hazards.

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

export class Combat {
  constructor(game) {
    this.game = game;
    this.fighters = new Set();
    this.projectiles = [];
    this.hazards = [];
    this.queued = [];
    this.listeners = [];
    this.damageMul = { 0: 1, 1: 1 };   // team multipliers (difficulty)
    this.lastHitTime = 0;
  }

  add(f) { this.fighters.add(f); return f; }
  remove(f) { this.fighters.delete(f); }
  clear() {
    for (const p of this.projectiles) this._disposeProjectile(p);
    for (const h of this.hazards) h.dispose?.();
    this.projectiles = []; this.hazards = []; this.queued = [];
    this.fighters.clear();
  }

  on(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((f) => f !== fn); }; }
  emit(ev) { for (const fn of this.listeners) fn(ev); }

  enemiesOf(f) {
    const out = [];
    for (const o of this.fighters) if (o.team !== f.team && o.alive && !o.untargetable) out.push(o);
    return out;
  }

  nearestEnemy(f, maxDist = 30) {
    let best = null; let bd = maxDist;
    for (const o of this.enemiesOf(f)) {
      const d = f.distanceTo(o);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // keep fighters from overlapping
  separate(c) {
    if (c.ghost || c.dead) return;
    for (const o of this.fighters) {
      if (o === c || o.ghost || o.dead || o.mounted) continue;
      const dx = c.pos.x - o.pos.x; const dz = c.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      const m = c.radius + o.radius;
      if (d < m && d > 1e-4 && Math.abs(c.pos.y - o.pos.y) < 1.6) {
        const push = (m - d);
        c.pos.x += dx / d * push; c.pos.z += dz / d * push;
      }
    }
  }

  // Melee strike in a cone in front of the attacker (or from a custom origin).
  strike(attacker, spec) {
    const hits = [];
    const origin = spec.origin || tmp.copy(attacker.pos);
    const fwd = attacker.forward(tmp2);
    const range = spec.range ?? 1.8;
    const arc = spec.arc ?? 1.0;
    for (const t of this.enemiesOf(spec.owner || attacker)) {
      const dx = t.pos.x - origin.x; const dz = t.pos.z - origin.z;
      const d = Math.hypot(dx, dz) - t.radius;
      if (d > range) continue;
      if (Math.abs((t.pos.y + 0.9) - (origin.y + 0.9)) > (spec.height ?? 2.2)) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fwd.x + dz * fwd.z) / Math.max(1e-4, Math.hypot(dx, dz)))));
      if (d > 0.35 && ang > arc) continue;
      if (spec.hitSet) { if (spec.hitSet.has(t)) continue; spec.hitSet.add(t); }
      const r = this.applyHit(t, attacker, spec);
      hits.push({ target: t, result: r });
    }
    // punch reflectable projectiles back, smash destructible ones
    if (spec.reflect !== false) {
      for (const p of this.projectiles) {
        if (p.team === attacker.team || (!p.reflectable && !p.destructible)) continue;
        const d = Math.hypot(p.pos.x - origin.x, p.pos.z - origin.z);
        if (d > range + 0.6 || Math.abs(p.pos.y - origin.y - 1) > 2) continue;
        if (p.reflectable) this.reflect(p, attacker);
        else { p.life = 0; p.smashed = true; this.game.vfx?.burst(p.pos, p.color, 10, 4, 0.35, 0.3); }
      }
    }
    return hits;
  }

  reflect(p, by) {
    p.team = by.team;
    p.owner = by;
    const speed = p.vel.length() * 1.3;
    const target = this.nearestEnemy(by, 60);
    if (target) p.vel.copy(target.chestWorld(tmp).sub(p.pos).normalize().multiplyScalar(speed));
    else p.vel.multiplyScalar(-1.3);
    p.life = Math.max(p.life, 2);
    p.reflected = true;
    audio.play('block');
    this.game.vfx?.sparkBurst(p.pos, 0xfff0b0, 12, 8);
    this.emit({ type: 'reflect', proj: p, by });
  }

  applyHit(target, attacker, hitIn) {
    const game = this.game;
    const hit = { ...hitIn };
    hit.damage = (hit.damage ?? 5) * (attacker.power || 1) * (this.damageMul[attacker.team] ?? 1) * (attacker.damageBonus || 1);
    if (target.dead) return 'none';
    // actions taken inside King Crimson's erased interval never connect
    if (attacker.actionsVoid) { game.vfx?.burst(target.chestWorld(new THREE.Vector3()), 0xff2030, 3, 1, 0.3, 0.2); return 'void'; }
    if (target.invuln > 0 && !hit.unblockable) {
      if (target.invulnStart && game.clock - target.invulnStart < 0.18 && target.onPerfectDodge) target.onPerfectDodge(attacker);
      return 'dodged';
    }
    if (target.immuneTo && target.immuneTo(hit, attacker)) return 'immune';
    // time stop: queue the hit for the instant time resumes
    if (game.time?.isFrozen(target)) {
      this.queued.push({ target, attacker, hit });
      const p = target.chestWorld(new THREE.Vector3());
      game.vfx?.impact(p, hit.color ?? 0xffe9a0, 0.8, attacker.forward());
      audio.play('punch', { power: 0.35 });
      this.emit({ type: 'queued', target, attacker, hit });
      return 'queued';
    }
    // guard / counter
    if (target.guarding && !hit.unblockable) {
      const tf = target.forward(tmp);
      const toA = tmp2.copy(attacker.pos).sub(target.pos).setY(0).normalize();
      if (tf.dot(toA) > 0.2) {
        const now = game.clock;
        if (now - target.guardStart < (target.counterWindow || 0.2) && !hit.noCounter) {
          // perfect counter: attacker staggered, defender empowered
          attacker.stun = Math.max(attacker.stun, 1.1);
          attacker.stunTotal = attacker.stun;
          attacker.cancelAction?.();
          target.counterBonus = 1.5;
          target.counterUntil = now + 1.4;
          game.vfx?.ring(target.chestWorld(new THREE.Vector3()), 0xfff2a0, 0.2, 2.2, 0.4, { vertical: true, face: game.engine.camera.position });
          game.vfx?.sparkBurst(target.chestWorld(new THREE.Vector3()), 0xfff2a0, 26, 10);
          audio.play('counter');
          game.slowMo?.(0.35, 0.25);
          this.emit({ type: 'counter', target, attacker, hit });
          return 'countered';
        }
        const chip = hit.damage * 0.12;
        target.hp = Math.max(1, target.hp - chip);
        target.stamina -= hit.damage * 1.6 + (hit.guardDamage || 0);
        game.vfx?.sparkBurst(target.chestWorld(new THREE.Vector3()), 0x9fc8ff, 10, 6, toA.negate());
        audio.play('block');
        if (hit.knock) { target.vel.x -= toA.x * hit.knock * 0.4; target.vel.z -= toA.z * hit.knock * 0.4; }
        if (target.stamina <= 0 || hit.guardBreak) {
          target.stamina = target.staminaMax * 0.3;
          target.guarding = false;
          target.stun = 1.2; target.stunTotal = 1.2;
          game.vfx?.text(target.chestWorld(new THREE.Vector3()).add(new THREE.Vector3(0, 0.6, 0)), 'GUARD BREAK', '#ffd060', 1, 0.6);
          this.emit({ type: 'guardBreak', target, attacker, hit });
          return 'guardBroken';
        }
        this.emit({ type: 'blocked', target, attacker, hit });
        return 'blocked';
      }
    }
    if (attacker.counterUntil && game.clock < attacker.counterUntil) { hit.damage *= attacker.counterBonus || 1.5; attacker.counterUntil = 0; }
    if (attacker.overwritten) hit.damage *= 0.25;
    if (target.kit?.interceptHit && target.kit.interceptHit(hit, attacker)) return 'rewritten';
    if (target.damageTakenMul) hit.damage *= target.damageTakenMul;
    const res = target.takeHit(hit, attacker);
    const p = target.chestWorld(new THREE.Vector3());
    const dir = tmp.copy(target.pos).sub(attacker.pos).setY(0).normalize();
    game.vfx?.impact(p, hit.color ?? 0xffe0a0, hit.fxPower ?? (hit.kind === 'heavy' ? 1.6 : 1), dir);
    audio.play(hit.kind === 'heavy' || hit.knock > 7 ? 'heavyHit' : hit.sfx || 'hit', { power: hit.kind === 'rush' ? 0.55 : 1 });
    if (hit.kind !== 'rush' || Math.random() < 0.2) game.engine.hitstop = Math.max(game.engine.hitstop, hit.kind === 'heavy' ? 0.09 : 0.035);
    game.camera?.shake(hit.kind === 'heavy' ? 0.5 : hit.kind === 'rush' ? 0.12 : 0.2);
    if (hit.onHit) hit.onHit(target, res);
    this.emit({ type: 'hit', target, attacker, hit, result: res });
    return res;
  }

  // Release hits stored during a time stop, all at once.
  releaseQueued() {
    const q = this.queued;
    this.queued = [];
    const byTarget = new Map();
    for (const e of q) {
      if (!byTarget.has(e.target)) byTarget.set(e.target, []);
      byTarget.get(e.target).push(e);
    }
    for (const [target, list] of byTarget) {
      let total = 0; let knock = 0; let att = null;
      for (const e of list) { total += e.hit.damage; knock = Math.max(knock, e.hit.knock || 0); att = e.attacker; }
      const bonus = 1 + Math.min(0.6, list.length * 0.04);
      const r = target.takeHit({ damage: total * bonus, stun: 0.9, knock: Math.max(knock, 6 + list.length * 0.4), launch: list.length > 4 ? 6 : 2, kind: 'heavy' }, att);
      const p = target.chestWorld(new THREE.Vector3());
      this.game.vfx?.impact(p, 0xfff0c0, 2.2, null);
      this.game.vfx?.ring(p, 0xfff0c0, 0.3, 4, 0.45, { vertical: true, face: this.game.engine.camera.position });
      this.emit({ type: 'hit', target, attacker: att, hit: { damage: total * bonus, kind: 'heavy' }, result: r, released: list.length });
    }
    if (q.length) { audio.play('heavyHit'); this.game.camera?.shake(0.8); this.game.engine.hitstop = 0.12; }
  }

  // ---------------------------------------------------------------- projectiles
  spawnProjectile(o) {
    const p = {
      pos: o.pos.clone(), vel: o.vel.clone(), radius: o.radius ?? 0.3, damage: o.damage ?? 6,
      owner: o.owner, team: o.owner.team, life: o.life ?? 3, age: 0, gravity: o.gravity ?? 0,
      mesh: o.mesh || null, stun: o.stun ?? 0.3, knock: o.knock ?? 2, launch: o.launch ?? 0, kind: o.kind || 'projectile',
      homing: o.homing || null, onHit: o.onHit, onExpire: o.onExpire, onTick: o.onTick, reflectable: !!o.reflectable,
      unblockable: !!o.unblockable, color: o.color ?? 0xffffff, trail: o.trail ?? null, pierce: !!o.pierce, hitSet: new Set(),
      ground: o.ground !== false, curve: o.curve || null, spin: o.spin || 0, data: o.data || {}, destructible: !!o.destructible,
    };
    if (p.mesh) { p.mesh.position.copy(p.pos); this.game.engine.scene.add(p.mesh); }
    this.projectiles.push(p);
    return p;
  }

  _disposeProjectile(p) {
    if (p.mesh) {
      p.mesh.removeFromParent();
      p.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
  }

  _updateProjectiles(dt) {
    const game = this.game;
    const time = game.time;
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const p = this.projectiles[i];
      if (time?.isFrozenProjectile(p)) continue;
      p.age += dt;
      p.life -= dt;
      if (p.homing && p.homing.target && !p.homing.target.dead) {
        const want = p.homing.target.chestWorld(tmp).sub(p.pos).normalize().multiplyScalar(p.vel.length());
        p.vel.lerp(want, Math.min(1, dt * (p.homing.rate || 2)));
      }
      if (p.curve) p.curve(p, dt);
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.onTick) p.onTick(p, dt);
      if (p.mesh) {
        p.mesh.position.copy(p.pos);
        if (p.vel.lengthSq() > 0.01) p.mesh.lookAt(tmp.copy(p.pos).add(p.vel));
        if (p.spin) p.mesh.rotateZ(p.spin * dt);
      }
      if (p.trail) p.trail(p, game.vfx);
      let dead = p.life <= 0;
      if (!dead && p.ground && game.world && p.pos.y < game.world.groundAt(p.pos.x, p.pos.z, p.pos.y + 1) + 0.05) dead = true;
      if (!dead) {
        for (const f of this.fighters) {
          if (f.team === p.team || f.dead || f.untargetable || p.hitSet.has(f)) continue;
          const dx = f.pos.x - p.pos.x; const dz = f.pos.z - p.pos.z;
          if (Math.hypot(dx, dz) > f.radius + p.radius) continue;
          if (p.pos.y < f.pos.y - p.radius || p.pos.y > f.pos.y + f.height + p.radius) continue;
          p.hitSet.add(f);
          const res = this.applyHit(f, p.owner, { damage: p.damage, stun: p.stun, knock: p.knock, launch: p.launch, kind: p.kind, color: p.color, unblockable: p.unblockable, noCounter: true });
          if (p.onHit) p.onHit(f, p, res);
          if (!p.pierce) { dead = true; break; }
        }
      }
      if (dead) {
        if (p.onExpire) p.onExpire(p);
        this._disposeProjectile(p);
        this.projectiles.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- hazards
  addHazard(h) { this.hazards.push(h); return h; }
  removeHazard(h) { const i = this.hazards.indexOf(h); if (i >= 0) { this.hazards.splice(i, 1); h.dispose?.(); } }

  _updateHazards(dt, realDt) {
    for (let i = this.hazards.length - 1; i >= 0; i -= 1) {
      const h = this.hazards[i];
      const frozen = this.game.time?.isFrozen(h) ?? false;
      const done = h.update(frozen ? 0 : dt, realDt, frozen);
      if (done) { h.dispose?.(); this.hazards.splice(i, 1); }
    }
  }

  update(dt, realDt) {
    this._updateProjectiles(dt);
    this._updateHazards(dt, realDt);
  }
}

// Utility: damage every enemy of `owner` inside a circle (used by hazards and AoE moves).
export function areaDamage(combat, owner, center, radius, hit, filter = null) {
  const out = [];
  for (const f of combat.enemiesOf(owner)) {
    if (filter && !filter(f)) continue;
    if (Math.hypot(f.pos.x - center.x, f.pos.z - center.z) < radius + f.radius && Math.abs(f.pos.y - center.y) < 2.5) {
      out.push({ target: f, result: combat.applyHit(f, owner, hit) });
    }
  }
  return out;
}
