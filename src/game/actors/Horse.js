import * as THREE from 'three';
import { instantiate } from '../assets/AssetLibrary';
import { HorseAnimator } from '../anim/HorseAnimator';
import { audio } from '../core/Audio';
import { roadX, roadDir, ROAD_HALF } from '../world/Terrain';

// Slow Dancer: rideable, summonable, with gaits driven by speed.

export const GAIT_SPEEDS = { walk: 2.2, trot: 4.6, canter: 8.5, gallop: 15 };

export class Horse {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'slowDancer';
    this.pos = this.group.position;
    this.yaw = 0;
    this.speed = 0;
    this.turn = 0;
    this.stamina = 100;
    this.rider = null;
    this.state = 'idle';
    this.target = null;
    this.pitch = 0;
    this.controls = { throttle: 0, steer: 0, gallop: false, brake: false };
    this.radius = 0.9;
    this.lastNeigh = 0;
  }

  async load() {
    this.model = await instantiate('horse');
    this.group.add(this.model);
    this.anim = new HorseAnimator(this.model);
    this.info = this.model.userData.info.horse;
    this.anim.onFootfall = (i, speed) => {
      if (this.game.time?.stopped) return;
      const wood = this.onPlatform;
      audio.play('hoof', { power: Math.min(1.2, 0.4 + speed / 12), wood });
      if (speed > 7 && Math.random() < 0.35) this.game.vfx?.smokePuff(this.pos.clone().add(new THREE.Vector3(0, 0.1, 0)), 0x2a241e, 1, 0.8, 0.8, 0.2);
      if (this.inWater) audio.play('splash', { power: 0.4 });
    };
    return this;
  }

  saddleWorld(out = new THREE.Vector3()) {
    const s = this.info ? this.info.saddle : new THREE.Vector3(0, 1.4, 0);
    out.copy(s);
    // follow the body bone's bob/pitch roughly
    const body = this.anim?.body;
    if (body) out.y += body.position.y - this.anim.bodyBase.y;
    return this.model.localToWorld(out);
  }

  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  // Mounting and dismounting are short animated transitions: the rider arcs between the ground
  // beside the horse and the saddle while the rider's pose blends (rider.mountK 0..1).
  mount(rider, instant = false) {
    this.rider = rider;
    rider.mounted = this;
    rider.ghost = true;
    this.state = 'ridden';
    if (rider.stand?.summoned) rider.stand.summon(false, true);
    this.leaving = null;
    this.mountT = instant ? 1 : 0;
    this.mountFrom = rider.pos.clone();
    rider.mountK = instant ? 1 : 0;
    audio.play('neigh');
  }

  dismount(instant = false) {
    const r = this.rider;
    if (!r) return null;
    this.rider = null;
    r.mounted = null;
    r.ghost = false;
    const side = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(-1.3);
    const to = this.pos.clone().add(side);
    to.y = this.game.world.groundAt(to.x, to.z, this.pos.y + 1);
    r.vel.set(0, 0, 0);
    r.yaw = r.targetYaw = this.yaw;
    if (instant) { r.pos.copy(to); r.mountK = 0; r.pinned = false; } else {
      this.leaving = { r, t: 0, from: r.pos.clone(), to };
      r.pinned = true;
    }
    this.state = 'idle';
    this.speed *= 0.3;
    return r;
  }

  // Whistle: Slow Dancer arrives from behind the player at a gallop.
  summon(player) {
    if (this.rider) return;
    const d = this.pos.distanceTo(player.pos);
    if (d > 70 || !this.group.parent) {
      this._placeNear(player, 45);
      if (!this.group.parent) this.game.engine.scene.add(this.group);
    }
    this.state = 'summoned';
    this.target = player;
    this.summonT = 0; this.summonBest = Infinity; this.summonBestT = 0;
    if (this.game.clock - this.lastNeigh > 2) { audio.play('neigh'); this.lastNeigh = this.game.clock; }
  }

  // Somewhere open `dist` metres behind the player, out of the way of buildings: behind them if
  // that spot is clear, otherwise on the road at the same distance.
  _placeNear(player, dist) {
    const world = this.game.world;
    const p = player.pos.clone().addScaledVector(player.forward(), -dist);
    const probe = p.clone();
    if (world.collide(probe, 1.2, p.y) || world.isIndoor?.(p)) {
      const z = player.pos.z + (player.forward().z > 0 ? -dist : dist);
      p.set(roadX(z), 0, z);
    }
    p.y = world.groundAt(p.x, p.z, player.pos.y + 5);
    this.pos.copy(p);
    this.yaw = Math.atan2(player.pos.x - p.x, player.pos.z - p.z);
    this.speed = 0;
  }

  update(dt) {
    if (!this.model) return;
    if (this.game.time?.isFrozen(this) && !(this.rider && !this.game.time.isFrozen(this.rider))) return;
    const world = this.game.world;
    let want = 0; let steer = 0;
    if (this.state === 'ridden' && (this.mountT ?? 1) < 0.55) {
      want = 0; steer = 0;
    } else if (this.state === 'ridden') {
      const c = this.controls;
      if (c.throttle > 0.1) want = c.gallop && this.stamina > 2 ? GAIT_SPEEDS.gallop : (c.throttle > 0.6 ? GAIT_SPEEDS.canter : c.throttle > 0.3 ? GAIT_SPEEDS.trot : GAIT_SPEEDS.walk);
      if (c.brake) want = this.speed > 0.5 ? 0 : -1.4;
      steer = c.steer;
      // hard stop from a gallop: Slow Dancer rears up
      if (c.brake && this.speed > 10 && !(this.rearT > 0)) { this.rearT = 1.1; audio.play('neigh'); this.game.camera?.shake(0.2); }
      // road-follow assist: with no steering input at speed, ease onto the road ahead
      if (Math.abs(c.steer) < 0.08 && this.speed > 5 && this.assistRoad !== false) {
        const rx = roadX(this.pos.z);
        const off = this.pos.x - rx;
        if (Math.abs(off) < ROAD_HALF + 7) {
          const d = roadDir(this.pos.z);
          let hx = d.x; let hz = d.z;
          const fx = Math.sin(this.yaw); const fz = Math.cos(this.yaw);
          if (fx * hx + fz * hz < 0) { hx = -hx; hz = -hz; }
          if (fx * hx + fz * hz > 0.8) {
            const want2 = Math.atan2(hx * 14 - off * 0.7, hz * 14);
            const da = Math.atan2(Math.sin(want2 - this.yaw), Math.cos(want2 - this.yaw));
            steer = Math.max(-0.5, Math.min(0.5, -da * 1.6));
          }
        }
      }
      if (c.gallop && c.throttle > 0.1 && this.speed > 9) this.stamina = Math.max(0, this.stamina - dt * 9);
      else this.stamina = Math.min(100, this.stamina + dt * 6);
    } else if (this.state === 'summoned' && this.target) {
      const tp = this.target.pos;
      const d = Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z);
      const ang = Math.atan2(tp.x - this.pos.x, tp.z - this.pos.z);
      let da = ang - this.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
      // steer is applied as yaw -= turn (positive = right), so turning toward the target is -da
      steer = Math.max(-1, Math.min(1, -da * 2));
      want = d > 12 ? GAIT_SPEEDS.gallop * 0.8 : d > 4 ? GAIT_SPEEDS.trot : 0;
      if (Math.abs(da) > 1.4 && d > 6) want = Math.min(want, GAIT_SPEEDS.trot);   // turn before galloping off
      if (d < 2.9) { this.state = 'idle'; want = 0; }
      // a whistle never leaves the player waiting: lost, blocked or stuck, she reappears closer
      this.summonT = (this.summonT || 0) + dt;
      if (d < (this.summonBest ?? Infinity) - 1.5) { this.summonBest = d; this.summonBestT = this.summonT; }
      if (d > 160 || (this.summonT - (this.summonBestT || 0) > 3 && d > 8)) {
        this._placeNear(this.target, Math.min(35, Math.max(14, d * 0.5)));
        this.summonBest = Infinity; this.summonBestT = this.summonT;
      }
    }
    // acceleration and turning
    const acc = want > this.speed ? 4.5 : 9;
    this.speed += Math.sign(want - this.speed) * Math.min(Math.abs(want - this.speed), acc * dt);
    const turnRate = 2.2 - Math.min(1.3, Math.abs(this.speed) / 12);
    this.turn += (steer - this.turn) * Math.min(1, dt * 6);
    this.yaw -= this.turn * turnRate * dt * (this.speed < 0 ? -1 : 1) * (Math.abs(this.speed) > 0.2 || this.state === 'ridden' ? 1 : 0);
    if (Math.abs(this.speed) < 0.2 && this.state === 'ridden') this.yaw -= this.turn * 1.4 * dt;
    // slope slows climbing
    const fwd = this.forward();
    const hF = world.groundAt(this.pos.x + fwd.x * 1.1, this.pos.z + fwd.z * 1.1, this.pos.y + 1.5);
    const hB = world.groundAt(this.pos.x - fwd.x * 1.1, this.pos.z - fwd.z * 1.1, this.pos.y + 1.5);
    const slope = (hF - hB) / 2.2;
    if (slope > 0.45 && this.speed > 0) this.speed *= Math.exp(-dt * 6);
    this.pitch += (-Math.atan(slope) * 0.9 - this.pitch) * Math.min(1, dt * 8);
    // integrate
    const ox = this.pos.x; const oz = this.pos.z;
    this.pos.x += fwd.x * this.speed * dt;
    this.pos.z += fwd.z * this.speed * dt;
    const front = this.pos.clone().addScaledVector(fwd, 0.9);
    const hit1 = world.collide(this.pos, this.radius * 0.8, this.pos.y);
    const fp = front.clone();
    const hit2 = world.collide(fp, 0.55, this.pos.y);
    if (hit2) { this.pos.x += fp.x - front.x; this.pos.z += fp.z - front.z; }
    if ((hit1 || hit2) && this.speed > 6) { this.speed *= 0.5; this.game.camera?.shake(0.15); }
    const g = world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.8);
    this.onPlatform = g > this.game.world.groundAt(this.pos.x, this.pos.z, -1e9) + 0.05;
    this.pos.y += (g - this.pos.y) * Math.min(1, dt * 18);
    const wl = world.waterAt(this.pos.x, this.pos.z);
    this.inWater = wl > -1e6 && this.pos.y < wl - 0.1;
    if (this.inWater) this.speed *= Math.exp(-dt * 1.2);
    const actual = Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, 1e-4);
    this.group.rotation.set(0, this.yaw, 0);
    this.model.rotation.x = this.pitch;
    if (this.rearT > 0) {
      this.rearT -= dt;
      this.anim.rear = Math.sin(Math.max(0, 1 - this.rearT / 1.1) * Math.PI) * 0.85;
      if (this.rearT <= 0) this.anim.rear = 0;
    }
    this.anim.update(dt, actual, this.turn);
    // a full gallop draws faint speed lines at the edge of the screen
    if (this.rider && this.rider === this.game.player && actual > 12.5 && !this.game.inCinematic) this.game.screen?.speedLines(0.16 * Math.min(1, (actual - 12.5) / 2), null, 0.1);
    // carry the rider
    if (this.rider) {
      const r = this.rider;
      const s = this.saddleWorld(new THREE.Vector3());
      r.pos.set(s.x, s.y - (r.rig ? r.rig.hipHeight * 0.92 : 0.9), s.z);
      if ((this.mountT ?? 1) < 0.55) {
        this.mountT += dt;
        const k = Math.min(1, this.mountT / 0.55);
        const e = k * k * (3 - 2 * k);
        r.pos.lerpVectors(this.mountFrom, r.pos, e);
        r.pos.y += Math.sin(k * Math.PI) * 0.45;
        r.mountK = e;
      } else r.mountK = 1;
      r.yaw = r.targetYaw = this.yaw;
      r.group.rotation.y = this.yaw;
      r.vel.set(0, 0, 0);
      r.onGround = true;
      r.moved = 0;
    }
    if (this.leaving) {
      const L = this.leaving;
      // a script took over (cinematic, encounter start) or the rider climbed back on: stop driving them
      if (L.r.mounted || this.game.inCinematic) { L.r.pinned = false; L.r.mountK = L.r.mounted ? L.r.mountK : 0; this.leaving = null; return; }
      L.t += dt;
      const k = Math.min(1, L.t / 0.45);
      const e = k * k * (3 - 2 * k);
      L.r.pos.lerpVectors(L.from, L.to, e);
      L.r.pos.y += Math.sin(k * Math.PI) * 0.35;
      L.r.mountK = 1 - e;
      L.r.onGround = true;
      if (k >= 1) { L.r.pinned = false; L.r.mountK = 0; this.leaving = null; }
    }
  }
}
