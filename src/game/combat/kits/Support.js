import * as THREE from 'three';
import { Kit, v3 } from '../Kit';
import * as Poses from '../../anim/Poses';
import { audio } from '../../core/Audio';
import { areaDamage } from '../Combat';
import { Timer } from '../Hazards';
import { instantiate } from '../../assets/AssetLibrary';

// ============================================================================ Hol Horse / Emperor
// Emperor is a Stand in the shape of a revolver; its bullets are part of the Stand and can be steered.
function revolverMesh() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8a92, metalness: 1, roughness: 0.25, emissive: 0x201030, emissiveIntensity: 0.6 });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.32, 8), metal);
  barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.15;
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8), metal);
  drum.rotation.x = Math.PI / 2;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.06), new THREE.MeshStandardMaterial({ color: 0x5a3a1a }));
  grip.position.set(0, -0.08, -0.06); grip.rotation.x = 0.3;
  g.add(barrel, drum, grip);
  return g;
}

function bulletMesh(color = 0xffe0a0) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color }));
  m.scale.z = 2.5;
  return m;
}

export class EmperorKit extends Kit {
  constructor(f, game) {
    super(f, game, { color: 0xffe0a0, reach: 1.5, name: 'Emperor' });
    this.gun = revolverMesh();
    game.engine.scene.add(this.gun);
    this.ammo = 6;
  }

  shoot(spread = 0, curve = 0, power = 1) {
    const f = this.f;
    const t = this.target();
    const origin = f.jointWorld('handR').addScaledVector(f.forward(), 0.3);
    let dir = t ? t.chestWorld(new THREE.Vector3()).sub(origin).normalize() : f.forward();
    dir = dir.applyAxisAngle(v3(0, 1, 0), spread);
    const proj = this.combat.spawnProjectile({
      owner: f, pos: origin, vel: dir.multiplyScalar(30), radius: 0.18, damage: 7 * power, stun: 0.3, knock: 1.5, life: 2.2,
      mesh: bulletMesh(), color: 0xffe0a0, reflectable: true,
      // Emperor's bullets bend toward the target mid-flight
      curve: curve && t ? (p, dt) => { if (p.reflected) return; const want = t.chestWorld(new THREE.Vector3()).sub(p.pos).normalize().multiplyScalar(p.vel.length()); p.vel.lerp(want, Math.min(1, dt * curve)); } : null,
      trail: (p, vfx) => { if (Math.random() < 0.6) vfx.sparks.emit(p.pos, p.vel.clone().multiplyScalar(-0.05), new THREE.Color(0xffd080), 0.12, 0.6); },
    });
    audio.play('bullet');
    this.vfx.burst(origin, 0xffd080, 4, 2, 0.3, 0.12);
    return proj;
  }

  light() {
    const f = this.f;
    if (!f.canAct()) return false;
    this.faceTarget(true);
    f.play({ name: 'shot', dur: 0.4, upper: true, pose: (k) => Poses.point('R', k), events: [{ t: 0.3, fn: () => this.shoot(0, 1.2) }] });
    this.combat.emit({ type: 'attack', attacker: f, move: 'light' });
    return true;
  }

  heavy() {
    const f = this.f;
    if (!f.canAct() || !this.spend(12)) return false;
    this.faceTarget(true);
    f.play({ name: 'fan', dur: 0.8, upper: true, pose: (k) => Poses.point('R', k), events: [0.2, 0.35, 0.5].map((t, i) => ({ t, fn: () => this.shoot((i - 1) * 0.12, 2) })) });
    return true;
  }

  // Bullets loop wide around cover and converge.
  specialA() {
    const f = this.f;
    if (!f.canAct() || !this.ready('curve') || !this.spend(20)) return false;
    this.setCool('curve', 4);
    this.faceTarget(true);
    f.play({ name: 'curveShots', dur: 1.1, upper: true, pose: (k) => Poses.point('R', k), events: [-0.9, -0.45, 0.45, 0.9].map((s, i) => ({ t: 0.2 + i * 0.18, fn: () => this.shoot(s, 3.5, 1.1) })) });
    this.vfx.text(f.chestWorld(new THREE.Vector3()).add(v3(0, 1, 0)), 'エンペラー', '#ffe0a0', 1.2, 0.6);
    return true;
  }

  specialB() {
    const f = this.f;
    if (!f.canAct() || !this.ready('roll')) return false;
    this.setCool('roll', 3);
    const side = f.forward().applyAxisAngle(v3(0, 1, 0), Math.PI / 2).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
    this.dodge(side);
    this.combat.addHazard(new Timer(0.35, () => this.shoot(0, 2.5)));
    return true;
  }

  signature() {
    const f = this.f;
    if (!f.canAct() || !this.ready('storm') || !this.spend(40)) return false;
    this.setCool('storm', 10);
    const ev = [];
    for (let i = 0; i < 10; i += 1) ev.push({ t: 0.1 + i * 0.08, fn: () => this.shoot((Math.random() - 0.5) * 1.6, 4, 0.9) });
    f.play({ name: 'storm', dur: 1.2, pose: (k) => Poses.point('R', k), events: ev });
    return true;
  }

  rush(holding) { if (holding && !this.rushing) return this.heavy(); return false; }

  update(dt) {
    super.update(dt);
    const f = this.f;
    const hand = f.jointWorld('handR');
    this.gun.position.copy(hand);
    this.gun.lookAt(hand.clone().add(f.forward()));
    this.gun.visible = !f.dead;
  }

  get abilities() {
    return [
      { name: 'shot', weight: 3, min: 4, max: 30, cool: 0.6, fn: () => this.light() },
      { name: 'fan', weight: 1.4, min: 4, max: 20, cool: 2, fn: () => this.heavy() },
      { name: 'curve', weight: 1.6, min: 6, max: 30, cool: 3, fn: () => this.specialA() },
      { name: 'roll', weight: 1.2, min: 0, max: 5, cool: 2, fn: () => this.specialB() },
    ];
  }

  dispose() { this.gun.removeFromParent(); }
}

// ============================================================================ Vanilla Ice / Cream
// Cream's void erases everything it passes through. Vanilla Ice hides inside it, so the sphere
// itself is the attack; its path is telegraphed by erased ground and dust.
export class CreamKit extends Kit {
  constructor(f, game) {
    super(f, game, { color: 0x9a6aff, reach: 1.6, name: 'Cream' });
    this.inVoid = false;
  }

  voidSphere(dur = 2.2, speed = 12) {
    const f = this.f;
    const t = this.target();
    if (!f.canAct() || !this.ready('void') || !this.spend(30)) return false;
    this.setCool('void', 6);
    this.inVoid = true;
    f.untargetable = true;
    f.setOpacity(0);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    const rim = new THREE.Mesh(new THREE.SphereGeometry(1.18, 24, 16), new THREE.MeshBasicMaterial({ color: 0x6a3aff, transparent: true, opacity: 0.35, side: THREE.BackSide, blending: THREE.AdditiveBlending }));
    sphere.add(rim);
    sphere.position.copy(f.pos).add(v3(0, 1, 0));
    this.game.engine.scene.add(sphere);
    audio.play('void');
    this.vfx.text(f.chestWorld(new THREE.Vector3()).add(v3(0, 1, 0)), 'クリーム', '#9a6aff', 1.2, 0.6);
    const dir = t ? t.pos.clone().sub(f.pos).setY(0).normalize() : f.forward();
    const kit = this;
    let life = dur;
    const hit = new Set();
    this.combat.addHazard({
      update(dt) {
        if (dt === 0) return false;
        life -= dt;
        const tg = kit.target();
        if (tg) { const want = tg.pos.clone().sub(f.pos).setY(0).normalize(); dir.lerp(want, Math.min(1, dt * 0.9)).normalize(); }
        f.pos.addScaledVector(dir, speed * dt);
        f.pos.y = kit.game.world.groundAt(f.pos.x, f.pos.z, f.pos.y + 2);
        sphere.position.copy(f.pos).add(v3(0, 1, 0));
        rim.material.opacity = 0.25 + Math.random() * 0.2;
        if (Math.random() < dt * 30) kit.vfx.smokePuff(f.pos.clone(), 0x1a1420, 1, 1, 0.8, 0.4);
        for (const e of kit.combat.enemiesOf(f)) {
          if (!hit.has(e) && e.pos.distanceTo(f.pos) < 1.6) {
            hit.add(e);
            kit.combat.applyHit(e, f, { damage: 24, stun: 0.8, knock: 6, kind: 'heavy', unblockable: true, noCounter: true, color: 0x6a3aff, sfx: 'void' });
          }
        }
        return life <= 0 || f.dead;
      },
      dispose() { sphere.removeFromParent(); f.untargetable = false; f.setOpacity(1); kit.inVoid = false; },
    });
    return true;
  }

  light() {
    const f = this.f;
    if (!f.canAct()) return false;
    this.faceTarget();
    this.combo = this.comboTimer > this.clock ? (this.combo + 1) % 3 : 0;
    this.comboTimer = this.clock + 0.75;
    const side = this.combo === 1 ? 'L' : 'R';
    f.play({ name: `punch${this.combo}`, dur: 0.4, pose: (k) => Poses.punch(side, k), move: (k) => (k < 0.4 ? 2 : 0), events: [{ t: 0.45, fn: () => this.combat.strike(f, { range: 1.6, damage: 7, stun: 0.3, knock: 1.5, kind: 'light', color: 0x9a6aff }) }] });
    this.combat.emit({ type: 'attack', attacker: f, move: 'light' });
    return true;
  }

  heavy() {
    const f = this.f;
    if (!f.canAct() || !this.spend(10)) return false;
    this.faceTarget(true);
    f.play({ name: 'heavy', dur: 0.6, pose: (k) => Poses.heavy(k), events: [{ t: 0.55, fn: () => this.combat.strike(f, { range: 1.8, damage: 14, stun: 0.6, knock: 7, kind: 'heavy', color: 0x9a6aff }) }] });
    return true;
  }

  rush(holding) { if (holding && !this.rushing) return this.voidSphere(1.2, 16); return false; }
  specialA() { return this.voidSphere(); }
  specialB() { return this.dodge(this.f.forward()); }
  signature() { return this.voidSphere(3.2, 9); }

  get abilities() {
    return [
      { name: 'void', weight: 2.5, min: 5, max: 30, cool: 2, fn: () => this.voidSphere() },
      { name: 'light', weight: 2.4, min: 0, max: 2, cool: 0.4, fn: () => this.light() },
      { name: 'heavy', weight: 1.2, min: 0, max: 2.2, cool: 1.5, fn: () => this.heavy() },
    ];
  }
}

// ============================================================================ N'Doul / Geb
export class GebKit extends Kit {
  constructor(f, game) {
    super(f, game, { color: 0x4ab8ff, reach: 1.5, name: 'Geb' });
    this.gebModel = null;
    instantiate('geb').then((m) => { this.gebModel = m; m.visible = false; game.engine.scene.add(m); });
  }

  // Geb erupts from the ground under the target and slashes.
  strikeAt(p, dmg = 12, delay = 0.7) {
    this.vfx.warn(p, 1.4, delay, 0x4ab8ff);
    this.combat.addHazard(new Timer(delay, () => {
      if (this.gebModel) {
        const m = this.gebModel;
        m.visible = true;
        m.position.copy(p);
        m.scale.setScalar(1.8);
        this.combat.addHazard(new Timer(0.5, () => { m.visible = false; }));
      }
      for (let i = 0; i < 20; i += 1) this.vfx.glow.emit(p.clone().add(v3((Math.random() - 0.5), 0, (Math.random() - 0.5))), v3((Math.random() - 0.5) * 3, 6 + Math.random() * 4, (Math.random() - 0.5) * 3), new THREE.Color(0x6ac8ff), 0.7, 0.35, 0.1, 0.7, { gravity: 14, drag: 0.5 });
      areaDamage(this.combat, this.f, p, 1.5, { damage: dmg, stun: 0.5, knock: 3, launch: 5, kind: 'special', color: 0x4ab8ff, sfx: 'splash', noCounter: true });
      audio.play('splash', { power: 1.4 });
    }));
  }

  light() {
    const f = this.f;
    const t = this.target();
    if (!f.canAct() || !t) return false;
    f.play({ name: 'cane', dur: 0.5, upper: true, pose: (k) => Poses.point('R', k) });
    this.strikeAt(t.pos.clone().addScaledVector(t.vel, 0.5), 9, 0.6);
    this.combat.emit({ type: 'attack', attacker: f, move: 'light' });
    return true;
  }

  heavy() {
    const f = this.f;
    const t = this.target();
    if (!f.canAct() || !t || !this.spend(15)) return false;
    f.play({ name: 'line', dur: 0.8, upper: true, pose: (k) => Poses.castBoth(k, -0.3) });
    const dir = t.pos.clone().sub(f.pos).setY(0).normalize();
    for (let i = 1; i <= 6; i += 1) {
      const p = f.pos.clone().addScaledVector(dir, i * 2.2);
      p.y = this.game.world.groundAt(p.x, p.z, p.y + 2);
      this.strikeAt(p, 8, 0.5 + i * 0.08);
    }
    return true;
  }

  rush(holding) { if (holding && !this.rushing) return this.heavy(); return false; }
  specialA() { return this.heavy(); }
  specialB() { return this.dodge(this.f.forward().multiplyScalar(-1)); }
  signature() {
    const t = this.target();
    if (!this.f.canAct() || !t || !this.ready('flood') || !this.spend(40)) return false;
    this.setCool('flood', 10);
    for (let i = 0; i < 8; i += 1) {
      const p = t.pos.clone().add(v3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
      p.y = this.game.world.groundAt(p.x, p.z, p.y + 2);
      this.strikeAt(p, 10, 0.6 + i * 0.15);
    }
    return true;
  }

  get abilities() {
    return [
      { name: 'strike', weight: 3, min: 3, max: 30, cool: 1.2, fn: () => this.light() },
      { name: 'line', weight: 1.5, min: 4, max: 16, cool: 3, fn: () => this.heavy() },
      { name: 'flood', weight: 1, min: 4, max: 20, cool: 6, fn: () => this.signature() },
    ];
  }

  dispose() { this.gebModel?.removeFromParent(); }
}

// ============================================================================ Mariah / Bastet
// Bastet magnetises whoever touches it; afterwards metal is drawn to the victim ever more strongly.
export class BastetKit extends Kit {
  constructor(f, game) {
    super(f, game, { color: 0x6a8aff, reach: 1.4, name: 'Bastet' });
    this.junk = [
      new THREE.CylinderGeometry(0.012, 0.012, 0.22, 4).rotateX(Math.PI / 2),   // nails
      new THREE.BoxGeometry(0.05, 0.05, 0.42),                                  // rail spike
      new THREE.CylinderGeometry(0.09, 0.09, 0.05, 8).rotateX(Math.PI / 2),     // bolt washer
      new THREE.BoxGeometry(0.03, 0.12, 0.3),                                   // knife
    ];
    this.junkMat = new THREE.MeshStandardMaterial({ color: 0x9a9aa2, metalness: 1, roughness: 0.3 });
  }

  _mag(t) { return t && (t.magnetUntil || 0) > this.clock ? (t.magnetism || 0) : 0; }

  magnetize() {
    const f = this.f;
    const t = this.target();
    if (!f.canAct() || !t || !this.ready('mag')) return false;
    this.setCool('mag', this.phase >= 2 ? 6 : 8);
    f.play({ name: 'magCmd', dur: 0.5, upper: true, pose: (k) => Poses.point('R', k) });
    t.magnetism = Math.min(5, (t.magnetism || 0) + (this.phase >= 2 ? 3 : 2));
    t.magnetUntil = this.clock + 14;
    this.vfx.text(t.chestWorld(new THREE.Vector3()).add(v3(0, 0.8, 0)), 'MAGNETIZED', '#6a8aff', 1.2, 0.5);
    this.vfx.ring(t.pos.clone().add(v3(0, 0.1, 0)), 0x6a8aff, 0.4, 2.2, 0.5);
    audio.play('click');
    return true;
  }

  _junk(origin, dir, speed, homingTarget, rate, damage = 4) {
    const mesh = new THREE.Mesh(this.junk[Math.floor(Math.random() * this.junk.length)], this.junkMat);
    return this.combat.spawnProjectile({
      owner: this.f, pos: origin, vel: dir.normalize().multiplyScalar(speed), radius: 0.16, damage, stun: 0.18, knock: 0.4, life: 3, mesh, color: 0xb0b8ff,
      homing: homingTarget ? { target: homingTarget, rate } : null,
      trail: (p, vfx) => { if (Math.random() < 0.35) vfx.sparks.emit(p.pos, v3(), new THREE.Color(0x8aa8ff), 0.12, 0.03); },
    });
  }

  nails() {
    const f = this.f;
    const t = this.target();
    if (!f.canAct() || !t || !this.spend(10)) return false;
    f.play({ name: 'throw', dur: 0.5, upper: true, pose: (k) => Poses.cast('R', k), events: [{ t: 0.4, fn: () => {
      const mag = this._mag(t);
      for (let i = 0; i < 5 + mag; i += 1) {
        const origin = f.jointWorld('handR');
        const dir = t.chestWorld(new THREE.Vector3()).sub(origin).normalize().applyAxisAngle(v3(0, 1, 0), (Math.random() - 0.5) * 1.1);
        this._junk(origin, dir, 19, t, 1.2 + mag * 1.5, 4);
      }
      audio.play('whoosh');
    } }] });
    this.combat.emit({ type: 'attack', attacker: f, move: 'light' });
    return true;
  }

  // Magnetic storm: every loose scrap of metal around a magnetised target tears free and converges
  // on them from all sides; the more magnetised, the more junk (lore: the victim becomes the magnet).
  debrisStorm() {
    const f = this.f;
    const t = this.target();
    const mag = this._mag(t);
    if (!f.canAct() || !t || mag < 2 || !this.ready('storm2')) return false;
    this.setCool('storm2', this.phase >= 2 ? 5 : 7);
    f.play({ name: 'stormCmd', dur: 0.7, pose: (k) => Poses.castBoth(k, 0.2) });
    this.vfx.text(t.chestWorld(new THREE.Vector3()).add(v3(0, 1.1, 0)), 'ガガガガ', '#8aa8ff', 1.2, 0.7);
    const n = 4 + mag * 2;
    for (let i = 0; i < n; i += 1) {
      this.combat.addHazard(new Timer(0.25 + i * 0.07, () => {
        if (t.dead) return;
        const a = Math.random() * Math.PI * 2;
        const r = 8 + Math.random() * 4;
        const origin = t.pos.clone().add(v3(Math.cos(a) * r, 0.6 + Math.random() * 3, Math.sin(a) * r));
        this.vfx.sparkBurst(origin, 0x8aa8ff, 4, 3);
        this._junk(origin, t.chestWorld(new THREE.Vector3()).sub(origin), 16, t, 2.5, 4);
      }));
    }
    audio.play('click');
    return true;
  }

  // Stiletto heel string: a quick front kick, a turning kick, then a stamping heel that launches.
  heelString() {
    const f = this.f;
    if (!f.canAct()) return false;
    this.faceTarget(true);
    const steps = [
      { dur: 0.32, dmg: 7, knock: 1.5, kind: 'light', move: 3 },
      { dur: 0.34, dmg: 7, knock: 2, kind: 'light', move: 2.5 },
      { dur: 0.5, dmg: 13, knock: 7, kind: 'heavy', move: 3.5, launch: 2.5 },
    ];
    const run = (i) => {
      const st = steps[i];
      if (!st || f.dead || f.stun > 0) return;
      this.faceTarget(true);
      f.play({ name: `heel${i}`, dur: st.dur, pose: (k) => Poses.heavy(k), move: (k) => (k < 0.45 ? st.move : 0), events: [{ t: 0.55, fn: () => {
        this.combat.strike(f, { range: 1.8, damage: st.dmg, stun: i === 2 ? 0.7 : 0.35, knock: st.knock, launch: st.launch || 0, kind: st.kind, color: 0x6a8aff });
        if (i === 2) this.vfx.ring(f.pos.clone().addScaledVector(f.forward(), 1.2).add(v3(0, 0.1, 0)), 0x6a8aff, 0.2, 1.8, 0.3);
      } }], onEnd: (self, cancelled) => { if (!cancelled) run(i + 1); } });
      this.combat.emit({ type: 'attack', attacker: f, move: i === 2 ? 'heavy' : 'light' });
    };
    run(0);
    return true;
  }

  // Phase 2: she whips a live power line along the ground; a telegraphed lane that stuns.
  powerLine() {
    const f = this.f;
    const t = this.target();
    if (!f.canAct() || !t || !this.ready('wire')) return false;
    this.setCool('wire', 6);
    const a = f.pos.clone();
    const b = t.pos.clone().addScaledVector(t.vel, 0.35);
    const len = Math.min(18, a.distanceTo(b) + 3);
    b.copy(a).addScaledVector(b.clone().sub(a).setY(0).normalize(), len);
    b.y = this.game.world.groundAt(b.x, b.z, b.y + 2);
    this.vfx.warnLine(a, b, 1.2, 0.6, 0x6a8aff);
    f.play({ name: 'wireCmd', dur: 0.8, upper: true, pose: (k) => Poses.cast('R', k) });
    this.combat.addHazard(new Timer(0.6, () => {
      const p0 = a.clone().add(v3(0, 0.25, 0)); const p1 = b.clone().add(v3(0, 0.25, 0));
      this.vfx.beam(p0, p1, 0x9ab8ff, 0.07, 0.35, 0.95);
      for (let i = 0; i <= 8; i += 1) this.vfx.sparks.emit(p0.clone().lerp(p1, i / 8), v3((Math.random() - 0.5) * 4, 3, (Math.random() - 0.5) * 4), new THREE.Color(0xc8d8ff), 0.3, 0.05);
      audio.play('click');
      for (const e of this.combat.enemiesOf(f)) {
        const d = e.pos.clone().sub(a); const ab = b.clone().sub(a);
        const k = Math.max(0, Math.min(1, d.dot(ab) / ab.lengthSq()));
        if (e.pos.distanceTo(a.clone().addScaledVector(ab, k)) < 0.9) {
          this.combat.applyHit(e, f, { damage: 12, stun: 1.0, knock: 0.5, kind: 'special', color: 0x9ab8ff, noCounter: true });
          this.vfx.text(e.chestWorld(new THREE.Vector3()).add(v3(0, 0.6, 0)), 'ZAP', '#9ab8ff', 0.9, 0.5);
        }
      }
    }));
    return true;
  }

  light() { return this.heelString(); }

  update(dt) {
    super.update(dt);
    // a strongly magnetised target is dragged toward her, into kicking range
    const t = this.target();
    const mag = this._mag(t);
    if (t && mag >= 3 && !t.dead && dt > 0 && !(t.isFrozen?.())) {
      const d = this.f.pos.clone().sub(t.pos).setY(0);
      const dist = d.length();
      if (dist > 2.2 && dist < 16) t.vel.addScaledVector(d.normalize(), dt * mag * 1.1);
    }
  }

  heavy() { return this.nails(); }
  rush(holding) { if (holding && !this.rushing) return this.nails(); return false; }
  specialA() { return this.magnetize(); }
  specialB() { return this.debrisStorm() || this.dodge(this.f.forward().multiplyScalar(-1)); }
  signature() {
    const t = this.target();
    if (!t || !this.ready('storm') || !this.spend(40)) return false;
    this.setCool('storm', 12);
    t.magnetism = 5;
    t.magnetUntil = this.clock + 14;
    for (let i = 0; i < 3; i += 1) this.combat.addHazard(new Timer(i * 0.3, () => this.nails()));
    return true;
  }

  get abilities() {
    return [
      { name: 'mag', weight: 2.2, min: 0, max: 20, cool: 3, fn: () => this.magnetize() },
      { name: 'nails', weight: 2.6, min: 3, max: 20, cool: 1, fn: () => this.nails() },
      { name: 'storm2', weight: 3, min: 0, max: 22, cool: 2, fn: () => this.debrisStorm() },
      { name: 'kick', weight: 2.4, min: 0, max: 2.2, cool: 0.6, fn: () => this.heelString() },
      { name: 'wire', weight: 2, min: 2, max: 16, cool: 2, phase: 2, fn: () => this.powerLine() },
    ];
  }

  // (junk geometry/material stay alive: projectiles already in flight still use them)
  dispose() { super.dispose?.(); }
}
