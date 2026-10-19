import * as THREE from 'three';
import { Kit, v3 } from '../Kit';
import * as Poses from '../../anim/Poses';
import { audio } from '../../core/Audio';
import { areaDamage } from '../Combat';
import { Timer } from '../Hazards';

// ============================================================================ Diavolo
export class KingCrimsonKit extends Kit {
  constructor(f, game) {
    super(f, game, { color: 0xff2a3a, reach: 2.2, name: 'King Crimson' });
    this.readUntil = 0;
    this.recentDamage = [];
    this.marker = null;
    this._unsub = game.combat.on((ev) => {
      // Epitaph: an attack started while Diavolo is reading the future is foreseen and punished.
      if (ev.type === 'attack' && ev.attacker.team !== f.team && this.clock < this.readUntil && !game.time.stopped && !f.dead) {
        this.readUntil = 0;
        this.predictiveCounter(ev.attacker);
      }
      if (ev.type === 'hit' && ev.target === f) this.recentDamage.push({ t: this.clock, d: ev.hit.damage });
    });
    this.eye = new THREE.PointLight(0xff2030, 0, 3, 2);
    game.engine.scene.add(this.eye);
  }

  epitaph() {
    const f = this.f;
    if (!f.canAct() || !this.ready('epitaph')) return false;
    this.setCool('epitaph', this.phase >= 3 ? 5 : 7);
    const dur = this.phase >= 3 ? 1.8 : 2.4;
    this.readUntil = this.clock + dur;
    f.play({ name: 'read', dur, pose: (k, self) => { const p = Poses.crossArms(self.t); p.head = [0.2, 0, 0]; return p; }, onEnd: (self, cancelled) => {
      if (!cancelled && this.readUntil > 0) { this.readUntil = 0; this.kcStrike(); }
    } });
    this.vfx.text(f.chestWorld(new THREE.Vector3()).add(v3(0, 1.1, 0)), 'エピタフ', '#ff2a3a', dur, 0.7);
    audio.play('epitaph');
    this.combat.emit({ type: 'epitaph', user: f, dur });
    return true;
  }

  predictiveCounter(attacker) {
    const f = this.f;
    f.cancelAction();
    // skip the moment and appear behind the attacker
    const behind = attacker.pos.clone().addScaledVector(attacker.forward(), -1.6);
    behind.y = this.game.world.groundAt(behind.x, behind.z, behind.y + 2);
    this.vfx.burst(f.chestWorld(new THREE.Vector3()), 0xff2a3a, 20, 5, 0.4, 0.4);
    f.pos.copy(behind);
    f.faceTowards(attacker.pos, true);
    attacker.cancelAction?.();
    attacker.stand?.cancelAction?.();
    this.game.engine.fx.uErase.value = 1;
    audio.play('erase');
    this.ensureStand();
    this.stand.slot = 'front';
    this.combat.addHazard(new Timer(0.12, () => {
      this.hit({ damage: 28, stun: 0.9, knock: 9, launch: 3, kind: 'heavy', unblockable: true, noCounter: true, range: 2.8, arc: 1.6 });
      this.stand.strike({ name: 'pc', dur: 0.4, pose: (k) => Poses.heavy(Math.min(1, 0.4 + k)) });
    }));
    this.vfx.text(f.chestWorld(new THREE.Vector3()).add(v3(0, 1, 0)), '予知', '#ff2a3a', 1, 0.7);
    this.combat.emit({ type: 'predicted', user: f, attacker });
  }

  // Time erasure: Diavolo vanishes for the skipped interval: no body, no Stand, no trail, no
  // destination marker and nothing to lock on to. He reappears wherever he chose and strikes the
  // instant time resumes; the only tell is the short warning circle of that strike.
  erase(reposition = false) {
    const f = this.f;
    const tc = this.game.time;
    const t = this.target();
    if (!t || tc.state || !this.ready(reposition ? 'repo' : 'erase')) return false;
    this.setCool(reposition ? 'repo' : 'erase', reposition ? 8 : (this.phase >= 3 ? 7 : 10));
    f.cancelAction();
    const dur = this.phase >= 3 ? 1.8 : 2.3;
    const ang = Math.random() * Math.PI * 2;
    const dest = reposition
      ? f.pos.clone().add(v3(Math.cos(ang) * 9, 0, Math.sin(ang) * 9))
      : t.pos.clone().add(v3(Math.cos(ang) * 2.2, 0, Math.sin(ang) * 2.2));
    dest.y = this.game.world.groundAt(dest.x, dest.z, dest.y + 2);
    this.vfx.text(f.chestWorld(new THREE.Vector3()).add(v3(0, 1.2, 0)), 'キング・クリムゾン', '#ff2a3a', 1.6, 0.8);
    const vanish = (on) => {
      f.group.visible = !on;
      if (this.stand?.group) this.stand.group.visible = !on && this.stand.summoned;
      f.untargetable = on;
      this.eye.visible = !on;
    };
    // a last flicker where he stood, then nothing
    this.vfx.burst(f.chestWorld(new THREE.Vector3()), 0xff2a3a, 16, 4, 0.35, 0.35);
    vanish(true);
    tc.erase(f, dur, { dest, onEnd: () => {
      if (this.marker) { this.marker.removeFromParent(); this.marker = null; }
      f.pos.copy(dest);
      f.vel.set(0, 0, 0);
      vanish(false);
      this.vfx.burst(f.chestWorld(new THREE.Vector3()), 0xff2a3a, 22, 6, 0.4, 0.35);
      if (!reposition && !f.dead) {
        f.faceTowards(t.pos, true);
        this.kcStrike(true);
      }
    } });
    // the victim's actions in the erased interval do not land
    t.actionsVoid = true;
    this.combat.addHazard(new Timer(dur, () => { t.actionsVoid = false; }));
    // during the erasure Diavolo moves unseen; if the erasure is cut short he still reappears
    this.combat.addHazard({ t: 0, update: (dt, realDt) => {
      this.t += realDt;
      if (!tc.erasing) { if (!f.group.visible && !f.dead) vanish(false); return true; }
      f.pos.lerp(dest, Math.min(1, realDt * 1.5));
      return false;
    } });
    return true;
  }

  kcStrike(fast = false) {
    const f = this.f;
    this.ensureStand();
    const tele = fast ? 0.32 : 0.55;
    this.stand.slot = 'front';
    const p = f.pos.clone().addScaledVector(f.forward(), 1.6);
    this.vfx.warn(p, 1.8, tele, 0xff2030);
    f.play({ name: 'kcCmd', dur: tele + 0.35, upper: true, pose: (k) => Poses.point('R', k), force: true });
    this.stand.strike({ name: 'chop', dur: tele + 0.35, pose: (k) => Poses.heavy(k), events: [{ t: tele / (tele + 0.35), fn: () => {
      this.hit({ damage: 32, stun: 0.9, knock: 10, launch: 4, kind: 'heavy', guardBreak: true, range: 2.8, arc: 1.0, noCounter: !fast });
      this.vfx.ring(p.clone().add(v3(0, 1, 0)), 0xff2030, 0.3, 2.6, 0.35, { vertical: true, face: this.game.engine.camera.position });
    } }] });
    return true;
  }

  update(dt) {
    super.update(dt);
    const f = this.f;
    const reading = this.clock < this.readUntil;
    this.eye.position.copy(f.jointWorld('head')).addScaledVector(f.forward(), 0.25);
    this.eye.intensity = reading ? 6 + Math.sin(this.clock * 20) * 2 : 0;
    if (reading && Math.random() < dt * 20) this.vfx.glow.emit(this.eye.position, v3(0, 0.3, 0), new THREE.Color(0xff2030), 0.7, 0.25, 0.05, 0.3);
    // temporal reposition when pressured
    this.recentDamage = this.recentDamage.filter((d) => d.t > this.clock - 2);
    const recent = this.recentDamage.reduce((s, d) => s + d.d, 0);
    if (recent > 28 && this.phase >= 2 && !this.game.time.state && f.canAct()) { this.recentDamage = []; this.erase(true); }
  }

  specialA() { return this.epitaph(); }
  specialB() { return this.kcStrike(); }
  signature() { return this.erase(false); }

  get abilities() {
    return [
      { name: 'epitaph', weight: 2.4, min: 0, max: 5, cool: 1.5, fn: () => this.epitaph() },
      { name: 'light', weight: 2.2, min: 0, max: 2.4, cool: 0.4, fn: () => this.light() },
      { name: 'chop', weight: 1.4, min: 0, max: 2.8, cool: 2, fn: () => this.kcStrike() },
      { name: 'erase', weight: 2.2, min: 2, max: 16, cool: 3, phase: 2, fn: () => this.erase(false) },
      { name: 'rush', weight: 0.8, min: 0, max: 2.4, cool: 4, fn: () => this.aiRush(1.0) },
    ];
  }

  aiRush(dur) { if (!this.rush(true, 0)) return false; this.aiRushT = dur; return true; }
  dispose() { this._unsub?.(); this.eye.removeFromParent(); if (this.marker) this.marker.removeFromParent(); }
}

// ============================================================================ Giorno
function frogMesh() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x6aa83a, roughness: 0.5, emissive: 0x1a2a00 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), m);
  body.scale.set(1, 0.7, 1.2); body.position.y = 0.15;
  const eyeM = new THREE.MeshStandardMaterial({ color: 0xffe060, emissive: 0x403000 });
  for (const x of [-0.09, 0.09]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eyeM); e.position.set(x, 0.27, 0.15); g.add(e); }
  g.add(body);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function snakeMesh() {
  const pts = [];
  for (let i = 0; i < 8; i += 1) pts.push(v3(Math.sin(i * 0.9) * 0.15, 0.08, -i * 0.18));
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.06, 6, false);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3a4a20, roughness: 0.4, emissive: 0x0a1000 }));
  mesh.castShadow = true;
  return mesh;
}

export class GoldExperienceKit extends Kit {
  constructor(f, game) {
    super(f, game, { color: 0xffd040, reach: 2.0, name: 'Gold Experience' });
    this.rushShout = '無駄無駄';
    this.rushShoutColor = '#ffd040';
    this.creatures = [];
    this.trees = [];
    this._unsub = game.combat.on((ev) => {
      // frogs reflect the damage of strikes aimed at them back onto the attacker
      if (ev.type === 'attack' && ev.attacker.team !== f.team) {
        const a = ev.attacker;
        const fwd = a.forward();
        for (const c of this.creatures) {
          if (c.kind !== 'frog' || c.dead) continue;
          const d = c.pos.clone().sub(a.pos); const dist = d.length();
          if (dist < 2.6 && d.setY(0).normalize().dot(fwd) > 0.5) {
            c.dead = true;
            game.combat.applyHit(a, f, { damage: ev.move === 'heavy' ? 14 : 6, stun: 0.5, knock: 2, kind: 'special', color: 0xffd040, unblockable: true, noCounter: true });
            this.vfx.burst(c.pos.clone().add(v3(0, 0.3, 0)), 0xffd040, 14, 3, 0.3, 0.5);
            this.vfx.text(c.pos.clone().add(v3(0, 1, 0)), 'REFLECTED', '#ffd040', 1, 0.5);
          }
        }
      }
    });
  }

  lifeCreation(kind = null) {
    const f = this.f;
    const t = this.target();
    if (!f.canAct() || !t || !this.ready('life')) return false;
    this.setCool('life', 3);
    const k = kind || (Math.random() < 0.5 ? 'frog' : 'snake');
    this.ensureStand();
    f.play({ name: 'lifeCmd', dur: 0.6, upper: true, pose: (q) => Poses.cast('R', q, -0.5) });
    this.stand.strike({ name: 'touchGround', dur: 0.6, pose: (q) => Poses.heavy(q), events: [{ t: 0.55, fn: () => {
      const n = k === 'frog' ? 3 : 2;
      for (let i = 0; i < n; i += 1) {
        const p = k === 'frog'
          ? f.pos.clone().lerp(t.pos, 0.5).add(v3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3))
          : f.pos.clone().addScaledVector(f.forward(), 1.5).add(v3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2));
        p.y = this.game.world.groundAt(p.x, p.z, p.y + 2);
        this.spawnCreature(k, p);
      }
      audio.play('life');
      this.vfx.text(f.chestWorld(new THREE.Vector3()).add(v3(0, 1, 0)), 'ゴールド・エクスペリエンス', '#ffd040', 1.3, 0.6);
    } }] });
    return true;
  }

  spawnCreature(kind, p) {
    const mesh = kind === 'frog' ? frogMesh() : snakeMesh();
    mesh.position.copy(p);
    this.game.engine.scene.add(mesh);
    this.vfx.burst(p.clone().add(v3(0, 0.3, 0)), 0xffd040, 10, 2, 0.35, 0.5, { up: 1 });
    const c = { kind, pos: p.clone(), mesh, life: kind === 'frog' ? 14 : 10, dead: false, bite: 0 };
    this.creatures.push(c);
    const kit = this;
    this.combat.addHazard({
      update(dt) {
        if (dt === 0) return false;
        c.life -= dt;
        const t = kit.target();
        if (c.kind === 'frog') {
          c.mesh.position.y = c.pos.y + Math.abs(Math.sin(kit.clock * 3 + c.pos.x)) * 0.12;
          if (t) c.mesh.lookAt(t.pos.x, c.mesh.position.y, t.pos.z);
        } else if (t) {
          const d = t.pos.clone().sub(c.pos).setY(0);
          const dist = d.length();
          d.normalize();
          c.pos.addScaledVector(d, dt * 4);
          c.pos.y = kit.game.world.groundAt(c.pos.x, c.pos.z, c.pos.y + 1);
          c.mesh.position.copy(c.pos);
          c.mesh.lookAt(c.pos.clone().sub(d));
          c.bite -= dt;
          if (dist < 0.9 && c.bite <= 0) {
            c.bite = 1.2;
            kit.combat.applyHit(t, kit.f, { damage: 5, stun: 0.3, knock: 0, kind: 'special', color: 0x80c040, noCounter: true });
            t.slowUntil = kit.clock + 2.5;
          }
          // snakes die to any strike nearby
          if (t.action && t.distanceTo({ pos: c.pos }) < 2.2 && /jab|punch|heavy|rush|dodge/.test(t.action.def.name)) c.dead = true;
        }
        return c.life <= 0 || c.dead || kit.f.dead;
      },
      dispose() { mesh.removeFromParent(); c.dead = true; kit.creatures = kit.creatures.filter((q) => q !== c); },
    });
  }

  vines() {
    const f = this.f;
    const t = this.target();
    if (!f.canAct() || !t || !this.ready('vines')) return false;
    this.setCool('vines', 6);
    const p = t.pos.clone();
    this.vfx.warn(p, 2.4, 0.9, 0x80ff40);
    f.play({ name: 'vineCmd', dur: 0.6, upper: true, pose: (q) => Poses.point('L', q) });
    this.combat.addHazard(new Timer(0.9, () => {
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * Math.PI * 2;
        const base = p.clone().add(v3(Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2));
        this.vfx.vine(base, p.clone().add(v3(0, 1.2, 0)), 0x3a8a2a, 0.07, 2.2, 0.25);
      }
      areaDamage(this.combat, f, p, 2.4, { damage: 6, stun: 1.4, knock: 0, kind: 'special', color: 0x80ff40, noCounter: true }).forEach((h) => { h.target.rootedUntil = this.clock + 1.4; });
      audio.play('life');
    }));
    return true;
  }

  // Turns pieces of the arena into trees: obstacles that block movement and sight lines.
  transform() {
    const f = this.f;
    const t = this.target();
    if (!f.canAct() || !t || !this.ready('trees')) return false;
    this.setCool('trees', 12);
    f.play({ name: 'treeCmd', dur: 0.8, pose: (q) => Poses.castBoth(q, -0.4) });
    const kit = this.game.world.kit;
    for (let i = 0; i < 4; i += 1) {
      const p = f.pos.clone().lerp(t.pos, 0.3 + i * 0.15).add(v3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
      p.y = this.game.world.groundAt(p.x, p.z, p.y + 2);
      const tree = new THREE.Mesh(kit.broad[i % 2], kit.mats.broad);
      tree.position.copy(p);
      tree.scale.setScalar(0.01);
      tree.castShadow = true;
      this.game.engine.scene.add(tree);
      const col = this.game.world.addCollider({ x: p.x, z: p.z, r: 0.6, top: p.y + 8, bottom: p.y - 2, noCam: true });
      const life = { t: 0 };
      this.combat.addHazard({
        update: (dt) => { life.t += dt; tree.scale.setScalar(Math.min(1, life.t * 1.5) * 0.8); return life.t > 16 || this.f.dead; },
        dispose: () => { tree.removeFromParent(); this.game.world.removeCollider(col); },
      });
      this.vfx.burst(p.clone().add(v3(0, 0.5, 0)), 0xffd040, 12, 3, 0.4, 0.6, { up: 1 });
    }
    audio.play('life');
    return true;
  }

  specialA() { return this.lifeCreation('frog'); }
  specialB() { return this.vines(); }
  signature() { return this.transform() || this.lifeCreation('snake'); }

  get abilities() {
    return [
      { name: 'light', weight: 2.4, min: 0, max: 2.3, cool: 0.4, fn: () => this.light() },
      { name: 'frogs', weight: 1.5, min: 2, max: 12, cool: 2, fn: () => this.lifeCreation('frog') },
      { name: 'snakes', weight: 1.2, min: 3, max: 16, cool: 2, fn: () => this.lifeCreation('snake') },
      { name: 'vines', weight: 1.6, min: 2, max: 14, cool: 2, phase: 1, fn: () => this.vines() },
      { name: 'trees', weight: 1.5, min: 5, max: 25, cool: 3, phase: 2, fn: () => this.transform() },
      { name: 'rush', weight: 1.4, min: 0, max: 2.4, cool: 3, phase: 2, fn: () => this.aiRush(1.3) },
      { name: 'heavy', weight: 0.9, min: 0, max: 2.4, cool: 2, fn: () => this.heavy() },
    ];
  }

  aiRush(dur) { if (!this.rush(true, 0)) return false; this.aiRushT = dur; return true; }
  dispose() { this._unsub?.(); }
}
