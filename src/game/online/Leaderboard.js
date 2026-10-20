import { base44 } from '@/api/base44Client';
import { MAIN_BOSSES } from './Progress';
import { LORE_COUNT } from '../story/Lore';

// Hall of Fame queries + run checks.
//
// Honest status: this is a browser game with no server-side game logic, so times are measured on
// the player's machine. The board is labelled UNVERIFIED. What it does check, for every entry:
//   - the run has a server-issued id (a RunStart created by the same account when it began);
//   - the server-recorded time between that start and the submission is at least the claimed time;
//   - boss splits exist for every Seal in story order and fit inside the final time;
//   - the time is above a plausible minimum for the category; 100% has every lore page;
//   - one entry per run id, best valid entry per player.
// Players can only create records (never edit or delete them).

export const MIN_MS = { any: 15 * 60000, 100: 18 * 60000, bossrush: 4 * 60000, boss: 12000 };
const STORY_ORDER = [...MAIN_BOSSES.slice(0, -1), 'jotaro', 'jotaroFinal'];

const kindOf = (category) => (category === 'any' || category === '100' ? 'story' : category === 'bossrush' ? 'bossrush' : 'boss');
const minFor = (category) => MIN_MS[category] ?? (category.startsWith('boss:') ? MIN_MS.boss : 0);

export function checkRun(rec, start, seenRunIds) {
  const checks = [];
  const add = (label, ok) => checks.push({ label, ok: !!ok });
  add('Server-issued run id', !!start && start.created_by_id === rec.created_by_id && start.kind === kindOf(rec.category));
  if (start) {
    const elapsed = new Date(rec.created_date).getTime() - new Date(start.created_date).getTime();
    add('Server clock covers the claimed time', elapsed >= rec.time_ms - 3000);
  } else add('Server clock covers the claimed time', false);
  add('Plausible time', rec.time_ms >= minFor(rec.category));
  if (kindOf(rec.category) === 'story') {
    const sp = rec.splits || {};
    let prev = -1; let ordered = true;
    for (const k of STORY_ORDER) { const t = sp[k]; if (!(t >= 0) || t < prev) { ordered = false; break; } prev = t; }
    add('Every Seal defeated, in order', ordered && prev <= rec.time_ms + 1000);
  }
  if (rec.category === '100') add('Every lore page found', (rec.lore || 0) >= LORE_COUNT);
  add('First submission of this run', !seenRunIds.has(`${rec.category}|${rec.run_id}`));
  seenRunIds.add(`${rec.category}|${rec.run_id}`);
  return { ok: checks.every((c) => c.ok), checks };
}

async function startsFor(ids) {
  const map = new Map();
  if (!ids.length) return map;
  try {
    const rows = (await base44.entities.RunStart.filter({ id: { $in: ids } }, 'created_date', ids.length)) || [];
    for (const r of rows) map.set(r.id, r);
    if (rows.length) return map;
  } catch { /* fall back to individual reads */ }
  await Promise.all(ids.map(async (id) => { try { map.set(id, await base44.entities.RunStart.get(id)); } catch { /* missing */ } }));
  return map;
}

// Top entries for a category + difficulty, best valid run per player, sorted fastest first.
export async function fetchBoard(category, difficulty, { limit = 100 } = {}) {
  const query = { category };
  if (difficulty) query.difficulty = difficulty;
  const recs = (await base44.entities.RunRecord.filter(query, 'time_ms', 300)) || [];
  // older submissions first so "first submission of a run" is decided by the server's order
  const byAge = [...recs].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
  const starts = await startsFor([...new Set(recs.map((r) => r.run_id).filter(Boolean))]);
  const seen = new Set();
  const checked = byAge.map((rec) => ({ rec, ...checkRun(rec, starts.get(rec.run_id), seen) }));
  const best = new Map();
  for (const c of checked) {
    if (!c.ok) continue;
    const who = c.rec.created_by_id;
    if (!best.has(who) || c.rec.time_ms < best.get(who).rec.time_ms) best.set(who, c);
  }
  const rows = [...best.values()].sort((a, b) => a.rec.time_ms - b.rec.time_ms || new Date(a.rec.created_date) - new Date(b.rec.created_date));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return { rows: rows.slice(0, limit), all: rows, rejected: checked.filter((c) => !c.ok).length };
}

export async function rankOf(category, difficulty, userId) {
  if (!userId) return null;
  const { all } = await fetchBoard(category, difficulty, { limit: 1000 });
  const me = all.find((r) => r.rec.created_by_id === userId);
  return me ? { rank: me.rank, of: all.length, ms: me.rec.time_ms } : null;
}
