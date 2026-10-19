// Campaign saves (auto checkpoint + 3 manual slots) and settings in localStorage.
// Versus mode never reads or writes campaign data.

const KEY = 'pth.v1';
const VERSION = 1;

function read(k) {
  try { const s = localStorage.getItem(`${KEY}.${k}`); return s ? JSON.parse(s) : null; } catch { return null; }
}
function write(k, v) {
  try { localStorage.setItem(`${KEY}.${k}`, JSON.stringify(v)); return true; } catch { return false; }
}
function remove(k) { try { localStorage.removeItem(`${KEY}.${k}`); } catch { /* storage unavailable */ } }

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
  load(slot) {
    const d = read(`save.${slot}`);
    if (!d || d.version !== VERSION) return null;
    return { ...newProgress(), ...d, upgrades: { ...newProgress().upgrades, ...(d.upgrades || {}) } };
  },
  save(slot, progress) {
    const d = { ...progress, savedAt: Date.now() };
    return write(`save.${slot}`, d);
  },
  remove(slot) { remove(`save.${slot}`); },
  list() {
    return this.slots.map((s) => {
      const d = read(`save.${s}`);
      return { slot: s, data: d && d.version === VERSION ? d : null };
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
      subtitles: true, subtitleSize: 1, difficulty: 'normal', shake: 1, fov: 55, showFps: false,
      ...(read('settings') || {}),
    };
  },
  saveSettings(s) { write('settings', s); },
  versusRecord() { return read('versus') || { wins: 0, losses: 0, last: null }; },
  saveVersusRecord(r) { write('versus', r); },
};
