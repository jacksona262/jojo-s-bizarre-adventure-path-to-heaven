import * as P from './Poses';

// Keyframed procedural clips. A clip is a list of [t01, pose, ease] keys sampled with eased
// interpolation, plus combat metadata so animation and gameplay share one timeline:
//   active: [t0, t1]  window in which the striking limb's hitbox is live
//   contact: t        the frame the limb is fully extended (impact pose)
//   limb: 'handL' | 'handR' | 'footL' | 'footR'   the joint carrying the hitbox
//   reach: [from, peak, to]   weights for the arm/leg IK that steers the limb onto the target
// Startup = [0, active0], active = [active0, active1], recovery = [active1, 1].

const { PI } = Math;
const EASE = {
  linear: (x) => x,
  in: (x) => x * x,
  out: (x) => 1 - (1 - x) * (1 - x),
  inout: (x) => x * x * (3 - 2 * x),
  snap: (x) => 1 - (1 - x) ** 4,
  slam: (x) => x ** 3,
  back: (x) => { const c = 1.7; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; },
};

export function clip(def) {
  const keys = def.keys;
  const out = P.rest();
  def.sample = (t, dst = out) => {
    if (t <= keys[0][0]) return P.copyPose(keys[0][1], dst);
    for (let i = 0; i < keys.length - 1; i += 1) {
      const k0 = keys[i]; const k1 = keys[i + 1];
      if (t <= k1[0]) {
        const s = (t - k0[0]) / Math.max(1e-5, k1[0] - k0[0]);
        return P.lerpPose(k0[1], k1[1], (EASE[k1[2]] || EASE.inout)(s), dst);
      }
    }
    return P.copyPose(keys[keys.length - 1][1], dst);
  };
  // 0..1 weight of the limb IK at time t
  def.reachW = (t) => {
    const r = def.reach;
    if (!r) return 0;
    if (t <= r[0] || t >= r[2]) return 0;
    return t < r[1] ? EASE.inout((t - r[0]) / (r[1] - r[0])) : 1 - EASE.inout((t - r[1]) / (r[2] - r[1]));
  };
  return def;
}

const pose = (base, o) => Object.assign(base, o);
const G = () => P.guardStance();

// ------------------------------------------------------------------ punches (canonical: +Z fwd, +X left)
const guard = G();
const jabWindR = pose(G(), {
  uaR: [-0.55, -0.62, -0.3], faR: [0.12, 0.42, 0.88], spine: [0.06, -0.28, 0], chest: [0.02, -0.22, 0], head: [0, 0.32, 0],
});
const jabHitR = pose(G(), {
  uaR: [-0.1, 0.06, 1], faR: [-0.04, 0.05, 1], handR: [0, 0, 0], spine: [0.14, 0.32, 0], chest: [0.05, 0.3, 0], head: [-0.02, -0.42, 0],
  uaL: [0.5, -0.65, 0.25], faL: [-0.1, 0.65, 0.7], rootY: -0.03,
});
const jabWindL = P.mirror(jabWindR);
const jabHitL = P.mirror(jabHitR);

const hookWindL = pose(G(), { uaL: [0.85, -0.35, -0.1], faL: [0.25, 0.35, 0.9], spine: [0.05, 0.35, 0], chest: [0, 0.3, 0], head: [0, -0.35, 0] });
const hookHitL = pose(G(), { uaL: [0.45, 0.05, 0.9], faL: [-0.95, 0.05, 0.35], spine: [0.12, -0.45, 0.05], chest: [0.04, -0.4, 0], head: [0, 0.5, 0], rootY: -0.05 });

const upperWindR = pose(G(), { uaR: [-0.35, -0.92, 0.1], faR: [0.05, -0.25, 1], spine: [0.24, -0.25, 0], chest: [0.08, -0.2, 0], head: [-0.15, 0.25, 0], rootY: -0.12 });
const upperHitR = pose(G(), { uaR: [-0.12, 0.55, 0.82], faR: [0.02, 1, 0.22], spine: [-0.16, 0.3, 0], chest: [-0.1, 0.25, 0], head: [-0.3, -0.3, 0], rootY: 0.06 });

const heavyWind = pose(G(), {
  uaR: [-0.62, -0.25, -0.68], faR: [0.2, 0.62, 0.62], uaL: [0.55, -0.35, 0.75], faL: [0.05, 0.25, 1],
  spine: [-0.02, -0.7, 0], chest: [-0.05, -0.45, 0], head: [0.05, 0.75, 0],
  thL: [0.18, -1, 0.2], shL: [0.1, -1, -0.05], thR: [-0.18, -1, -0.2], shR: [-0.1, -1, -0.4], rootY: -0.05,
});
const heavyHit = pose(G(), {
  uaR: [-0.04, 0.04, 1], faR: [0, 0.04, 1], uaL: [0.65, -0.65, -0.25], faL: [0.3, -0.1, -0.2],
  spine: [0.28, 0.62, 0], chest: [0.08, 0.42, 0], head: [-0.1, -0.85, 0],
  thL: [0.16, -1, 0.5], shL: [0.1, -1, -0.05], thR: [-0.16, -1, -0.45], shR: [-0.1, -1, -0.6], rootY: -0.1,
});

const kickChamberR = pose(G(), { thR: [-0.25, -0.35, 0.9], shR: [-0.15, -1, -0.25], spine: [-0.15, 0.25, 0.12], chest: [0, 0.15, 0], uaL: [0.7, -0.4, 0.4], uaR: [-0.6, -0.6, 0.5] });
const kickHitR = pose(G(), { thR: [0.1, 0.02, 1], shR: [0.2, 0.05, 1], spine: [-0.28, 0.55, 0.25], chest: [-0.05, 0.3, 0], head: [0.1, -0.6, -0.1], uaL: [0.9, -0.3, -0.2], faL: [0.5, 0.2, 0.3], uaR: [-0.8, -0.4, 0.4] });

const knockWind = pose(G(), { uaL: [0.4, -0.5, -0.5], faL: [0, 0.7, 0.6], uaR: [-0.4, -0.5, -0.5], faR: [0, 0.7, 0.6], spine: [-0.15, 0, 0], chest: [-0.1, 0, 0], rootY: -0.06 });
const knockHit = pose(G(), { uaL: [0.2, 0.05, 1], faL: [0.05, 0.1, 1], uaR: [-0.2, 0.05, 1], faR: [-0.05, 0.1, 1], handL: [-1.1, 0, 0], handR: [-1.1, 0, 0], spine: [0.32, 0, 0], chest: [0.1, 0, 0], rootY: -0.1 });

export const jabR = clip({ name: 'jabR', dur: 0.3, limb: 'handR', active: [0.3, 0.58], contact: 0.42, reach: [0.22, 0.42, 0.78], keys: [[0, guard], [0.22, jabWindR, 'out'], [0.42, jabHitR, 'snap'], [0.62, jabHitR], [1, guard, 'inout']] });
export const jabL = clip({ name: 'jabL', dur: 0.3, limb: 'handL', active: [0.3, 0.58], contact: 0.42, reach: [0.22, 0.42, 0.78], keys: [[0, guard], [0.22, jabWindL, 'out'], [0.42, jabHitL, 'snap'], [0.62, jabHitL], [1, guard, 'inout']] });
export const hookL = clip({ name: 'hookL', dur: 0.36, limb: 'handL', active: [0.34, 0.6], contact: 0.46, reach: [0.3, 0.46, 0.7], keys: [[0, guard], [0.26, hookWindL, 'out'], [0.46, hookHitL, 'snap'], [0.64, hookHitL], [1, guard]] });
export const uppercutR = clip({ name: 'uppercutR', dur: 0.46, limb: 'handR', active: [0.36, 0.6], contact: 0.48, reach: [0.3, 0.48, 0.68], keys: [[0, guard], [0.3, upperWindR, 'out'], [0.48, upperHitR, 'snap'], [0.7, upperHitR], [1, guard]] });
export const heavyR = clip({ name: 'heavyR', dur: 0.62, limb: 'handR', active: [0.5, 0.7], contact: 0.58, reach: [0.42, 0.58, 0.82], keys: [[0, guard], [0.44, heavyWind, 'out'], [0.58, heavyHit, 'slam'], [0.78, heavyHit], [1, guard]] });
export const kickR = clip({ name: 'kickR', dur: 0.5, limb: 'footR', active: [0.38, 0.62], contact: 0.5, reach: [0.3, 0.5, 0.7], keys: [[0, guard], [0.32, kickChamberR, 'out'], [0.5, kickHitR, 'snap'], [0.68, kickHitR], [1, guard]] });
export const knockback = clip({ name: 'knockback', dur: 0.85, limb: 'handR', active: [0.6, 0.78], contact: 0.68, reach: [0.55, 0.68, 0.85], keys: [[0, guard], [0.55, knockWind, 'out'], [0.68, knockHit, 'slam'], [0.86, knockHit], [1, guard]] });
export const rushFinish = clip({ name: 'rushFinish', dur: 0.48, limb: 'handR', active: [0.3, 0.55], contact: 0.4, reach: [0.2, 0.4, 0.7], keys: [[0, jabHitL], [0.22, heavyWind, 'out'], [0.4, heavyHit, 'slam'], [0.7, heavyHit], [1, guard]] });

// Stand rush: alternating straight punches at `rate` per second. Arms are steered onto jittered
// points of the target by IK; reachW() exposes which fist is extending right now.
const rushA = pose(G(), { spine: [0.18, 0.2, 0], chest: [0.06, 0.2, 0], head: [-0.1, -0.2, 0] });
const rushB = pose(G(), { spine: [0.18, -0.2, 0], chest: [0.06, -0.2, 0], head: [-0.1, 0.2, 0] });
export function rushPose(t, rate = 15, out = P.rest()) {
  const ph = t * rate * PI;
  const a = (Math.sin(ph) + 1) / 2;
  const b = 1 - a;
  P.lerpPose(rushB, rushA, a, out);
  out.uaL = [0.28 - a * 0.2, -0.32 + a * 0.36, 0.55 + a * 0.45]; out.faL = [0.05 - a * 0.06, -0.04 + a * 0.06, 1];
  out.uaR = [-0.28 + b * 0.2, -0.32 + b * 0.36, 0.55 + b * 0.45]; out.faR = [-0.05 + b * 0.06, -0.04 + b * 0.06, 1];
  return out;
}
export function rushReach(t, rate = 15) {
  const s = Math.sin(t * rate * PI);
  return { L: Math.max(0, s) ** 0.7, R: Math.max(0, -s) ** 0.7 };
}

// ------------------------------------------------------------------ The World signature poses
export const timeStopPose = (() => {
  const p = P.rest();
  p.uaL = [0.92, 0.32, 0.22]; p.faL = [0.75, 0.62, 0.15];
  p.uaR = [-0.92, 0.32, 0.22]; p.faR = [-0.75, 0.62, 0.15];
  p.handL = [0, 0, -0.4]; p.handR = [0, 0, 0.4];
  p.spine = [-0.12, 0, 0]; p.chest = [-0.22, 0, 0]; p.head = [-0.28, 0, 0];
  p.thL = [0.22, -1, 0.08]; p.shL = [0.12, -1, -0.05]; p.thR = [-0.22, -1, 0.02]; p.shR = [-0.12, -1, -0.1];
  return p;
})();
export const timeStop = clip({ name: 'timeStop', dur: 0.7, keys: [[0, guard], [0.25, P.lerpPose(guard, timeStopPose, 0.4), 'in'], [0.45, timeStopPose, 'back'], [1, timeStopPose]] });

// DIO's commanding gestures (user side, upper body)
const cmdPoint = pose(P.rest(), { uaR: [-0.32, 0.06, 1], faR: [-0.1, 0.12, 1], handR: [-0.15, 0, 0], chest: [-0.06, 0.18, 0], head: [-0.06, -0.2, 0], uaL: [0.3, -0.92, 0.1], faL: [0.15, -0.7, 0.5] });
const cmdSweepA = pose(P.rest(), { uaR: [0.35, -0.2, 0.9], faR: [0.6, 0, 0.8], chest: [-0.04, 0.3, 0], head: [-0.05, -0.15, 0] });
const cmdSweepB = pose(P.rest(), { uaR: [-0.95, -0.05, 0.3], faR: [-0.95, 0.1, 0.25], handR: [0, 0, 0.5], chest: [-0.1, -0.25, 0], head: [-0.1, 0.1, 0] });
export const command = clip({ name: 'command', dur: 0.32, keys: [[0, P.rest()], [0.35, cmdPoint, 'snap'], [0.8, cmdPoint], [1, cmdPoint]] });
export const sweep = clip({ name: 'sweep', dur: 0.55, keys: [[0, P.rest()], [0.3, cmdSweepA, 'out'], [0.55, cmdSweepB, 'snap'], [1, cmdSweepB]] });
const menace = P.dioPose(0);
export const dioTaunt = clip({ name: 'dioTaunt', dur: 1.6, keys: [[0, P.rest()], [0.25, menace, 'inout'], [0.85, menace], [1, P.rest()]] });

// ------------------------------------------------------------------ reactions
// drop: fraction of pelvis height removed (resolved per character by the controller)
const staggerPose = pose(P.rest(), {
  spine: [-0.42, 0.12, 0.05], chest: [-0.28, 0.05, 0], head: [-0.5, 0.25, 0],
  uaL: [0.75, -0.25, -0.35], faL: [0.55, 0.25, 0.1], uaR: [-0.75, -0.35, -0.3], faR: [-0.5, 0.15, 0.1],
  thL: [0.12, -1, 0.15], shL: [0.08, -1, -0.05], thR: [-0.12, -1, -0.4], shR: [-0.08, -1, -0.5], rootY: -0.06,
});
export const staggerBack = clip({ name: 'staggerBack', dur: 0.62, keys: [[0, guard], [0.18, staggerPose, 'snap'], [0.55, P.lerpPose(staggerPose, guard, 0.45)], [1, guard]] });
const blockPose = P.block();
const blockPush = pose(P.block(), { spine: [-0.05, 0, 0], head: [0.05, 0, 0], rootY: -0.12 });
export const guardImpact = clip({ name: 'guardImpact', dur: 0.28, keys: [[0, blockPose], [0.25, blockPush, 'snap'], [1, blockPose]] });
const brokenPose = pose(P.rest(), { uaL: [0.85, 0.35, -0.2], faL: [0.6, 0.7, 0], uaR: [-0.85, 0.35, -0.2], faR: [-0.6, 0.7, 0], spine: [-0.35, 0, 0], chest: [-0.25, 0, 0], head: [-0.35, 0, 0], thR: [-0.12, -1, -0.35], shR: [-0.08, -1, -0.45], rootY: -0.05 });
export const guardBreak = clip({ name: 'guardBreak', dur: 1.2, keys: [[0, blockPose], [0.15, brokenPose, 'snap'], [0.7, brokenPose], [1, guard]] });

const H = PI / 2;
const lieBack = pose(P.rest(), {
  rootRot: [-H, 0, 0], drop: 1,
  uaL: [0.9, -0.3, -0.2], faL: [0.8, 0.1, 0.4], uaR: [-0.9, -0.3, -0.2], faR: [-0.8, 0.1, 0.4],
  thL: [0.12, -1, 0.1], shL: [0.1, -1, -0.15], thR: [-0.12, -1, 0.2], shR: [-0.08, -1, -0.05], head: [0.25, 0.3, 0],
});
const fallBackMid = pose(P.rest(), {
  rootRot: [-0.75, 0, 0], drop: 0.35, spine: [-0.2, 0, 0], head: [0.3, 0, 0],
  uaL: [0.8, 0.1, 0.4], faL: [0.6, 0.4, 0.5], uaR: [-0.8, 0.1, 0.4], faR: [-0.6, 0.4, 0.5],
  thL: [0.12, -0.8, 0.55], shL: [0.1, -1, -0.1], thR: [-0.12, -0.9, 0.35], shR: [-0.1, -1, -0.2],
});
const bounceBack = pose(P.copyPose(lieBack), { rootRot: [-H + 0.16, 0, 0], drop: 0.94, head: [0.45, 0.1, 0] });
export const knockdownBack = clip({ name: 'knockdownBack', dur: 0.62, keys: [[0, pose(G(), { rootRot: [0, 0, 0], drop: 0 })], [0.32, fallBackMid, 'in'], [0.62, lieBack, 'slam'], [0.78, bounceBack, 'out'], [1, lieBack, 'in']] });
const sitUp = pose(P.rest(), {
  rootRot: [-0.42, 0, 0], drop: 0.78, spine: [0.3, 0, 0], chest: [0.15, 0, 0], head: [0.1, 0, 0],
  uaL: [0.5, -0.9, -0.5], faL: [0.2, -1, 0.1], uaR: [-0.5, -0.9, -0.5], faR: [-0.2, -1, 0.1],
  thL: [0.15, -0.35, 0.95], shL: [0.1, -1, 0.15], thR: [-0.15, -0.1, 1], shR: [-0.12, -0.95, -0.35],
});
const kneelUp = pose(P.kneel(1), { drop: 0.42, rootY: 0, rootRot: [0, 0, 0] });
export const getUpBack = clip({ name: 'getUpBack', dur: 0.8, keys: [[0, lieBack], [0.35, sitUp, 'out'], [0.68, kneelUp, 'inout'], [1, pose(G(), { rootRot: [0, 0, 0], drop: 0 }), 'inout']] });

const lieFront = pose(P.rest(), {
  rootRot: [H, 0, 0], drop: 1,
  uaL: [0.55, 0.6, 0.6], faL: [0.3, 0.6, 0.7], uaR: [-0.55, 0.6, 0.6], faR: [-0.3, 0.6, 0.7],
  head: [-0.6, 0.4, 0], thL: [0.1, -1, -0.05], thR: [-0.14, -1, 0.05],
});
const fallFrontMid = pose(P.rest(), { rootRot: [0.7, 0, 0], drop: 0.35, uaL: [0.4, 0.2, 1], faL: [0.2, 0.3, 1], uaR: [-0.4, 0.2, 1], faR: [-0.2, 0.3, 1], head: [-0.5, 0, 0], thL: [0.1, -1, -0.2], thR: [-0.1, -1, 0.15] });
export const knockdownFront = clip({ name: 'knockdownFront', dur: 0.62, keys: [[0, pose(G(), { rootRot: [0, 0, 0], drop: 0 })], [0.32, fallFrontMid, 'in'], [0.62, lieFront, 'slam'], [0.78, pose(P.copyPose(lieFront), { rootRot: [H - 0.12, 0, 0], drop: 0.95 }), 'out'], [1, lieFront, 'in']] });
const pushUp = pose(P.rest(), { rootRot: [0.55, 0, 0], drop: 0.62, uaL: [0.3, -0.75, 0.6], faL: [0.15, -1, 0.1], uaR: [-0.3, -0.75, 0.6], faR: [-0.15, -1, 0.1], spine: [0.2, 0, 0], head: [-0.6, 0, 0], thL: [0.12, -0.7, 0.7], shL: [0.1, -1, -0.3], thR: [-0.12, -0.9, -0.2], shR: [-0.1, -1, -0.3] });
export const getUpFront = clip({ name: 'getUpFront', dur: 0.8, keys: [[0, lieFront], [0.38, pushUp, 'out'], [0.7, kneelUp, 'inout'], [1, pose(G(), { rootRot: [0, 0, 0], drop: 0 }), 'inout']] });

const buckle = pose(P.rest(), { drop: 0.45, spine: [0.35, 0, 0], chest: [0.15, 0, 0], head: [0.4, 0, 0], thL: [0.12, -0.5, 0.85], shL: [0.08, -1, -0.1], thR: [-0.12, -0.6, 0.8], shR: [-0.08, -1, -0.2], uaL: [0.2, -1, 0.2], faL: [0.1, -1, 0.1], uaR: [-0.2, -1, 0.15], faR: [-0.1, -1, 0.1] });
export const death = clip({ name: 'death', dur: 1.4, keys: [[0, P.rest()], [0.35, buckle, 'out'], [0.55, buckle], [0.85, pose(P.copyPose(lieFront), { rootRot: [H, 0.3, 0] }), 'slam'], [1, pose(P.copyPose(lieFront), { rootRot: [H, 0.3, 0] })]] });

export const ALL = { jabL, jabR, hookL, uppercutR, heavyR, kickR, knockback, rushFinish, timeStop, command, sweep, dioTaunt, staggerBack, guardImpact, guardBreak, knockdownBack, getUpBack, knockdownFront, getUpFront, death };
