// Campaign saves (auto checkpoint + 3 manual slots) and settings in localStorage.
// Versus mode never reads or writes campaign data.
// Saves must survive game updates: the storage key never changes, older (or newer) save formats
// are migrated instead of discarded, missing fields fall back to defaults, the story position is
// also stored by step id (so new chapters can be inserted), and every slot keeps a backup of its
// previous save in case a write is interrupted.

const KEY = 'pth.v1';
const VERSION = 1;
// Dev / QA sessions (chapter jumps, ?step=...) keep their journey in a separate namespace so they
// can never overwrite a player's real saves. Settings are shared.
let sandbox = false;
const ns = (k) => (sandbox && k.startsWith('save.') ? `${KEY}.dev.${k}` : `${KEY}.${k}`);

function read(k) {
  try { const s = localStorage.getItem(ns(k)); return s ? JSON.parse(s) : null; } catch { return null; }
}
const isSave = (d) => !!d && typeof d === 'object' && typeof d.step === 'number';
// bring any saved progress up to the current format
function migrate(d) {
  const base = newProgress();
  const out = { ...base, ...d, version: VERSION };
  out.upgrades = { ...base.upgrades, ...(d.upgrades || {}) };
  out.sub = d.sub && typeof d.sub === 'object' ? d.sub : {};
  out.flags = d.flags && typeof d.flags === 'object' ? d.flags : {};
  for (const k of ['clues', 'defeated']) out[k] = Array.isArray(d[k]) ? d[k] : [];
  out.step = Math.max(0, Math.floor(d.step || 0));
  return out;
}
function readSave(slot) {
  const main = read(`save.${slot}`);
  if (isSave(main)) return main;
  const bak = read(`save.${slot}.bak`);
  return isSave(bak) ? bak : null;
}
function write(k, v) {
  try { localStorage.setItem(ns(k), JSON.stringify(v)); return true; } catch { return false; }
}
function remove(k) { try { localStorage.removeItem(ns(k)); } catch { /* storage unavailable */ } }

export function newProgress() {
  return {
    version: VERSION,
    step: 0,
    sub: {},              // per-step objective state
    flags: {},            // dialogue choices etc.
    upgrades: { tsDuration: 0, tsCooldown: 0, energy: 0, vitality: 0, rush: 0, counter: 0, knives: false, tsAwareness: false },
    fragments: 0,
    clues: [],
    defeated: [],
    playtime: 0,
    pos: null,
    horsePos: null,
    hp: null,
    chapterName: 'Prologue',
    savedAt: 0,
  };
}

export const Save = {
  slots: ['auto', 'slot1', 'slot2', 'slot3'],
  setSandbox(on) { sandbox = !!on; },
  get sandboxed() { return sandbox; },
  load(slot) {
    const d = readSave(slot);
    return d ? migrate(d) : null;
  },
  save(slot, progress) {
    const prev = read(`save.${slot}`);
    if (isSave(prev)) write(`save.${slot}.bak`, prev);
    const d = { ...progress, version: VERSION, savedAt: Date.now() };
    return write(`save.${slot}`, d);
  },
  remove(slot) { remove(`save.${slot}`); remove(`save.${slot}.bak`); },
  list() {
    return this.slots.map((s) => {
      const d = readSave(s);
      return { slot: s, data: d ? migrate(d) : null };
    });
  },
  latest() {
    let best = null;
    for (const { slot, data } of this.list()) if (data && (!best || data.savedAt > best.data.savedAt)) best = { slot, data };
    return best;
  },
  settings() {
    return {
      quality: 'high', master: 0.8, music: 0.55, sfx: 0.85, ambience: 0.7, sensitivity: 1, invertY: false,
      subtitles: true, subtitleSize: 1, difficulty: 'normal', shake: 1, fov: 55, showFps: false, screenFx: 'full', renderDistance: 'medium',
      ...(read('settings') || {}),
    };
  },
  saveSettings(s) { write('settings', s); },
  versusRecord() { return read('versus') || { wins: 0, losses: 0, last: null }; },
  saveVersusRecord(r) { write('versus', r); },
};
