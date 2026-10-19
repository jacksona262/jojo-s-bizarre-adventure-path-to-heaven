// Visual identity per fighter (keyed by roster key): every Stand's blows, afterimages and rush
// read differently at a glance.
//   hit    — main impact colour        accent — secondary sparks
//   ghost  — afterimage colour          style  — extra impact signature (VFX.impactStyle)
//   cry    — rush onomatopoeia (world text), kana — menacing glyph for its big moments
export const STAND_FX = {
  dio:        { hit: 0xffd34d, accent: 0x9effd0, ghost: 0xffcf40, style: 'time',     cry: '無駄無駄', kana: 'ゴ' },
  dioHeaven:  { hit: 0xfff2c8, accent: 0xffe08a, ghost: 0xfff0c0, style: 'heaven',   cry: '無駄無駄', kana: 'ゴ' },
  jotaro:     { hit: 0xa99cff, accent: 0xe8f0ff, ghost: 0x9a8cff, style: 'star',     cry: 'オラオラ', kana: 'ゴ' },
  avdol:      { hit: 0xff6a20, accent: 0xffd060, ghost: 0xff5a10, style: 'fire',     cry: 'ガアアア', kana: 'ド' },
  kakyoin:    { hit: 0x3cff8a, accent: 0xc8ffd8, ghost: 0x30e080, style: 'emerald',  cry: 'エメラルド', kana: 'ゴ' },
  polnareff:  { hit: 0xd8e6ff, accent: 0xffffff, ghost: 0xc8dcff, style: 'slash',    cry: 'ホラホラ', kana: 'ド' },
  josuke:     { hit: 0xff8ad8, accent: 0xffd0f0, ghost: 0xff7ad0, style: 'diamond',  cry: 'ドラララ', kana: 'ド' },
  kira:       { hit: 0xff7ab8, accent: 0xffb070, ghost: 0xff6aa8, style: 'bomb',     cry: 'しばッ', kana: 'ゴ' },
  diavolo:    { hit: 0xff2a3a, accent: 0xff9aa0, ghost: 0xff2030, style: 'crimson',  cry: '無駄', kana: 'ド' },
  giorno:     { hit: 0xffd040, accent: 0x9aff60, ghost: 0xffd040, style: 'life',     cry: '無駄無駄', kana: 'ゴ' },
  valentine:  { hit: 0x9fd8ff, accent: 0xffffff, ghost: 0x8fc8ff, style: 'dimension', cry: 'D4C', kana: 'ド' },
  pucci:      { hit: 0x6aff7a, accent: 0xd8ffe0, ghost: 0x5aff70, style: 'gravity',  cry: '', kana: 'ゴ' },
  holHorse:   { hit: 0xffe0a0, accent: 0xfff6d8, ghost: 0xffe0a0, style: 'bullet',   cry: '', kana: 'ド' },
  vanillaIce: { hit: 0xb08aff, accent: 0x2a1040, ghost: 0x8a6aff, style: 'void',     cry: '', kana: 'ゴ' },
  ndoul:      { hit: 0x6ac8ff, accent: 0xd8f4ff, ghost: 0x4ab8ff, style: 'water',    cry: '', kana: 'ゴ' },
  mariah:     { hit: 0x8aa0ff, accent: 0xd8e0ff, ghost: 0x6a8aff, style: 'magnet',   cry: '', kana: 'ド' },
};

export const DEFAULT_FX = { hit: 0xffe0a0, accent: 0xffffff, ghost: 0xffe0a0, style: null, cry: '', kana: 'ゴ' };

export function standFx(key) { return STAND_FX[key] || DEFAULT_FX; }
