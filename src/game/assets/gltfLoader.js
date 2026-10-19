import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ASSET_MANIFEST, ASSET_BY_ID } from './assetManifest';

const loader = new GLTFLoader();
const rawCache = new Map();
const loadPromises = new Map();

// Runtime status tracker for all 28 GLBs
export const assetRegistryStatus = new Map(
  ASSET_MANIFEST.map((item) => [
    item.id,
    {
      id: item.id,
      fileName: item.fileName,
      role: item.role,
      status: 'pending', // 'pending' | 'loading' | 'loaded' | 'error'
      meshCount: 0,
      skinCount: 0,
      animCount: 0,
      error: null,
    },
  ])
);

const statusListeners = new Set();
export function subscribeAssetStatus(cb) {
  statusListeners.add(cb);
  return () => statusListeners.delete(cb);
}
function notifyStatus() {
  const snapshot = Array.from(assetRegistryStatus.values());
  statusListeners.forEach((cb) => cb(snapshot));
}

export async function loadRawGLTF(assetId) {
  const meta = ASSET_BY_ID[assetId];
  if (!meta) throw new Error(`Unknown assetId: ${assetId}`);

  if (rawCache.has(assetId)) return rawCache.get(assetId);
  if (loadPromises.has(assetId)) return loadPromises.get(assetId);

  const st = assetRegistryStatus.get(assetId);
  if (st) {
    st.status = 'loading';
    notifyStatus();
  }

  const encodedUrl = encodeURI(meta.url);
  const promise = new Promise((resolve, reject) => {
    loader.load(
      encodedUrl,
      (gltf) => {
        let meshes = 0;
        let skins = 0;
        gltf.scene.traverse((child) => {
          if (child.isMesh) {
            meshes++;
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m) => {
              if (!m) return;
              m.side = THREE.DoubleSide;
              if (m.transparent && m.opacity > 0.95) {
                m.transparent = false;
              }
              m.depthWrite = true;
            });
          }
          if (child.isSkinnedMesh) skins++;
        });

        if (st) {
          st.status = 'loaded';
          st.meshCount = meshes;
          st.skinCount = skins;
          st.animCount = gltf.animations?.length || 0;
          notifyStatus();
        }
        rawCache.set(assetId, gltf);
        resolve(gltf);
      },
      undefined,
      (err) => {
        if (st) {
          st.status = 'error';
          st.error = err?.message || 'Failed to load GLB';
          notifyStatus();
        }
        reject(err);
      }
    );
  });

  loadPromises.set(assetId, promise);
  return promise;
}

/**
 * Computes accurate world bounding box of ONLY visible meshes inside `root`.
 */
function computeVisibleBox(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  let hasPoints = false;

  root.traverse((node) => {
    if (!node.visible) return;
    // Check if any ancestor is invisible
    let p = node.parent;
    while (p && p !== root.parent) {
      if (!p.visible) return;
      p = p.parent;
    }
    if (node.isMesh && node.geometry) {
      if (!node.geometry.boundingBox) {
        node.geometry.computeBoundingBox();
      }
      const geomBox = node.geometry.boundingBox.clone();
      geomBox.applyMatrix4(node.matrixWorld);
      if (
        Number.isFinite(geomBox.min.x) &&
        Number.isFinite(geomBox.max.x) &&
        geomBox.max.y - geomBox.min.y < 10000
      ) {
        box.union(geomBox);
        hasPoints = true;
      }
    }
  });

  if (!hasPoints) {
    box.setFromCenterAndSize(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 2, 1));
  }
  return box;
}

/**
 * Clones and normalizes an asset (or a specific sub-rig / sub-mesh of a combined asset)
 * so its feet sit at Y=0, its center is at X=0, Z=0, and its height matches targetHeight.
 *
 * part: 'full' | 'wielder' | 'stand'
 */
export async function instantiateModel(assetId, options = {}) {
  const { part = 'full', targetHeightOverride = null } = options;
  const meta = ASSET_BY_ID[assetId];
  const gltf = await loadRawGLTF(assetId);

  const clonedScene = SkeletonUtils.clone(gltf.scene);

  // Hide shadow/backdrop plane in loading screen model if used in 3D space
  if (assetId === 'dio_cinematic' && options.hideBackdropPlane) {
    clonedScene.traverse((n) => {
      if (n.name === 'Plane_0' || n.name === 'Object_4') {
        n.visible = false;
      }
    });
  }

  // Handle Dual-Rig models (main character.glb, funny_valentine__d4c__sbr.glb, giorno_giovanna__gold_experience.glb)
  if (meta.dualRig && (part === 'wielder' || part === 'stand')) {
    const hideNodeName = part === 'wielder' ? meta.dualRig.standNode : meta.dualRig.wielderNode;
    const hideMeshName = part === 'wielder' ? meta.dualRig.standMeshNode : meta.dualRig.wielderMeshNode;
    clonedScene.traverse((n) => {
      if (n.name === hideNodeName || (hideMeshName && n.name === hideMeshName)) {
        n.visible = false;
      }
    });
  }

  // Handle 2-Mesh spatially split static models (Avdol, Kakyoin, Josuke, Jotaro, N'Doul, D'Arby brothers)
  if (meta.splitMeshes && (part === 'wielder' || part === 'stand')) {
    const hideMeshName = part === 'wielder' ? meta.splitMeshes.standMesh : meta.splitMeshes.wielderMesh;
    clonedScene.traverse((n) => {
      if (n.name === hideMeshName) {
        n.visible = false;
      }
    });
  }

  const container = new THREE.Group();
  container.name = `${assetId}_${part}`;
  const pivot = new THREE.Group();
  pivot.add(clonedScene);
  container.add(pivot);

  const box = computeVisibleBox(clonedScene);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const desiredHeight = targetHeightOverride || meta.targetHeight || 1.9;
  const rawHeight = Math.max(size.y, 0.001);
  const scale = desiredHeight / rawHeight;

  pivot.scale.setScalar(scale);
  pivot.position.set(
    -center.x * scale,
    -box.min.y * scale,
    -center.z * scale
  );

  // Collect bone dictionary for procedural animation
  const bones = {};
  clonedScene.traverse((n) => {
    if (n.isBone || n.name) {
      bones[n.name] = n;
    }
    if (n.isMesh) {
      n.frustumCulled = false;
    }
  });

  // For Polnareff, attach non-humanoid spectral Silver Chariot rapier conduit to weapon hand bone
  if (assetId === 'boss_polnareff') {
    const handBone = bones['3pln01t0 r wep d_051'] || bones['3pln01t0 r hand_038'];
    if (handBone) {
      const rapierGroup = createSilverChariotRapierConduit();
      handBone.add(rapierGroup);
      container.userData.rapierConduit = rapierGroup;
    }
  }

  container.userData = {
    ...container.userData,
    assetId,
    part,
    meta,
    bones,
    clonedScene,
    pivot,
    animations: gltf.animations || [],
    normalizedHeight: desiredHeight,
  };

  return container;
}

/**
 * Non-humanoid crystalline Silver Rapier conduit for Polnareff
 * (since polnereff_eoh.glb does not include a separate Silver Chariot mesh).
 */
function createSilverChariotRapierConduit() {
  const g = new THREE.Group();
  g.name = 'SilverChariot_RapierConduit';

  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.55,
    metalness: 0.95,
    roughness: 0.12,
  });
  const guardMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xa16207,
    emissiveIntensity: 0.35,
    metalness: 0.9,
    roughness: 0.2,
  });

  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.025, 1.35, 8), bladeMat);
  blade.position.y = 0.72;
  g.add(blade);

  const cupGuard = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), guardMat);
  cupGuard.position.y = 0.08;
  g.add(cupGuard);

  const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 8), guardMat);
  cross.rotation.z = Math.PI / 2;
  cross.position.y = 0.06;
  g.add(cross);

  return g;
}

/**
 * Preloads core campaign models first, then streams the remaining 28 GLBs in background
 * so gameplay starts quickly and every single model is verified.
 */
export async function preloadAll28Assets(onProgress) {
  const priorityOrder = [
    'dio_cinematic',
    'dio_normal',
    'horse_slow_dancer',
    'prop_stand_arrow',
    'boss_avdol',
    'npc_enya',
    'prop_street_props',
    ...ASSET_MANIFEST.map((a) => a.id),
  ];
  const uniqueIds = Array.from(new Set(priorityOrder));
  let completed = 0;

  for (const id of uniqueIds) {
    try {
      await loadRawGLTF(id);
    } catch (e) {
      console.warn(`Asset load warning for ${id}:`, e);
    }
    completed++;
    if (onProgress) {
      onProgress(completed, uniqueIds.length, ASSET_BY_ID[id]);
    }
  }
  return Array.from(assetRegistryStatus.values());
}