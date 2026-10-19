// World layout: one long, narrow frontier. The journey runs from south (z > 0) to north (z < 0).
// Region centres are ~1400 m apart: roughly three minutes at Slow Dancer's canter (8 m/s).

export const SPACING = 1400;

export const REGIONS = [
  {
    id: 'ebon', name: 'Ebon Crossing', z: 0, base: 2, corridor: 170, wall: 70, hills: 6,
    ground: [0.16, 0.13, 0.1], ground2: [0.11, 0.1, 0.08], rock: [0.28, 0.25, 0.22], trees: 0.15, pines: 0.2, dead: 0.6, rocks: 0.4, grass: 0.5, cactus: 0, reeds: 0, graves: 0.25, crystals: 0,
    blurb: 'An abandoned frontier town. Lanterns still burn in empty windows.',
  },
  {
    id: 'ember', name: 'Ember Flats', z: -SPACING, base: 6, corridor: 320, wall: 90, hills: 9,
    ground: [0.2, 0.15, 0.09], ground2: [0.14, 0.12, 0.07], rock: [0.32, 0.26, 0.2], trees: 0.1, pines: 0.05, dead: 1, rocks: 0.6, grass: 1, cactus: 0.9, reeds: 0, graves: 0.1, crystals: 0,
    blurb: 'Open storm plains, burnt camps and a telegraph line running north.',
  },
  {
    id: 'redstone', name: 'Redstone Pass', z: -SPACING * 2, base: 14, corridor: 48, wall: 95, hills: 4,
    ground: [0.24, 0.12, 0.08], ground2: [0.18, 0.09, 0.06], rock: [0.42, 0.18, 0.11], trees: 0.05, pines: 0.1, dead: 0.3, rocks: 1.2, grass: 0.2, cactus: 0.7, reeds: 0, graves: 0.05, crystals: 0,
    blurb: 'Red canyon walls and trestle bridges over black gulches.',
  },
  {
    id: 'hollow', name: 'Hollow Pines', z: -SPACING * 3, base: 34, corridor: 140, wall: 80, hills: 14,
    ground: [0.07, 0.1, 0.07], ground2: [0.1, 0.09, 0.06], rock: [0.25, 0.26, 0.24], trees: 1, pines: 1.6, dead: 0.2, rocks: 0.5, grass: 0.8, cactus: 0, reeds: 0.2, graves: 0.35, crystals: 0,
    blurb: 'Moonlit pine forest wrapped in fog, cabins along a narrow trail.',
  },
  {
    id: 'iron', name: 'Iron Vale', z: -SPACING * 4, base: 52, corridor: 150, wall: 110, hills: 8,
    ground: [0.12, 0.11, 0.1], ground2: [0.09, 0.08, 0.08], rock: [0.3, 0.29, 0.28], trees: 0.3, pines: 0.5, dead: 0.4, rocks: 1, grass: 0.4, cactus: 0, reeds: 0, graves: 0.1, crystals: 0,
    blurb: 'A mining settlement of rail spurs, warehouses and tunnel mouths.',
  },
  {
    id: 'gravewater', name: 'Gravewater Marsh', z: -SPACING * 5, base: 30, corridor: 360, wall: 60, hills: 3, water: 31.2,
    ground: [0.09, 0.1, 0.07], ground2: [0.08, 0.07, 0.05], rock: [0.22, 0.24, 0.2], trees: 0.4, pines: 0.15, dead: 1.4, rocks: 0.3, grass: 1.2, cactus: 0, reeds: 1.4, graves: 0.5, crystals: 0,
    blurb: 'Flooded lowlands crossed by rotting boardwalks.',
  },
  {
    id: 'bleak', name: 'Bleakwater Ridge', z: -SPACING * 6, base: 92, corridor: 90, wall: 150, hills: 18,
    ground: [0.13, 0.13, 0.13], ground2: [0.2, 0.2, 0.21], rock: [0.34, 0.34, 0.36], trees: 0.15, pines: 0.4, dead: 0.3, rocks: 1.3, grass: 0.3, cactus: 0, reeds: 0, graves: 0.3, crystals: 0.1,
    blurb: 'Mountain switchbacks, ruined waystations and vast overlooks.',
  },
  {
    id: 'rift', name: 'The Rift Expanse', z: -SPACING * 7, base: 128, corridor: 220, wall: 120, hills: 12,
    ground: [0.12, 0.1, 0.14], ground2: [0.16, 0.13, 0.18], rock: [0.3, 0.26, 0.34], trees: 0.05, pines: 0.1, dead: 0.5, rocks: 1.1, grass: 0.2, cactus: 0, reeds: 0, graves: 0.1, crystals: 1,
    blurb: 'Ancient ruins where different timelines appear to overlap.',
  },
  {
    id: 'heaven', name: "Heaven's Reach", z: -SPACING * 8, base: 170, corridor: 130, wall: 200, hills: 10,
    ground: [0.2, 0.2, 0.21], ground2: [0.26, 0.26, 0.28], rock: [0.42, 0.42, 0.44], trees: 0.02, pines: 0.15, dead: 0.1, rocks: 0.8, grass: 0.15, cactus: 0, reeds: 0, graves: 0, crystals: 0.8,
    blurb: 'The gothic sanctuary above the storm, where the second Arrow waits.',
  },
];

export const WORLD = {
  zStart: 260,
  zEnd: -SPACING * 8 - 420,
  halfWidth: 900,
};

export const SANCTUARY = { x: 0, z: -SPACING * 8 - 220, y: 0 }; // y filled in from terrain

// Title-screen mansion on the southern slope above Ebon Crossing (x resolved from the road).
export const MANSION = { side: -34, z: 236, x: 0, y: 0 };

export function regionAt(z) {
  let best = REGIONS[0];
  let bd = Infinity;
  for (const r of REGIONS) {
    const d = Math.abs(z - r.z);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

// Smoothly blended region parameters at a given z.
export function regionBlend(z) {
  const i = Math.max(0, Math.min(REGIONS.length - 1.0001, -z / SPACING));
  const a = Math.floor(i);
  const b = Math.min(REGIONS.length - 1, a + 1);
  let t = i - a;
  // hold each region's character around its centre, transition between
  t = Math.min(1, Math.max(0, (t - 0.3) / 0.4));
  t = t * t * (3 - 2 * t);
  return { a: REGIONS[a], b: REGIONS[b], t };
}

// Points of interest. Positions are along-road offsets resolved against the road curve at runtime.
// kind: town | boss | quest | landmark | camp
export const POIS = [
  { id: 'ebonTown', kind: 'town', region: 'ebon', dz: 0, label: 'Ebon Crossing' },
  { id: 'landOffice', kind: 'landmark', region: 'ebon', dz: -40, side: 22, label: 'Land Office' },
  { id: 'arenaAvdol', kind: 'boss', region: 'ebon', dz: -95, side: 0, label: 'Main Street' },
  { id: 'telegraph', kind: 'quest', region: 'ember', dz: 300, side: 40, label: 'Telegraph Station' },
  { id: 'camp1', kind: 'camp', region: 'ember', dz: 120, side: -150, label: 'Burnt Camp' },
  { id: 'camp2', kind: 'camp', region: 'ember', dz: -60, side: 170, label: 'Burnt Camp' },
  { id: 'camp3', kind: 'camp', region: 'ember', dz: -260, side: -120, label: 'Burnt Camp' },
  { id: 'arenaKakyoin', kind: 'boss', region: 'ember', dz: -480, side: 30, label: 'Ember Flats Station' },
  { id: 'railyard', kind: 'quest', region: 'redstone', dz: 520, side: 0, label: 'Bastet Rail Yard' },
  { id: 'bridgeHol', kind: 'quest', region: 'redstone', dz: -560, side: 0, label: 'Gulch Trestle' },
  // the courtyard itself is built at side 26 (Settlements.js); the duel line runs 4.5 m east of
  // its fountain so neither fighter (nor the intro cutscene) ends up standing in the basin
  { id: 'arenaPolnareff', kind: 'boss', region: 'redstone', dz: -260, side: 30.5, label: 'Ashgrove Courtyard' },
  { id: 'arenaJosuke', kind: 'boss', region: 'hollow', dz: 160, side: 0, label: 'Splintered Hamlet' },
  { id: 'enyaCabin', kind: 'quest', region: 'hollow', dz: -420, side: -30, label: "Enya's Cabin" },
  { id: 'arenaKira', kind: 'boss', region: 'iron', dz: 150, side: 0, label: 'Iron Vale Yard' },
  { id: 'osirisHall', kind: 'quest', region: 'iron', dz: -300, side: 34, label: 'Assay Hall' },
  { id: 'arenaDiavolo', kind: 'boss', region: 'iron', dz: -640, side: 0, label: 'Canyon Rail Bridge' },
  { id: 'gebMarsh', kind: 'quest', region: 'gravewater', dz: 300, side: 60, label: 'Drowned Boardwalk' },
  { id: 'arenaGiorno', kind: 'boss', region: 'gravewater', dz: -320, side: 70, label: 'Verdant Estate' },
  { id: 'atumOverlook', kind: 'quest', region: 'bleak', dz: 380, side: 28, label: 'Lantern Overlook' },
  { id: 'arenaValentine', kind: 'boss', region: 'bleak', dz: -330, side: -70, label: 'Fracture Basin' },
  { id: 'creamRuins', kind: 'quest', region: 'rift', dz: 360, side: 0, label: 'Ruins of Many Hours' },
  { id: 'arenaPucci', kind: 'boss', region: 'rift', dz: -340, side: 0, label: 'Inverted Cloister' },
  { id: 'sanctuaryStair', kind: 'quest', region: 'heaven', dz: 420, side: 0, label: 'The Thousand Steps' },
  { id: 'arenaJotaro', kind: 'boss', region: 'heaven', dz: -220, side: 0, label: "Heaven's Reach Sanctum" },
];
