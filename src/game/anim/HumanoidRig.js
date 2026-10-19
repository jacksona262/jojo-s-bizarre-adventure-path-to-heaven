import * as THREE from 'three';
import { solveTwoBone } from './IK';

// Drives any humanoid skeleton (authored or auto-generated) from a canonical pose.
// Canonical frame: character faces +Z, up is +Y, character's left is +X.
//
// pose = {
//   hips, spine, chest, neck, head: [pitch, yaw, roll] (radians, Euler YXZ, applied cumulatively)
//   uaL, faL, uaR, faR: limb directions in the chest frame
//   thL, shL, thR, shR: limb directions in the hips frame
//   handL, handR: optional [pitch,yaw,roll] relative to forearm
//   rootY: vertical offset of the whole model (m)
//   rootRot: optional [pitch,yaw,roll] of the whole body (knockdowns, tumbles, Stand lean)
//   rootPivot: height (m, character space) the body rotates about; default the pelvis
//   rootOff: optional [x, z] horizontal offset (m)
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
const _m4 = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _u = new THREE.Vector3();
const _l = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _qi = new THREE.Quaternion();
const _arrU = [0, 0, 0];
const _arrL = [0, 0, 0];

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
    const avg = (a, b) => (a && b ? (a + b) / 2 : a || b);
    this.len = {
      thigh: avg(len('thighL', 'shinL'), len('thighR', 'shinR')),
      shin: avg(len('shinL', 'footL'), len('shinR', 'footR')),
      upperArm: avg(len('upperArmL', 'foreArmL'), len('upperArmR', 'foreArmR')),
      foreArm: avg(len('foreArmL', 'handL'), len('foreArmR', 'handR')),
    };
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

  // Joint positions in character space (feet on y=0) for the upright rest pose. The gait
  // generator plans foot placement from these.
  measure(pose) {
    this.apply(pose);
    this.root.updateMatrixWorld(true);
    _m4.copy(this.root.matrixWorld).invert();
    const off = this.root.position;
    const P = (j) => {
      const b = this.bones[j];
      if (!b) return null;
      return b.getWorldPosition(new THREE.Vector3()).applyMatrix4(_m4).add(off);
    };
    const U = {
      pelvis: P('hips'), hipL: P('thighL'), hipR: P('thighR'), ankleL: P('footL'), ankleR: P('footR'),
      shoulderL: P('upperArmL'), shoulderR: P('upperArmR'), chest: P('chest'), head: P('head'),
    };
    if (!U.pelvis) U.pelvis = new THREE.Vector3(0, this.hipHeight, 0);
    if (!U.hipL) U.hipL = U.pelvis.clone().add(new THREE.Vector3(0.1, -0.05, 0));
    if (!U.hipR) U.hipR = U.pelvis.clone().add(new THREE.Vector3(-0.1, -0.05, 0));
    if (!U.ankleL) U.ankleL = new THREE.Vector3(U.hipL.x, 0.08, 0);
    if (!U.ankleR) U.ankleR = new THREE.Vector3(U.hipR.x, 0.08, 0);
    U.ankleH = Math.max(0.03, (U.ankleL.y + U.ankleR.y) / 2);
    U.hipW = Math.max(0.05, (U.hipL.x - U.hipR.x) / 2);
    // hip joints relative to the pelvis bone, in the (unrotated) hips frame
    U.hipOffL = U.hipL.clone().sub(U.pelvis);
    U.hipOffR = U.hipR.clone().sub(U.pelvis);
    this.U = U;
    if (!this.len.thigh) this.len.thigh = (U.hipL.y - U.ankleH) * 0.52;
    if (!this.len.shin) this.len.shin = (U.hipL.y - U.ankleH) * 0.48;
    return U;
  }

  // World point -> root-local (model frame) point.
  toModel(world, out) {
    _m4.copy(this.root.matrixWorld).invert();
    return out.copy(world).applyMatrix4(_m4);
  }

  // Post-pose two-bone IK: place the ankle (legs) or wrist (arms) at a world target. Must run
  // after apply() in the same frame. weight blends from the posed limb towards the solution.
  // poleModel: bend direction in the limb's frame (hips frame for legs, chest frame for arms).
  reach(side, limb, targetWorld, weight = 1, poleModel = null) {
    if (weight <= 0.001) return false;
    const leg = limb === 'leg';
    const upperJ = leg ? `thigh${side}` : `upperArm${side}`;
    const lowerJ = leg ? `shin${side}` : `foreArm${side}`;
    const endJ = leg ? `foot${side}` : `hand${side}`;
    const ub = this.bones[upperJ];
    if (!ub || !this.bones[lowerJ] || !this.dirs[upperJ]) return false;
    const a = leg ? this.len.thigh : this.len.upperArm;
    const b = leg ? this.len.shin : this.len.foreArm;
    if (!a || !b) return false;
    this.root.updateWorldMatrix(true, false);
    this.root.getWorldQuaternion(_qc);
    _qci.copy(_qc).invert();
    ub.parent.updateWorldMatrix(true, false);
    ub.updateMatrix();
    _a.setFromMatrixPosition(_m4.multiplyMatrices(ub.parent.matrixWorld, ub.matrix));
    _m4.copy(this.root.matrixWorld).invert();
    _a.applyMatrix4(_m4);
    _b.copy(targetWorld).applyMatrix4(_m4).sub(_a);
    const frame = leg ? this.D.hips : this.D.chest;
    _qi.copy(frame).invert();
    _b.applyQuaternion(_qi);
    if (poleModel) _pole.copy(poleModel);
    else if (leg) _pole.set(side === 'L' ? 0.08 : -0.08, 0, 1);
    else _pole.set(side === 'L' ? 0.45 : -0.45, -0.55, -0.7);
    solveTwoBone(_b, a, b, _pole, _u, _l);
    if (weight < 1 && this._last) {
      const pu = this._last[leg ? `th${side}` : `ua${side}`];
      const pl = this._last[leg ? `sh${side}` : `fa${side}`];
      if (pu && pl) {
        _u.lerp(_a.set(pu[0], pu[1], pu[2]).normalize(), 1 - weight).normalize();
        _l.lerp(_a.set(pl[0], pl[1], pl[2]).normalize(), 1 - weight).normalize();
      }
    }
    _arrU[0] = _u.x; _arrU[1] = _u.y; _arrU[2] = _u.z;
    _arrL[0] = _l.x; _arrL[1] = _l.y; _arrL[2] = _l.z;
    const endRot = leg ? 'level' : this._last?.[`hand${side}`];
    this._limb(upperJ, lowerJ, endJ, _arrU, _arrL, frame, endRot);
    return true;
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
    this._last = pose;
    const rr = pose.rootRot;
    if (rr || pose.rootOff) {
      qFromArr(rr, root.quaternion);
      const piv = (pose.rootPivot ?? (this.U ? this.U.pelvis.y : this.hipHeight)) - this.groundY;
      _v.set(0, piv, 0).applyQuaternion(root.quaternion);
      root.position.set((pose.rootOff?.[0] || 0) - _v.x, this.groundY + (pose.rootY || 0) + piv - _v.y, (pose.rootOff?.[1] || 0) - _v.z);
      this._rooted = true;
    } else if (this._rooted) {
      root.quaternion.identity();
      root.position.set(0, this.groundY + (pose.rootY || 0), 0);
      this._rooted = false;
    }
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
    if (!this._rooted) root.position.y = this.groundY + (pose.rootY || 0);
  }

  // World position of a joint (for hitboxes, VFX anchors).
  jointWorld(joint, out = new THREE.Vector3()) {
    const b = this.bones[joint];
    if (!b) return this.root.getWorldPosition(out);
    return b.getWorldPosition(out);
  }
}
