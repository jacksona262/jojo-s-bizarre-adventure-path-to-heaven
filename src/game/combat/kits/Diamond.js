import * as THREE from 'three';
import { Kit, v3 } from '../Kit';
import * as Poses from '../../anim/Poses';
import { audio } from '../../core/Audio';
import { areaDamage } from '../Combat';
import { Timer, Eruption } from '../Hazards';
import { getTextures } from '../../world/Textures';

const UP = v3(0, 1, 0);

// ---------------------------------------------------------------- breakable / restorable props
let propMats = null;
function mats() {
  if (!propMats) {
    const t = getTextures();
    propMats = {
      wood: new THREE.MeshStandardMaterial({ map: t.woodLight, roughness: 0.9 }),
      dark: new THREE.MeshStandardMaterial({ map: t.woodDark, roughness: 0.9 }),
      stone: new THREE.MeshStandardMaterial({ map: t.stone, roughness: 0.9 }),
    };
  }
  return propMats;
}

// A prop made of pieces that can shatter and be restored.
export class Restorable {
  constructor(game, kind, pos, rotY = 0) {
    this.game = game;
    this.kind = kind;
    this.home = pos.clone();
    this.group = new THREE.Group();
    this.group.position.copy(pos);
    this.group.rotation.y = rotY;
    this.pieces = [];
    const m = mats();
    const add = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.group.add(mesh);
      this.pieces.push({ mesh, home: mesh.position.clone(), homeRot: mesh.rotation.clone(), vel: v3(), spin: v3(), world: v3() });
    };
    if (kind === 'crate') {
      for (let i = 0; i < 2; i += 1) for (let j = 0; j < 2; j += 1) for (let k = 0; k < 2; k += 1) add(new THREE.BoxGeometry(0.5, 0.5, 0.5), m.wood, i * 0.5 - 0.25, j * 0.5 + 0.25, k * 0.5 - 0.25);
      this.radius = 0.6; this.height = 1;
    } else if (kind === 'wall') {
      for (let i = 0; i < 4; i += 1) for (let j = 0; j < 3; j += 1) add(new THREE.BoxGeometry(0.9, 0.85, 0.3), m.stone, i * 0.9 - 1.35, j * 0.85 + 0.42, 0);
      this.radius = 1.9; this.height = 2.5;
    } else if (kind === 'cart') {
      add(new THREE.BoxGeometry(1.4, 0.15, 2.4), m.wood, 0, 0.8, 0);
      add(new THREE.BoxGeometry(0.08, 0.5, 2.4), m.wood, 0.7, 1.1, 0);
      add(new THREE.BoxGeometry(0.08, 0.5, 2.4), m.wood, -0.7, 1.1, 0);
      for (const [x, z] of [[0.75, 0.8], [-0.75, 0.8], [0.75, -0.8], [-0.75, -0.8]]) add(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 10).rotateZ(Math.PI / 2), m.dark, x, 0.4, z);
      this.radius = 1.3; this.height = 1.4;
    } else {
      add(new THREE.CylinderGeometry(0.34, 0.34, 0.9, 10), m.dark, 0, 0.45, 0);
      add(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 10), m.stone, 0, 0.9, 0);
      this.radius = 0.4; this.height = 1;
    }
    game.engine.scene.add(this.group);
    this.state = 'intact';
    this.t = 0;
    this.collider = game.world.addCollider({ x: pos.x, z: pos.z, hw: kind === 'wall' ? 1.8 : this.radius, hd: kind === 'wall' ? 0.2 : this.radius, rot: rotY, top: pos.y + this.height, bottom: pos.y - 1, noCam: true });
    this.armed = false;
  }

  center() { return this.group.position.clone().add(v3(0, this.height / 2, 0)); }

  shatter(from, power = 8) {
    if (this.state !== 'intact') return false;
    this.state = 'broken';
    this.t = 0;
    this.game.world.removeCollider(this.collider);
    this.collider = null;
    const c = this.center();
    for (const p of this.pieces) {
      p.mesh.getWorldPosition(p.world);
      const dir = p.world.clone().sub(from || c).setY(0.5).normalize();
      p.vel.copy(dir.multiplyScalar(power * (0.6 + Math.random() * 0.6)));
      p.vel.y += 3 + Math.random() * 4;
      p.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
    }
    this.game.vfx.smokePuff(c, 0x5a4a3a, 6, 1.4, 1.2);
    audio.play('heavyHit');
    return true;
  }

  // Pieces fly home; returns the straight paths so the caller can damage what is in the way.
  restore(onPiece) {
    if (this.state !== 'broken') return false;
    this.state = 'restoring';
    this.t = 0;
    for (const p of this.pieces) { p.start = p.mesh.position.clone(); p.startRot = p.mesh.rotation.clone(); }
    this.onPiece = onPiece;
    audio.play('restore');
    return true;
  }

  update(dt, frozen) {
    if (frozen) return;
    if (this.state === 'broken') {
      this.t += dt;
      for (const p of this.pieces) {
        p.vel.y -= 18 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt; p.mesh.rotation.z += p.spin.z * dt;
        p.mesh.getWorldPosition(p.world);
        const g = this.game.world.groundAt(p.world.x, p.world.z, p.world.y + 1);
        if (p.world.y < g + 0.15) { p.mesh.position.y += (g + 0.15 - p.world.y); p.vel.multiplyScalar(0.3); p.vel.y = Math.abs(p.vel.y) * 0.2; p.spin.multiplyScalar(0.5); }
      }
    } else if (this.state === 'restoring') {
      this.t += dt;
      const k = Math.min(1, this.t / 0.55);
      const e = k * k;
      for (const p of this.pieces) {
        const prev = p.mesh.getWorldPosition(new THREE.Vector3());
        p.mesh.position.lerpVectors(p.start, p.home, e);
        p.mesh.rotation.set(p.startRot.x * (1 - e), p.startRot.y * (1 - e), p.startRot.z * (1 - e));
        const now = p.mesh.getWorldPosition(new THREE.Vector3());
        if (this.onPiece) this.onPiece(prev, now);
        if (Math.random() < 0.3) this.game.vfx.glow.emit(now, v3(), new THREE.Color(0xff7ad0), 0.7, 0.25, 0.05, 0.3);
      }
      if (k >= 1) {
        this.state = 'intact';
        const pos = this.group.position;
        this.collider = this.game.world.addCollider({ x: pos.x, z: pos.z, hw: this.kind === 'wall' ? 1.8 : this.radius, hd: this.kind === 'wall' ? 0.2 : this.radius, rot: this.group.rotation.y, top: pos.y + this.height, bottom: pos.y - 1, noCam: true });
      }
    }
  }

  setGlow(color, k) {
    for (const p of this.pieces) {
      if (!p.mesh.userData.ownMat) { p.mesh.material = p.mesh.material.clone(); p.mesh.userData.ownMat = true; }
      p.mesh.material.emissive.set(color).multiplyScalar(k);
    }
  }

  dispose() {
    this.group.removeFromParent();
    if (this.collider) this.game.world.removeCollider(this.collider);
  }
}

// Helper hazard to keep a set of props updating (respects time stop).
function propUpdater(game, owner, props) {
  return {
    owner,
    update(dt, realDt, frozen) { for (const p of props) p.update(dt, frozen); return owner.dead && false; },
    dispose() { for (const p of props) p.dispose(); },
  };
}

function scatterProps(game, center, kinds, radius = 14) {
  const props = [];
  kinds.forEach((kind, i) => {
    const a = (i / kinds.length) * Math.PI * 2 + Math.random() * 0.4;
    const r = radius * (0.55 + Math.random() * 0.45);
    const p = center.clone().add(v3(Math.cos(a) * r, 0, Math.sin(a) * r));
    p.y = game.world.groundAt(p.x, p.z, p.y + 3);
    props.push(new Restorable(game, kind, p, a + Math.PI / 2));
  });
  return props;
}

// ============================================================================ Josuke
export class CrazyDiamondKit extends Kit {
  constructor(f, game) {
    super(f, game, { color: 0xff8ad8, reach: 2.1, name: 'Crazy Diamond' });
    this.rushShout = 'ドラララ';
    this.rushShoutColor = '#ff8ad8';
    this.props = [];
    this.cage = null;
  }

  setupArena(center) {
    this.props = scatterProps(this.game, center, ['wall', 'crate', 'cart', 'crate', 'wall', 'barrel', 'crate', 'wall', 'barrel', 'cart'], 15);
    this.combat.addHazard(propUpdater(this.game, this.f, this.props));
    // anyone's heavy strikes shatter props
    this._unsub = this.combat.on((ev) => {
      if (ev.type === 'attack' && (ev.move === 'heavy' || ev.move === 'knock')) {
        const a = ev.attacker;
        for (const p of this.props) if (p.state === 'intact' && a.pos.distanceTo(p.group.position) < 3.2) p.shatter(a.pos, 9);
      }
    });
  }

  // Note: Crazy Diamond cannot restore its own user. No self-heal anywhere in this kit.
  restoreAll() {
    const f = this.f;
    if (!f.canAct() || !this.ready('restore')) return false;
    const broken = this.props.filter((p) => p.state === 'broken');
    if (!broken.length) return false;
    this.setCool('restore', this.phase >= 3 ? 4 : 6);
    this.ensureStand();
    f.play({ name: 'restoreCmd', dur: 0.9, pose: (k) => Poses.castBoth(k, 0.2) });
    this.stand.strike({ name: 'restoreSt', dur: 0.9, pose: (k) => Poses.raiseArms(k) });
    this.vfx.text(f.chestWorld(new THREE.Vector3()).add(v3(0, 1, 0)), 'なおす', '#ff8ad8', 1.2, 0.7);
    const hitSet = new Set();
    for (const p of broken) {
      p.restore((a, b) => {
        for (const e of this.combat.enemiesOf(f)) {
          if (hitSet.has(e)) continue;
          const c = e.chestWorld(new THREE.Vector3());
          const seg = b.clone().sub(a); const len = seg.length();
          if (len < 1e-4) continue;
          const t = Math.max(0, Math.min(1, c.clone().sub(a).dot(seg) / (len * len)));
          if (a.clone().addScaledVector(seg, t).distanceTo(c) < 0.9) {
            hitSet.add(e);
            this.combat.applyHit(e, f, { damage: 9, stun: 0.5, knock: 5, kind: 'special', color: 0xff8ad8, noCounter: true });
          }
        }
      });
    }
    return true;
  }

  smashNear() {
    const f = this.f;
    const t = this.target();
    if (!f.canAct() || !t || !this.ready('smash')) return false;
    let best = null; let bd = 99;
    for (const p of this.props) {
      if (p.state !== 'intact') continue;
      const d = p.group.position.distanceTo(t.pos);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best || bd > 6) return false;
    this.setCool('smash', 4);
    f.faceTowards(best.group.position, true);
    this.ensureStand();
    this.stand.strike({ name: 'smash', dur: 0.55, pose: (k) => Poses.heavy(k), events: [{ t: 0.5, fn: () => { best.shatter(f.pos, 13); this.combat.addHazard(new Timer(1.0, () => this.restoreAll())); } }] }, 'far');
    return true;
  }

  // Reconstruction trap: stone panels assemble into a cage around the target.
  cageTrap() {
    const f = this.f;
    const t = this.target();
    if (!f.canAct() || !t || this.cage || !this.ready('cage')) return false;
    this.setCool('cage', 14);
    this.ensureStand();
    f.play({ name: 'cageCmd', dur: 0.8, pose: (k) => Poses.castBoth(k, -0.2) });
    const c = t.pos.clone();
    this.vfx.warn(c, 2.2, 0.8, 0xff8ad8);
    this.combat.addHazard(new Timer(0.8, () => {
      const walls = [];
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * Math.PI * 2;
        const p = c.clone().add(v3(Math.cos(a) * 1.8, 0, Math.sin(a) * 1.8));
        p.y = this.game.world.groundAt(p.x, p.z, p.y + 2);
        const w = new Restorable(this.game, 'wall', p, -a + Math.PI / 2);
        // assemble from scattered pieces
        for (const piece of w.pieces) { piece.start = piece.home.clone().add(v3((Math.random() - 0.5) * 8, Math.random() * 3, (Math.random() - 0.5) * 8)); piece.startRot = new THREE.Euler(Math.random() * 3, Math.random() * 3, 0); piece.mesh.position.copy(piece.start); }
        w.state = 'restoring'; w.t = 0;
        walls.push(w);
      }
      audio.play('restore');
      this.cage = walls;
      this.vfx.text(c.clone().add(v3(0, 2.5, 0)), 'TRAPPED', '#ff8ad8', 1.2, 0.6);
      this.combat.addHazard({
        life: 3.2,
        update: (dt, realDt, frozen) => {
          for (const w of walls) w.update(dt, frozen);
          if (dt > 0) this.life = (this.life ?? 3.2) - dt;
          return (this.life ?? 1) <= 0 || walls.every((w) => w.state === 'broken');
        },
        dispose: () => { for (const w of walls) w.dispose(); this.cage = null; this.life = undefined; },
      });
      // breaking out: heavy strikes inside shatter the cage
      const unsub = this.combat.on((ev) => {
        if (ev.type === 'attack' && ev.attacker === t && (ev.move === 'heavy' || ev.move === 'knock') && this.cage) {
          for (const w of this.cage) w.shatter(t.pos, 10);
          unsub();
        }
      });
    }));
    return true;
  }

  specialA() { return this.smashNear() || this.heavy(); }
  specialB() { return this.restoreAll(); }
  signature() { return this.cageTrap(); }

  get abilities() {
    return [
      { name: 'light', weight: 3, min: 0, max: 2.4, cool: 0.3, fn: () => this.light() },
      { name: 'heavy', weight: 1.6, min: 0, max: 2.6, cool: 1.2, fn: () => this.heavy() },
      { name: 'rush', weight: 1.6, min: 0, max: 2.4, cool: 3, fn: () => this.aiRush(1.3) },
      { name: 'smash', weight: 1.8, min: 0, max: 10, cool: 2, phase: 2, fn: () => this.smashNear() },
      { name: 'restore', weight: 2.5, min: 0, max: 30, cool: 2, phase: 2, fn: () => this.restoreAll() },
      { name: 'cage', weight: 1.3, min: 2, max: 9, cool: 4, phase: 3, fn: () => this.cageTrap() },
    ];
  }

  aiRush(dur) { if (!this.rush(true, 0)) return false; this.aiRushT = dur; return true; }
  dispose() { this._unsub?.(); }
}

// ============================================================================ Kira
function sheerHeartMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.6), new THREE.MeshStandardMaterial({ color: 0xd8c8b8, roughness: 0.4, metalness: 0.4 }));
  body.position.y = 0.18;
  const tread = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.44), new THREE.MeshStandardMaterial({ color: 0x3a3030, roughness: 0.8 }));
  tread.position.y = 0.07;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4080 }));
  eye.position.set(0, 0.28, 0.24);
  g.add(body, tread, eye);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class KillerQueenKit extends Kit {
  constructor(f, game) {
    super(f, game, { color: 0xff7ab8, reach: 2.0, name: 'Killer Queen' });
    this.props = [];
    this.bombs = new Set();
    this.mines = [];
    this.sha = null;
  }

  setupArena(center) {
    this.center = center.clone();
    this.props = scatterProps(this.game, center, ['crate', 'barrel', 'crate', 'barrel', 'crate', 'barrel', 'crate', 'crate', 'barrel', 'crate', 'barrel', 'crate'], 16);
    this.combat.addHazard(propUpdater(this.game, this.f, this.props));
    this.combat.addHazard({ update: (dt, realDt) => { this._pulse(realDt); return false; } });
  }

  _pulse(dt) {
    this.pt = (this.pt || 0) + dt;
    const stopped = this.game.time.stopped;
    const t = this.target();
    for (const p of this.bombs) {
      if (p.state !== 'intact') { this.bombs.delete(p); continue; }
      const near = t ? p.group.position.distanceTo(t.pos) : 99;
      const k = stopped ? 1.4 : near < 4 ? 0.5 + 0.4 * Math.sin(this.pt * 12) : 0.08 + 0.06 * Math.sin(this.pt * 3);
      p.setGlow(0xff4a9a, k);
    }
  }

  // First Bomb: Killer Queen touches an object and turns it into a bomb.
  armObject() {
    const f = this.f;
    if (!f.canAct() || !this.ready('arm')) return false;
    const t = this.target();
    const cands = this.props.filter((p) => p.state === 'intact' && !this.bombs.has(p));
    if (!cands.length) return false;
    // pick one between Kira and DIO-ish, near DIO's likely path
    cands.sort((a, b) => (t ? a.group.position.distanceTo(t.pos) - b.group.position.distanceTo(t.pos) : 0));
    const p = cands[Math.min(cands.length - 1, Math.floor(Math.random() * 3))];
    this.setCool('arm', this.phase >= 2 ? 3 : 5);
    this.ensureStand();
    f.play({ name: 'armCmd', dur: 0.6, upper: true, pose: (k) => Poses.point('L', k) });
    this.stand.strike({ name: 'touch', dur: 0.6, pose: (k) => Poses.cast('L', k, -0.3), events: [{ t: 0.5, fn: () => {
      this.bombs.add(p);
      this.vfx.burst(p.center(), 0xff4a9a, 8, 2, 0.3, 0.4);
      audio.play('click');
    } }] }, 'far');
    return true;
  }

  detonate(p) {
    if (p.state !== 'intact') return;
    this.bombs.delete(p);
    const c = p.center();
    this.vfx.burst(c, 0xffffff, 1, 0, 3, 0.15, { shape: 3 });
    this.combat.addHazard(new Timer(0.3, () => {
      p.shatter(c, 14);
      this.explode(c, 4.2, 20);
    }));
    audio.play('click');
  }

  explode(c, r, dmg) {
    areaDamage(this.combat, this.f, c, r, { damage: dmg, stun: 0.6, knock: 11, launch: 6, kind: 'heavy', color: 0xff8ab8, sfx: 'explosion', noCounter: true });
    this.vfx.burst(c, 0xff9a50, 40, 10, 0.9, 0.6);
    this.vfx.burst(c, 0xffe0a0, 1, 0, 6, 0.2, { shape: 3 });
    this.vfx.smokePuff(c, 0x2a2420, 12, 2.6, 2.2);
    this.vfx.ring(c.clone().setY(c.y - 0.4), 0xff9a50, 0.5, r + 1, 0.4);
    audio.play('explosion');
    this.game.camera.shake(0.6);
  }

  // click: detonate armed objects near the target
  click() {
    const t = this.target();
    if (!t) return false;
    let any = false;
    for (const p of this.bombs) if (p.group.position.distanceTo(t.pos) < 4.5) { this.detonate(p); any = true; }
    if (any) this.f.play({ name: 'click', dur: 0.4, upper: true, pose: (k) => Poses.point('R', k) });
    return any;
  }

  coinMine() {
    const f = this.f;
    const t = this.target();
    if (!f.canAct() || !t || !this.ready('coin')) return false;
    this.setCool('coin', 4);
    f.play({ name: 'flick', dur: 0.5, upper: true, pose: (k) => Poses.cast('R', k, 0.2), events: [{ t: 0.4, fn: () => {
      for (let i = 0; i < (this.phase >= 2 ? 3 : 1); i += 1) {
        const dest = t.pos.clone().add(v3((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5));
        dest.y = this.game.world.groundAt(dest.x, dest.z, dest.y + 2);
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 10), new THREE.MeshStandardMaterial({ color: 0xd8b060, metalness: 1, roughness: 0.3, emissive: 0x401020 }));
        coin.position.copy(dest).add(v3(0, 0.03, 0));
        this.game.engine.scene.add(coin);
        const mine = { p: dest, mesh: coin, armedAt: this.clock + 0.8 };
        this.combat.addHazard({
          update: (dt) => {
            if (dt === 0 || this.clock < mine.armedAt) return false;
            for (const e of this.combat.enemiesOf(f)) {
              if (e.pos.distanceTo(mine.p) < 1.4) { this.explode(mine.p.clone().add(v3(0, 0.5, 0)), 3, 14); return true; }
            }
            return f.dead;
          },
          dispose: () => coin.removeFromParent(),
        });
      }
    } }] });
    return true;
  }

  // Sheer Heart Attack: autonomous, heat-seeking, practically indestructible.
  sheerHeart() {
    if (this.sha || !this.ready('sha')) return false;
    const f = this.f;
    this.setCool('sha', 6);
    const mesh = sheerHeartMesh();
    const pos = f.pos.clone().addScaledVector(f.forward(), 1.2);
    mesh.position.copy(pos);
    this.game.engine.scene.add(mesh);
    const sha = { pos, vel: v3(), mesh, cooldown: 0.8 };
    this.sha = sha;
    this.vfx.text(pos.clone().add(v3(0, 1.4, 0)), 'コッチヲ見ロ', '#ff7ab8', 1.6, 0.7);
    const kit = this;
    this.combat.addHazard({
      update(dt) {
        if (dt === 0) return false;
        sha.cooldown -= dt;
        const t = kit.target();
        if (t) {
          const dir = t.pos.clone().sub(sha.pos).setY(0);
          const d = dir.length(); dir.normalize();
          sha.vel.x += (dir.x * 5.5 - sha.vel.x) * Math.min(1, dt * 2);
          sha.vel.z += (dir.z * 5.5 - sha.vel.z) * Math.min(1, dt * 2);
          if (d < 0.9 && sha.cooldown <= 0) { kit.explode(sha.pos.clone().add(v3(0, 0.4, 0)), 3.2, 18); sha.cooldown = 2.5; sha.vel.multiplyScalar(-1.5); }
        }
        sha.vel.multiplyScalar(Math.exp(-dt * 0.3));
        sha.pos.addScaledVector(sha.vel, dt);
        sha.pos.y = kit.game.world.groundAt(sha.pos.x, sha.pos.z, sha.pos.y + 1);
        mesh.position.copy(sha.pos);
        mesh.rotation.y = Math.atan2(sha.vel.x, sha.vel.z);
        // knocked into Kira himself
        if (sha.knocked && sha.pos.distanceTo(kit.f.pos) < 1.2 && sha.cooldown <= 0) {
          kit.f.team = -1; kit.explode(sha.pos.clone().add(v3(0, 0.4, 0)), 2.5, 0); kit.f.team = 1;
          kit.combat.applyHit(kit.f, kit.target() || kit.f, { damage: 34, stun: 1.4, knock: 8, launch: 5, kind: 'heavy', unblockable: true, noCounter: true });
          kit.vfx.text(kit.f.chestWorld(new THREE.Vector3()).add(v3(0, 1, 0)), '!?', '#ff7ab8', 1, 1);
          sha.cooldown = 4; sha.knocked = false;
        }
        if (sha.knocked && sha.vel.length() < 2) sha.knocked = false;
        return kit.f.dead;
      },
      dispose() { mesh.removeFromParent(); kit.sha = null; },
    });
    // strikes knock it away (it cannot be destroyed)
    this._unsubSha = this.combat.on((ev) => {
      if (ev.type !== 'attack' || !this.sha || ev.attacker.team === f.team) return;
      const a = ev.attacker;
      if (a.pos.distanceTo(this.sha.pos) < 3) {
        const dir = this.sha.pos.clone().sub(a.pos).setY(0).normalize();
        this.sha.vel.copy(dir.multiplyScalar(ev.move === 'heavy' || ev.move === 'knock' ? 22 : 10));
        this.sha.knocked = true;
        this.sha.cooldown = 0.5;
        audio.play('block');
      }
    });
    return true;
  }

  // Final trap: every remaining object in the yard is armed around the target.
  finalTrap() {
    if (this.finalDone || !this.f.canAct()) return false;
    this.finalDone = true;
    const t = this.target();
    if (!t) return false;
    const f = this.f;
    f.play({ name: 'finalCmd', dur: 1, pose: (k) => Poses.raiseArms(k) });
    this.vfx.text(f.chestWorld(new THREE.Vector3()).add(v3(0, 1.2, 0)), 'キラークイーン第一の爆弾', '#ff7ab8', 2, 0.7);
    const c = t.pos.clone();
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2;
      const p = c.clone().add(v3(Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2));
      p.y = this.game.world.groundAt(p.x, p.z, p.y + 2);
      if (i === 3) continue; // a single gap
      this.combat.addHazard(new Eruption(this.game, f, p, 1.8, 3.6, { damage: 16, stun: 0.6, knock: 9, launch: 6, kind: 'heavy', color: 0xff7ab8, sfx: 'explosion' }, (q) => { this.vfx.burst(q, 0xff9a50, 20, 8, 0.8, 0.5); audio.play('explosion', { power: 0.6 }); }));
    }
    this.combat.addHazard(new Eruption(this.game, f, c, 2.6, 3.8, { damage: 26, stun: 0.8, knock: 10, launch: 8, kind: 'heavy', color: 0xff7ab8, sfx: 'explosion' }, (q) => this.explode(q.clone().add(v3(0, 0.5, 0)), 0.1, 0)));
    return true;
  }

  update(dt) {
    super.update(dt);
    // automatic click when DIO walks by an armed bomb
    if (!this.f.dead && this.bombs.size && Math.random() < dt * 4) this.click();
  }

  specialA() { return this.armObject(); }
  specialB() { return this.coinMine(); }
  signature() { return this.click() || this.sheerHeart(); }

  get abilities() {
    return [
      { name: 'arm', weight: 2.6, min: 3, max: 30, cool: 0.5, fn: () => this.armObject() },
      { name: 'coin', weight: 1.8, min: 4, max: 18, cool: 1, fn: () => this.coinMine() },
      { name: 'light', weight: 2.2, min: 0, max: 2.2, cool: 0.4, fn: () => this.light() },
      { name: 'heavy', weight: 0.8, min: 0, max: 2.4, cool: 2, fn: () => this.heavy() },
      { name: 'sha', weight: 4, min: 0, max: 30, cool: 2, phase: 3, fn: () => this.sheerHeart() },
      { name: 'final', weight: 6, min: 0, max: 20, cool: 2, phase: 4, fn: () => this.finalTrap() },
    ];
  }

  dispose() { this._unsubSha?.(); }
}
