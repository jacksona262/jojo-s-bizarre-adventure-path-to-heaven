import * as THREE from 'three';
import { Kit, v3 } from '../Kit';
import * as Poses from '../../anim/Poses';
import { audio } from '../../core/Audio';
import { areaDamage } from '../Combat';
import { Timer, Eruption } from '../Hazards';
import { Character } from '../../actors/Character';

// ============================================================================ Valentine / D4C
export class D4CKit extends Kit {
  constructor(f, game) {
    super(f, game, { color: 0x9fd8ff, reach: 2.2, name: 'D4C' });
    this.rushShout = 'D4C';
    this.rushShoutColor = '#9fd8ff';
    this.alts = [];
    this.anchors = [];
  }

  setupArena(center, anchors = null) {
    this.center = center.clone();
    // pairs of objects to slip "between": rocks around the basin plus the flagpole
    this.anchors = anchors || [];
    if (!this.anchors.length) for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      const p = center.clone().add(v3(Math.cos(a) * 18, 0, Math.sin(a) * 18));
      p.y = this.game.world.groundAt(p.x, p.z, p.y + 3);
      this.anchors.push(p);
    }
  }

  // Dimensional transfer: vanish between two objects and emerge at another anchor.
  hop(dest = null) {
    const f = this.f;
    if (!f.canAct() || !this.ready('hop')) return false;
    this.setCool('hop', this.phase >= 3 ? 3 : 5);
    const to = dest || this.anchors[Math.floor(Math.random() * this.anchors.length)] || f.pos.clone().add(v3(8, 0, 0));
    this.vfx.tear(f.pos.clone(), 3, 1.0);
    audio.play('dimension');
    this.game.engine.fx.uDim.value = 1;
    f.untargetable = true;
    f.setOpacity(0.15);
    f.play({ name: 'hop', dur: 0.7, pose: (k) => Poses.crossArms(k), onEnd: () => {
      f.pos.copy(to);
      f.untargetable = false;
      f.setOpacity(1);
      this.vfx.tear(to.clone(), 3, 1.0);
      const t = this.target();
      if (t) f.faceTowards(t.pos, true);
    } });
    return true;
  }

  ambush() {
    const f = this.f;
    const t = this.target();
    if (!f.canAct() || !t || !this.ready('ambush')) return false;
    this.setCool('ambush', 6);
    const behind = t.pos.clone().addScaledVector(t.forward(), -1.8);
    behind.y = this.game.world.groundAt(behind.x, behind.z, behind.y + 2);
    this.vfx.tear(behind.clone(), 3, 1.3);
    audio.play('dimension');
    f.untargetable = true;
    f.setOpacity(0.1);
    f.play({ name: 'ambushHide', dur: 0.6, pose: (k) => Poses.crossArms(k), onEnd: () => {
      f.pos.copy(behind);
      f.untargetable = false;
      f.setOpacity(1);
      f.faceTowards(t.pos, true);
      this.ensureStand();
      this.stand.strike({ name: 'ambushHit', dur: 0.5, pose: (k) => Poses.heavy(k), events: [{ t: 0.45, fn: () => this.hit({ damage: 16, stun: 0.6, knock: 7, launch: 2, kind: 'heavy', range: 2.6, arc: 1.4 }) }] });
    } });
    return true;
  }

  // Bring an alternate Valentine from a neighbouring world. If an alternate is knocked into
  // the original, both suffer the fragmentation of two selves meeting.
  async summonAlternate() {
    const f = this.f;
    if (this.alts.length >= (this.phase >= 3 ? 2 : 1) || !this.ready('alt') || !f.canAct()) return false;
    this.setCool('alt', 9);
    f.play({ name: 'altCmd', dur: 0.8, pose: (k) => Poses.raiseArms(k) });
    const p = f.pos.clone().add(v3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6));
    this.vfx.tear(p.clone(), 3, 1.4);
    audio.play('dimension');
    const alt = new Character(this.game, { partKey: 'valentine', name: 'Alternate Valentine', team: f.team, hp: 40, power: 0.6, speed: 4 });
    await alt.load();
    alt.isAlternate = true;
    alt.addTo(this.game.engine.scene);
    alt.pos.copy(p);
    alt.setTint(new THREE.Color(0x3080ff), 0.25);
    this.game.combat.add(alt);
    this.game.addActor?.(alt);
    this.alts.push(alt);
    const kit = this;
    alt.altBrain = { t: 0 };
    this.combat.addHazard({
      update(dt) {
        if (dt === 0 || alt.dead) return alt.dead;
        alt.altBrain.t -= dt;
        const t = kit.target();
        if (t && alt.canAct()) {
          const d = alt.distanceTo(t);
          alt.faceTowards(t.pos);
          if (d > 1.8) { const dir = t.pos.clone().sub(alt.pos).setY(0).normalize(); alt.steer(dir.x * 3.8, dir.z * 3.8, dt); } else alt.steer(0, 0, dt);
          if (d < 2 && alt.altBrain.t <= 0) {
            alt.altBrain.t = 1.4;
            alt.play({ name: 'altPunch', dur: 0.45, pose: (k) => Poses.punch('R', k), events: [{ t: 0.45, fn: () => kit.combat.strike(alt, { range: 1.6, damage: 6, stun: 0.3, knock: 2, kind: 'light', color: 0x9fd8ff }) }] });
          }
        }
        // meeting the original
        if (alt.pos.distanceTo(kit.f.pos) < 1.0 && Math.hypot(alt.vel.x, alt.vel.z) > 4) {
          kit.fragment(alt);
          return true;
        }
        return false;
      },
      dispose() {
        kit.alts = kit.alts.filter((a) => a !== alt);
        kit.game.combat.remove(alt);
        kit.game.removeActor?.(alt);
        alt.remove();
      },
    });
    return true;
  }

  fragment(alt) {
    const f = this.f;
    const c = alt.chestWorld(new THREE.Vector3());
    for (let i = 0; i < 40; i += 1) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: 0x8fb8ff, emissive: 0x2050a0 }));
      m.position.copy(c).add(v3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.8));
      const vel = m.position.clone().sub(c).multiplyScalar(4);
      this.vfx.addMesh(m, 1.2, (e, k, dt) => { m.position.addScaledVector(vel, dt); m.scale.setScalar(1 - k); m.rotation.x += dt * 5; });
    }
    alt.die();
    this.combat.applyHit(f, this.target() || alt, { damage: f.hpMax * 0.09, stun: 1.2, knock: 4, kind: 'heavy', unblockable: true, noCounter: true, color: 0x8fb8ff });
    this.vfx.text(c.clone().add(v3(0, 1, 0)), 'MENGER', '#9fd8ff', 1.2, 0.6);
    audio.play('dimension');
    this.combat.emit({ type: 'fragment', target: f });
  }

  // Parallel position swap when struck hard (needs an alternate present).
  maybeSwap() {
    const alt = this.alts.find((a) => !a.dead);
    if (!alt || !this.ready('swap')) return false;
    this.setCool('swap', 6);
    const a = this.f.pos.clone();
    this.f.pos.copy(alt.pos);
    alt.pos.copy(a);
    this.vfx.tear(a.clone(), 3, 0.8);
    this.vfx.tear(this.f.pos.clone(), 3, 0.8);
    audio.play('dimension');
    return true;
  }

  dimensionalHazard() {
    const t = this.target();
    if (!t || !this.ready('hazard') || !this.f.canAct()) return false;
    this.setCool('hazard', 8);
    this.f.play({ name: 'hazCmd', dur: 0.6, upper: true, pose: (k) => Poses.point('R', k) });
    for (let i = 0; i < 4; i += 1) {
      const p = t.pos.clone().add(v3((Math.random() - 0.5) * 7, 0, (Math.random() - 0.5) * 7));
      p.y = this.game.world.groundAt(p.x, p.z, p.y + 2);
      this.vfx.tear(p.clone().add(v3(0, 4, 0)), 2, 1.4);
      this.combat.addHazard(new Eruption(this.game, this.f, p, 1.8, 1.1 + i * 0.2, { damage: 14, stun: 0.5, knock: 4, kind: 'heavy', color: 0x9fd8ff, sfx: 'heavyHit' }, (q) => {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), this.game.world.bank.get('rock'));
        rock.position.copy(q);
        this.vfx.addMesh(rock, 2, (e, k) => { rock.scale.setScalar(1 - k * 0.6); });
        this.vfx.smokePuff(q, 0x4a4a50, 6, 1.6, 1.2);
      }));
    }
    return true;
  }

  update(dt) {
    super.update(dt);
    const fx = this.game.engine.fx;
    fx.uDim.value = Math.max(0, fx.uDim.value - dt * 1.4);
    if (this.f.stun > 0.5 && this.phase >= 2) this.maybeSwap();
  }

  specialA() { return this.hop(); }
  specialB() { return this.ambush(); }
  signature() { this.summonAlternate(); return true; }

  get abilities() {
    return [
      { name: 'light', weight: 2.2, min: 0, max: 2.4, cool: 0.4, fn: () => this.light() },
      { name: 'hop', weight: 1.5, min: 0, max: 30, cool: 2, fn: () => this.hop() },
      { name: 'ambush', weight: 1.6, min: 4, max: 25, cool: 2, fn: () => this.ambush() },
      { name: 'alt', weight: 2.5, min: 0, max: 30, cool: 3, phase: 2, fn: () => { this.summonAlternate(); return true; } },
      { name: 'hazard', weight: 1.4, min: 3, max: 20, cool: 3, phase: 2, fn: () => this.dimensionalHazard() },
      { name: 'heavy', weight: 1, min: 0, max: 2.4, cool: 2, fn: () => this.heavy() },
      { name: 'rush', weight: 1, min: 0, max: 2.4, cool: 4, phase: 3, fn: () => this.aiRush(1.2) },
    ];
  }

  aiRush(dur) { if (!this.rush(true, 0)) return false; this.aiRushT = dur; return true; }
  dispose() { for (const a of this.alts) { this.game.combat.remove(a); a.remove(); } }
}

// ============================================================================ Pucci / C-Moon
export class CMoonKit extends Kit {
  constructor(f, game) {
    super(f, game, { color: 0x6aff7a, reach: 2.2, name: 'C-Moon' });
    this.zones = [];
  }

  // Gravity shift: inside the zone, gravity points away from C-Moon's centre of gravity: up.
  gravityZone() {
    const t = this.target();
    if (!this.f.canAct() || !t || !this.ready('zone')) return false;
    this.setCool('zone', this.phase >= 2 ? 4 : 6);
    this.f.play({ name: 'zoneCmd', dur: 0.6, upper: true, pose: (k) => Poses.point('R', k) });
    const n = this.phase >= 3 ? 3 : this.phase >= 2 ? 2 : 1;
    for (let i = 0; i < n; i += 1) {
      const p = t.pos.clone().add(v3((Math.random() - 0.5) * 6 * i, 0, (Math.random() - 0.5) * 6 * i));
      p.y = this.game.world.groundAt(p.x, p.z, p.y + 2);
      const r = 3.2;
      this.vfx.warn(p, r, 0.9, 0x7a5aff);
      const kit = this;
      const zone = { p, r, life: 4.5, armed: 0.9 };
      this.combat.addHazard({
        update(dt) {
          if (dt === 0) return false;
          zone.armed -= dt;
          zone.life -= dt;
          if (zone.armed <= 0) {
            if (Math.random() < dt * 20) kit.vfx.glow.emit(p.clone().add(v3((Math.random() - 0.5) * r * 2, Math.random() * 4, (Math.random() - 0.5) * r * 2)), v3(0, 3, 0), new THREE.Color(0x9a7aff), 0.6, 0.3, 0.05, 0.8);
            for (const e of kit.combat.enemiesOf(kit.f)) {
              if (e.pos.distanceTo(p) < r + e.radius && !e.dead) {
                e.vel.y = Math.max(e.vel.y, 7);
                e.onGround = false;
                e.gravityInverted = kit.clock + 0.3;
              }
            }
          }
          return zone.life <= 0;
        },
      });
      audio.play('gravity');
    }
    return true;
  }

  repulse() {
    const f = this.f;
    if (!f.canAct() || !this.ready('repulse')) return false;
    this.setCool('repulse', 5);
    this.ensureStand();
    const tele = 0.55;
    this.vfx.warn(f.pos, 9, tele, 0x7aff8a);
    f.play({ name: 'repulse', dur: tele + 0.3, pose: (k) => Poses.castBoth(k, 0), events: [{ t: tele / (tele + 0.3), fn: () => {
      areaDamage(this.combat, f, f.pos, 9, { damage: 5, stun: 0.5, knock: 16, launch: 3, kind: 'special', color: 0x7aff8a, noCounter: true });
      for (let i = 0; i < 3; i += 1) this.vfx.ring(f.pos.clone().add(v3(0, 0.5 + i * 0.6, 0)), 0x7aff8a, 0.5, 10, 0.5 + i * 0.1);
      this.game.engine.fx.uGravity.value = 1;
      audio.play('gravity');
    } }] });
    return true;
  }

  pull() {
    const f = this.f;
    const t = this.target();
    if (!f.canAct() || !t || !this.ready('pull')) return false;
    this.setCool('pull', 6);
    this.ensureStand();
    f.play({ name: 'pullCmd', dur: 1.3, pose: (k) => Poses.castBoth(k, 0.1), tick: (self, k, dt) => {
      if (k < 0.75) {
        const d = f.pos.clone().sub(t.pos).setY(0);
        if (d.length() > 1.6) { d.normalize(); t.vel.x += d.x * 30 * dt; t.vel.z += d.z * 30 * dt; }
        this.game.engine.fx.uGravity.value = 0.8;
        if (Math.random() < 0.5) this.vfx.glow.emit(t.chestWorld(new THREE.Vector3()), f.pos.clone().sub(t.pos).multiplyScalar(0.8), new THREE.Color(0x7aff8a), 0.6, 0.3, 0.05, 0.5);
      }
    }, events: [{ t: 0.78, fn: () => this.moonStrike(true) }] });
    audio.play('gravity');
    return true;
  }

  // C-Moon strike: turns the target "inside out" (damage over time + heavy slow).
  moonStrike(chained = false) {
    const f = this.f;
    if (!chained && (!f.canAct() || !this.ready('strike'))) return false;
    this.setCool('strike', 3);
    this.faceTarget(true);
    this.ensureStand();
    this.stand.strike({ name: 'moon', dur: 0.5, pose: (k) => Poses.punch('R', k), events: [{ t: 0.45, fn: () => {
      const hits = this.hit({ damage: 10, stun: 0.5, knock: 3, kind: 'special', color: 0x7aff8a });
      for (const h of hits) if (h.result === 'hit') this.invert(h.target);
    } }] });
    return true;
  }

  invert(t) {
    t.slowUntil = this.clock + 4;
    this.vfx.text(t.chestWorld(new THREE.Vector3()).add(v3(0, 0.8, 0)), '裏返し', '#7aff8a', 1.2, 0.6);
    let ticks = 8;
    const kit = this;
    this.combat.addHazard({ t: 0, update(dt) { this.t += dt; if (this.t > 0.5) { this.t = 0; ticks -= 1; kit.combat.applyHit(t, kit.f, { damage: 2.5, stun: 0, knock: 0, kind: 'special', color: 0x7aff8a, unblockable: true, noCounter: true }); } return ticks <= 0 || t.dead; } });
  }

  surfaceDistortion() {
    const t = this.target();
    if (!this.f.canAct() || !t || !this.ready('surface')) return false;
    this.setCool('surface', 10);
    this.f.play({ name: 'surfCmd', dur: 0.8, pose: (k) => Poses.raiseArms(k) });
    for (let i = 0; i < 4; i += 1) {
      const p = t.pos.clone().add(v3((i % 2 ? 1 : -1) * 4 + (Math.random() - 0.5) * 3, 0, (i < 2 ? 1 : -1) * 4));
      p.y = this.game.world.groundAt(p.x, p.z, p.y + 2);
      const kit = this;
      const z = { life: 6, tick: 0, warn: 0.8 };
      this.vfx.warn(p, 2.6, 0.8, 0x50ff70);
      this.combat.addHazard({
        update(dt) {
          if (dt === 0) return false;
          z.life -= dt; z.warn -= dt; z.tick -= dt;
          if (z.warn <= 0) {
            if (Math.random() < dt * 14) kit.vfx.ring(p.clone().add(v3(0, 0.1, 0)), 0x50ff70, 0.3, 2.6, 0.6, { soft: 0.5, alpha: 0.5 });
            if (z.tick <= 0) {
              z.tick = 0.5;
              for (const e of kit.combat.enemiesOf(kit.f)) if (e.pos.distanceTo(p) < 2.6) { kit.combat.applyHit(e, kit.f, { damage: 4, stun: 0.25, knock: 0, kind: 'special', color: 0x50ff70, unblockable: true, noCounter: true }); e.slowUntil = kit.clock + 1; }
            }
          }
          return z.life <= 0;
        },
      });
    }
    return true;
  }

  update(dt) {
    super.update(dt);
    const fx = this.game.engine.fx;
    fx.uGravity.value = Math.max(this.zonesActive ? 0.3 : 0, fx.uGravity.value - dt * 0.8);
  }

  specialA() { return this.repulse(); }
  specialB() { return this.gravityZone(); }
  signature() { return this.pull(); }

  get abilities() {
    return [
      { name: 'light', weight: 2, min: 0, max: 2.3, cool: 0.4, fn: () => this.light() },
      { name: 'strike', weight: 1.6, min: 0, max: 2.5, cool: 1.5, fn: () => this.moonStrike() },
      { name: 'zone', weight: 2.2, min: 2, max: 20, cool: 1.5, fn: () => this.gravityZone() },
      { name: 'repulse', weight: 2.5, min: 0, max: 4, cool: 2, fn: () => this.repulse() },
      { name: 'pull', weight: 1.5, min: 5, max: 18, cool: 3, phase: 2, fn: () => this.pull() },
      { name: 'surface', weight: 1.4, min: 0, max: 20, cool: 4, phase: 2, fn: () => this.surfaceDistortion() },
      { name: 'rush', weight: 1, min: 0, max: 2.4, cool: 4, phase: 3, fn: () => this.aiRush(1.2) },
    ];
  }

  aiRush(dur) { if (!this.rush(true, 0)) return false; this.aiRushT = dur; return true; }
}

export { Timer };
