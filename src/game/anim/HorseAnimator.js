import * as THREE from 'three';

// Gait-based leg articulation for Slow Dancer's generated skeleton (see AutoRig.buildAutoHorse).
// Positive X-rotation swings a hanging leg backwards (horse faces +Z).

const GAITS = {
  //        stride Hz, upper amp, lower bend, body bob, body pitch, phase offsets (FL, FR, BL, BR)
  idle: { hz: 0, amp: 0, bend: 0, bob: 0, pitch: 0, off: [0, 0, 0, 0] },
  walk: { hz: 0.95, amp: 0.32, bend: 0.75, bob: 0.015, pitch: 0.01, off: [0.25, 0.75, 0.0, 0.5] },
  trot: { hz: 1.45, amp: 0.42, bend: 1.0, bob: 0.04, pitch: 0.015, off: [0.0, 0.5, 0.5, 0.0] },
  canter: { hz: 1.75, amp: 0.55, bend: 1.15, bob: 0.06, pitch: 0.05, off: [0.32, 0.5, 0.0, 0.32] },
  gallop: { hz: 2.3, amp: 0.72, bend: 1.3, bob: 0.07, pitch: 0.07, off: [0.45, 0.58, 0.0, 0.12] },
};
const ORDER = ['idle', 'walk', 'trot', 'canter', 'gallop'];

export function gaitForSpeed(v) {
  if (v < 0.3) return 'idle';
  if (v < 2.6) return 'walk';
  if (v < 5.2) return 'trot';
  if (v < 10.5) return 'canter';
  return 'gallop';
}

export class HorseAnimator {
  constructor(obj) {
    this.obj = obj;
    const g = (n) => obj.getObjectByName(n);
    this.body = g('h_body');
    this.neck = g('h_neck');
    this.head = g('h_head');
    this.tail = g('h_tail');
    this.legs = ['FL', 'FR', 'BL', 'BR'].map((k) => ({ k, u: g(`h_${k}_upper`), l: g(`h_${k}_lower`), h: g(`h_${k}_hoof`), front: k[0] === 'F' }));
    this.bodyBase = this.body ? this.body.position.clone() : new THREE.Vector3();
    this.phase = 0;
    this.blend = { ...GAITS.idle, off: [...GAITS.idle.off] };
    this.t = 0;
    this.lastFootfall = [0, 0, 0, 0];
    this.onFootfall = null;
    this.gait = 'idle';
    this.rear = 0; // 0..1 rearing up (summon / brake flourish)
  }

  update(dt, speed, turn = 0) {
    if (!this.body) return;
    this.t += dt;
    const target = GAITS[gaitForSpeed(speed)];
    this.gait = gaitForSpeed(speed);
    const k = 1 - Math.exp(-dt * 5);
    const b = this.blend;
    for (const key of ['hz', 'amp', 'bend', 'bob', 'pitch']) b[key] += (target[key] - b[key]) * k;
    for (let i = 0; i < 4; i += 1) {
      // blend offsets along the shortest way round the cycle
      let d = target.off[i] - b.off[i];
      d -= Math.round(d);
      b.off[i] += d * k;
    }
    // Stride rate scales gently with speed inside a gait.
    const ref = { idle: 1, walk: 1.6, trot: 3.8, canter: 7.5, gallop: 13 }[this.gait];
    const hz = b.hz * (0.75 + 0.25 * Math.min(1.6, speed / ref));
    this.phase = (this.phase + hz * dt) % 1;
    const TAU = Math.PI * 2;

    for (let i = 0; i < 4; i += 1) {
      const L = this.legs[i];
      if (!L.u) continue;
      const ph = (this.phase + b.off[i]) % 1;
      const s = Math.sin(ph * TAU);
      // stance: hoof moves backwards (positive), swing: forwards (negative) with knee fold
      const upper = s * b.amp;
      const swing = Math.max(0, Math.cos(ph * TAU));
      const fold = swing * b.bend;
      L.u.rotation.x = upper * (L.front ? 1 : 0.85) + (this.rear * (L.front ? -1.1 : 0.25));
      L.l.rotation.x = L.front ? fold : -fold * 0.85;
      if (L.front && this.rear > 0) L.l.rotation.x += this.rear * 1.6;
      L.h.rotation.x = L.front ? -fold * 0.4 : fold * 0.3;
      // Footfall events when a hoof begins its stance phase
      const prev = this.lastFootfall[i];
      if (b.hz > 0.1 && prev > 0.7 && ph < 0.3 && this.onFootfall) this.onFootfall(i, speed);
      this.lastFootfall[i] = ph;
    }
    const bobPh = this.phase * TAU * 2;
    this.body.position.y = this.bodyBase.y - Math.abs(Math.sin(bobPh / 2)) * b.bob * 2 + b.bob + this.rear * 0.25;
    this.body.position.z = this.bodyBase.z - this.rear * 0.2;
    this.body.rotation.x = Math.sin(this.phase * TAU) * b.pitch - this.rear * 0.75;
    this.body.rotation.z = -turn * 0.08 * Math.min(1, speed / 6);
    if (this.neck) {
      const idleLook = b.hz < 0.2 ? Math.sin(this.t * 0.5) * 0.1 : 0;
      this.neck.rotation.x = -Math.sin(this.phase * TAU) * b.pitch * 1.6 + 0.05 * Math.min(1, speed / 10) + this.rear * 0.5;
      this.neck.rotation.y = turn * 0.25 + idleLook;
    }
    if (this.head) this.head.rotation.x = Math.sin(this.phase * TAU + 1) * b.pitch * 0.8 - 0.05 * Math.min(1, speed / 10);
    if (this.tail) {
      this.tail.rotation.x = 0.25 * Math.min(1, speed / 8) + Math.sin(this.t * 2.3) * 0.05;
      this.tail.rotation.y = Math.sin(this.t * 1.7) * 0.12;
    }
  }
}
