import * as THREE from 'three';

// Drives any humanoid skeleton (authored or auto-generated) from a canonical pose.
// Canonical frame: character faces +Z, up is +Y, character's left is +X.
//
// pose = {
//   hips, spine, chest, neck, head: [pitch, yaw, roll] (radians, Euler YXZ, applied cumulatively)
//   uaL, faL, uaR, faR: limb directions in the chest frame
//   thL, shL, thR, shR: limb directions in the hips frame
//   handL, handR: optional [pitch,yaw,roll] relative to forearm
//   rootY: vertical offset of the whole model (m)
// }

const TORSO = ['hips', 'spine', 'spine2', 'chest', 'neck', 'head'];
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _qci = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

function qFromArr(a, out) {
  if (!a) return out.identity();
  _e.set(a[0] || 0, a[1] || 0, a[2] || 0, 'YXZ');
  return out.setFromEuler(_e);
}

export class HumanoidRig {
  constructor(root, jointNames) {
    this.root = root;
    this.inner = root.getObjectByName('inner') || null;
    this.bones = {};
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(_qc);
    _qci.copy(_qc).invert();
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    this.bind = {};
    for (const [joint, name] of Object.entries(jointNames)) {
      const b = root.getObjectByName(name);
      if (!b) continue;
      this.bones[joint] = b;
      const wq = b.getWorldQuaternion(new THREE.Quaternion());
      this.bind[joint] = {
        local: b.quaternion.clone(),
        localPos: b.position.clone(),
        model: _qci.clone().multiply(wq),
        pos: b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv),
      };
    }
    const dir = (a, b) => {
      if (!this.bind[a] || !this.bind[b]) return null;
      return this.bind[b].pos.clone().sub(this.bind[a].pos).normalize();
    };
    this.dirs = {
      upperArmL: dir('upperArmL', 'foreArmL'), foreArmL: dir('foreArmL', 'handL') || dir('upperArmL', 'foreArmL'),
      upperArmR: dir('upperArmR', 'foreArmR'), foreArmR: dir('foreArmR', 'handR') || dir('upperArmR', 'foreArmR'),
      thighL: dir('thighL', 'shinL'), shinL: dir('shinL', 'footL'),
      thighR: dir('thighR', 'shinR'), shinR: dir('shinR', 'footR'),
    };
    const len = (a, b) => (this.bind[a] && this.bind[b] ? this.bind[a].pos.distanceTo(this.bind[b].pos) : 0);
    this.legLength = len('thighL', 'shinL') + len('shinL', 'footL');
    this.hipHeight = this.bind.hips ? this.bind.hips.pos.y : 1;
    this.chestHeight = this.bind.chest ? this.bind.chest.pos.y : 1.4;
    this.headHeight = this.bind.head ? this.bind.head.pos.y : 1.7;
    this.rootBaseY = this.inner ? this.inner.position.y : 0;
    this.D = {};
    for (const j of [...TORSO, 'limb']) this.D[j] = new THREE.Quaternion();
    this._Rupper = new THREE.Quaternion();
    this._Rlower = new THREE.Quaternion();
    this.valid = !!(this.bones.upperArmL || this.bones.thighL);
    this._computeTorsoCorrection();
    this.groundY = 0;
  }

  // Several supplied rigs are bound in action poses (The World, Valentine, D4C, Giorno...).
  // Build per-joint corrections so an identity torso pose means upright and facing +Z.
  _computeTorsoCorrection() {
    this.C = {};
    const P = (j) => (this.bind[j] ? this.bind[j].pos : null);
    const sub = (a, b) => (a && b ? a.clone().sub(b) : null);
    const leftHips = sub(P('thighL'), P('thighR')) || new THREE.Vector3(1, 0, 0);
    const leftChest = sub(P('upperArmL'), P('upperArmR')) || sub(P('clavL'), P('clavR')) || leftHips.clone();
    const chain = ['hips', 'spine', 'spine2', 'chest', 'neck', 'head'].filter((j) => this.bind[j]);
    const basis = (left, up) => {
      const u = up.clone().normalize();
      const l = left.clone().addScaledVector(u, -left.dot(u)).normalize();
      const f = new THREE.Vector3().crossVectors(l, u).normalize();
      const m = new THREE.Matrix4().makeBasis(l, u, f);
      return new THREE.Quaternion().setFromRotationMatrix(m);
    };
    for (let i = 0; i < chain.length; i += 1) {
      const j = chain[i];
      let up;
      if (i < chain.length - 1) up = sub(P(chain[i + 1]), P(j));
      else up = sub(P(j), P(chain[i - 1] || j));
      if (!up || up.lengthSq() < 1e-8) up = new THREE.Vector3(0, 1, 0);
      const left = (j === 'hips' || j === 'spine') ? leftHips : leftChest;
      const B = basis(left, up);
      // correction maps the bind basis onto canonical axes: C = I * B^-1
      const C = B.clone().invert();
      // Ignore tiny corrections so upright rigs stay exactly as authored.
      if (2 * Math.acos(Math.min(1, Math.abs(C.w))) < 0.12) C.identity();
      this.C[j] = C;
    }
  }

  // Measure how far the rest pose puts the soles below/above y=0 and compensate.
  calibrateGround(pose) {
    this.groundY = 0;
    this.apply(pose);
    this.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    let minY = Infinity;
    this.root.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.computeBoundingBox();
      const b = o.boundingBox.clone().applyMatrix4(o.matrixWorld).applyMatrix4(inv);
      minY = Math.min(minY, b.min.y);
    });
    if (Number.isFinite(minY)) this.groundY = -minY;
    return this.groundY;
  }

  // Set a bone so that its model-space orientation equals M.
  _setModel(joint, M) {
    const b = this.bones[joint];
    if (!b) return;
    b.parent.updateWorldMatrix(true, false);
    b.parent.getWorldQuaternion(_qp);
    // desired world = Qc * M ; local = inv(parentWorld) * desired
    _q2.copy(_qc).multiply(M);
    b.quaternion.copy(_qp.invert()).multiply(_q2);
  }

  _limb(upperJ, lowerJ, endJ, dirUpper, dirLower, frame, endRot) {
    const bu = this.dirs[upperJ];
    const bl = this.dirs[lowerJ];
    if (!bu || !this.bones[upperJ]) return;
    _v.set(dirUpper[0], dirUpper[1], dirUpper[2]).normalize().applyQuaternion(frame);
    this._Rupper.setFromUnitVectors(bu, _v);
    _q.copy(this._Rupper).multiply(this.bind[upperJ].model);
    this._setModel(upperJ, _q);
    if (bl && this.bones[lowerJ]) {
      _v2.copy(bl).applyQuaternion(this._Rupper);
      _v.set(dirLower[0], dirLower[1], dirLower[2]).normalize().applyQuaternion(frame);
      this._Rlower.setFromUnitVectors(_v2, _v).multiply(this._Rupper);
      _q.copy(this._Rlower).multiply(this.bind[lowerJ].model);
      this._setModel(lowerJ, _q);
      if (endJ && this.bones[endJ]) {
        if (endRot === 'level') {
          _q.copy(this.D.hips).multiply(this.bind[endJ].model);
        } else {
          _q.copy(this._Rlower);
          if (endRot) _q.multiply(qFromArr(endRot, _q2));
          _q.multiply(this.bind[endJ].model);
        }
        this._setModel(endJ, _q);
      }
    }
  }

  apply(pose) {
    if (!this.valid) return;
    const root = this.root;
    root.updateWorldMatrix(true, false);
    root.getWorldQuaternion(_qc);
    _qci.copy(_qc).invert();
    const accQ = this._accQ || (this._accQ = new THREE.Quaternion());
    accQ.identity();
    for (const j of TORSO) {
      const key = j === 'spine2' ? null : j;
      if (key && pose[key]) accQ.multiply(qFromArr(pose[key], _q));
      this.D[j].copy(accQ);
      if (this.bones[j]) {
        _q.copy(accQ);
        if (this.C[j]) _q.multiply(this.C[j]);
        _q.multiply(this.bind[j].model);
        this._setModel(j, _q);
      }
    }
    const acc = this.D.chest;
    for (const side of ['L', 'R']) {
      const clav = `clav${side}`;
      if (this.bones[clav]) {
        _q.copy(acc);
        if (this.C.chest) _q.multiply(this.C.chest);
        const sh = pose[`clav${side}`];
        if (sh) _q.multiply(qFromArr(sh, new THREE.Quaternion()));
        _q.multiply(this.bind[clav].model);
        this._setModel(clav, _q);
      }
      this._limb(`upperArm${side}`, `foreArm${side}`, `hand${side}`, pose[`ua${side}`], pose[`fa${side}`], acc, pose[`hand${side}`]);
    }
    for (const side of ['L', 'R']) {
      this._limb(`thigh${side}`, `shin${side}`, `foot${side}`, pose[`th${side}`], pose[`sh${side}`], this.D.hips, 'level');
    }
    root.position.y = this.groundY + (pose.rootY || 0);
  }

  // World position of a joint (for hitboxes, VFX anchors).
  jointWorld(joint, out = new THREE.Vector3()) {
    const b = this.bones[joint];
    if (!b) return this.root.getWorldPosition(out);
    return b.getWorldPosition(out);
  }
}
