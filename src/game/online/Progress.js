import { base44 } from '@/api/base44Client';
import { Save } from '../state/Save';
import { ui } from '../core/Store';
import { Account } from './Account';

// ============================================================================ run timing
// Two clocks, stored independently in the save:
//   run.storyMs  - the official story time. Starts when New Game is confirmed, never pauses
//                  (pause menus, loading, cutscenes, deaths and retries all count) and stops when
//                  the final victory is confirmed. Active-session timing: it only accumulates while
//                  the campaign is open; a closed game does not tick.
//   p.totalMs    - total playtime in the campaign (all play, side content included).
// Both advance from a monotonic clock (performance.now) on a 4 Hz timer, outside the render loop.
// A suspension longer than 2 s (device sleep, a frozen background tab) counts as 2 s.
// The official time also lives in a per-run ledger beside the saves, and on load the larger value
// wins, so reloading an older checkpoint can never wind the clock back.

export const GAME_VERSION = '3.0';
export const MAIN_BOSSES = ['avdol', 'kakyoin', 'polnareff', 'josuke', 'kira', 'diavolo', 'giorno', 'valentine', 'pucci', 'jotaro'];
export const SIDE_QUESTS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9'];
const TICK_MS = 250;
const MAX_GAP_MS = 2000;

export function formatRunTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '--:--:--.---';
  const t = Math.floor(ms);
  const h = Math.floor(t / 3600000); const m = Math.floor((t % 3600000) / 60000); const s = Math.floor((t % 60000) / 1000); const x = t % 1000;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}.${p(x, 3)}`;
}

export function newRun({ difficulty = 'normal', ng = 0, dev = false } = {}) {
  return {
    id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    serverId: null, storyMs: 0, done: false, finishMs: null, deaths: 0, splits: {}, difficulty, ng, dev,
    legacy: false, startedAt: Date.now(), version: GAME_VERSION, submitted: false,
  };
}

export class RunClock {
  constructor(getProgress) {
    this.getP = getProgress;
    this.last = performance.now();
    this.ledgerT = 0;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  tick() {
    const now = performance.now();
    const d = Math.min(MAX_GAP_MS, Math.max(0, now - this.last));
    this.last = now;
    const p = this.getP();
    if (!p) return;
    p.totalMs = (p.totalMs || 0) + d;
    const run = p.run;
    if (run && !run.done) run.storyMs += d;
    this.ledgerT += d;
    if (this.ledgerT >= 5000) { this.ledgerT = 0; this.writeLedger(); }
  }

  // the ledger only ever moves forward: a stale copy of the run can never lower it
  writeLedger() {
    const run = this.getP()?.run;
    if (!run || run.dev) return;
    const cur = Save.raw(`run.${run.id}`);
    if (cur && cur.storyMs > run.storyMs) return;
    Save.writeRaw(`run.${run.id}`, { storyMs: run.storyMs, done: run.done, finishMs: run.finishMs, deaths: run.deaths, splits: run.splits });
  }

  stop() { clearInterval(this.timer); this.tick(); this.writeLedger(); }
}

// the larger of the save's and the ledger's official time wins (reloads never rewind)
export function reconcileRun(run) {
  if (!run) return run;
  const led = Save.raw(`run.${run.id}`);
  if (led && led.storyMs > run.storyMs) {
    run.storyMs = led.storyMs;
    run.deaths = Math.max(run.deaths || 0, led.deaths || 0);
    run.splits = { ...(led.splits || {}), ...(run.splits || {}) };
    if (led.done && !run.done) { run.done = true; run.finishMs = led.finishMs; }
  }
  return run;
}

// server-issued run identifier: the RunStart record (its server created_date is the start event)
export async function registerRun(run, kind = 'story') {
  if (!Account.loggedIn || run.dev || run.serverId) return run;
  try {
    const rec = await base44.entities.RunStart.create({ kind, difficulty: run.difficulty, ng: run.ng || 0, version: GAME_VERSION, username: Account.username || '' });
    run.serverId = rec.id;
  } catch (e) { console.warn('[run] could not register run start', e); }
  return run;
}

// Submit a finished run to the Hall of Fame (signed-in, server-registered, untouched runs only).
export async function submitRun(run, { category, extra = {} }) {
  const why = runIneligible(run);
  if (why) return { ok: false, reason: why };
  try {
    const rec = await base44.entities.RunRecord.create({
      run_id: run.serverId, username: Account.username, category, difficulty: run.difficulty, time_ms: Math.round(run.finishMs ?? run.storyMs),
      deaths: run.deaths || 0, splits: run.splits || {}, version: GAME_VERSION, ng: run.ng || 0, completed_at: Date.now(), ...extra,
    });
    return { ok: true, id: rec.id };
  } catch (e) {
    console.warn('[run] submit failed', e);
    return { ok: false, reason: 'Could not reach the Hall of Fame. Your time is saved; try again from your profile.' };
  }
}

export function runIneligible(run) {
  if (!Account.loggedIn) return 'Sign in to submit times to the Hall of Fame.';
  if (!Account.username) return 'Choose a username to submit times.';
  if (!run) return 'No timed run.';
  if (run.dev) return 'Runs using developer tools are not ranked.';
  if (run.legacy) return 'This journey began before timed runs existed; start a New Game to set an official time.';
  if (run.difficulty === 'mixed') return 'The difficulty was changed during this run, so it is not ranked.';
  if (!run.serverId) return 'This run was not registered with the server when it began (offline or signed out).';
  return null;
}

// ============================================================================ achievements
export const ACHIEVEMENTS = [
  { id: 'first_seal', name: 'The First Seal', desc: 'Defeat your first Seal-bearer.' },
  { id: 'the_world', name: 'THE WORLD', desc: 'Awaken your Stand.' },
  { id: 'ten_seals', name: 'Ten Seals Broken', desc: 'Defeat all ten Seal-bearers.' },
  { id: 'heaven', name: 'Over Heaven', desc: 'Achieve Heaven Ascension.' },
  { id: 'story', name: 'The Man on the Throne', desc: 'Complete the main story.' },
  { id: 'side_all', name: 'Every Stitch', desc: 'Complete every quest on the road north.' },
  { id: 'untouched', name: 'Untouchable', desc: 'Defeat a Seal-bearer without taking damage.' },
  { id: 'versus_win', name: 'Duelist', desc: 'Win a Versus match.' },
  { id: 'bossrush', name: 'Thousand Steps', desc: 'Complete Boss Rush.' },
  { id: 'lore_all', name: 'Keeper of the Valley', desc: 'Find every lore page.' },
  { id: 'ngplus', name: 'Once More, With Feeling', desc: 'Begin New Game+.' },
];

function localAch() { return Save.raw('meta.achievements') || []; }

export function hasAchievement(id) {
  return localAch().some((a) => a.id === id) || !!Account.profile?.achievements?.some((a) => a.id === id);
}

export function unlockAchievement(id) {
  if (Save.sandboxed || hasAchievement(id)) return false;
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return false;
  const at = Date.now();
  Save.writeRaw('meta.achievements', [...localAch(), { id, at }]);
  Account.updateProfile((p) => { if (!p.achievements.some((a) => a.id === id)) p.achievements.push({ id, at }); });
  ui.set({ achievement: { ...def, key: at } });
  setTimeout(() => { if (ui.get().achievement?.key === at) ui.set({ achievement: null }); }, 5200);
  return true;
}

export function allAchievements() {
  const got = new Map();
  for (const a of [...localAch(), ...(Account.profile?.achievements || [])]) if (!got.has(a.id)) got.set(a.id, a.at);
  return ACHIEVEMENTS.map((a) => ({ ...a, at: got.get(a.id) || null }));
}

// ============================================================================ account stats
export function statAdd(key, n = 1) { Account.updateProfile((p) => { p.stats[key] = (p.stats[key] || 0) + n; }); }
export function statUnion(key, val) { Account.updateProfile((p) => { const a = new Set(p.stats[key] || []); a.add(val); p.stats[key] = [...a]; }); }
