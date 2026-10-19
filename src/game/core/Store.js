import { useSyncExternalStore } from 'react';

// Small observable store bridging the engine (writes every frame) and React UI (reads).
// High-frequency HUD numbers are throttled by the publishers, not here.

function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set: (patch) => {
      const next = typeof patch === 'function' ? patch(state) : patch;
      let changed = false;
      for (const k of Object.keys(next)) if (state[k] !== next[k]) { changed = true; break; }
      if (!changed) return;
      state = { ...state, ...next };
      for (const fn of subs) fn();
    },
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
  };
}

export const ui = createStore({
  screen: 'boot',        // boot | title | loading | game | versusSelect | versus | credits
  overlay: null,         // pause | journal | map | upgrades | settings | saves | minigame | results
  loading: null,         // { label, progress }
  hud: null,             // { hp, hpMax, energy, energyMax, ts, tsMax, tsCooldown, stand, mounted, stamina }
  boss: null,            // { name, stand, hp, hpMax, phase, phases }
  prompt: null,          // interaction prompt text
  subtitle: null,        // { speaker, text, color }
  choice: null,          // { prompt, options: [{id,label}] }
  objective: null,       // { title, text, distance }
  toast: null,           // { text, kind, id }
  letterbox: false,
  fade: 0,
  region: null,
  timeStop: null,        // { remaining, total, user }
  minigame: null,
  versus: null,
  credits: false,
  device: 'kbm',
  debug: null,
});

export function useUI(selector) {
  return useSyncExternalStore(ui.subscribe, () => selector(ui.get()));
}

let toastId = 0;
export function toast(text, kind = 'info', ms = 3200) {
  toastId += 1;
  const id = toastId;
  ui.set({ toast: { text, kind, id } });
  setTimeout(() => { if (ui.get().toast?.id === id) ui.set({ toast: null }); }, ms);
}
