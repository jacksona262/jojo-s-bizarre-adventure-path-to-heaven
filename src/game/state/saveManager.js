// Versioned Campaign Save & Checkpoint System (Isolated from Versus Mode)

const SAVE_STORAGE_KEY = 'JOJO_PATH_TO_HEAVEN_SAVES_V1';
const AUTO_SAVE_KEY = 'JOJO_PATH_TO_HEAVEN_AUTOSAVE_V1';
const SETTINGS_KEY = 'JOJO_PATH_TO_HEAVEN_SETTINGS_V1';

export const DEFAULT_CAMPAIGN_STATE = {
  version: 1,
  timestamp: null,
  label: 'Chapter 1 — Ebon Crossing',
  chapterIndex: 0, // 0..9 for bosses 1..10, 10 for Heaven Ascension & Final Jotaro Rematch
  currentBossIndex: 0, // 0..10
  currentQuestIndex: 0, // 0..8
  questStep: 0,
  bossesDefeated: [], // array of boss indices 0..10
  questsCompleted: [], // array of quest indices 0..8
  visitedRegions: ['ebon_crossing'],
  isHeavenDio: false,
  playerPosition: { x: 0, y: 0, z: -25 },
  playerRotationY: Math.PI,
  horsePosition: { x: 4.5, y: 0, z: -28 },
  horseRotationY: Math.PI,
  isMounted: false,
  stats: {
    maxHp: 1000,
    hp: 1000,
    maxStandEnergy: 100,
    standEnergy: 100,
    skillPoints: 0,
    xp: 0,
  },
  upgrades: {
    timeStopLevel: 1, // Level 1 (3.5s) -> Level 5 (9.0s + Over Heaven 11s)
    standPowerLevel: 1, // Increases Light/Heavy/Barrage damage
    vampiricVitalityLevel: 1, // Increases Max HP & regeneration on finishers
    horseEnduranceLevel: 1, // Increases Slow Dancer gallop stamina & recovery
  },
  cluesCollected: [],
};

export const DEFAULT_SETTINGS = {
  brightness: 1.08,
  subtitles: true,
  masterVolume: 0.75,
  sfxVolume: 0.85,
  stormVolume: 0.55,
  musicVolume: 0.45,
  cameraShake: 0.8,
  reducedFlashing: false,
  renderQuality: 'high', // 'medium' | 'high'
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Could not persist settings:', e);
  }
}

export function getSaveSlots() {
  try {
    const raw = localStorage.getItem(SAVE_STORAGE_KEY);
    const slots = raw ? JSON.parse(raw) : [null, null, null];
    return Array.isArray(slots) && slots.length === 3 ? slots : [null, null, null];
  } catch {
    return [null, null, null];
  }
}

export function saveToSlot(slotIndex, campaignState, customLabel) {
  const slots = getSaveSlots();
  const payload = {
    ...DEFAULT_CAMPAIGN_STATE,
    ...campaignState,
    version: 1,
    timestamp: Date.now(),
    label: customLabel || campaignState.label || `Frontier Save Slot ${slotIndex + 1}`,
  };
  slots[slotIndex] = payload;
  localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(slots));
  localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(payload));
  return payload;
}

export function saveAutoCheckpoint(campaignState, checkpointLabel) {
  const payload = {
    ...DEFAULT_CAMPAIGN_STATE,
    ...campaignState,
    version: 1,
    timestamp: Date.now(),
    label: checkpointLabel || campaignState.label || 'Auto Checkpoint',
  };
  try {
    localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('Checkpoint save warning:', e);
  }
  return payload;
}

export function loadAutoCheckpoint() {
  try {
    const raw = localStorage.getItem(AUTO_SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return null;
    return {
      ...DEFAULT_CAMPAIGN_STATE,
      ...parsed,
      stats: { ...DEFAULT_CAMPAIGN_STATE.stats, ...(parsed.stats || {}) },
      upgrades: { ...DEFAULT_CAMPAIGN_STATE.upgrades, ...(parsed.upgrades || {}) },
    };
  } catch {
    return null;
  }
}

export function hasAnySavedGame() {
  if (loadAutoCheckpoint()) return true;
  return getSaveSlots().some(Boolean);
}