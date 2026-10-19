import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { FILES, PARTS } from './manifest';
import { buildAutoHumanoid, buildAutoHorse } from '../anim/AutoRig';
import { HumanoidRig } from '../anim/HumanoidRig';
import { rest as restPose } from '../anim/Poses';

// Exact node-name comparison (GLTFLoader sanitises names: whitespace -> '_', strips []:./).
export const sanitize = (s) => (s || '').replace(/\s/g, '_').replace(/[[\]\.:/]/g, '');
// Bone-name comparison: drop Sketchfab's trailing _<index>, punctuation and case.
export const boneKey = (s) => sanitize(s).replace(/_\d+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const loader = new GLTFLoader();
const fileCache = new Map();
const templateCache = new Map();
const listeners = new Set();
const progress = { loaded: 0, total: 0 };

export function onAssetProgress(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() { for (const fn of listeners) fn({ ...progress }); }

export function loadFile(fileKey) {
  if (fileCache.has(fileKey)) return fileCache.get(fileKey);
  const url = encodeURI(FILES[fileKey]);
  progress.total += 1; emit();
  const p = loader.loadAsync(url).then(async (g) => {
    await restoreSpecGloss(g);
    progress.loaded += 1; emit();
    return g;
  });
  fileCache.set(fileKey, p);
  return p;
}

// three.js dropped KHR_materials_pbrSpecularGlossiness; Slow Dancer uses it, so map its
// diffuse texture/colour onto the standard material the loader produced.
async function restoreSpecGloss(gltf) {
  const json = gltf.parser.json;
  const jobs = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const assoc = gltf.parser.associations.get(o.material);
    const mi = assoc ? assoc.materials : undefined;
    if (mi === undefined) return;
    const ext = json.materials[mi]?.extensions?.KHR_materials_pbrSpecularGlossiness;
    if (!ext) return;
    const m = o.material;
    if (ext.diffuseFactor) m.color.setRGB(ext.diffuseFactor[0], ext.diffuseFactor[1], ext.diffuseFactor[2]);
    m.metalness = 0;
    m.roughness = 1 - (ext.glossinessFactor ?? 0.5) * 0.55;
    if (ext.diffuseTexture) {
      jobs.push(gltf.parser.getDependency('texture', ext.diffuseTexture.index).then((t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        m.map = t;
        m.needsUpdate = true;
      }));
    }
  });
  await Promise.all(jobs);
}

function upgradeMaterial(m) {
  // Unlit materials look like cardboard under a moonlit scene; give them a lit equivalent.
  if (m.isMeshBasicMaterial) {
    const n = new THREE.MeshStandardMaterial({
      map: m.map, color: m.color, transparent: m.transparent, opacity: m.opacity,
      alphaTest: m.alphaTest, side: m.side, roughness: 0.75, metalness: 0,
    });
    n.name = m.name;
    return n;
  }
  if (m.isMeshStandardMaterial) {
    if (m.roughness < 0.35 && !m.metalnessMap) m.roughness = 0.45;
    if (m.transparent && m.map && m.opacity >= 0.99) {
      m.transparent = false;
      m.alphaTest = Math.max(m.alphaTest, 0.4);
    }
  }
  return m;
}

function selectNodes(root, spec) {
  const sel = [];
  if (spec.subtree) {
    const key = sanitize(spec.subtree);
    root.traverse((o) => { if (!sel.length && o.name === key) sel.push(o); });
    if (!sel.length) console.warn('[assets] subtree not found', spec.subtree);
  } else if (spec.meshes) {
    const keys = new Set(spec.meshes.map(sanitize));
    root.traverse((o) => { if (keys.has(o.name)) sel.push(o); });
  } else {
    sel.push(root);
  }
  return sel;
}

function measure(obj) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3();
  obj.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    let b;
    if (o.isSkinnedMesh) { o.computeBoundingBox(); b = o.boundingBox.clone(); } else {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      b = o.geometry.boundingBox.clone();
    }
    b.applyMatrix4(o.matrixWorld);
    box.union(b);
  });
  return box;
}

async function buildTemplate(partKey) {
  const spec = PARTS[partKey];
  if (!spec) throw new Error(`Unknown part ${partKey}`);
  const gltf = await loadFile(spec.file);
  const src = SkeletonUtils.clone(gltf.scene);
  src.updateMatrixWorld(true);

  const container = new THREE.Group();
  container.name = `part:${partKey}`;
  const inner = new THREE.Group();
  inner.name = 'inner';
  container.add(inner);

  const sel = selectNodes(src, spec);
  for (const n of sel) inner.attach(n);
  const excl = new Set((spec.exclude || []).map(sanitize));
  const drop = [];
  inner.traverse((o) => { if (o.isMesh && excl.has(o.name)) drop.push(o); });
  for (const o of drop) o.removeFromParent();

  inner.traverse((o) => {
    if (o.isMesh) {
      o.material = Array.isArray(o.material) ? o.material.map(upgradeMaterial) : upgradeMaterial(o.material);
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = !o.isSkinnedMesh;
    }
  });

  // Normalise: yaw, scale, feet on ground, centred.
  if (spec.yaw) inner.rotation.y = spec.yaw;
  let box = measure(container);
  const size = box.getSize(new THREE.Vector3());
  if (spec.height) {
    const ref = spec.axis === 'length' ? Math.max(size.x, size.y, size.z) : size.y;
    inner.scale.setScalar(spec.height / ref);
  }
  box = measure(container);
  const c = box.getCenter(new THREE.Vector3());
  inner.position.x -= c.x;
  inner.position.z -= c.z;
  inner.position.y -= box.min.y;
  container.updateMatrixWorld(true);

  const info = { partKey, spec, joints: null, horse: null };
  const rigType = spec.rig?.type;
  if (rigType === 'auto-humanoid' || rigType === 'auto-horse') {
    // Bake static meshes into container space, then skin them.
    const baked = [];
    inner.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, o.material);
      mesh.name = o.name;
      baked.push(mesh);
    });
    container.remove(inner);
    const H = measure(container).max.y || spec.height;
    let hMax = 0;
    for (const m of baked) { m.geometry.computeBoundingBox(); hMax = Math.max(hMax, m.geometry.boundingBox.max.y); }
    if (rigType === 'auto-humanoid') {
      const r = buildAutoHumanoid(container, baked, hMax || H);
      info.joints = r.joints;
    } else {
      info.horse = buildAutoHorse(container, baked, hMax || H);
    }
    container.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    });
  } else if (rigType === 'bones') {
    const prefix = spec.rig.prefix || '';
    const byKey = new Map();
    container.traverse((o) => { if (o.isBone) byKey.set(boneKey(o.name), o.name); });
    const joints = {};
    for (const [joint, name] of Object.entries(spec.rig.map)) {
      const found = byKey.get(prefix + name);
      if (found) joints[joint] = found;
    }
    info.joints = joints;
    const missing = Object.keys(spec.rig.map).filter((j) => !joints[j]);
    if (missing.length) console.warn(`[assets] ${partKey} missing joints:`, missing.join(','));
    // Rigs bound in crouched/action poses were measured too short: re-measure upright.
    if (spec.height) {
      const rig = new HumanoidRig(container, joints);
      rig.apply(restPose());
      const b = measure(container);
      const h = b.max.y - b.min.y;
      for (const [j, bone] of Object.entries(rig.bones)) bone.quaternion.copy(rig.bind[j].local);
      container.position.y = 0;
      if (h > 0 && Math.abs(h - spec.height) / spec.height > 0.04) {
        inner.scale.multiplyScalar(spec.height / h);
        const b2 = measure(container);
        const c2 = b2.getCenter(new THREE.Vector3());
        inner.position.x -= c2.x;
        inner.position.z -= c2.z;
        inner.position.y -= b2.min.y;
        container.updateMatrixWorld(true);
      }
    }
  }
  container.userData.info = info;
  return container;
}

export function getTemplate(partKey) {
  if (!templateCache.has(partKey)) templateCache.set(partKey, buildTemplate(partKey));
  return templateCache.get(partKey);
}

export function preload(partKeys) {
  return Promise.all(partKeys.map(getTemplate));
}

// A fresh, independently animatable instance with its own materials.
export async function instantiate(partKey, { ownMaterials = true } = {}) {
  const tpl = await getTemplate(partKey);
  const obj = SkeletonUtils.clone(tpl);
  const info = tpl.userData.info;
  obj.userData.info = info;
  const mats = [];
  if (ownMaterials) {
    const map = new Map();
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const conv = (m) => {
        if (!map.has(m)) {
          const c = m.clone();
          c.userData.baseEmissive = c.emissive ? c.emissive.clone() : null;
          map.set(m, c);
          mats.push(c);
        }
        return map.get(m);
      };
      o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    });
  }
  obj.userData.materials = mats;
  if (info.joints) {
    const rig = new HumanoidRig(obj, info.joints);
    if (info.groundY === undefined) info.groundY = rig.calibrateGround(restPose());
    rig.groundY = info.groundY;
    obj.userData.rig = rig;
  }
  return obj;
}

export function partSpec(partKey) { return PARTS[partKey]; }
