import * as THREE from 'three';

// Generates a skeleton + skin weights for supplied models that have no rig.
// Input meshes must already be baked into container space: feet at y=0,
// centred on x/z, facing +Z (character's left = +X).

const ss = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function makeBone(name, pos, parent, parentPos) {
  const b = new THREE.Bone();
  b.name = name;
  if (parent) {
    b.position.set(pos.x - parentPos.x, pos.y - parentPos.y, pos.z - parentPos.z);
    parent.add(b);
  } else {
    b.position.copy(pos);
  }
  b.userData.modelPos = pos.clone();
  return b;
}

// Collect every vertex across meshes for landmark detection.
function gatherPositions(geoms) {
  const pts = [];
  for (const g of geoms) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 1) pts.push(p.getX(i), p.getY(i), p.getZ(i));
  }
  return pts;
}

function writeSkin(geom, fn) {
  const p = geom.attributes.position;
  const idx = new Uint16Array(p.count * 4);
  const wts = new Float32Array(p.count * 4);
  const v = new THREE.Vector3();
  const pairs = [];
  for (let i = 0; i < p.count; i += 1) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    pairs.length = 0;
    fn(v, pairs); // pushes [boneIndex, weight]
    pairs.sort((a, b) => b[1] - a[1]);
    let sum = 0;
    for (let k = 0; k < 4 && k < pairs.length; k += 1) sum += pairs[k][1];
    if (sum <= 1e-6) { pairs.length = 0; pairs.push([0, 1]); sum = 1; }
    for (let k = 0; k < 4; k += 1) {
      if (k < pairs.length) {
        idx[i * 4 + k] = pairs[k][0];
        wts[i * 4 + k] = pairs[k][1] / sum;
      }
    }
  }
  geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
}

export function buildAutoHumanoid(container, bakedMeshes, H) {
  const geoms = bakedMeshes.map((m) => m.geometry);
  const pts = gatherPositions(geoms);

  const hipY = 0.5 * H;
  const kneeY = 0.275 * H;
  const ankleY = 0.05 * H;
  const shoulderY = 0.815 * H;
  const shoulderX = 0.105 * H;
  const hipX = 0.058 * H;

  // Arm direction per side: farthest vertex from the shoulder pivot among lateral vertices.
  const arm = {};
  for (const s of [1, -1]) {
    const S = new THREE.Vector3(s * shoulderX, shoulderY, 0);
    let best = -1;
    const F = new THREE.Vector3();
    // T-pose test: farthest lateral vertex in a band around shoulder height.
    let tipX = -1;
    const T = new THREE.Vector3();
    for (let i = 0; i < pts.length; i += 3) {
      if (Math.abs(pts[i + 1] - shoulderY) > 0.1 * H) continue;
      const x = pts[i] * s;
      if (x > tipX) { tipX = x; T.set(pts[i], pts[i + 1], pts[i + 2]); }
    }
    if (tipX > 0.36 * H) {
      best = T.distanceToSquared(S);
      F.copy(T);
    }
    for (let i = 0; best < 0 && i < pts.length; i += 3) {
      const x = pts[i] * s;
      const y = pts[i + 1];
      if (x < 0.19 * H || y < 0.33 * H) continue;
      const dx = pts[i] - S.x; const dy = y - S.y; const dz = pts[i + 2] - S.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d > best) { best = d; F.set(pts[i], y, pts[i + 2]); }
    }
    let len = Math.sqrt(Math.max(best, 0));
    let dir = F.clone().sub(S).normalize();
    if (best < 0 || len < 0.24 * H) {
      len = 0.38 * H;
      dir = new THREE.Vector3(s * 0.45, -0.89, 0).normalize();
    }
    arm[s] = {
      S, dir, len,
      E: S.clone().addScaledVector(dir, len * 0.44),
      W: S.clone().addScaledVector(dir, len * 0.8),
    };
  }

  // Bones
  const P = (x, y, z) => new THREE.Vector3(x, y, z);
  const pHips = P(0, hipY, 0);
  const hips = makeBone('j_hips', pHips, null);
  const pSpine = P(0, 0.6 * H, 0); const spine = makeBone('j_spine', pSpine, hips, pHips);
  const pChest = P(0, 0.71 * H, 0); const chest = makeBone('j_chest', pChest, spine, pSpine);
  const pNeck = P(0, 0.835 * H, 0); const neck = makeBone('j_neck', pNeck, chest, pChest);
  const pHead = P(0, 0.87 * H, 0); const head = makeBone('j_head', pHead, neck, pNeck);
  const bones = [hips, spine, chest, neck, head];
  const sideBones = {};
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'L' : 'R';
    const a = arm[s];
    const pClav = P(s * 0.035 * H, 0.8 * H, 0);
    const clav = makeBone(`j_clav${tag}`, pClav, chest, pChest);
    const ua = makeBone(`j_upperArm${tag}`, a.S, clav, pClav);
    const fa = makeBone(`j_foreArm${tag}`, a.E, ua, a.S);
    const hd = makeBone(`j_hand${tag}`, a.W, fa, a.E);
    const pTh = P(s * hipX, hipY, 0);
    const th = makeBone(`j_thigh${tag}`, pTh, hips, pHips);
    const pSh = P(s * hipX, kneeY, 0.008 * H);
    const sh = makeBone(`j_shin${tag}`, pSh, th, pTh);
    const pFt = P(s * hipX, ankleY, 0);
    const ft = makeBone(`j_foot${tag}`, pFt, sh, pSh);
    bones.push(clav, ua, fa, hd, th, sh, ft);
    sideBones[s] = { clav, ua, fa, hd, th, sh, ft };
  }
  const index = new Map(bones.map((b, i) => [b, i]));
  const bi = (b) => index.get(b);

  const torsoBands = [
    [bi(hips), -1e9, 0.56 * H],
    [bi(spine), 0.56 * H, 0.665 * H],
    [bi(chest), 0.665 * H, 0.825 * H],
    [bi(neck), 0.825 * H, 0.865 * H],
    [bi(head), 0.865 * H, 1e9],
  ];
  const blend = 0.025 * H;
  const tmp = new THREE.Vector3();

  const weightFn = (v, out) => {
    let remaining = 1;
    // arms
    for (const s of [1, -1]) {
      const a = arm[s];
      tmp.copy(v).sub(a.S);
      const t = tmp.dot(a.dir);
      const r = tmp.addScaledVector(a.dir, -t).length();
      let w = ss(-0.02 * H, 0.045 * H, t) * (1 - ss(0.085 * H, 0.13 * H, r)) * ss(shoulderX * 0.55, shoulderX * 1.0, v.x * s);
      if (v.y < 0.25 * H) w = 0;
      if (w <= 0.001) continue;
      w *= remaining;
      const b = sideBones[s];
      const tE = a.len * 0.44; const tW = a.len * 0.8;
      const fE = ss(tE - blend, tE + blend, t);
      const fW = ss(tW - blend * 0.6, tW + blend * 0.6, t);
      out.push([bi(b.ua), w * (1 - fE)]);
      out.push([bi(b.fa), w * fE * (1 - fW)]);
      out.push([bi(b.hd), w * fW]);
      remaining -= w;
    }
    // legs
    const legInf = (1 - ss(hipY - 0.075 * H, hipY + 0.015 * H, v.y)) * remaining;
    if (legInf > 0.001) {
      const left = ss(-0.028 * H, 0.028 * H, v.x);
      const fK = 1 - ss(kneeY - blend, kneeY + blend, v.y);
      const fA = 1 - ss(ankleY - blend * 0.5, ankleY + blend * 0.5, v.y);
      for (const [s, sw] of [[1, left], [-1, 1 - left]]) {
        const w = legInf * sw;
        if (w <= 0.001) continue;
        const b = sideBones[s];
        out.push([bi(b.th), w * (1 - fK)]);
        out.push([bi(b.sh), w * fK * (1 - fA)]);
        out.push([bi(b.ft), w * fA]);
      }
      remaining -= legInf;
    }
    if (remaining > 0.001) {
      // torso, blended between adjacent bands
      const y = v.y;
      for (let k = 0; k < torsoBands.length; k += 1) {
        const [b, lo, hi] = torsoBands[k];
        const wIn = ss(lo - blend, lo + blend, y) * (1 - ss(hi - blend, hi + blend, y));
        if (wIn > 0.001) out.push([b, remaining * wIn]);
      }
    }
  };

  for (const g of geoms) writeSkin(g, weightFn);

  hips.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  container.add(hips);
  container.updateMatrixWorld(true);
  const skinned = bakedMeshes.map((m) => {
    const sm = new THREE.SkinnedMesh(m.geometry, m.material);
    sm.name = m.name;
    container.add(sm);
    sm.updateMatrixWorld(true);
    sm.bind(skeleton, sm.matrixWorld);
    return sm;
  });

  return {
    skinned,
    joints: {
      hips: 'j_hips', spine: 'j_spine', chest: 'j_chest', neck: 'j_neck', head: 'j_head',
      clavL: 'j_clavL', upperArmL: 'j_upperArmL', foreArmL: 'j_foreArmL', handL: 'j_handL',
      clavR: 'j_clavR', upperArmR: 'j_upperArmR', foreArmR: 'j_foreArmR', handR: 'j_handR',
      thighL: 'j_thighL', shinL: 'j_shinL', footL: 'j_footL',
      thighR: 'j_thighR', shinR: 'j_shinR', footR: 'j_footR',
    },
  };
}

// Quadruped auto-rig for Slow Dancer (static mesh in the supplied file).
export function buildAutoHorse(container, bakedMeshes, H) {
  const geoms = bakedMeshes.map((m) => m.geometry);
  const pts = gatherPositions(geoms);
  let zMin = 1e9; let zMax = -1e9;
  for (let i = 0; i < pts.length; i += 3) { zMin = Math.min(zMin, pts[i + 2]); zMax = Math.max(zMax, pts[i + 2]); }

  // Leg columns from low vertices
  const low = [];
  for (let i = 0; i < pts.length; i += 3) if (pts[i + 1] < 0.22 * H) low.push([pts[i], pts[i + 2]]);
  let zc = 0;
  for (const p of low) zc += p[1];
  zc /= Math.max(1, low.length);
  const cols = { FL: [0, 0, 0], FR: [0, 0, 0], BL: [0, 0, 0], BR: [0, 0, 0] };
  for (const [x, z] of low) {
    const key = (z > zc ? 'F' : 'B') + (x > 0 ? 'L' : 'R');
    cols[key][0] += x; cols[key][1] += z; cols[key][2] += 1;
  }
  for (const k of Object.keys(cols)) {
    const c = cols[k];
    if (c[2] > 0) { c[0] /= c[2]; c[1] /= c[2]; } else {
      c[0] = k.endsWith('L') ? 0.15 : -0.15; c[1] = zc + (k.startsWith('F') ? 0.5 : -0.5);
    }
  }
  const frontZ = (cols.FL[1] + cols.FR[1]) / 2;
  const backZ = (cols.BL[1] + cols.BR[1]) / 2;

  const legTopY = 0.5 * H;
  const kneeY = 0.25 * H;
  const hoofY = 0.06 * H;
  const neckZ = frontZ + 0.12;
  const headZ = zMax - 0.62;
  const tailZ = backZ - 0.22;

  const P = (x, y, z) => new THREE.Vector3(x, y, z);
  const pBody = P(0, 0.58 * H, (frontZ + backZ) / 2);
  const body = makeBone('h_body', pBody, null);
  const pNeck = P(0, 0.6 * H, neckZ);
  const neck = makeBone('h_neck', pNeck, body, pBody);
  const pHead = P(0, 0.84 * H, headZ);
  const head = makeBone('h_head', pHead, neck, pNeck);
  const pTail = P(0, 0.6 * H, tailZ);
  const tail = makeBone('h_tail', pTail, body, pBody);
  const bones = [body, neck, head, tail];
  const legs = {};
  for (const k of ['FL', 'FR', 'BL', 'BR']) {
    const [x, z] = cols[k];
    const pU = P(x, legTopY, z);
    const u = makeBone(`h_${k}_upper`, pU, body, pBody);
    const pL = P(x, kneeY, z);
    const l = makeBone(`h_${k}_lower`, pL, u, pU);
    const pH = P(x, hoofY, z);
    const h = makeBone(`h_${k}_hoof`, pH, l, pL);
    bones.push(u, l, h);
    legs[k] = { u, l, h, x, z };
  }
  const index = new Map(bones.map((b, i) => [b, i]));
  const bi = (b) => index.get(b);

  const weightFn = (v, out) => {
    let remaining = 1;
    const legInf = 1 - ss(0.4 * H, 0.54 * H, v.y);
    if (legInf > 0.001) {
      // nearest leg column in xz
      let best = null; let bd = 1e9;
      for (const k of Object.keys(legs)) {
        const L = legs[k];
        const d = (v.x - L.x) ** 2 + (v.z - L.z) ** 2 * 0.6;
        if (d < bd) { bd = d; best = L; }
      }
      const fK = 1 - ss(kneeY - 0.05 * H, kneeY + 0.04 * H, v.y);
      const fH = 1 - ss(hoofY - 0.02 * H, hoofY + 0.025 * H, v.y);
      out.push([bi(best.u), legInf * (1 - fK)]);
      out.push([bi(best.l), legInf * fK * (1 - fH)]);
      out.push([bi(best.h), legInf * fH]);
      remaining -= legInf;
    }
    if (remaining > 0.001) {
      const fNeck = ss(neckZ - 0.12, neckZ + 0.22, v.z) * ss(0.5 * H, 0.6 * H, v.y + (v.z - neckZ) * 0.4);
      const fHead = ss(headZ - 0.12, headZ + 0.12, v.z) * fNeck;
      const fTail = ss(tailZ + 0.05, tailZ - 0.18, v.z) * ss(0.42 * H, 0.52 * H, v.y);
      out.push([bi(head), remaining * fHead]);
      out.push([bi(neck), remaining * (fNeck - fHead)]);
      out.push([bi(tail), remaining * fTail * (1 - fNeck)]);
      out.push([bi(body), remaining * (1 - fNeck) * (1 - fTail)]);
    }
  };
  for (const g of geoms) writeSkin(g, weightFn);

  body.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  container.add(body);
  container.updateMatrixWorld(true);
  const skinned = bakedMeshes.map((m) => {
    const sm = new THREE.SkinnedMesh(m.geometry, m.material);
    sm.name = m.name;
    container.add(sm);
    sm.updateMatrixWorld(true);
    sm.bind(skeleton, sm.matrixWorld);
    return sm;
  });
  return { skinned, saddle: P(0, 0.62 * H + 0.06, (frontZ + backZ) / 2 + 0.06), frontZ, backZ, H };
}
