import * as THREE from 'three';
import { instantiate, partSpec } from '../assets/AssetLibrary';
import * as Poses from '../anim/Poses';
import { ROSTER } from '../combat/Roster';

// Character-select art rendered from the actual 3D models: each fighter in their signature stance,
// lit in their colour, with their Stand looming behind for the large art. Rendered once per session
// on a small private WebGL canvas (queued one at a time so the game never stalls) and cached as
// images; the canvas is released when nothing has been requested for a few seconds.

const cache = new Map();
let renderer = null;
let queue = Promise.resolve();
let pending = 0;
let idleT = null;

function getRenderer() {
  if (renderer) return renderer;
  const canvas = document.createElement('canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

function release() {
  if (!renderer || pending > 0) return;
  renderer.dispose();
  renderer.forceContextLoss();
  renderer = null;
}

function stanceFor(key, style) {
  if (key === 'dio' || key === 'dioHeaven') return Poses.dioPose(1.2);
  const sig = Poses.SIGNATURE[key];
  return sig ? sig(1.2) : Poses.idle(1.2, style || 'neutral');
}

function shoot(r, scene, cam, w, h) {
  r.setSize(w, h, false);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
  r.render(scene, cam);
  return r.domElement.toDataURL('image/png');
}

async function render(key) {
  const ro = ROSTER[key];
  if (!ro) return null;
  const r = getRenderer();
  const scene = new THREE.Scene();
  const col = new THREE.Color(ro.color || '#ffd34d');
  scene.add(new THREE.HemisphereLight(0x8a8ca8, 0x141018, 0.9));
  const key1 = new THREE.DirectionalLight(0xfff2e0, 2.6); key1.position.set(1.6, 2.4, 3); scene.add(key1);
  const rim = new THREE.DirectionalLight(col, 4.2); rim.position.set(-2.4, 2.2, -2.6); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(col, 2.2); rim2.position.set(2.6, 1.2, -2.2); scene.add(rim2);
  const made = [];
  try {
    const hgt = partSpec(ro.part)?.height || 1.9;
    const body = await instantiate(ro.part);
    made.push(body);
    body.userData.rig?.apply(stanceFor(key, ro.style));
    body.rotation.y = 0.38;
    scene.add(body);
    let stand = null;
    if (ro.stand) {
      try {
        stand = await instantiate(ro.stand);
        made.push(stand);
        stand.userData.rig?.apply(Poses.standFloat(1.2, true));
        stand.position.set(-0.62 * hgt, 0.32, -1.1);
        stand.rotation.y = 0.55;
        // a touch of the Stand's colour in its own glow so it reads as a spirit behind them
        for (const m of stand.userData.materials || []) if (m.emissive) { m.emissive.copy(col).multiplyScalar(0.18); }
        scene.add(stand);
      } catch { stand = null; }
    }
    const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
    // full-length art (Stand included)
    const fullH = hgt * (stand ? 1.42 : 1.2);
    const dist = (fullH / 2) / Math.tan(THREE.MathUtils.degToRad(14));
    const cy = stand ? hgt * 0.66 : hgt * 0.56;
    cam.position.set(stand ? -0.25 * hgt : 0, cy, dist);
    cam.lookAt(stand ? -0.25 * hgt : 0, cy, 0);
    const full = shoot(r, scene, cam, 420, 640);
    // head-and-shoulders tile (fighter only)
    if (stand) stand.visible = false;
    const head = new THREE.Vector3(0, hgt * 0.86, 0);
    const bustH = hgt * 0.42;
    const bd = (bustH / 2) / Math.tan(THREE.MathUtils.degToRad(14));
    cam.position.set(0.08 * hgt, head.y, bd);
    cam.lookAt(0, head.y - 0.02 * hgt, 0);
    const bust = shoot(r, scene, cam, 220, 220);
    return { full, bust };
  } finally {
    for (const o of made) {
      for (const m of o.userData.materials || []) m.dispose();
      o.removeFromParent();
    }
  }
}

// Returns a promise of { full, bust } image URLs (or null if the model could not be rendered).
export function portrait(key) {
  if (!cache.has(key)) {
    pending += 1;
    clearTimeout(idleT);
    const p = queue.then(() => render(key)).catch(() => null).finally(() => {
      pending -= 1;
      if (pending === 0) { clearTimeout(idleT); idleT = setTimeout(release, 4000); }
    });
    queue = p.then(() => {});
    cache.set(key, p);
  }
  return cache.get(key);
}
