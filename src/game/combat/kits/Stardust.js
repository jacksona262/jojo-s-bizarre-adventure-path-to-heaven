import * as THREE from 'three';
import { Kit, v3 } from '../Kit';
import * as Poses from '../../anim/Poses';
import { audio } from '../../core/Audio';
import { areaDamage } from '../Combat';
import { FireZone, FireWall, Eruption, Timer, distToSegment } from '../Hazards';

const UP = v3(0, 1, 0);

// ============================================================================ Avdol
export class MagiciansRedKit extends Kit {
  constructor(f, game) {
    super(f, game, { color: 0xff6a20, reach: 2.2, name: "Magician's Red" });
    this.rushShout = 'ガアアア';
    this.rushShoutColor = '#ff7a30';
  }

  orb(origin, dir, speed, homing = 0) {
    const t = this.target();
    return this.combat.spawnProjectile({
      owner: this.f, pos: origin, vel: dir.clone().normalize().multiplyScalar(speed), radius: 0.5, damage: 9, stun: 0.35, knock: 3.5,
      life: 3.2, mesh: this.vfx.orb(0xff5a10, 0.45), color: 0xff6020, destructible: true,
      homing: homing && t ? { target: t, rate: homing } : null,
      trail: (p, vfx) => vfx.flame(p.pos, 1, 0.45),
      onExpire: (p) => { this.vfx.burst(p.pos, 0xff7a20, 10, 4, 0.5, 0.4); if (!p.smashed && Math.random() < 0.3) this.combat.addHazard(new FireZone(this.game, this.f, p.pos.clone().setY(this.game.world.groundAt(p.pos.x, p.pos.z, p.pos.y)), 1.2, 3, 8)); },
    });
  }

  // Crossfire Hurricane: patterns by phase
  crossfire() {
    const f = this.f;
    if (!f.canAct() || !this.ready('cf')) return false;
    this.setCool('cf', [0, 2.6, 2.2, 1.8][this.phase] || 2);
    const t = this.faceTarget(true);
    this.ensureStand();
    f.play({ name: 'cfCmd', dur: 0.9, upper: true, pose: (k) => Poses.castBoth(k) });
    this.stand.strike({ name: 'cf', dur: 0.9, pose: (k) => Poses.castBoth(k, 0.2), events: [{ t: 0.55, fn: () => {
      const origin = this.stand.chestWorld(new THREE.Vector3()).addScaledVector(f.forward(), 0.8);
      const aim = t ? t.chestWorld(new THREE.Vector3()).sub(origin) : f.forward();
      audio.play('fire', { power: 1.2 });
      this.vfx.text(origin.clone().add(v3(0, 1, 0)), 'クロスファイヤー', '#ff7a30', 1.2, 0.7);
      if (this.phase <= 1) this.orb(origin, aim, 17);
      else if (this.phase === 2) for (let i = -2; i <= 2; i += 1) this.orb(origin, aim.clone().applyAxisAngle(UP, i * 0.22), 16);
      else for (let i = 0; i < 8; i += 1) this.orb(origin, aim.clone().applyAxisAngle(UP, (i / 8) * Math.PI * 2), 11, 1.1);
    } }] });
    return true;
  }

  fireWall() {
    const f = this.f;
    const t = this.target();
    if (!f.canAct() || !t || !this.ready('wall')) return false;
    this.setCool('wall', 7);
    this.faceTarget(true);
    this.ensureStand();
    f.play({ name: 'wallCmd', dur: 0.7, upper: true, pose: (k) => Poses.cast('L', k, -0.4) });
    this.stand.strike({ name: 'wall', dur: 0.7, pose: (k) => Poses.castBoth(k, -0.3), events: [{ t: 0.5, fn: () => {
      // wall across the target's escape lanes (perpendicular to the line between them, behind the target)
      const dir = t.pos.clone().sub(f.pos).setY(0).normalize();
      const side = v3(-dir.z, 0, dir.x);
      const c = t.pos.clone().addScaledVector(dir, 3.5);
      const segs = this.phase >= 2 ? 3 : 1;
      for (let s = 0; s < segs; s += 1) {
        const off = (s - (segs - 1) / 2) * 7;
        const rot = s === 0 && segs > 1 ? -0.6 : s === 2 ? 0.6 : 0;
        const sd = side.clone().applyAxisAngle(UP, rot);
        const cc = c.clone().addScaledVector(side, off);
        const a = cc.clone().addScaledVector(sd, -3.4); const b = cc.clone().addScaledVector(sd, 3.4);
        a.y = this.game.world.groundAt(a.x, a.z, a.y + 2); b.y = a.y;
        this.combat.addHazard(new FireWall(this.game, f, a, b, 5.5));
      }
      audio.play('fire', { power: 1.5 });
    } }] });
    return true;
  }

  flameBurst() {
    const f = this.f;
    if (!f.canAct() || !this.ready('burst')) return false;
    this.setCool('burst', 5);
    this.ensureStand();
    const tele = this.phase >= 3 ? 0.45 : 0.7;
    this.vfx.warn(f.pos, 4.6, tele, 0xff4010);
    f.play({ name: 'burst', dur: tele + 0.35, pose: (k) => Poses.raiseArms(Math.min(1, k * 1.6)), events: [{ t: tele / (tele + 0.35), fn: () => {
      areaDamage(this.combat, f, f.pos, 4.6, { damage: 15, stun: 0.6, knock: 10, launch: 4, kind: 'heavy', color: 0xff6020, sfx: 'fire' });
      for (let i = 0; i < 24; i += 1) { const a = (i / 24) * Math.PI * 2; this.vfx.flame(f.pos.clone().add(v3(Math.cos(a) * 3, 0, Math.sin(a) * 3)), 3, 1); }
      this.vfx.ring(f.pos.clone().add(v3(0, 0.3, 0)), 0xff7a20, 0.5, 5, 0.5);
      audio.play('explosion', { power: 0.7 });
    } }] });
    return true;
  }

  flameTrail() {
    const f = this.f;
    if (!f.canAct() || !this.ready('trail')) return false;
    this.setCool('trail', 6);
    const t = this.target();
    const dir = t ? v3(-(t.pos.z - f.pos.z), 0, t.pos.x - f.pos.x).normalize().multiplyScalar(Math.random() < 0.5 ? 1 : -1) : f.forward();
    let dropT = 0;
    f.play({ name: 'trail', dur: 0.8, pose: (k) => Poses.locomotion(k * 12, 2.5), tick: (self, k, dt) => {
      self.vel.x = dir.x * 9; self.vel.z = dir.z * 9;
      dropT -= dt;
      if (dropT <= 0) { dropT = 0.18; this.combat.addHazard(new FireZone(this.game, f, self.pos.clone(), 1.3, 5, 10)); }
    } });
    return true;
  }

  heatPressure() {
    const t = this.target();
    if (!this.f.canAct() || !t || !this.ready('heat')) return false;
    this.setCool('heat', 4);
    this.f.play({ name: 'heatCmd', dur: 0.5, upper: true, pose: (k) => Poses.point('R', k) });
    const n = this.phase >= 3 ? 3 : 1;
    for (let i = 0; i < n; i += 1) {
      const p = t.pos.clone().add(v3((Math.random() - 0.5) * 4 * i, 0, (Math.random() - 0.5) * 4 * i));
      p.y = this.game.world.groundAt(p.x, p.z, p.y + 2);
      this.combat.addHazard(new Eruption(this.game, this.f, p, 2.8, 1.2 + i * 0.25, { damage: 16, stun: 0.5, knock: 3, launch: 8, kind: 'heavy', color: 0xff5010, sfx: 'fire' }, (q) => {
        for (let k = 0; k < 18; k += 1) this.vfx.flame(q.clone().add(v3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3)), 2, 1.4);
        audio.play('fire', { power: 1.6 });
      }));
    }
    return true;
  }

  specialA() { return this.flameBurst(); }
  specialB() { return this.fireWall(); }
  signature() { const p = this.phase; this.phase = 3; const r = this.crossfire(); this.phase = p; return r; }

  hit(spec) { return super.hit({ ...spec, color: 0xff6a20, onHit: (t) => this.vfx.flame(t.chestWorld(new THREE.Vector3()), 4, 0.6) }); }

  get abilities() {
    return [
      { name: 'crossfire', weight: 3, min: 5, max: 26, cool: 0.5, fn: () => this.crossfire() },
      { name: 'heat', weight: 1.6, min: 4, max: 22, cool: 1, fn: () => this.heatPressure() },
      { name: 'wall', weight: 1.2, min: 3, max: 18, cool: 2, fn: () => this.fireWall() },
      { name: 'burst', weight: 4, min: 0, max: 3.8, cool: 1, fn: () => this.flameBurst() },
      { name: 'trail', weight: 1, min: 2, max: 10, cool: 3, phase: 2, fn: () => this.flameTrail() },
      { name: 'light', weight: 1.5, min: 0, max: 2.3, cool: 0.6, fn: () => this.light() },
      { name: 'heavy', weight: 0.8, min: 0, max: 2.4, cool: 2, phase: 2, fn: () => this.heavy() },
    ];
  }
}

// ============================================================================ Kakyoin
export class HierophantKit extends Kit {
  constructor(f, game) {
    super(f, game, { color: 0x3cff8a, reach: 2.0, name: 'Hierophant Green' });
    this.threads = [];
    this.nodes = [];
    this.exposedUntil = 0;
  }

  gem(origin, dir, speed, dmg = 3) {
    return this.combat.spawnProjectile({ owner: this.f, pos: origin, vel: dir.clone().normalize().multiplyScalar(speed), radius: 0.22, damage: dmg, stun: 0.22, knock: 0.8, life: 2.2, mesh: this.vfx.gem(0x30ff80), color: 0x40ff90, destructible: true, trail: (p, vfx) => { if (Math.random() < 0.4) vfx.glow.emit(p.pos, v3(), new THREE.Color(0x30ff80), 0.6, 0.25, 0.05, 0.25); } });
  }

  splash() {
    const f = this.f;
    if (!f.canAct() || !this.ready('splash')) return false;
    this.setCool('splash', this.phase >= 2 ? 1.8 : 2.4);
    const t = this.faceTarget(true);
    this.ensureStand();
    f.play({ name: 'splashCmd', dur: 0.7, upper: true, pose: (k) => Poses.point('R', k) });
    this.stand.strike({ name: 'splash', dur: 0.7, pose: (k) => Poses.castBoth(k, 0.1), events: [{ t: 0.5, fn: () => {
      const origin = this.stand.chestWorld(new THREE.Vector3());
      const aim = (t ? t.chestWorld(new THREE.Vector3()) : origin.clone().addScaledVector(f.forward(), 10)).sub(origin);
      const n = 10 + this.phase * 3;
      for (let i = 0; i < n; i += 1) this.gem(origin, aim.clone().applyAxisAngle(UP, (Math.random() - 0.5) * 0.7).add(v3(0, (Math.random() - 0.5) * 2, 0)), 20 + Math.random() * 6);
      audio.play('emerald');
      this.vfx.text(origin.clone().add(v3(0, 1, 0)), 'エメラルドスプラッシュ', '#3cff8a', 1.3, 0.7);
    } }] });
    return true;
  }

  concentrated() {
    const f = this.f;
    if (!f.canAct() || !this.ready('conc')) return false;
    this.setCool('conc', 6);
    const t = this.faceTarget(true);
    this.ensureStand();
    this.vfx.aura(this.stand.chestWorld(new THREE.Vector3()), 0x30ff80, 0.8);
    let shots = 0;
    f.play({ name: 'concCmd', dur: 1.9, pose: (k) => Poses.castBoth(Math.min(1, k * 2)), uninterruptible: false, tick: (self, k) => {
      if (k > 0.5 && shots < 30 && Math.random() < 0.9) {
        shots += 1;
        const origin = this.stand.chestWorld(new THREE.Vector3());
        const aim = (t ? t.chestWorld(new THREE.Vector3()) : origin.clone().addScaledVector(f.forward(), 10)).sub(origin);
        this.gem(origin, aim.applyAxisAngle(UP, (Math.random() - 0.5) * 0.08), 30, 3.5);
        if (shots % 4 === 0) audio.play('emerald');
      }
    }, onEnd: () => { this.exposedUntil = this.clock + 1.6; f.stun = 1.2; f.stunTotal = 1.2; } });
    this.stand.strike({ name: 'conc', dur: 1.9, pose: (k) => Poses.castBoth(Math.min(1, k * 2), 0) });
    return true;
  }

  tendril() {
    const f = this.f;
    const t = this.target();
    if (!f.canAct() || !t || !this.ready('tendril')) return false;
    this.setCool('tendril', 5);
    const a = f.pos.clone(); const b = t.pos.clone().addScaledVector(t.vel, 0.4);
    b.y = this.game.world.groundAt(b.x, b.z, b.y + 2);
    this.vfx.warnLine(a, b, 1.4, 0.65, 0x30ff80);
    f.play({ name: 'tendrilCmd', dur: 0.9, upper: true, pose: (k) => Poses.point('L', k) });
    this.combat.addHazard(new Timer(0.65, () => {
      this.vfx.vine(a.clone().add(v3(0, 0.3, 0)), b.clone().add(v3(0, 0.3, 0)), 0x36d070, 0.08, 1.4, 0.15, 0x0c4a20);
      for (const e of this.combat.enemiesOf(f)) {
        if (distToSegment(e.pos, a, b) < 0.9) {
          this.combat.applyHit(e, f, { damage: 6, stun: 1.3, knock: 0, kind: 'special', color: 0x40ff90, noCounter: true });
          e.rootedUntil = this.clock + 1.3;
          this.vfx.text(e.chestWorld(new THREE.Vector3()).add(v3(0, 0.6, 0)), 'BOUND', '#3cff8a', 1, 0.5);
        }
      }
    }));
    return true;
  }

  // Trip threads: faint until close (or while time is stopped), then detonate emerald bursts.
  placeTraps() {
    const f = this.f;
    const t = this.target();
    if (!t || !this.ready('traps')) return false;
    this.setCool('traps', 12);
    f.play({ name: 'trapCmd', dur: 0.8, upper: true, pose: (k) => Poses.castBoth(k, -0.5) });
    for (let i = 0; i < 5; i += 1) {
      const c = t.pos.clone().add(v3((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 16));
      const ang = Math.random() * Math.PI;
      const a = c.clone().add(v3(Math.cos(ang) * 3, 0, Math.sin(ang) * 3));
      const b = c.clone().add(v3(-Math.cos(ang) * 3, 0, -Math.sin(ang) * 3));
      a.y = this.game.world.groundAt(a.x, a.z, a.y + 3) + 0.35; b.y = this.game.world.groundAt(b.x, b.z, b.y + 3) + 0.35;
      this.addThread(a, b);
    }
    return true;
  }

  addThread(a, b) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const mat = new THREE.LineBasicMaterial({ color: 0x50ff9a, transparent: true, opacity: 0.1 });
    const line = new THREE.Line(geo, mat);
    this.game.engine.scene.add(line);
    const th = { a, b, line, mat, life: 18 };
    const kit = this;
    this.combat.addHazard({
      update(dt, realDt) {
        th.life -= dt;
        const g = kit.game;
        let near = 99;
        for (const e of g.combat.enemiesOf(kit.f)) near = Math.min(near, distToSegment(e.pos, a, b));
        th.mat.opacity = g.time.stopped ? 0.95 : Math.max(0.08, Math.min(0.8, (6 - near) / 6));
        if (dt > 0) {
          for (const e of g.combat.enemiesOf(kit.f)) {
            if (distToSegment(e.pos, a, b) < 0.45 && e.pos.y < a.y + 0.6) {
              kit.trapBurst(a, b);
              th.life = 0;
            }
          }
        }
        void realDt;
        return th.life <= 0;
      },
      dispose() { line.removeFromParent(); geo.dispose(); mat.dispose(); },
    });
  }

  trapBurst(a, b) {
    const c = a.clone().add(b).multiplyScalar(0.5);
    audio.play('emerald');
    for (const end of [a, b]) {
      for (let i = 0; i < 7; i += 1) this.gem(end.clone().add(v3(0, 0.6, 0)), c.clone().sub(end).add(v3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2)), 16, 4);
    }
  }

  // Phase 3: the 20-metre barrier. Nodes are destructible; while 4+ stand, Kakyoin is shielded.
  barrier() {
    if (this.nodes.length || !this.ready('barrier')) return false;
    this.setCool('barrier', 30);
    const f = this.f;
    f.play({ name: 'barrierCmd', dur: 1.2, pose: (k) => Poses.raiseArms(k) });
    this.vfx.text(f.chestWorld(new THREE.Vector3()).add(v3(0, 1.2, 0)), '半径20mエメラルドスプラッシュ', '#3cff8a', 2, 0.6);
    const center = f.pos.clone();
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      const p = center.clone().add(v3(Math.cos(a) * 17, 0, Math.sin(a) * 17));
      p.y = this.game.world.groundAt(p.x, p.z, p.y + 3) + 1.4;
      const mesh = this.vfx.gem(0x30ff80, 0.45);
      mesh.position.copy(p);
      this.game.engine.scene.add(mesh);
      const node = { p, mesh, hp: 1, id: i };
      this.nodes.push(node);
    }
    // nodes behave as targets for DIO's strikes via a proxy check each frame
    const kit = this;
    this.combat.addHazard({
      t: 0,
      update(dt) {
        this.t += dt;
        for (const n of kit.nodes) n.mesh.rotation.y += dt * 2;
        // threads between neighbours
        if (dt > 0 && Math.floor(this.t / 3) !== Math.floor((this.t - dt) / 3)) {
          const alive = kit.nodes.filter((n) => n.hp > 0);
          const tg = kit.target();
          if (tg) for (let k = 0; k < Math.min(3, alive.length); k += 1) {
            const n = alive[Math.floor(Math.random() * alive.length)];
            kit.gem(n.p, tg.chestWorld(new THREE.Vector3()).sub(n.p), 18, 4);
          }
        }
        kit.f.damageTakenMul = kit.nodes.filter((n) => n.hp > 0).length >= 4 ? 0.45 : 1;
        return kit.nodes.every((n) => n.hp <= 0) || kit.f.dead;
      },
      dispose() { for (const n of kit.nodes) n.mesh.removeFromParent(); kit.nodes = []; kit.f.damageTakenMul = 1; },
    });
    // strikes near a node destroy it
    this._unsub = this.combat.on((ev) => {
      if (ev.type !== 'attack') return;
      const a = ev.attacker;
      if (a.team === f.team) return;
      for (const n of this.nodes) {
        if (n.hp > 0 && Math.hypot(a.pos.x - n.p.x, a.pos.z - n.p.z) < 3.2) {
          n.hp = 0;
          this.vfx.burst(n.p, 0x30ff80, 20, 6, 0.4, 0.5);
          audio.play('block');
          n.mesh.visible = false;
        }
      }
    });
    return true;
  }

  specialA() { return this.concentrated(); }
  specialB() { return this.tendril(); }
  signature() { return this.placeTraps(); }

  get abilities() {
    return [
      { name: 'splash', weight: 3.5, min: 6, max: 28, cool: 0.4, fn: () => this.splash() },
      { name: 'conc', weight: 1.2, min: 8, max: 26, cool: 2, fn: () => this.concentrated() },
      { name: 'tendril', weight: 1.6, min: 3, max: 16, cool: 1.5, fn: () => this.tendril() },
      { name: 'traps', weight: 1.4, min: 0, max: 30, cool: 3, phase: 2, fn: () => this.placeTraps() },
      { name: 'barrier', weight: 5, min: 0, max: 40, cool: 5, phase: 3, fn: () => this.barrier() },
      { name: 'light', weight: 1, min: 0, max: 2.2, cool: 1, fn: () => this.light() },
    ];
  }

  dispose() { this._unsub?.(); }
}

// ============================================================================ Polnareff
// Silver Chariot is not in the supplied files: it appears as a spectral rapier + armour light.
function rapierMesh() {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, 1.25, 6), new THREE.MeshStandardMaterial({ color: 0xe8eef8, metalness: 1, roughness: 0.12, emissive: 0x6f7f9f, emissiveIntensity: 0.6 }));
  blade.rotation.x = Math.PI / 2;
  blade.position.z = 0.62;
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 14, Math.PI * 1.4), new THREE.MeshStandardMaterial({ color: 0xc8b070, metalness: 1, roughness: 0.25 }));
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 6), new THREE.MeshStandardMaterial({ color: 0x2a2a30 }));
  grip.rotation.x = Math.PI / 2; grip.position.z = -0.08;
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), new THREE.MeshBasicMaterial({ color: 0xbfd4ff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = Math.PI / 2; glow.position.z = 0.62;
  g.add(blade, guard, grip, glow);
  return g;
}

export class SilverChariotKit extends Kit {
  constructor(f, game) {
    super(f, game, { color: 0xcfe0ff, reach: 2.6, name: 'Silver Chariot' });
    this.blade = rapierMesh();
    game.engine.scene.add(this.blade);
    this.bladeState = 'guard';
    this.bladeT = 0;
    this.disarmedUntil = 0;
    this.stanceUntil = 0;
    this.armorOff = false;
    f.immuneTo = (hit, attacker) => this.parry(hit, attacker);
  }

  parry(hit, attacker) {
    if (this.clock < this.stanceUntil && !hit.guardBreak && hit.kind !== 'heavy') {
      this.stanceUntil = 0;
      attacker.stun = Math.max(attacker.stun, 0.9); attacker.stunTotal = 0.9;
      attacker.cancelAction?.();
      audio.play('sword');
      this.vfx.sparkBurst(this.f.chestWorld(new THREE.Vector3()), 0xe8f0ff, 20, 10);
      this.combat.emit({ type: 'parry', target: this.f, attacker });
      this.f.cancelAction();
      this.combat.addHazard(new Timer(0.25, () => this.thrust(true)));
      return true;
    }
    if (this.armorOff && hit.kind === 'light' && Math.random() < 0.4) {
      this.afterimage();
      const side = this.f.forward().applyAxisAngle(UP, Math.PI / 2).multiplyScalar(Math.random() < 0.5 ? 2 : -2);
      this.f.pos.add(side);
      return true;
    }
    return false;
  }

  afterimage() {
    const p = this.f.chestWorld(new THREE.Vector3());
    for (let i = 0; i < 14; i += 1) this.vfx.glow.emit(p.clone().add(v3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.6)), v3(), new THREE.Color(0xcfe0ff), 0.6, 0.5, 0.1, 0.4);
  }

  hasBlade() { return this.clock >= this.disarmedUntil; }

  thrust(riposte = false) {
    const f = this.f;
    if ((!f.canAct() && !riposte) || !this.hasBlade()) return false;
    this.faceTarget(true);
    this.vfx.burst(this.blade.position, 0xffffff, 3, 1, 0.6, 0.25, { shape: 3 });
    audio.play('sword');
    const tele = riposte ? 0.08 : 0.25;
    f.play({ name: 'thrust', dur: tele + 0.45, pose: (k) => Poses.punch('R', Math.min(1, k * 1.3)), move: (k) => (k > tele / (tele + 0.45) && k < 0.8 ? 11 : 0), events: [{ t: (tele + 0.05) / (tele + 0.45), fn: () => {
      this.bladeState = 'thrust'; this.bladeT = 0;
      this.hit({ damage: riposte ? 13 : 9, stun: 0.45, knock: 3, kind: riposte ? 'heavy' : 'light', range: 3.2, arc: 0.35, sfx: 'sword', color: 0xe8f0ff });
    } }] });
    return true;
  }

  fencing() {
    const f = this.f;
    if (!f.canAct() || !this.hasBlade() || !this.ready('fence')) return false;
    this.setCool('fence', 3);
    this.faceTarget(true);
    const n = 6;
    const events = [];
    for (let i = 0; i < n; i += 1) {
      events.push({ t: 0.12 + i * 0.13, fn: () => {
        this.bladeState = 'thrust'; this.bladeT = 0;
        this.hit({ damage: i === n - 1 ? 7 : 2.4, stun: 0.3, knock: i === n - 1 ? 5 : 0.5, kind: i === n - 1 ? 'heavy' : 'rush', range: 2.8, arc: 0.6, sfx: 'sword', color: 0xe8f0ff, noCounter: i !== n - 1 });
        audio.play('sword');
      } });
    }
    f.play({ name: 'fence', dur: 1.05, pose: (k, self) => Poses.rush(self.action.t * 0.8, 9), events, move: () => 1.2 });
    return true;
  }

  counterStance() {
    const f = this.f;
    if (!f.canAct() || !this.hasBlade() || !this.ready('stance')) return false;
    this.setCool('stance', 6);
    this.stanceUntil = this.clock + 1.7;
    this.bladeState = 'stance';
    f.play({ name: 'stance', dur: 1.7, pose: () => { const p = Poses.guardStance(); p.uaR = [-0.2, -0.1, 1]; p.faR = [-0.05, 0.3, 1]; return p; } });
    this.vfx.text(f.chestWorld(new THREE.Vector3()).add(v3(0, 1, 0)), '構え', '#cfe0ff', 1.4, 0.6);
    return true;
  }

  armorRelease() {
    if (this.armorOff) return false;
    this.armorOff = true;
    this.f.moveSpeed *= 1.6;
    this.f.damageTakenMul = 1.3;
    this.vfx.burst(this.f.chestWorld(new THREE.Vector3()), 0xcfe0ff, 60, 9, 0.5, 0.8);
    this.vfx.text(this.f.chestWorld(new THREE.Vector3()).add(v3(0, 1.2, 0)), 'アーマーテイクオフ', '#cfe0ff', 1.8, 0.7);
    audio.play('explosion', { power: 0.4 });
    this.game.camera.shake(0.4);
    return true;
  }

  swordShot() {
    const f = this.f;
    const t = this.target();
    if (!f.canAct() || !t || !this.hasBlade() || !this.ready('shot')) return false;
    this.setCool('shot', 10);
    this.faceTarget(true);
    this.bladeState = 'aim';
    f.play({ name: 'shotAim', dur: 1.15, pose: (k) => Poses.cast('R', k, 0.05), events: [{ t: 0.2, fn: () => { this.vfx.burst(this.blade.position, 0xffffff, 4, 0.5, 0.9, 0.7, { shape: 3 }); audio.play('epitaph'); } }, { t: 0.72, fn: () => {
      const origin = this.blade.position.clone();
      const aim = t.chestWorld(new THREE.Vector3()).sub(origin).normalize();
      this.bladeState = 'gone';
      this.disarmedUntil = this.clock + 3.2;
      this.blade.visible = false;
      const mesh = rapierMesh();
      this.combat.spawnProjectile({ owner: f, pos: origin, vel: aim.multiplyScalar(42), radius: 0.3, damage: 22, stun: 0.8, knock: 6, life: 1.2, mesh, color: 0xe8f0ff, kind: 'heavy', trail: (p, vfx) => vfx.sparks.emit(p.pos, v3(), new THREE.Color(0xcfe0ff), 0.2, 0.02) });
      audio.play('sword');
      this.vfx.text(origin.clone().add(v3(0, 0.6, 0)), '!!', '#cfe0ff', 0.8, 0.8);
      this.combat.emit({ type: 'disarmed', target: f });
    } }] });
    return true;
  }

  update(dt) {
    super.update(dt);
    const f = this.f;
    if (this.clock >= this.disarmedUntil && !this.blade.visible) { this.blade.visible = true; this.bladeState = 'guard'; }
    // position the spectral rapier
    const fwd = f.forward();
    const right = v3(fwd.z, 0, -fwd.x).multiplyScalar(-1);
    this.bladeT += dt;
    let pos; let dir = fwd.clone();
    const hand = f.jointWorld('handR');
    if (this.bladeState === 'thrust' && this.bladeT < 0.15) {
      pos = hand.clone().addScaledVector(fwd, 0.2 + this.bladeT * 8);
      if (Math.random() < 0.8) this.vfx.sparks.emit(pos.clone().addScaledVector(fwd, 1.1), fwd.clone().multiplyScalar(3), new THREE.Color(0xdfe8ff), 0.15, 0.04);
    } else if (this.bladeState === 'stance') {
      pos = hand.clone().addScaledVector(fwd, 0.15);
      dir = fwd.clone().add(v3(0, 0.25, 0)).normalize();
      if (Math.random() < 0.3) this.vfx.glow.emit(pos.clone().addScaledVector(dir, Math.random() * 1.2), v3(0, 0.3, 0), new THREE.Color(0xcfe0ff), 0.7, 0.2, 0.05, 0.4);
    } else if (this.bladeState === 'aim') {
      pos = f.chestWorld(new THREE.Vector3()).addScaledVector(fwd, 0.6).add(v3(0, 0.3, 0));
    } else {
      if (this.bladeState === 'thrust') this.bladeState = 'guard';
      pos = hand.clone().addScaledVector(right, 0.05);
      dir = fwd.clone().add(v3(0, -0.5, 0)).normalize();
    }
    this.blade.position.copy(pos);
    this.blade.lookAt(pos.clone().add(dir));
    if (this.armorOff && Math.random() < 0.25 && f.moved > 2) this.afterimage();
  }

  light() { return this.hasBlade() ? this.thrust() : super.light(); }
  rush(holding, dt) { if (holding && !this.rushing && this.fencing()) return true; return false; }
  specialA() { return this.counterStance(); }
  specialB() { return this.swordShot(); }
  signature() { return this.armorRelease() || this.fencing(); }

  get abilities() {
    return [
      { name: 'thrust', weight: 3, min: 1.5, max: 4.5, cool: 0.5, fn: () => this.thrust() },
      { name: 'fence', weight: 2.2, min: 0, max: 3, cool: 1, fn: () => this.fencing() },
      { name: 'stance', weight: 1.4, min: 0, max: 4, cool: 2, fn: () => this.counterStance() },
      { name: 'shot', weight: 0.9, min: 6, max: 22, cool: 4, fn: () => this.swordShot() },
      { name: 'light', weight: 0.6, min: 0, max: 2, cool: 0.6, fn: () => this.light() },
    ];
  }

  dispose() { this.blade.removeFromParent(); }
}

// ============================================================================ Jotaro
export class StarPlatinumKit extends Kit {
  constructor(f, game) {
    super(f, game, { color: 0x8f7cff, reach: 2.2, name: 'Star Platinum' });
    this.rushShout = 'オラオラ';
    this.rushShoutColor = '#9f8cff';
    this.seen = [];
    this.tsWindup = null;
    this._unsub = game.combat.on((ev) => {
      if (ev.type === 'attack' && ev.attacker.team !== f.team) {
        this.seen.push(ev.move);
        if (this.seen.length > 6) this.seen.shift();
      }
      if (ev.type === 'playerTimeStop' && this.tsWindup) {
        // DIO's time stop beat Jotaro's to the punch
        this.tsWindup = null;
        f.cancelAction();
      }
    });
  }

  // Learns from repeated patterns: three of the same attack in a row get read and countered.
  predicts(move) {
    const s = this.seen;
    const n = s.length;
    return n >= 3 && s[n - 1] === move && s[n - 2] === move && s[n - 3] === move;
  }

  update(dt) {
    super.update(dt);
    const f = this.f;
    // defensive reaction: auto-guard read attacks
    const t = this.target();
    if (t && t.action && !f.busy() && this.phase >= 1) {
      const name = t.action.def.name;
      const move = name.startsWith('jab') || name.startsWith('punch') || name === 'command' ? 'light' : name === 'heavy' || name === 'heavyCmd' ? 'heavy' : null;
      if (move && f.distanceTo(t) < 3.4) {
        const chance = this.predicts(move) ? 0.95 : 0.12 + this.phase * 0.06;
        if (Math.random() < chance * dt * 8 && !f.guarding) {
          f.guarding = true;
          f.guardStart = this.clock;
          f.counterWindow = this.predicts(move) ? 0.5 : 0.2;
          this.combat.addHazard(new Timer(0.5, () => { f.guarding = false; }));
          if (this.predicts(move)) this.vfx.text(f.chestWorld(new THREE.Vector3()).add(v3(0, 1, 0)), 'やれやれだぜ', '#9f8cff', 1.2, 0.5);
        }
      }
    }
  }

  starFinger() {
    const f = this.f;
    if (!f.canAct() || !this.ready('finger')) return false;
    this.setCool('finger', 3.5);
    this.faceTarget(true);
    this.ensureStand();
    f.play({ name: 'fingerCmd', dur: 0.55, upper: true, pose: (k) => Poses.point('R', k) });
    this.stand.strike({ name: 'finger', dur: 0.55, pose: (k) => Poses.cast('R', k), events: [{ t: 0.45, fn: () => {
      const a = this.stand.jointWorld('handR'); const b = a.clone().addScaledVector(f.forward(), 4.5);
      this.vfx.beam(a, b, 0xb9a8ff, 0.06, 0.2);
      this.combat.strike(f, { origin: f.pos.clone(), range: 5, arc: 0.18, damage: 10, stun: 0.5, knock: 4, kind: 'special', color: 0xb9a8ff });
      audio.play('punch', { power: 1.2 });
    } }] });
    return true;
  }

  precision() {
    const f = this.f;
    if (!f.canAct() || !this.ready('prec')) return false;
    this.setCool('prec', 2.4);
    this.faceTarget(true);
    this.ensureStand();
    f.play({ name: 'precCmd', dur: 0.55, upper: true, pose: (k) => Poses.cast('R', k) });
    this.stand.strike({ name: 'prec', dur: 0.55, pose: (k) => Poses.heavy(Math.min(1, k * 1.15)), events: [{ t: 0.5, fn: () => this.hit({ damage: 18, stun: 0.7, knock: 9, launch: 3, kind: 'heavy', guardBreak: this.phase >= 2 }) }] });
    return true;
  }

  // Phase 3+: telegraphed time stop. DIO can preempt it with his own.
  timeStop() {
    const f = this.f;
    const tc = this.game.time;
    if (!f.canAct() || tc.state || !this.ready('ts')) return false;
    this.setCool('ts', this.phase >= 4 ? 14 : 18);
    this.ensureStand();
    const windup = 1.25;
    this.tsWindup = { t: 0 };
    this.vfx.text(f.chestWorld(new THREE.Vector3()).add(v3(0, 1.2, 0)), 'スタープラチナ・ザ・ワールド', '#9f8cff', 1.8, 0.75);
    this.vfx.aura(f.chestWorld(new THREE.Vector3()), 0x8f7cff, 1);
    audio.play('stinger');
    this.combat.emit({ type: 'enemyTimeStopWindup', user: f, windup });
    f.play({ name: 'tsWind', dur: windup, pose: (k) => Poses.raiseArms(k), onEnd: (self, cancelled) => {
      if (cancelled || !this.tsWindup) { this.tsWindup = null; return; }
      this.tsWindup = null;
      tc.stop(f, this.phase >= 4 ? 3.2 : 2.5, { variant: 'starPlatinum' });
      // close in and rush during the stop
      const t = this.target();
      if (t) this.combat.addHazard({ t: 0, done: false, freeInStop: true, owner: f, update: (dt, realDt) => {
        this._tsT = (this._tsT || 0) + realDt;
        if (!tc.stopped) { this._tsT = 0; return true; }
        f.faceTowards(t.pos);
        if (f.distanceTo(t) > 2) { const d = t.pos.clone().sub(f.pos).setY(0).normalize(); f.vel.x = d.x * 9; f.vel.z = d.z * 9; } else if (!this.rushing) this.rush(true, 0);
        if (this.rushing) this.rush(this._tsT < 2.2, realDt);
        return false;
      } });
    } });
    return true;
  }

  get abilities() {
    return [
      { name: 'light', weight: 2.5, min: 0, max: 2.4, cool: 0.35, fn: () => this.light() },
      { name: 'prec', weight: 1.5, min: 0, max: 2.6, cool: 1, fn: () => this.precision() },
      { name: 'finger', weight: 1.6, min: 2.5, max: 5, cool: 1, fn: () => this.starFinger() },
      { name: 'rush', weight: 1.4, min: 0, max: 2.5, cool: 3, fn: () => this.aiRush(1.4) },
      { name: 'knock', weight: 0.7, min: 0, max: 2.8, cool: 4, phase: 2, fn: () => this.knockback() },
      { name: 'ts', weight: 2.5, min: 0, max: 14, cool: 6, phase: 3, fn: () => this.timeStop() },
    ];
  }

  aiRush(dur) { if (!this.rush(true, 0)) return false; this.aiRushT = dur; return true; }

  specialA() { return this.starFinger(); }
  specialB() { return this.precision(); }
  signature() { return this.timeStop(); }

  dispose() { this._unsub?.(); }
}

export { FireZone };
