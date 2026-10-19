import * as THREE from 'three';

// Secondary motion for rigs that ship the bones for it (see docs/V2_AUDIT.md): spring-bone hair
// and coat/belt strips, a head-sphere collider so hair never sinks into the skull, plus
// blinking and jaw movement on rigs with facial bones. Auto-rigged models have none of these
// bones; the classes simply find nothing and cost nothing.

const _head = new THREE.Vector3();
const _rest = new THREE.Vector3();
const _next = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _pq = new THREE.Quaternion();
const _pqi = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const _wq = new THREE.Quaternion();
const _ws = new THREE.Vector3();
const _m = new THREE.Matrix4();
const GRAV = new THREE.Vector3(0, -1, 0);

const HAIR = /hair|ponytail|bang|fringe/i;
const CLOTH = /belt|coat|skirt|cape|scarf|tail(?!bone)|ribbon|mant|robe/i;

export class SpringBones {
  constructor(rig) {
    this.rig = rig;
    this.joints = [];
    const mapped = new Set(Object.values(rig.bones));
    const cand = [];
    rig.root.traverse((o) => {
      if (!o.isBone || mapped.has(o)) return;
      const hair = HAIR.test(o.name);
      const cloth = !hair && CLOTH.test(o.name);
      if (hair || cloth) cand.push({ bone: o, hair });
    });
    if (!cand.length) return;
    rig.root.updateMatrixWorld(true);
    const set = new Set(cand.map((c) => c.bone));
    for (const { bone, hair } of cand) {
      // tail: first spring child, else any child, else continue the parent->bone direction
      const kid = bone.children.find((k) => k.isBone && set.has(k)) || bone.children.find((k) => k.isBone);
      let tailLocal;
      if (kid) tailLocal = kid.position.clone();
      else tailLocal = bone.position.clone().applyQuaternion(_dq.copy(bone.quaternion).invert()).multiplyScalar(0.7);
      if (tailLocal.lengthSq() < 1e-10) continue;
      let depth = 0;
      for (let p = bone.parent; p && set.has(p); p = p.parent) depth += 1;
      this.joints.push({
        bone, hair, depth,
        restQ: bone.quaternion.clone(),
        axis: tailLocal.clone().normalize(),
        lenLocal: tailLocal.length(),
        cur: new THREE.Vector3(), vel: new THREE.Vector3(), init: false,
        stiff: hair ? 95 : 55, drag: hair ? 9 : 6, grav: hair ? 2.6 : 5.5,
      });
    }
    // parents before children
    this.joints.sort((a, b) => a.depth - b.depth);
    this.headBone = rig.bones.head || null;
    this.lastHead = new THREE.Vector3();
    this.enabled = this.joints.length > 0;
  }

  reset() { for (const j of this.joints) j.init = false; }

  update(dt, scale = 1) {
    if (!this.enabled || dt < 1e-4) return;
    const h = Math.min(dt, 1 / 30);
    const root = this.rig.root;
    root.updateMatrixWorld(true);
    let headC = null; let headR = 0;
    if (this.headBone) {
      headC = this.headBone.getWorldPosition(_tmp).clone();
      headC.y += 0.07 * scale;
      headR = 0.105 * scale;
      if (headC.distanceToSquared(this.lastHead) > 2.25) this.reset();
      this.lastHead.copy(headC);
    }
    for (const j of this.joints) {
      const b = j.bone;
      const parent = b.parent;
      parent.getWorldQuaternion(_pq);
      _head.setFromMatrixPosition(_m.multiplyMatrices(parent.matrixWorld, b.matrix.compose(b.position, j.restQ, b.scale)));
      _ws.setFromMatrixScale(parent.matrixWorld);
      const len = j.lenLocal * _ws.x;
      _wq.copy(_pq).multiply(j.restQ);
      _rest.copy(j.axis).applyQuaternion(_wq);
      if (!j.init) {
        j.cur.copy(_head).addScaledVector(_rest, len);
        j.vel.set(0, 0, 0);
        j.init = true;
      }
      // damped spring towards the rest tail position, plus gravity (time-step independent)
      _tmp.copy(_head).addScaledVector(_rest, len).sub(j.cur).multiplyScalar(j.stiff);
      _tmp.addScaledVector(GRAV, j.grav);
      j.vel.multiplyScalar(Math.exp(-j.drag * h)).addScaledVector(_tmp, h);
      _next.copy(j.cur).addScaledVector(j.vel, h);
      _next.sub(_head).normalize().multiplyScalar(len).add(_head);
      if (headC) {
        _tmp.copy(_next).sub(headC);
        const d = _tmp.length();
        if (d < headR) _next.copy(headC).addScaledVector(_tmp.normalize(), headR);
        _next.sub(_head).normalize().multiplyScalar(len).add(_head);
      }
      j.vel.copy(_next).sub(j.cur).divideScalar(h);
      j.cur.copy(_next);
      // rotate the bone so its axis points at the simulated tail
      _tmp.copy(_next).sub(_head).normalize();
      _dq.setFromUnitVectors(_rest, _tmp);
      _pqi.copy(_pq).invert();
      b.quaternion.copy(_pqi).multiply(_dq).multiply(_pq).multiply(j.restQ);
      b.updateMatrixWorld(true);
    }
  }
}

// Blinks and jaw. Axis signs per rig family were verified in the animation viewer (/lab).
export class FaceRig {
  constructor(rig) {
    this.rig = rig;
    this.jaw = null;
    this.lidsUpper = [];
    this.lidsLower = [];
    rig.root.traverse((o) => {
      if (!o.isBone) return;
      const n = o.name.toLowerCase();
      if (/jaw/.test(n) && !this.jaw) this.jaw = o;
      else if (/eyelid/.test(n) && /upper/.test(n) && !/corner/.test(n)) this.lidsUpper.push(o);
      else if (/eyelid/.test(n) && /lower/.test(n) && !/corner/.test(n)) this.lidsLower.push(o);
    });
    // local axis that corresponds to the character's left (+X canonical) at bind
    const axisFor = (b) => {
      const inv = rig.root.matrixWorld.clone().invert();
      const q = new THREE.Quaternion();
      b.updateWorldMatrix(true, false);
      new THREE.Matrix4().multiplyMatrices(inv, b.matrixWorld).decompose(new THREE.Vector3(), q, new THREE.Vector3());
      return new THREE.Vector3(1, 0, 0).applyQuaternion(q.invert()).normalize();
    };
    this.bones = [];
    if (this.jaw) this.bones.push({ b: this.jaw, q: this.jaw.quaternion.clone(), ax: axisFor(this.jaw) });
    for (const b of this.lidsUpper) this.bones.push({ b, q: b.quaternion.clone(), ax: axisFor(b), lid: 1 });
    for (const b of this.lidsLower) this.bones.push({ b, q: b.quaternion.clone(), ax: axisFor(b), lid: -1 });
    this.enabled = this.bones.length > 0;
    this.blinkT = 2 + Math.random() * 3;
    this.blink = 0;
    this.jawOpen = 0;
    this.talk = 0;
    this.t = 0;
    this.jawSign = 1;
    this.lidSign = 1;
    this.lidAngle = 0;     // enabled per rig once verified
  }

  update(dt, talking) {
    if (!this.enabled) return;
    this.t += dt;
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinkT = 2.5 + Math.random() * 4; this.blink = 1; }
    const bl = this.blink > 0 ? Math.sin((1 - this.blink) * Math.PI) : 0;
    this.blink = Math.max(0, this.blink - dt / 0.16);
    this.talk += ((talking ? 1 : 0) - this.talk) * Math.min(1, dt * 10);
    const target = this.talk * (0.35 + 0.65 * Math.abs(Math.sin(this.t * 11) * Math.sin(this.t * 4.3)));
    this.jawOpen += (target - this.jawOpen) * Math.min(1, dt * 20);
    for (const e of this.bones) {
      let a = 0;
      if (e.lid) a = bl * this.lidAngle * this.lidSign * e.lid;
      else a = this.jawOpen * 0.32 * this.jawSign;
      _dq.setFromAxisAngle(e.ax, a);
      e.b.quaternion.copy(e.q).multiply(_dq);
    }
  }
}
