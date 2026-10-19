// Procedural pose library. All poses use the canonical frame of HumanoidRig
// (facing +Z, left = +X). Limb entries are directions; torso entries are Euler [pitch, yaw, roll].

const { sin, cos, max, min, PI, abs } = Math;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const dirFromAngles = (x, pitchFwd) => [x, -cos(pitchFwd), sin(pitchFwd)];

export const LIMBS = ['uaL', 'faL', 'uaR', 'faR', 'thL', 'shL', 'thR', 'shR'];
export const EULERS = ['hips', 'spine', 'chest', 'neck', 'head', 'handL', 'handR', 'clavL', 'clavR'];

export function rest() {
  return {
    hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
    uaL: [0.22, -1, 0.02], faL: [0.12, -1, 0.16], uaR: [-0.22, -1, 0.02], faR: [-0.12, -1, 0.16],
    thL: [0.05, -1, 0], shL: [0.03, -1, -0.03], thR: [-0.05, -1, 0], shR: [-0.03, -1, -0.03],
    rootY: 0,
  };
}

export function lerpPose(a, b, t, out = rest()) {
  if (t <= 0) return copyPose(a, out);
  if (t >= 1) return copyPose(b, out);
  for (const k of LIMBS) {
    const pa = a[k]; const pb = b[k]; const o = out[k] || (out[k] = [0, 0, 0]);
    o[0] = pa[0] + (pb[0] - pa[0]) * t;
    o[1] = pa[1] + (pb[1] - pa[1]) * t;
    o[2] = pa[2] + (pb[2] - pa[2]) * t;
  }
  for (const k of EULERS) {
    const pa = a[k] || ZERO; const pb = b[k] || ZERO;
    if (!a[k] && !b[k]) { delete out[k]; continue; }
    const o = out[k] || (out[k] = [0, 0, 0]);
    o[0] = pa[0] + (pb[0] - pa[0]) * t;
    o[1] = pa[1] + (pb[1] - pa[1]) * t;
    o[2] = pa[2] + (pb[2] - pa[2]) * t;
  }
  out.rootY = (a.rootY || 0) + ((b.rootY || 0) - (a.rootY || 0)) * t;
  lerpRoot(a, b, t, out);
  return out;
}
const ZERO = [0, 0, 0];
const ZERO2 = [0, 0];

// Whole-body channels: rootRot (Euler), rootOff ([x, z]), rootPivot, drop (0..1 of pelvis height).
function lerpRoot(a, b, t, out) {
  if (a.rootRot || b.rootRot) {
    const pa = a.rootRot || ZERO; const pb = b.rootRot || ZERO;
    const o = out.rootRot && out.rootRot !== pa && out.rootRot !== pb ? out.rootRot : (out.rootRot = [0, 0, 0]);
    o[0] = pa[0] + (pb[0] - pa[0]) * t; o[1] = pa[1] + (pb[1] - pa[1]) * t; o[2] = pa[2] + (pb[2] - pa[2]) * t;
  } else delete out.rootRot;
  if (a.rootOff || b.rootOff) {
    const pa = a.rootOff || ZERO2; const pb = b.rootOff || ZERO2;
    out.rootOff = [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t];
  } else delete out.rootOff;
  const pv = b.rootPivot ?? a.rootPivot;
  if (pv !== undefined) out.rootPivot = pv; else delete out.rootPivot;
  if (a.drop || b.drop) out.drop = (a.drop || 0) + ((b.drop || 0) - (a.drop || 0)) * t; else delete out.drop;
}

// Copy without allocating (reuses the destination's arrays).
export function assignPose(a, out) {
  for (const k of LIMBS) {
    const s = a[k]; const o = out[k] || (out[k] = [0, 0, 0]);
    o[0] = s[0]; o[1] = s[1]; o[2] = s[2];
  }
  for (const k of EULERS) {
    const s = a[k];
    if (!s) { delete out[k]; continue; }
    const o = out[k] || (out[k] = [0, 0, 0]);
    o[0] = s[0]; o[1] = s[1]; o[2] = s[2];
  }
  out.rootY = a.rootY || 0;
  if (a.rootRot) { const o = out.rootRot || (out.rootRot = [0, 0, 0]); o[0] = a.rootRot[0]; o[1] = a.rootRot[1]; o[2] = a.rootRot[2]; } else delete out.rootRot;
  if (a.rootOff) out.rootOff = [a.rootOff[0], a.rootOff[1]]; else delete out.rootOff;
  if (a.rootPivot !== undefined) out.rootPivot = a.rootPivot; else delete out.rootPivot;
  if (a.drop) out.drop = a.drop; else delete out.drop;
  return out;
}

export function copyPose(a, out = rest()) {
  for (const k of LIMBS) out[k] = [a[k][0], a[k][1], a[k][2]];
  for (const k of EULERS) { if (a[k]) out[k] = [a[k][0], a[k][1], a[k][2]]; else delete out[k]; }
  out.rootY = a.rootY || 0;
  if (a.rootRot) out.rootRot = [a.rootRot[0], a.rootRot[1], a.rootRot[2]]; else delete out.rootRot;
  if (a.rootOff) out.rootOff = [a.rootOff[0], a.rootOff[1]]; else delete out.rootOff;
  if (a.rootPivot !== undefined) out.rootPivot = a.rootPivot; else delete out.rootPivot;
  if (a.drop) out.drop = a.drop; else delete out.drop;
  return out;
}

export function mirror(p) {
  const o = rest();
  const m = (v) => [-v[0], v[1], v[2]];
  o.uaL = m(p.uaR); o.faL = m(p.faR); o.uaR = m(p.uaL); o.faR = m(p.faL);
  o.thL = m(p.thR); o.shL = m(p.shR); o.thR = m(p.thL); o.shR = m(p.shL);
  for (const k of ['hips', 'spine', 'chest', 'neck', 'head']) if (p[k]) o[k] = [p[k][0], -p[k][1], -p[k][2]];
  if (p.handR) o.handL = [p.handR[0], -p.handR[1], -p.handR[2]];
  if (p.handL) o.handR = [p.handL[0], -p.handL[1], -p.handL[2]];
  o.rootY = p.rootY || 0;
  if (p.rootRot) o.rootRot = [p.rootRot[0], -p.rootRot[1], -p.rootRot[2]];
  if (p.rootOff) o.rootOff = [-p.rootOff[0], p.rootOff[1]];
  if (p.rootPivot !== undefined) o.rootPivot = p.rootPivot;
  if (p.drop) o.drop = p.drop;
  return o;
}

// ---------------------------------------------------------------- basics
export function idle(t, style = 'neutral') {
  const p = rest();
  const br = sin(t * 1.6);
  p.chest = [-0.03 + br * 0.015, 0, 0];
  p.head = [0.02 - br * 0.01, sin(t * 0.37) * 0.06, 0];
  p.uaL = [0.24 + br * 0.01, -1, 0.03];
  p.uaR = [-0.24 - br * 0.01, -1, 0.03];
  if (style === 'dio') {
    // Upright, chest forward, chin raised, one hand loosely at the hip.
    p.spine = [-0.05, 0.08, 0];
    p.chest = [-0.07 + br * 0.012, 0.05, 0];
    p.head = [-0.08, -0.12 + sin(t * 0.37) * 0.05, 0.04];
    p.uaR = [-0.55, -0.8, -0.1];
    p.faR = [0.35, -0.55, 0.5];
    p.thL = [0.1, -1, 0.04];
    p.thR = [-0.08, -1, -0.04];
  } else if (style === 'stand') {
    p.chest = [-0.06 + br * 0.02, 0, 0];
    p.uaL = [0.5, -0.8, 0.35]; p.faL = [-0.25, 0.4, 0.9];
    p.uaR = [-0.5, -0.8, 0.35]; p.faR = [0.25, 0.4, 0.9];
    p.thL = [0.12, -1, 0.15]; p.shL = [0.08, -1, -0.15];
    p.thR = [-0.12, -1, 0.05]; p.shR = [-0.08, -1, -0.25];
  } else if (style === 'boss') {
    p.chest = [-0.05 + br * 0.015, 0, 0];
    p.uaL = [0.35, -0.9, 0.2]; p.faL = [0.0, -0.2, 1];
    p.uaR = [-0.35, -0.9, 0.2]; p.faR = [0.0, -0.2, 1];
    p.thL = [0.16, -1, 0.1]; p.thR = [-0.16, -1, -0.12];
    p.shL = [0.12, -1, -0.05]; p.shR = [-0.12, -1, -0.1];
    p.rootY = -0.04;
  } else if (style === 'old') {
    p.spine = [0.35, 0, 0]; p.chest = [0.2, 0, 0]; p.head = [-0.35, 0, 0];
    p.uaL = [0.15, -0.9, 0.4]; p.faL = [-0.2, -0.3, 1];
    p.uaR = [-0.15, -0.9, 0.4]; p.faR = [0.2, -0.3, 1];
  }
  return p;
}

// speed: 0 idle .. 1 walk .. 2 run .. 3 sprint
export function locomotion(phase, speed, t = 0) {
  const p = rest();
  const s = min(speed, 3);
  const run = clamp01(s - 1);
  const sprint = clamp01(s - 2);
  const legAmp = 0.42 + run * 0.35 + sprint * 0.12;
  const kneeAmp = 0.55 + run * 0.9;
  const armAmp = 0.3 + run * 0.5;
  for (const [side, off] of [['L', 0], ['R', PI]]) {
    const ph = phase + off;
    const x = side === 'L' ? 0.05 : -0.05;
    const a = sin(ph) * legAmp;
    const bend = max(0, -cos(ph)) * kneeAmp + 0.08 + run * 0.12;
    p[`th${side}`] = dirFromAngles(x, a);
    p[`sh${side}`] = dirFromAngles(x * 0.6, a - bend);
    const aa = -sin(ph) * armAmp;
    const ax = side === 'L' ? 0.2 : -0.2;
    p[`ua${side}`] = dirFromAngles(ax, aa);
    p[`fa${side}`] = dirFromAngles(ax * 0.5, aa + 0.25 + run * 1.0);
  }
  p.spine = [0.04 + run * 0.12 + sprint * 0.1, sin(phase) * 0.06, 0];
  p.chest = [0.02, -sin(phase) * (0.08 + run * 0.06), 0];
  p.head = [-0.04 - run * 0.1, 0, 0];
  p.rootY = -abs(sin(phase)) * (0.02 + run * 0.05) - run * 0.03;
  if (s < 1) return lerpPose(idle(t), p, s);
  return p;
}

export function airborne(t, vy) {
  const p = rest();
  const tuck = clamp01(-vy * 0.1 + 0.5);
  p.thL = [0.08, -0.8, 0.5 * tuck]; p.shL = [0.05, -1, -0.4 * tuck];
  p.thR = [-0.08, -1, -0.1]; p.shR = [-0.05, -1, -0.6 * tuck];
  p.uaL = [0.7, -0.4, 0.2]; p.faL = [0.5, 0.2, 0.4];
  p.uaR = [-0.7, -0.4, 0.2]; p.faR = [-0.5, 0.2, 0.4];
  return p;
}

// ---------------------------------------------------------------- combat
// side: 'L' or 'R'; t: 0..1 normalised
export function punch(side, t, power = 1) {
  const p = guardStance();
  const wind = smooth(t / 0.3);
  const strike = smooth((t - 0.25) / 0.2);
  const recover = smooth((t - 0.7) / 0.3);
  const s = side === 'L' ? 1 : -1;
  const k = strike * (1 - recover);
  const w = wind * (1 - strike);
  const ua = `ua${side}`; const fa = `fa${side}`;
  p[ua] = [s * (0.35 + w * 0.4 - k * 0.3), -0.6 + w * 0.2 + k * 0.62, 0.4 - w * 0.6 + k * 0.6];
  p[fa] = [s * (0.1 - k * 0.12), -0.1 + w * 0.6 + k * 0.12, 0.9 - w * 0.4 + k * 0.1];
  const twist = (w * 0.35 - k * 0.55) * s * power;
  p.spine = [0.08 + k * 0.08, twist * 0.5, 0];
  p.chest = [0.02, twist * 0.6, 0];
  p.head = [0, -twist * 0.7, 0];
  return p;
}

export function heavy(t) {
  const p = guardStance();
  const wind = smooth(t / 0.4);
  const strike = smooth((t - 0.4) / 0.15);
  const recover = smooth((t - 0.75) / 0.25);
  const k = strike * (1 - recover);
  const w = wind * (1 - strike);
  p.uaR = [-0.6 - w * 0.2 + k * 0.5, -0.3 + w * 0.6 + k * 0.32, -0.3 + w * -0.4 + k * 1.2];
  p.faR = [-0.2 + k * 0.2, w * 0.9 + k * 0.05, 0.6 - w * 0.3 + k * 0.5];
  p.spine = [0.1 + k * 0.15 - w * 0.1, w * -0.6 + k * 0.5, 0];
  p.chest = [0.05, w * -0.4 + k * 0.4, 0];
  p.head = [0, w * 0.5 - k * 0.6, 0];
  p.thL = [0.15, -1, 0.35 * k]; p.shL = [0.1, -1, 0.1];
  p.thR = [-0.15, -1, -0.3 * k]; p.shR = [-0.1, -1, -0.45 * k];
  p.rootY = -0.06 * k;
  return p;
}

// Rapid alternating barrage (Stand rush). t in seconds.
export function rush(t, rate = 14) {
  const ph = t * rate * PI;
  const a = (sin(ph) + 1) / 2;
  const b = (sin(ph + PI) + 1) / 2;
  const p = guardStance();
  p.uaL = [0.25 - a * 0.2, -0.3 + a * 0.35, 0.6 + a * 0.4];
  p.faL = [0.05 - a * 0.05, -0.05 + a * 0.05, 1];
  p.uaR = [-0.25 + b * 0.2, -0.3 + b * 0.35, 0.6 + b * 0.4];
  p.faR = [-0.05 + b * 0.05, -0.05 + b * 0.05, 1];
  p.spine = [0.15, (a - b) * 0.18, 0];
  p.chest = [0.05, (a - b) * 0.2, 0];
  p.head = [-0.1, 0, 0];
  return p;
}

export function guardStance() {
  const p = rest();
  p.uaL = [0.45, -0.75, 0.35]; p.faL = [0.0, 0.55, 0.8];
  p.uaR = [-0.45, -0.75, 0.35]; p.faR = [0.0, 0.55, 0.8];
  p.thL = [0.15, -1, 0.15]; p.shL = [0.1, -1, -0.05];
  p.thR = [-0.15, -1, -0.15]; p.shR = [-0.1, -1, -0.3];
  p.spine = [0.08, 0, 0];
  p.rootY = -0.04;
  return p;
}

export function block() {
  const p = guardStance();
  p.uaL = [0.3, -0.25, 0.9]; p.faL = [-0.6, 0.7, 0.35];
  p.uaR = [-0.3, -0.25, 0.9]; p.faR = [0.6, 0.75, 0.3];
  p.spine = [0.15, 0, 0]; p.head = [0.15, 0, 0];
  p.rootY = -0.08;
  return p;
}

// Evasive step. dirX: +1 = to the character's left, dirZ: +1 = forward (local frame).
// The body drops and leans into the direction of travel; the trailing leg extends behind.
export function dodge(t, dirX, dirZ = 0) {
  const p = guardStance();
  const tt = clamp01(t);
  const k = sin(min(1, tt * 1.4) * PI * 0.5) * (1 - smooth((tt - 0.55) / 0.45));
  const lat = dirX; const fw = dirZ;
  p.rootRot = [fw * 0.32 * k, 0, -lat * 0.38 * k];
  p.rootPivot = 0;
  p.spine = [0.22 * k + max(0, -fw) * 0.15 * k, -lat * 0.2 * k, 0];
  p.chest = [0.08 * k, -lat * 0.15 * k, 0];
  p.head = [-0.1 * k, lat * 0.25 * k, lat * 0.2 * k];
  // leading leg bends, trailing leg pushes off
  const lead = lat >= 0 ? 'L' : 'R'; const trail = lead === 'L' ? 'R' : 'L';
  const ls = lead === 'L' ? 1 : -1;
  p[`th${lead}`] = [ls * (0.2 + abs(lat) * 0.35 * k), -1, 0.35 * k + fw * 0.3 * k];
  p[`sh${lead}`] = [ls * 0.1, -1, -0.45 * k];
  p[`th${trail}`] = [-ls * (0.15 + abs(lat) * 0.25 * k), -1, -0.25 * k - max(0, fw) * 0.2 * k];
  p[`sh${trail}`] = [-ls * 0.1, -1, -0.15 * k];
  p.uaL = [0.5 + lat * 0.2 * k, -0.6, 0.3]; p.uaR = [-0.5 + lat * 0.2 * k, -0.6, 0.3];
  p.rootY = -0.22 * k;
  return p;
}

export function hitReact(t, strength = 1) {
  const p = guardStance();
  const k = sin(clamp01(t) * PI) * strength;
  p.spine = [-0.35 * k, 0.1 * k, 0.05];
  p.chest = [-0.25 * k, 0, 0];
  p.head = [-0.4 * k, 0.2 * k, 0];
  p.uaL = [0.7, -0.5 + k * 0.4, -0.2 * k]; p.faL = [0.5, 0.1, 0.3];
  p.uaR = [-0.7, -0.5 + k * 0.4, -0.2 * k]; p.faR = [-0.5, 0.1, 0.3];
  return p;
}

export function knockedDown(t) {
  const p = rest();
  const k = smooth(t);
  p.spine = [-0.2 * k, 0, 0];
  p.uaL = [0.9, -0.2, -0.2]; p.faL = [0.8, 0.3, 0];
  p.uaR = [-0.9, -0.2, -0.2]; p.faR = [-0.8, 0.3, 0];
  p.thL = [0.15, -1, 0.2]; p.shL = [0.1, -1, 0.1];
  p.thR = [-0.15, -1, 0.5]; p.shR = [-0.1, -0.9, 0];
  return p;
}

export function kneel(t = 1) {
  const p = rest();
  const k = smooth(t);
  p.thL = [0.1, -0.2 * k - (1 - k), 1 * k]; p.shL = [0.05, -1, 0];
  p.thR = [-0.1, -1, -0.1 * k]; p.shR = [-0.05, -0.1, -1 * k - 0.0];
  p.spine = [0.35 * k, 0, 0]; p.chest = [0.15 * k, 0, 0]; p.head = [0.3 * k, 0, 0];
  p.uaL = [0.2, -1, 0.3]; p.faL = [0.05, -0.6, 0.8];
  p.uaR = [-0.3, -1, 0.1]; p.faR = [-0.1, -1, 0.1];
  p.rootY = -0.45 * k;
  return p;
}

export function cast(side, t, height = 0) {
  const p = guardStance();
  const k = smooth(t / 0.3);
  const s = side === 'L' ? 1 : -1;
  p[`ua${side}`] = [s * 0.12, -0.05 + height * k, 1];
  p[`fa${side}`] = [0, 0.05 + height * k, 1];
  p[`hand${side}`] = [-0.9 * k, 0, 0];
  p.spine = [0.05, -s * 0.3 * k, 0];
  p.chest = [0, -s * 0.25 * k, 0];
  p.head = [0, s * 0.4 * k, 0];
  return p;
}

export function castBoth(t, up = 0) {
  const p = guardStance();
  const k = smooth(t / 0.3);
  p.uaL = [0.35, -0.05 + up * k, 1]; p.faL = [0.15, up * k, 1];
  p.uaR = [-0.35, -0.05 + up * k, 1]; p.faR = [-0.15, up * k, 1];
  p.handL = [-1.1 * k, 0, 0]; p.handR = [-1.1 * k, 0, 0];
  p.spine = [0.08, 0, 0];
  return p;
}

export function raiseArms(t) {
  const p = rest();
  const k = smooth(t);
  p.uaL = [0.6, 0.4 * k - (1 - k) * 0.8, 0.3]; p.faL = [0.3, 0.9 * k - (1 - k), 0.2];
  p.uaR = [-0.6, 0.4 * k - (1 - k) * 0.8, 0.3]; p.faR = [-0.3, 0.9 * k - (1 - k), 0.2];
  p.chest = [-0.2 * k, 0, 0]; p.head = [-0.35 * k, 0, 0];
  return p;
}

export function point(side, t) {
  const p = idle(t);
  const s = side === 'L' ? 1 : -1;
  p[`ua${side}`] = [s * 0.3, 0.05, 1];
  p[`fa${side}`] = [s * 0.1, 0.1, 1];
  p.chest = [-0.05, -s * 0.15, 0];
  return p;
}

export function crossArms(t) {
  const p = idle(t);
  p.uaL = [0.45, -0.85, 0.35]; p.faL = [-0.95, 0.15, 0.3];
  p.uaR = [-0.45, -0.85, 0.4]; p.faR = [0.95, 0.2, 0.25];
  p.chest = [-0.06, 0, 0];
  return p;
}

// The signature menacing DIO pose for cinematics / title screen.
export function dioPose(t) {
  const p = idle(t, 'dio');
  const br = sin(t * 1.3);
  p.spine = [-0.12, 0.25, 0.04];
  p.chest = [-0.12 + br * 0.01, 0.2, 0.05];
  p.head = [-0.16, -0.45, 0.12];
  p.uaL = [0.5, 0.25, 0.75]; p.faL = [-0.55, 0.65, 0.4];
  p.handL = [0.3, 0.6, 0];
  p.uaR = [-0.7, -0.55, -0.2]; p.faR = [-0.3, -0.9, 0.45];
  p.thL = [0.18, -1, 0.15]; p.shL = [0.1, -1, 0.0];
  p.thR = [-0.12, -1, -0.1]; p.shR = [-0.08, -1, -0.12];
  return p;
}

// ---------------------------------------------------------------- signature stances
// Each fighter's body language when idle (and, for Stand users, while their Stand fights).
const sig = (fn) => (t) => { const p = idle(t); fn(p, sin(t * 1.5), t); return p; };
export const SIGNATURE = {
  jotaro: sig((p, b) => { // hands in his coat pockets, chin down
    p.uaL = [0.22, -1, -0.14]; p.faL = [0.06, -0.72, 0.6]; p.uaR = [-0.22, -1, -0.14]; p.faR = [-0.06, -0.72, 0.6];
    p.chest = [-0.04 + b * 0.01, 0, 0]; p.head = [0.1, 0.05, 0];
  }),
  avdol: sig((p, b) => { // upright fortune-teller, hands held low and ready to call the flame
    // (his auto-rigged coat cannot fold its arms without the sleeves collapsing)
    p.uaL = [0.32, -0.92, 0.18]; p.faL = [0.22, -0.55, 0.75]; p.uaR = [-0.32, -0.92, 0.18]; p.faR = [-0.22, -0.55, 0.75];
    p.handL = [-0.3, 0, 0]; p.handR = [-0.3, 0, 0];
    p.chest = [-0.07 + b * 0.012, 0, 0]; p.head = [-0.05, 0, 0];
  }),
  kakyoin: sig((p, b, t) => { // right hand raised before the chest, poised
    p.uaR = [-0.32, -0.62, 0.55]; p.faR = [0.32, 0.82, 0.45]; p.handR = [-0.3, 0.2, 0];
    p.uaL = [0.28, -0.95, 0.1]; p.chest = [-0.04 + b * 0.01, 0.1, 0]; p.head = [0, -0.08 + sin(t * 0.4) * 0.04, 0];
  }),
  polnareff: sig((p, b) => { // fencer: left hand on hip, right arm forward
    p.uaL = [0.75, -0.6, -0.2]; p.faL = [-0.4, 0.15, 0.35]; p.uaR = [-0.3, -0.45, 0.85]; p.faR = [-0.05, -0.2, 1];
    p.chest = [-0.03 + b * 0.01, 0.25, 0]; p.head = [0, -0.25, 0];
  }),
  josuke: sig((p, b) => { // relaxed delinquent slouch, hands low
    p.uaL = [0.28, -1, 0.05]; p.faL = [0.15, -0.85, 0.45]; p.uaR = [-0.3, -1, 0.05]; p.faR = [-0.2, -0.85, 0.4];
    p.spine = [0.05, 0, 0.04]; p.chest = [0.02 + b * 0.012, 0, 0]; p.head = [-0.06, 0, -0.05];
  }),
  kira: sig((p, b) => { // composed office worker: hands meeting softly at the belt
    p.uaL = [0.28, -0.95, 0.2]; p.faL = [-0.4, -0.55, 0.65]; p.uaR = [-0.28, -0.95, 0.2]; p.faR = [0.4, -0.58, 0.65];
    p.chest = [-0.02 + b * 0.008, 0, 0]; p.head = [0.04, 0, 0];
  }),
  diavolo: sig((p, b) => { // hunched and coiled, arms out
    p.spine = [0.18, 0, 0]; p.chest = [0.12 + b * 0.015, 0, 0]; p.head = [-0.2, 0, 0];
    p.uaL = [0.6, -0.75, 0.15]; p.faL = [0.3, -0.5, 0.7]; p.uaR = [-0.6, -0.75, 0.15]; p.faR = [-0.3, -0.5, 0.7];
  }),
  giorno: sig((p, b) => { // right hand across the chest, left arm open
    p.uaR = [-0.35, -0.55, 0.6]; p.faR = [0.85, 0.3, 0.35]; p.handR = [0, 0.3, 0];
    p.uaL = [0.55, -0.8, 0.15]; p.faL = [0.4, -0.6, 0.4]; p.chest = [-0.08 + b * 0.01, -0.1, 0]; p.head = [-0.05, 0.12, 0];
  }),
  valentine: sig((p, b) => { // hand over the heart, presidential
    p.uaR = [-0.3, -0.7, 0.55]; p.faR = [0.8, 0.45, 0.3]; p.uaL = [0.25, -1, 0.05];
    p.chest = [-0.1 + b * 0.01, 0, 0]; p.head = [-0.08, 0, 0];
  }),
  pucci: sig((p, b) => { // hands clasped before him, priestly
    p.uaL = [0.28, -0.85, 0.4]; p.faL = [-0.6, 0.1, 0.8]; p.uaR = [-0.28, -0.85, 0.4]; p.faR = [0.6, 0.12, 0.8];
    p.chest = [-0.03 + b * 0.008, 0, 0]; p.head = [0.12, 0, 0];
  }),
  holHorse: sig((p, b) => { // cowboy: thumb in the belt beside the holster
    p.uaR = [-0.45, -0.9, -0.05]; p.faR = [0.3, -0.6, 0.5]; p.uaL = [0.3, -1, 0]; p.chest = [-0.03 + b * 0.01, -0.12, 0]; p.head = [0, 0.1, 0.05];
  }),
  vanillaIce: sig((p, b) => { // head bowed, arms hanging, menacing
    p.spine = [0.1, 0, 0]; p.chest = [0.06 + b * 0.012, 0, 0]; p.head = [0.35, 0, 0];
    p.uaL = [0.2, -1, 0.05]; p.faL = [0.1, -1, 0.1]; p.uaR = [-0.2, -1, 0.05]; p.faR = [-0.1, -1, 0.1];
  }),
  ndoul: sig((p, b) => { // blind: right hand forward on a cane
    p.uaR = [-0.25, -0.8, 0.5]; p.faR = [-0.05, -0.9, 0.4]; p.head = [-0.12, 0.2, 0]; p.chest = [0.02 + b * 0.01, 0, 0];
  }),
  mariah: sig((p, b) => { // hand on hip, weight on one leg
    p.uaL = [0.75, -0.6, -0.15]; p.faL = [-0.45, 0.15, 0.3]; p.hips = [0, 0.1, 0.06]; p.chest = [-0.03 + b * 0.01, -0.1, -0.05]; p.head = [0, 0.1, 0.08];
  }),
};

export function talk(t, intensity = 1) {
  const p = idle(t);
  const g = sin(t * 2.3) * 0.5 + 0.5;
  p.uaR = [-0.35, -0.8, 0.3 + g * 0.3 * intensity]; p.faR = [-0.2, -0.1 + g * 0.4 * intensity, 1];
  p.uaL = [0.28, -0.95, 0.12]; p.faL = [0.15, -0.6, 0.6];
  p.head = [0.03 * sin(t * 3.1), sin(t * 0.9) * 0.15, 0];
  return p;
}

export function sit(t) {
  const p = idle(t);
  p.thL = [0.15, -0.05, 1]; p.shL = [0.1, -1, 0.05];
  p.thR = [-0.15, -0.05, 1]; p.shR = [-0.1, -1, 0.05];
  p.uaL = [0.25, -0.75, 0.5]; p.faL = [-0.05, -0.2, 1];
  p.uaR = [-0.25, -0.75, 0.5]; p.faR = [0.05, -0.2, 1];
  p.spine = [0.1, 0, 0];
  return p;
}

// Rider pose; gaitPhase drives the bounce.
export function ride(gaitPhase, gait, lean = 0) {
  const p = rest();
  const bounce = sin(gaitPhase * 2) * (0.02 + gait * 0.02);
  p.thL = [0.55, -0.25, 0.8]; p.shL = [0.18, -1, -0.12];
  p.thR = [-0.55, -0.25, 0.8]; p.shR = [-0.18, -1, -0.12];
  p.spine = [0.08 + gait * 0.08 + bounce, 0, -lean * 0.25];
  p.chest = [0.02, 0, 0];
  p.head = [-0.06 - gait * 0.05, lean * 0.2, 0];
  p.uaL = [0.18, -0.75, 0.6]; p.faL = [-0.08, -0.35, 1];
  p.uaR = [-0.18, -0.75, 0.6]; p.faR = [0.08, -0.35, 1];
  return p;
}

// Stand floating posture (legs trail, arms ready).
export function standFloat(t, aggressive = false) {
  const p = aggressive ? guardStance() : crossArms(t);
  const bob = sin(t * 2.1);
  p.thL = [0.1, -1, 0.15 + bob * 0.04]; p.shL = [0.06, -1, -0.35];
  p.thR = [-0.1, -1, 0.0 - bob * 0.04]; p.shR = [-0.06, -1, -0.45];
  p.rootY = 0;
  return p;
}

export function defeated(t) {
  const p = kneel(t);
  p.head = [0.6, 0, 0];
  p.uaL = [0.3, -1, 0.1]; p.faL = [0.2, -1, 0.1];
  return p;
}

export function victory(t) {
  const p = idle(t, 'dio');
  p.uaL = [0.3, 0.9, 0.2]; p.faL = [0.1, 1, 0.1];
  p.head = [-0.25, 0, 0];
  return p;
}
