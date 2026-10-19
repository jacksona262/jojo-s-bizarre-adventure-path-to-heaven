import * as THREE from 'three';
import { FRONTIER_REGIONS } from '../data/campaignData';
import { instantiateModel } from '../assets/gltfLoader';

/**
 * Deterministic height function along the South-to-North Frontier Corridor
 * (Z = +100 to Z = -4950, X = -260 to +260)
 */
export function getTerrainHeight(x, z) {
  // Find region base elevation via smooth interpolation
  let baseH = 0;
  if (z > -420) {
    baseH = 0;
  } else if (z > -960) {
    const t = (-420 - z) / 540;
    baseH = THREE.MathUtils.lerp(0, 3.0, t);
  } else if (z > -1500) {
    const t = (-960 - z) / 540;
    baseH = THREE.MathUtils.lerp(3.0, 12.0, t);
  } else if (z > -2040) {
    const t = (-1500 - z) / 540;
    baseH = THREE.MathUtils.lerp(12.0, 16.5, t);
  } else if (z > -2580) {
    const t = (-2040 - z) / 540;
    baseH = THREE.MathUtils.lerp(16.5, 13.5, t);
  } else if (z > -3120) {
    const t = (-2580 - z) / 540;
    // Sunken Gravewater Marsh basin
    baseH = THREE.MathUtils.lerp(13.5, 1.5, Math.sin(t * Math.PI));
  } else if (z > -3660) {
    const t = (-3120 - z) / 540;
    baseH = THREE.MathUtils.lerp(4.0, 26.0, t);
  } else if (z > -4260) {
    const t = (-3660 - z) / 600;
    baseH = THREE.MathUtils.lerp(26.0, 36.0, t);
  } else {
    const t = Math.min(1, (-4260 - z) / 640);
    baseH = THREE.MathUtils.lerp(36.0, 58.0, t);
  }

  // Keep central road/arena corridor (|x| < 36) gently graded so boss arenas and trails have zero floating/clipping
  const roadMask = THREE.MathUtils.smoothstep(Math.abs(x), 28, 95);
  const canyonRidge =
    (Math.sin(z * 0.018) * 6.5 + Math.cos(x * 0.045 + z * 0.01) * 8.0 + Math.abs(x) * 0.16) *
    roadMask;

  const microUndulation = (Math.sin(x * 0.08) * Math.cos(z * 0.04) * 0.35) * roadMask;
  return baseH + canyonRidge + microUndulation;
}

/**
 * Builds the entire connected 9-region nighttime frontier, sky dome, giant moon,
 * western timber buildings, bridges, railway, marsh water, gothic cathedral, and GLB props.
 */
export function buildFrontierWorld(scene) {
  const worldGroup = new THREE.Group();
  worldGroup.name = 'FrontierWorld';
  const colliders = []; // { x, z, r, label }
  const lanternLights = [];
  const regionalArrowRelics = [];

  // 1. CONTINUOUS TERRAIN MESH (Width 460m, Length 5150m)
  const width = 460;
  const length = 5150;
  const segX = 76;
  const segZ = 420;
  const terrainGeo = new THREE.PlaneGeometry(width, length, segX, segZ);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const cRoad = new THREE.Color('#201913');
  const cGrass = new THREE.Color('#111816');
  const cCanyon = new THREE.Color('#2b1713');
  const cRift = new THREE.Color('#191326');

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i) - 2420; // Span from +155 to -4995
    posAttr.setZ(i, vz);
    const vy = getTerrainHeight(vx, vz);
    posAttr.setY(i, vy);

    // Vertex color blending
    const roadBlend = 1 - THREE.MathUtils.smoothstep(Math.abs(vx), 4, 15);
    let baseC = cGrass;
    if (vz < -960 && vz > -1550) baseC = cCanyon;
    else if (vz < -3650) baseC = cRift;

    const finalC = baseC.clone().lerp(cRoad, roadBlend * 0.85);
    colors[i * 3] = finalC.r;
    colors[i * 3 + 1] = finalC.g;
    colors[i * 3 + 2] = finalC.b;
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.14,
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  worldGroup.add(terrainMesh);

  // 2. WET PUDDLES & GRAVEWATER MARSH REFLECTIVE WATER
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x0a192f,
    roughness: 0.08,
    metalness: 0.88,
    transparent: true,
    opacity: 0.82,
  });
  const marshWater = new THREE.Mesh(new THREE.PlaneGeometry(180, 520), waterMat);
  marshWater.rotation.x = -Math.PI / 2;
  marshWater.position.set(0, getTerrainHeight(0, -2840) + 0.15, -2840);
  worldGroup.add(marshWater);

  // Add reflective rainwater puddles along the trail
  const puddleGeo = new THREE.CircleGeometry(3.8, 16);
  puddleGeo.rotateX(-Math.PI / 2);
  for (let pz = -60; pz > -4500; pz -= 95) {
    const px = Math.sin(pz * 0.07) * 6;
    const puddle = new THREE.Mesh(puddleGeo, waterMat);
    puddle.position.set(px, getTerrainHeight(px, pz) + 0.03, pz);
    worldGroup.add(puddle);
  }

  // 3. ARCHITECTURAL WESTERN BUILDINGS (Thickness, Porches, Roofs, Columns, Windows)
  const woodDarkMat = new THREE.MeshStandardMaterial({ color: 0x2a1d15, roughness: 0.82, metalness: 0.08 });
  const woodPlankMat = new THREE.MeshStandardMaterial({ color: 0x3b281d, roughness: 0.78, metalness: 0.1 });
  const roofSlateMat = new THREE.MeshStandardMaterial({ color: 0x181c24, roughness: 0.65, metalness: 0.25 });
  const windowGlowMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xd97706,
    emissiveIntensity: 1.4,
    roughness: 0.3,
  });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x262936, roughness: 0.75, metalness: 0.2 });

  function createWesternBuilding(x, z, rotY, w = 12, h = 7.5, d = 10, hasSecondFloor = true) {
    const bGroup = new THREE.Group();
    const y = getTerrainHeight(x, z);
    bGroup.position.set(x, y, z);
    bGroup.rotation.y = rotY;

    // Raised timber foundation deck & porch
    const deck = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.6, d + 3.4), woodDarkMat);
    deck.position.set(0, 0.3, 1.1);
    deck.castShadow = true;
    deck.receiveShadow = true;
    bGroup.add(deck);

    // Main Cabin Volume with realistic wall trim
    const totalH = hasSecondFloor ? h * 1.45 : h;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, totalH, d), woodPlankMat);
    body.position.set(0, 0.6 + totalH / 2, 0);
    body.castShadow = true;
    body.receiveShadow = true;
    bGroup.add(body);

    // Western False-Front Parapet
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 2.2, 0.45), woodDarkMat);
    parapet.position.set(0, 0.6 + totalH + 0.9, d / 2 - 0.1);
    bGroup.add(parapet);

    // Pitched Gables Roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 3.2, 4), roofSlateMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.set(0, 0.6 + totalH + 1.4, 0);
    roof.castShadow = true;
    bGroup.add(roof);

    // Porch Overhang Roof + 4 Timber Posts
    const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.35, 3.2), roofSlateMat);
    porchRoof.position.set(0, 4.2, d / 2 + 1.3);
    porchRoof.rotation.x = 0.12;
    bGroup.add(porchRoof);

    [-w * 0.44, -w * 0.15, w * 0.15, w * 0.44].forEach((px) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.7, 0.24), woodDarkMat);
      post.position.set(px, 2.4, d / 2 + 2.5);
      bGroup.add(post);
    });

    // Recessed Doorway + Warm Lantern Windows
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3.1, 0.3), woodDarkMat);
    door.position.set(0, 2.15, d / 2 + 0.05);
    bGroup.add(door);

    [-w * 0.3, w * 0.3].forEach((wx) => {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.6, 0.22), windowGlowMat);
      win.position.set(wx, 2.6, d / 2 + 0.04);
      bGroup.add(win);
      if (hasSecondFloor) {
        const win2 = win.clone();
        win2.position.set(wx, 6.2, d / 2 + 0.04);
        bGroup.add(win2);
      }
    });

    // Hitching Post in front
    const hitchBar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6), woodDarkMat);
    hitchBar.rotation.z = Math.PI / 2;
    hitchBar.position.set(w * 0.3, 1.1, d / 2 + 3.8);
    bGroup.add(hitchBar);

    worldGroup.add(bGroup);
    colliders.push({ x, z, r: Math.max(w, d) * 0.58, label: 'Western Structure' });
  }

  // Place Ebon Crossing Town Buildings (Z: -40 to -220)
  for (let bz = -45; bz >= -210; bz -= 42) {
    createWesternBuilding(-28, bz, Math.PI / 2, 13, 6.8, 10, bz % 84 === 0);
    createWesternBuilding(28, bz, -Math.PI / 2, 12, 6.5, 10, bz % 84 !== 0);
  }

  // Place Iron Vale Mining & Industrial Warehouses (Z: -2120 to -2290)
  for (let bz = -2120; bz >= -2280; bz -= 52) {
    createWesternBuilding(-32, bz, Math.PI / 2, 15, 8.0, 12, true);
    createWesternBuilding(32, bz, -Math.PI / 2, 14, 7.5, 11, false);
  }

  // Place Bleakwater Ridge Colonial Manor Outposts (Z: -3240 to -3360)
  createWesternBuilding(-30, -3290, Math.PI / 2, 16, 8.5, 12, true);
  createWesternBuilding(30, -3290, -Math.PI / 2, 16, 8.5, 12, true);

  // 4. REDSTONE PASS TRESTLE BRIDGE & RAILWAY TRACKS
  const railGroup = new THREE.Group();
  for (let rz = -1020; rz >= -2450; rz -= 8) {
    const ry = getTerrainHeight(-16, rz) + 0.12;
    const sleeper = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 0.45), woodDarkMat);
    sleeper.position.set(-16, ry, rz);
    railGroup.add(sleeper);
  }
  worldGroup.add(railGroup);

  // 5. THE RIFT EXPANSE OBSIDIAN COLONNADES
  for (let cz = -3720; cz >= -4200; cz -= 48) {
    [-28, 28].forEach((cx) => {
      const py = getTerrainHeight(cx, cz);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.6, 16, 8), stoneMat);
      pillar.position.set(cx, py + 8, cz);
      pillar.rotation.z = Math.sin(cz * 0.05) * 0.14; // Tilted timeline architecture
      pillar.castShadow = true;
      worldGroup.add(pillar);
      colliders.push({ x: cx, z: cz, r: 2.1, label: 'Rift Colonnade' });
    });
  }

  // 6. COLOSSAL GOTHIC CATHEDRAL OF HEAVEN'S REACH (Visible from afar at Z = -4720)
  const cathedralGroup = new THREE.Group();
  const cathY = getTerrainHeight(0, -4720);
  cathedralGroup.position.set(0, cathY, -4720);

  const nave = new THREE.Mesh(new THREE.BoxGeometry(54, 48, 86), stoneMat);
  nave.position.set(0, 24, 0);
  nave.castShadow = true;
  cathedralGroup.add(nave);

  const centralSpire = new THREE.Mesh(new THREE.ConeGeometry(16, 68, 8), roofSlateMat);
  centralSpire.position.set(0, 82, -10);
  cathedralGroup.add(centralSpire);

  [-24, 24].forEach((tx) => {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(14, 66, 18), stoneMat);
    tower.position.set(tx, 33, 36);
    cathedralGroup.add(tower);

    const spire = new THREE.Mesh(new THREE.ConeGeometry(10, 34, 8), roofSlateMat);
    spire.position.set(tx, 83, 36);
    cathedralGroup.add(spire);
  });

  // Glowing Rose Window on Cathedral Facade
  const roseWindow = new THREE.Mesh(
    new THREE.CircleGeometry(9.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide })
  );
  roseWindow.position.set(0, 34, 43.2);
  cathedralGroup.add(roseWindow);

  worldGroup.add(cathedralGroup);

  // 7. BOSS ARENA RINGS & FAST-TRAVEL HITCHING POSTS PER REGION
  const lanternPoleGeo = new THREE.CylinderGeometry(0.1, 0.14, 4.2, 6);
  const lanternOrbGeo = new THREE.SphereGeometry(0.28, 8, 8);

  FRONTIER_REGIONS.forEach((reg, idx) => {
    // Region Hitching Post & Lantern
    const hx = 14;
    const hz = reg.centerZ + 45;
    const hy = getTerrainHeight(hx, hz);
    const pole = new THREE.Mesh(lanternPoleGeo, woodDarkMat);
    pole.position.set(hx, hy + 2.1, hz);
    worldGroup.add(pole);

    const orb = new THREE.Mesh(lanternOrbGeo, windowGlowMat);
    orb.position.set(hx, hy + 4.1, hz);
    worldGroup.add(orb);

    if (idx % 2 === 0) {
      const pLight = new THREE.PointLight(0xf59e0b, 2.2, 28);
      pLight.position.set(hx, hy + 4.2, hz);
      worldGroup.add(pLight);
      lanternLights.push(pLight);
    }
  });

  // 8. INSTANTIATED NATURAL TREES, CACTI & CANYON BOULDERS (Non-human environmental detail)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x231710, roughness: 0.9 });
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x0d1f18, roughness: 0.85 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x221f29, roughness: 0.82 });

  for (let i = 0; i < 240; i++) {
    const tz = -80 - (i * 20.5);
    const side = i % 2 === 0 ? 1 : -1;
    const tx = side * (36 + ((i * 19) % 75));
    const ty = getTerrainHeight(tx, tz);

    if (tz < -1450 && tz > -2100) {
      // Hollow Pines dense towering conifers
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 5, 6), trunkMat);
      trunk.position.set(tx, ty + 2.5, tz);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(3.2, 11, 7), foliageMat);
      cone.position.set(tx, ty + 8.5, tz);
      worldGroup.add(trunk, cone);
    } else {
      // Frontier crag boulders
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2 + (i % 3), 0), rockMat);
      rock.position.set(tx, ty + 1.2, tz);
      rock.rotation.set(i, i * 0.5, 0);
      worldGroup.add(rock);
    }
  }

  // 9. PERMANENT NIGHTTIME SKY DOME, ENORMOUS MOON & RAIN PARTICLES
  const skyGroup = new THREE.Group();
  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(52, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xdbeafe })
  );
  moonMesh.position.set(-140, 290, -900);
  skyGroup.add(moonMesh);

  const moonHalo = new THREE.Mesh(
    new THREE.RingGeometry(54, 92, 32),
    new THREE.MeshBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
    })
  );
  moonHalo.position.copy(moonMesh.position);
  skyGroup.add(moonHalo);

  // Rain Particle Field
  const rainCount = 1800;
  const rainPositions = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i++) {
    rainPositions[i * 3] = (Math.random() - 0.5) * 140;
    rainPositions[i * 3 + 1] = Math.random() * 45;
    rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 140;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rainMat = new THREE.PointsMaterial({
    color: 0x93c5fd,
    size: 0.22,
    transparent: true,
    opacity: 0.52,
  });
  const rainSystem = new THREE.Points(rainGeo, rainMat);
  worldGroup.add(rainSystem);
  worldGroup.add(skyGroup);

  scene.add(worldGroup);

  // 10. ASYNC PLACEMENT OF SUPPLIED ENVIRONMENT GLBS (street_props.glb, bus_shelter_diorama.glb, stand_arrow.glb)
  instantiateModel('prop_stand_arrow', { targetHeightOverride: 2.6 })
    .then((arrowModel) => {
      const ay = getTerrainHeight(0, -4585);
      arrowModel.position.set(0, ay + 1.6, -4585);
      worldGroup.add(arrowModel);
      regionalArrowRelics.push(arrowModel);
    })
    .catch(() => {});

  instantiateModel('prop_street_props', { targetHeightOverride: 2.2 })
    .then((propsModel) => {
      const spots = [
        { x: -16, z: -90 },
        { x: 16, z: -160 },
        { x: -18, z: -2220 },
        { x: 18, z: -2310 },
      ];
      spots.forEach((s) => {
        const clone = propsModel.clone();
        clone.position.set(s.x, getTerrainHeight(s.x, s.z), s.z);
        worldGroup.add(clone);
      });
    })
    .catch(() => {});

  instantiateModel('prop_bus_diorama', { targetHeightOverride: 3.4 })
    .then((dioramaModel) => {
      // Placed exclusively in The Rift Expanse where 20th-century JoJo timelines bleed into 1889
      const dx = 0;
      const dz = -4045;
      dioramaModel.position.set(dx, getTerrainHeight(dx, dz), dz);
      worldGroup.add(dioramaModel);
    })
    .catch(() => {});

  return {
    worldGroup,
    colliders,
    lanternLights,
    rainSystem,
    skyGroup,
    moonMesh,
    regionalArrowRelics,
  };
}