import * as Poses from '../anim/Poses';
import * as Clips from '../anim/Clips';

// Cinematic acting: characters keep their own stance (signature idle, or whatever pose the scene
// already gave them, e.g. a defeated kneel) and layer on top of it a gesture, a speaking jaw, a
// head that tracks the other character, and small listening nods.

const { sin } = Math;
const ease = (x) => x * x * (3 - 2 * x);

function envelope(k) {
  if (k <= 0 || k >= 1) return 0;
  if (k < 0.22) return 1 - (1 - k / 0.22) ** 2;
  if (k < 0.72) return 1;
  return 1 - ease((k - 0.72) / 0.28);
}

// opts: { gesture: name in Clips.GESTURES, talking, lookAt: Character|Vector3, nod }
export function perform(actor, opts = {}) {
  if (!actor) return;
  if (!actor._acting) actor._acting = { prev: actor.override || null };
  const prev = actor._acting.prev;
  const clip = opts.gesture ? Clips.GESTURES[opts.gesture] : null;
  const t0 = actor.t;
  actor.talking = !!opts.talking;
  if (actor.anim) actor.anim.lookAt = opts.lookAt || null;
  actor.override = (t, self) => {
    const base = prev ? prev(t, self) : (self.idlePose ? self.idlePose(t, self) : Poses.idle(t, self.style || 'neutral'));
    if (!base) return base;
    if (clip) {
      const w = envelope((t - t0) / clip.dur);
      if (w > 0.001) {
        const peak = clip.peak;
        for (const k of clip.joints) {
          const a = base[k] || [0, 0, 0]; const b = peak[k];
          if (!b) continue;
          base[k] = [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
        }
      }
    }
    if (opts.talking) {
      const h = base.head || [0, 0, 0];
      base.head = [h[0] + sin(t * 4.6) * 0.025 + sin(t * 1.7) * 0.02, h[1] + sin(t * 1.1) * 0.03, h[2]];
    } else if (opts.nod) {
      const h = base.head || [0, 0, 0];
      const n = Math.max(0, sin(t * 0.9)) ** 8;   // an occasional slow nod
      base.head = [h[0] + n * 0.12, h[1], h[2]];
    }
    return base;
  };
}

export function stopPerform(actor) {
  if (!actor || !actor._acting) return;
  actor.override = actor._acting.prev;
  actor._acting = null;
  actor.talking = false;
  if (actor.anim) actor.anim.lookAt = null;
}

// Pick the next gesture for this actor (cycled through their personal set).
export function nextGesture(actor) {
  const key = actor.rosterKey || actor.partKey;
  const set = Clips.GESTURE_SETS[key] || Clips.GESTURE_SETS.default;
  actor._gi = (actor._gi || 0) + 1;
  return set[(actor._gi - 1) % set.length];
}
