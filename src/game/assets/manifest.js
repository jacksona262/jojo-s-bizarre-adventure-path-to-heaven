// Authoritative manifest for the 28 supplied GLB files (public/models).
// Every in-game character, Stand, horse and prop comes from one of these entries.
//
// part selection:
//   subtree  - keep only meshes under the named node (names compared case/punctuation-insensitively)
//   meshes   - keep only these mesh node names
//   exclude  - drop these mesh node names
// rig:
//   { type: 'bones', prefix, map }  - drive the file's real skeleton (map: joint -> bone name)
//   { type: 'auto-humanoid' }       - file has no skeleton; a skeleton + weights are generated at load
//   { type: 'auto-horse' }          - same for the quadruped
//   null                            - rigid object (moved as a whole)
// yaw: rotation (radians) applied so the model faces +Z.
// height: target height in metres after normalisation.

const M = (f) => `/models/${f}`;

const DIO_RIG = {
  type: 'bones',
  map: {
    hips: 'roothips', spine: 'spinelower', spine2: 'spinemiddle', chest: 'spineupper', neck: 'headnecklower', head: 'headneckupper',
    clavL: 'shll', upperArmL: 'al', foreArmL: 'al001', handL: 'al002',
    clavR: 'shlr', upperArmR: 'ar', foreArmR: 'ar001', handR: 'ar002',
    thighL: 'legl', shinL: 'legl001', footL: 'footl',
    thighR: 'legr', shinR: 'legr001', footR: 'footr',
  },
};

const WORLD_RIG = {
  type: 'bones',
  map: {
    hips: 'roothips', spine: 'spinelower', spine2: 'spinemiddle', chest: 'spineupper', neck: 'headnecklower', head: 'headneckupper',
    clavL: 'armshoulderl', upperArmL: 'armshoulderl001', foreArmL: 'armelbowl', handL: 'armwristl',
    clavR: 'armshoulderr', upperArmR: 'armshoulderr001', foreArmR: 'armelbowr', handR: 'armwristr',
    thighL: 'legl', shinL: 'legl001', footL: 'legl002',
    thighR: 'legr', shinR: 'legr001', footR: 'legr002',
  },
};

const HOME_DIO_RIG = {
  type: 'bones',
  map: {
    hips: 'roothips', spine: 'spinelower', spine2: 'spinemiddle', chest: 'spineupper', neck: 'headnecklower', head: 'headneckupper',
    clavL: 'shoulderl', upperArmL: 'arml', foreArmL: 'arml001', handL: 'arml002',
    clavR: 'shoulderr', upperArmR: 'armr', foreArmR: 'armr001', handR: 'armr002',
    thighL: 'legl', shinL: 'legl001', footL: 'legl002',
    thighR: 'legr', shinR: 'legr001', footR: 'legr002',
  },
};

const VALVE_RIG = {
  type: 'bones',
  prefix: 'valvebipedbip01',
  map: {
    hips: 'pelvis', spine: 'spine1', spine2: 'spine2', chest: 'spine4', neck: 'neck1', head: 'head1',
    clavL: 'lclavicle', upperArmL: 'lupperarm', foreArmL: 'lforearm', handL: 'lhand',
    clavR: 'rclavicle', upperArmR: 'rupperarm', foreArmR: 'rforearm', handR: 'rhand',
    thighL: 'lthigh', shinL: 'lcalf', footL: 'lfoot',
    thighR: 'rthigh', shinR: 'rcalf', footR: 'rfoot',
  },
};

const EOH_RIG = (prefix) => ({
  type: 'bones',
  prefix,
  map: {
    hips: 'pelvis', spine: 'spine1', chest: 'spine2', neck: 'neck', head: 'head',
    clavL: 'lclavicle', upperArmL: 'lupperarm', foreArmL: 'lforearm', handL: 'lhand',
    clavR: 'rclavicle', upperArmR: 'rupperarm', foreArmR: 'rforearm', handR: 'rhand',
    thighL: 'lthigh', shinL: 'lcalf', footL: 'lfoot',
    thighR: 'rthigh', shinR: 'rcalf', footR: 'rfoot',
  },
});

const SBR_RIG = {
  type: 'bones',
  map: {
    hips: 'hips', spine: 'spine', chest: 'chest', neck: 'neck', head: 'head',
    clavL: 'leftshoulder', upperArmL: 'leftarm', foreArmL: 'leftelbow', handL: 'leftwrist',
    clavR: 'rightshoulder', upperArmR: 'rightarm', foreArmR: 'rightelbow', handR: 'rightwrist',
    thighL: 'leftleg', shinL: 'leftknee', footL: 'leftankle',
    thighR: 'rightleg', shinR: 'rightknee', footR: 'rightankle',
  },
};

const D4C_RIG = {
  type: 'bones',
  map: {
    hips: 'hips', spine: 'spine1', spine2: 'spine2', chest: 'chest', neck: 'neck', head: 'head',
    clavL: 'lshoulder', upperArmL: 'larm', foreArmL: 'lforearm', handL: 'lwrist',
    clavR: 'rshoulder', upperArmR: 'rarm', foreArmR: 'rforearm', handR: 'rwrist',
    thighL: 'lleg', shinL: 'lknee', footL: 'lankle',
    thighR: 'rleg', shinR: 'rknee', footR: 'rankle',
  },
};

const MIXAMO_RIG = {
  type: 'bones',
  prefix: 'mixamorig',
  map: {
    hips: 'hips', spine: 'spine1', chest: 'spine2', neck: 'neck', head: 'head',
    clavL: 'leftshoulder', upperArmL: 'leftarm', foreArmL: 'leftforearm', handL: 'lefthand',
    clavR: 'rightshoulder', upperArmR: 'rightarm', foreArmR: 'rightforearm', handR: 'righthand',
    thighL: 'leftupleg', shinL: 'leftleg', footL: 'leftfoot',
    thighR: 'rightupleg', shinR: 'rightleg', footR: 'rightfoot',
  },
};

const AUTO = { type: 'auto-humanoid' };

export const FILES = {
  dio: M('main character.glb'),
  dioHome: M('loading screen  and home screen animated model.glb'),
  dioHeaven: M('dio_over_heaven__eyes_of_heaven_model.glb'),
  avdol: M('muhammad_avdol__magicians_red.glb'),
  kakyoin: M('noriaki_kakyoin__hierophant_green.glb'),
  polnareff: M('polnereff_eoh.glb'),
  josuke: M('josuke_higashikata__crazy_diamond.glb'),
  kira: M('yoshikage_kira_jojos_bizarre_adventure_diu.glb'),
  killerQueen: M('killer_queen.glb'),
  diavolo: M('diavolo.glb'),
  kingCrimson: M('king_crimson_asb.glb'),
  giorno: M('giorno_giovanna__gold_experience.glb'),
  valentine: M('funny_valentine__d4c__sbr.glb'),
  pucci: M('enrico_pucci_jjba_p6.glb'),
  cmoon: M('c-moonsee_moon.glb'),
  jotaro: M('jotaro_kujo__star_platinum.glb'),
  mariah: M('mariah_jjba_jojo.glb'),
  holHorse: M('hol_horse_dr.glb'),
  vanillaIce: M('vanilla_ice_dr.glb'),
  ndoul: M('n_doul__geb.glb'),
  daniel: M('daniel_j._d_arby__osiris.glb'),
  telence: M('telence_t._d_arby__atum.glb'),
  enya: M('enya_the_hag_dr.glb'),
  speedwagon: M('robert_e.o._speedwagon.glb'),
  horse: M('slow_dancer_jojo_steel_ball_run.glb'),
  arrow: M('jojos_bizarre_adventures_-_stand_arrow.glb'),
  streetProps: M('street_props.glb'),
  busShelter: M('bus_shelter_diorama.glb'),
};

// Each part is one independently placeable model.
export const PARTS = {
  // --- DIO ---
  dio: { file: 'dio', subtree: 'DIO_248', height: 1.95, rig: DIO_RIG, label: 'DIO' },
  theWorld: { file: 'dio', subtree: 'ZA WARUDO_496', height: 2.3, rig: WORLD_RIG, label: 'The World', stand: true },
  dioHome: { file: 'dioHome', subtree: 'DIO(SHADOW)_249', height: 1.95, rig: HOME_DIO_RIG, label: 'DIO (cinematic)' },
  dioHeaven: { file: 'dioHeaven', height: 1.95, rig: VALVE_RIG, label: 'Heaven Ascension DIO' },

  // --- Bosses ---
  avdol: { file: 'avdol', meshes: ['Object_2'], height: 1.95, rig: AUTO, label: 'Muhammad Avdol' },
  magiciansRed: { file: 'avdol', meshes: ['Object_3'], height: 2.25, rig: AUTO, label: "Magician's Red", stand: true },
  kakyoin: { file: 'kakyoin', meshes: ['Object_3'], height: 1.8, rig: AUTO, label: 'Noriaki Kakyoin' },
  hierophant: { file: 'kakyoin', meshes: ['Object_2'], height: 2.05, rig: AUTO, label: 'Hierophant Green', stand: true },
  polnareff: { file: 'polnareff', height: 1.88, rig: EOH_RIG('3pln01t0'), label: 'Jean Pierre Polnareff' },
  josuke: { file: 'josuke', meshes: ['Object_3'], height: 1.85, rig: AUTO, label: 'Josuke Higashikata' },
  crazyDiamond: { file: 'josuke', meshes: ['Object_2'], height: 2.2, rig: AUTO, label: 'Crazy Diamond', stand: true },
  kira: { file: 'kira', height: 1.78, rig: AUTO, label: 'Yoshikage Kira' },
  killerQueen: { file: 'killerQueen', height: 2.05, rig: EOH_RIG('4klq01t0'), label: 'Killer Queen', stand: true },
  diavolo: { file: 'diavolo', height: 1.9, rig: AUTO, label: 'Diavolo' },
  kingCrimson: { file: 'kingCrimson', height: 2.25, rig: AUTO, label: 'King Crimson', stand: true },
  giorno: { file: 'giorno', subtree: 'Armature', height: 1.76, rig: MIXAMO_RIG, label: 'Giorno Giovanna', exclude: ['Cube.004_Material.003_0'] },
  goldExperience: { file: 'giorno', subtree: 'Armature.001', height: 2.0, rig: MIXAMO_RIG, label: 'Gold Experience', stand: true },
  valentine: { file: 'valentine', subtree: 'Armature_259', height: 1.78, rig: SBR_RIG, label: 'Funny Valentine' },
  d4c: { file: 'valentine', subtree: 'Armature.001_105', height: 2.2, rig: D4C_RIG, label: 'D4C', stand: true },
  pucci: { file: 'pucci', height: 1.88, rig: SBR_RIG, label: 'Enrico Pucci' },
  cmoon: { file: 'cmoon', height: 2.45, rig: null, label: 'C-Moon', stand: true },
  jotaro: { file: 'jotaro', meshes: ['Object_3'], height: 1.95, rig: AUTO, label: 'Jotaro Kujo' },
  starPlatinum: { file: 'jotaro', meshes: ['Object_2'], height: 2.3, rig: AUTO, label: 'Star Platinum', stand: true },

  // --- Supporting cast ---
  mariah: { file: 'mariah', height: 1.68, rig: AUTO, label: 'Mariah' },
  holHorse: { file: 'holHorse', height: 1.86, rig: AUTO, label: 'Hol Horse' },
  vanillaIce: { file: 'vanillaIce', height: 2.0, rig: AUTO, label: 'Vanilla Ice' },
  ndoul: { file: 'ndoul', meshes: ['Object_3'], height: 1.82, rig: AUTO, label: "N'Doul" },
  geb: { file: 'ndoul', meshes: ['Object_2'], height: 0.55, rig: null, label: 'Geb', stand: true },
  daniel: { file: 'daniel', meshes: ['Object_2'], height: 1.82, rig: AUTO, label: "Daniel J. D'Arby" },
  osiris: { file: 'daniel', meshes: ['Object_3'], height: 2.0, rig: AUTO, label: 'Osiris', stand: true },
  telence: { file: 'telence', meshes: ['Object_3'], height: 1.8, rig: AUTO, label: "Telence T. D'Arby" },
  atum: { file: 'telence', meshes: ['Object_2'], height: 2.05, rig: AUTO, label: 'Atum', stand: true },
  enya: { file: 'enya', height: 1.25, rig: AUTO, label: 'Enya the Hag' },
  speedwagon: { file: 'speedwagon', height: 1.86, rig: AUTO, label: 'Robert E. O. Speedwagon' },

  // --- Other ---
  horse: { file: 'horse', height: 2.15, rig: { type: 'auto-horse' }, label: 'Slow Dancer' },
  arrow: { file: 'arrow', height: 0.75, rig: null, label: 'Stand Arrow', axis: 'length' },
  streetProps: { file: 'streetProps', height: null, rig: null, label: 'Street props' },
  busShelter: { file: 'busShelter', height: null, rig: null, label: 'Bus shelter diorama (unused: modern vending machine is anachronistic)' },
};

// Character -> Stand pairing (Silver Chariot, The World Over Heaven, Bastet, Emperor, Cream,
// Justice are not present as meshes in the supplied files; see ASSET_NOTES).
export const STAND_OF = {
  dio: 'theWorld',
  dioHeaven: null,
  avdol: 'magiciansRed',
  kakyoin: 'hierophant',
  polnareff: null,
  josuke: 'crazyDiamond',
  kira: 'killerQueen',
  diavolo: 'kingCrimson',
  giorno: 'goldExperience',
  valentine: 'd4c',
  pucci: 'cmoon',
  jotaro: 'starPlatinum',
  ndoul: 'geb',
  daniel: 'osiris',
  telence: 'atum',
  mariah: null,
  holHorse: null,
  vanillaIce: null,
  enya: null,
  speedwagon: null,
};

export const ASSET_NOTES = [
  'No supplied GLB contains animation clips (Giorno has four zero-length rest clips). All motion is procedural.',
  'Rigged files driven through their own skeletons: DIO + The World, cinematic DIO, Heaven DIO, Polnareff, Killer Queen, Valentine + D4C, Giorno + Gold Experience, Pucci.',
  'C-Moon is rigged but its bone names are unreadable (lost encoding); it is animated as a floating rigid body.',
  'Static files (no skeleton) receive a generated skeleton and skin weights at load: Avdol, Kakyoin, Josuke, Jotaro, Kira, Diavolo, King Crimson, the D\'Arby brothers, Mariah, Hol Horse, Vanilla Ice, N\'Doul, Enya, Speedwagon, and the horse.',
  'Silver Chariot is not present in polnereff_eoh.glb. It is shown as a spectral rapier and armour-light effect, never as an invented humanoid.',
  'The World Over Heaven has no separate mesh. Heaven DIO\'s Stand is presented as a luminous projection of The World\'s rig recoloured white-gold.',
  'Bastet, Emperor, Cream and Justice have no meshes; they are represented by their mechanics (magnet field, curving bullets, erasure void, fog).',
  'bus_shelter_diorama.glb includes a modern vending machine and bus shelter; it is excluded from the 1880s frontier as anachronistic.',
];
