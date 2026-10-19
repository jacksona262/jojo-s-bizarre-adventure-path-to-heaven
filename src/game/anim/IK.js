import * as THREE from 'three';

// Analytic two-bone IK shared by the gait generator (pose space) and the post-pose solvers
// (foot planting on terrain, Stand fists reaching their target).

const _t = new THREE.Vector3();
const _p = new THREE.Vector3();
const _k = new THREE.Vector3();

// target: vector from the root joint to the desired end position (any frame).
// a, b: upper/lower bone lengths. pole: direction the middle joint should bend towards.
// Writes unit directions into outUpper / outLower (Vector3). Returns the reached distance ratio.
export function solveTwoBone(target, a, b, pole, outUpper, outLower) {
  const d = target.length();
  if (d < 1e-5) {
    outUpper.copy(pole).normalize();
    outLower.copy(pole).normalize().negate();
    return 0;
  }
  _t.copy(target).divideScalar(d);
  const dist = Math.min(Math.max(d, Math.abs(a - b) + 1e-3), (a + b) * 0.9995);
  const cosA = (a * a + dist * dist - b * b) / (2 * a * dist);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _p.copy(pole).addScaledVector(_t, -pole.dot(_t));
  if (_p.lengthSq() < 1e-8) {
    // pole parallel to the target: pick any perpendicular
    _p.set(0, 0, 1).addScaledVector(_t, -_t.z);
    if (_p.lengthSq() < 1e-8) _p.set(1, 0, 0).addScaledVector(_t, -_t.x);
  }
  _p.normalize();
  outUpper.copy(_t).multiplyScalar(cosA).addScaledVector(_p, sinA);
  _k.copy(outUpper).multiplyScalar(a);
  outLower.copy(_t).multiplyScalar(dist).sub(_k).normalize();
  return d / (a + b);
}

// Closest distance between segments p1-q1 and p2-q2 (used for swept fist hitboxes).
const _d1 = new THREE.Vector3();
const _d2 = new THREE.Vector3();
const _r = new THREE.Vector3();
const _c1 = new THREE.Vector3();
const _c2 = new THREE.Vector3();
export function segmentDistance(p1, q1, p2, q2) {
  _d1.subVectors(q1, p1);
  _d2.subVectors(q2, p2);
  _r.subVectors(p1, p2);
  const a = _d1.dot(_d1); const e = _d2.dot(_d2); const f = _d2.dot(_r);
  let s; let t;
  if (a <= 1e-9 && e <= 1e-9) return p1.distanceTo(p2);
  if (a <= 1e-9) { s = 0; t = Math.min(1, Math.max(0, f / e)); } else {
    const c = _d1.dot(_r);
    if (e <= 1e-9) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else {
      const b = _d1.dot(_d2);
      const den = a * e - b * b;
      s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  _c1.copy(p1).addScaledVector(_d1, s);
  _c2.copy(p2).addScaledVector(_d2, t);
  return _c1.distanceTo(_c2);
}
