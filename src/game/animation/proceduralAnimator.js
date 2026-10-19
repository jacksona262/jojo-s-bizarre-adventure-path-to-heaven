import * as THREE from 'three';

/**
 * Procedural Skeletal & Articulated Pose Animator for all 28 JoJo GLB models.
 * - For skinned meshes (main character.glb DIO_248 & ZA WARUDO_496, dio_over_heaven, polnereff_eoh,
 *   enrico_pucci, c-moonsee_moon, killer_queen, funny_valentine, giorno_giovanna, loading_dio),
 *   applies smooth additive bone rotations relative to each bone's bind pose.
 * - For static sculptural models (Avdol, Kakyoin, Josuke, Jotaro, Kira, Diavolo, Slow Dancer, etc.),
 *   applies truthful articulated root/pivot dynamics (stride banking, attack windup/lunge/recovery,
 *   breathing, hit-stagger, and synchronized Stand hover/rush motion).
 */

export function registerBindPose(modelContainer) {
  if (!modelContainer || modelContainer.userData.bindPoseSaved) return;
  const bindRotations = {};
  const bones = modelContainer.userData.bones || {};

  Object.entries(bones).forEach(([name, node]) => {
    if (node && node.rotation) {
      bindRotations[name] = node.rotation.clone();
    }
  });

  // Resolve semantic bone keys across the different GLB rig conventions
  const findBone = (patterns) => {
    for (const pat of patterns) {
      const match = Object.keys(bones).find((k) => pat.test(k));
      if (match) return bones[match];
    }
    return null;
  };

  modelContainer.userData.bindRotations = bindRotations;
  modelContainer.userData.rigMap = {
    hips: findBone([/^root hips_156$/i, /^root hips_342$/i, /Pelvis_00/i, /^Hips_03$/i, /^Hips_102$/i, /mixamorig:Hips/i, /3pln01t0 pelvis/i, /^root hips_143$/i]),
    spineLower: findBone([/^spine lower_155$/i, /^spine lower_341$/i, /Bip01_Spine_07/i, /^Spine_04$/i, /^Spine1_89$/i, /mixamorig:Spine_0/i, /3pln01t0 spine_05/i, /4klq01t0 spine_04/i, /^spine lower_142$/i]),
    spineUpper: findBone([/^spine upper_153$/i, /^spine upper_339$/i, /Bip01_Spine2/i, /^Chest_05$/i, /^Chest_87$/i, /mixamorig:Spine2/i, /3pln01t0 spine2/i, /4klq01t0 spine2/i, /^spine upper_140$/i]),
    head: findBone([/^head neck upper_95$/i, /Bip01_Head1/i, /^Head_07$/i, /^Head_85$/i, /mixamorig:Head_0/i, /3pln01t0 head/i, /4klq01t0 head/i, /head00_011/i, /^head neck upper_90$/i]),
    leftUpperArm: findBone([/^a\.l_120$/i, /^arm  shoulder l\.001_283$/i, /Bip01_L_UpperArm/i, /^Left arm_061$/i, /^LArm_23$/i, /mixamorig:LeftArm/i, /3pln01t0 l upperarm/i, /4klq01t0 l upperarm/i, /arm00_051/i]),
    leftForeArm: findBone([/^a\.l\.001_119$/i, /^arm  elbow l_281$/i, /Bip01_L_Forearm/i, /^LForearm_22$/i, /mixamorig:LeftForeArm/i, /3pln01t0 l forearm/i, /4klq01t0 l forearm/i, /arm01_052/i]),
    rightUpperArm: findBone([/^a\.r_145$/i, /^arm  shoulder r\.001/i, /Bip01_R_UpperArm/i, /^Right arm_081$/i, /^RArm_47$/i, /mixamorig:RightArm/i, /3pln01t0 r upperarm/i, /4klq01t0 r upperarm/i, /arm00_054/i]),
    rightForeArm: findBone([/^a\.r\.001_144$/i, /^arm  elbow r/i, /Bip01_R_Forearm/i, /^RForearm_46$/i, /mixamorig:RightForeArm/i, /3pln01t0 r forearm/i, /4klq01t0 r forearm/i, /arm01_055/i]),
    leftThigh: findBone([/^leg\.l_4$/i, /^leg\.l_253$/i, /Bip01_L_Thigh/i, /^Left leg_0100$/i, /^LLeg_95$/i, /mixamorig:LeftUpLeg/i, /3pln01t0 l thigh/i, /4klq01t0 l thigh/i, /^leg\.l_5$/i]),
    leftCalf: findBone([/^leg\.l\.001_3$/i, /^leg\.l\.001_251$/i, /Bip01_L_Calf/i, /mixamorig:LeftLeg/i, /4klq01t0 l calf/i, /^leg\.l\.001_3$/i]),
    rightThigh: findBone([/^leg\.r_9$/i, /^leg\.r_258$/i, /Bip01_R_Thigh/i, /^Right leg_0114$/i, /^RLeg_101$/i, /mixamorig:RightUpLeg/i, /3pln01t0 r thigh/i, /^leg\.r_10$/i]),
    rightCalf: findBone([/^leg\.r\.001_8$/i, /^leg\.r\.001_256$/i, /Bip01_R_Calf/i, /mixamorig:RightLeg/i, /^leg\.r\.001_8$/i]),
  };
  modelContainer.userData.bindPoseSaved = true;
}

function applyBoneOffset(bone, bindRotations, dx = 0, dy = 0, dz = 0, lerpFactor = 0.25) {
  if (!bone || !bindRotations[bone.name]) return;
  const base = bindRotations[bone.name];
  bone.rotation.x = THREE.MathUtils.lerp(bone.rotation.x, base.x + dx, lerpFactor);
  bone.rotation.y = THREE.MathUtils.lerp(bone.rotation.y, base.y + dy, lerpFactor);
  bone.rotation.z = THREE.MathUtils.lerp(bone.rotation.z, base.z + dz, lerpFactor);
}

/**
 * Updates skeletal and root animation for a Wielder or Stand container.
 * state: 'idle' | 'walk' | 'run' | 'mounted' | 'light_attack' | 'heavy_attack' | 'barrage' | 'block' | 'dodge' | 'timestop_cast' | 'hit'
 */
export function updateCharacterAnimation(container, state, time, speedRatio = 0, isStand = false) {
  if (!container) return;
  registerBindPose(container);

  const { rigMap, bindRotations, pivot } = container.userData;
  if (!pivot) return;

  const t = time;
  const freq = state === 'run' ? 11.5 : 7.5;

  // Root / Pivot secondary motion (works on both rigged and static sculptures)
  let rootBobY = 0;
  let rootTiltX = 0;
  let rootTiltZ = 0;
  let rootTurnY = 0;
  let rootLungeZ = 0;

  if (isStand) {
    // Stands hover fluidly and surge forward on attacks
    rootBobY = 0.14 + Math.sin(t * 3.4) * 0.08;
    if (state === 'barrage') {
      rootLungeZ = 0.85 + Math.sin(t * 42) * 0.18;
      rootTurnY = Math.sin(t * 36) * 0.22;
      rootTiltX = 0.18;
    } else if (state === 'light_attack') {
      rootLungeZ = 0.7;
      rootTurnY = -0.35;
      rootTiltX = 0.15;
    } else if (state === 'heavy_attack') {
      rootLungeZ = 1.05;
      rootTurnY = 0.45;
      rootTiltX = 0.28;
    } else if (state === 'timestop_cast') {
      rootBobY = 0.32;
      rootTiltX = -0.22;
    }
  } else {
    // Wielder root motion
    if (state === 'idle') {
      rootBobY = Math.sin(t * 2.2) * 0.018;
      rootTiltZ = Math.cos(t * 1.1) * 0.015;
    } else if (state === 'walk' || state === 'run') {
      const amp = Math.min(1, Math.max(0.25, speedRatio));
      rootBobY = Math.abs(Math.sin(t * freq)) * 0.065 * amp;
      rootTiltX = 0.08 * amp;
      rootTiltZ = Math.cos(t * freq) * 0.045 * amp;
      rootTurnY = Math.sin(t * freq) * 0.06 * amp;
    } else if (state === 'mounted') {
      const horseFreq = speedRatio > 0.6 ? 11.0 : speedRatio > 0.15 ? 7.0 : 2.2;
      rootBobY = Math.abs(Math.sin(t * horseFreq)) * (0.04 + speedRatio * 0.06);
      rootTiltX = 0.12 * speedRatio + Math.sin(t * horseFreq) * 0.05 * speedRatio;
    } else if (state === 'light_attack') {
      rootLungeZ = 0.28;
      rootTurnY = Math.sin(t * 24) * 0.28;
      rootTiltX = 0.12;
    } else if (state === 'heavy_attack') {
      rootLungeZ = 0.45;
      rootTurnY = -0.42;
      rootTiltX = 0.22;
    } else if (state === 'barrage') {
      rootLungeZ = 0.2;
      rootTiltX = -0.08;
      rootTurnY = Math.sin(t * 28) * 0.08;
    } else if (state === 'timestop_cast') {
      // Iconic DIO arch-back arms-wide pose
      rootTiltX = -0.26;
      rootBobY = 0.05;
    } else if (state === 'block') {
      rootTiltX = -0.06;
      rootTurnY = 0.35;
    } else if (state === 'dodge') {
      rootTiltX = 0.28;
      rootBobY = 0.12;
    } else if (state === 'hit') {
      rootTiltX = -0.25;
      rootLungeZ = -0.2;
    }
  }

  pivot.position.y = THREE.MathUtils.lerp(pivot.position.y, (container.userData.basePivotY ?? pivot.position.y) + rootBobY, 0.25);
  if (container.userData.basePivotY === undefined) {
    container.userData.basePivotY = pivot.position.y;
    container.userData.basePivotZ = pivot.position.z;
  }
  pivot.position.z = THREE.MathUtils.lerp(pivot.position.z, container.userData.basePivotZ + rootLungeZ, 0.28);
  pivot.rotation.x = THREE.MathUtils.lerp(pivot.rotation.x, rootTiltX, 0.25);
  pivot.rotation.y = THREE.MathUtils.lerp(pivot.rotation.y, rootTurnY, 0.25);
  pivot.rotation.z = THREE.MathUtils.lerp(pivot.rotation.z, rootTiltZ, 0.25);

  if (!rigMap) return;

  // Skeletal bone articulation for rigged models
  if (state === 'walk' || state === 'run') {
    const stride = Math.sin(t * freq) * (state === 'run' ? 0.62 : 0.38);
    const kneeL = Math.max(0, -Math.sin(t * freq)) * 0.55;
    const kneeR = Math.max(0, Math.sin(t * freq)) * 0.55;

    applyBoneOffset(rigMap.leftThigh, bindRotations, stride, 0, 0);
    applyBoneOffset(rigMap.rightThigh, bindRotations, -stride, 0, 0);
    applyBoneOffset(rigMap.leftCalf, bindRotations, kneeL, 0, 0);
    applyBoneOffset(rigMap.rightCalf, bindRotations, kneeR, 0, 0);

    applyBoneOffset(rigMap.leftUpperArm, bindRotations, -stride * 0.65, 0, -0.12);
    applyBoneOffset(rigMap.rightUpperArm, bindRotations, stride * 0.65, 0, 0.12);
    applyBoneOffset(rigMap.spineLower, bindRotations, 0.08, -stride * 0.18, 0);
    applyBoneOffset(rigMap.head, bindRotations, -0.05, stride * 0.1, 0);
  } else if (state === 'mounted') {
    // Saddle riding posture
    applyBoneOffset(rigMap.leftThigh, bindRotations, -0.65, 0.28, -0.22);
    applyBoneOffset(rigMap.rightThigh, bindRotations, -0.65, -0.28, 0.22);
    applyBoneOffset(rigMap.leftCalf, bindRotations, 0.55, 0, 0);
    applyBoneOffset(rigMap.rightCalf, bindRotations, 0.55, 0, 0);
    applyBoneOffset(rigMap.leftUpperArm, bindRotations, -0.35, 0.2, 0);
    applyBoneOffset(rigMap.rightUpperArm, bindRotations, -0.35, -0.2, 0);
    applyBoneOffset(rigMap.spineUpper, bindRotations, 0.08 * speedRatio, 0, 0);
  } else if (state === 'barrage') {
    const punchWave = Math.sin(t * 48);
    const punchCos = Math.cos(t * 48);
    applyBoneOffset(rigMap.leftUpperArm, bindRotations, -1.1 + punchWave * 0.55, 0.2 * punchCos, -0.2);
    applyBoneOffset(rigMap.rightUpperArm, bindRotations, -1.1 - punchWave * 0.55, -0.2 * punchCos, 0.2);
    applyBoneOffset(rigMap.leftForeArm, bindRotations, -0.4 + punchCos * 0.45, 0, 0);
    applyBoneOffset(rigMap.rightForeArm, bindRotations, -0.4 - punchCos * 0.45, 0, 0);
    applyBoneOffset(rigMap.spineUpper, bindRotations, 0.18, punchWave * 0.22, 0);
  } else if (state === 'light_attack') {
    applyBoneOffset(rigMap.rightUpperArm, bindRotations, -1.25, -0.25, 0.2);
    applyBoneOffset(rigMap.rightForeArm, bindRotations, -0.25, 0, 0);
    applyBoneOffset(rigMap.spineUpper, bindRotations, 0.12, -0.32, 0);
  } else if (state === 'heavy_attack') {
    applyBoneOffset(rigMap.leftUpperArm, bindRotations, -1.35, 0.35, -0.3);
    applyBoneOffset(rigMap.rightUpperArm, bindRotations, -1.35, -0.35, 0.3);
    applyBoneOffset(rigMap.spineUpper, bindRotations, 0.25, 0.38, 0);
  } else if (state === 'timestop_cast') {
    // Iconic DIO "ZA WARUDO!" open-chest arms-flung pose
    applyBoneOffset(rigMap.spineLower, bindRotations, -0.22, 0, 0);
    applyBoneOffset(rigMap.spineUpper, bindRotations, -0.28, 0, 0);
    applyBoneOffset(rigMap.leftUpperArm, bindRotations, -0.45, -0.55, -0.85);
    applyBoneOffset(rigMap.rightUpperArm, bindRotations, -0.45, 0.55, 0.85);
    applyBoneOffset(rigMap.head, bindRotations, -0.25, 0, 0);
  } else if (state === 'block') {
    applyBoneOffset(rigMap.leftUpperArm, bindRotations, -0.95, 0.55, 0);
    applyBoneOffset(rigMap.rightUpperArm, bindRotations, -0.95, -0.55, 0);
    applyBoneOffset(rigMap.leftForeArm, bindRotations, -1.1, 0, 0);
    applyBoneOffset(rigMap.rightForeArm, bindRotations, -1.1, 0, 0);
  } else {
    // Idle breathing & subtle JoJo poise
    const breath = Math.sin(t * 2.2) * 0.04;
    applyBoneOffset(rigMap.leftThigh, bindRotations, 0, 0, 0);
    applyBoneOffset(rigMap.rightThigh, bindRotations, 0, 0, 0);
    applyBoneOffset(rigMap.leftCalf, bindRotations, 0, 0, 0);
    applyBoneOffset(rigMap.rightCalf, bindRotations, 0, 0, 0);
    applyBoneOffset(rigMap.spineLower, bindRotations, breath * 0.5, 0, 0);
    applyBoneOffset(rigMap.spineUpper, bindRotations, breath, 0, 0);
    applyBoneOffset(rigMap.leftUpperArm, bindRotations, breath * 0.8, 0, -0.06);
    applyBoneOffset(rigMap.rightUpperArm, bindRotations, -breath * 0.8, 0, 0.06);
    applyBoneOffset(rigMap.leftForeArm, bindRotations, 0, 0, 0);
    applyBoneOffset(rigMap.rightForeArm, bindRotations, 0, 0, 0);
    applyBoneOffset(rigMap.head, bindRotations, -breath * 0.5, Math.sin(t * 0.9) * 0.06, 0);
  }
}

/**
 * Animates Slow Dancer (4-mesh static horse model) with convincing gait suspension,
 * pitch/roll banking, and terrain slope alignment.
 */
export function updateHorseAnimation(horseContainer, time, speedRatio, turnRate, terrainSlope = 0) {
  if (!horseContainer) return;
  const pivot = horseContainer.userData.pivot;
  if (!pivot) return;
  if (horseContainer.userData.basePivotY === undefined) {
    horseContainer.userData.basePivotY = pivot.position.y;
  }

  const freq = speedRatio > 0.65 ? 11.2 : speedRatio > 0.2 ? 7.2 : 1.8;
  const strideSin = Math.sin(time * freq);
  const strideCos = Math.cos(time * freq);

  const bob = speedRatio > 0.03 ? Math.abs(strideSin) * (0.06 + speedRatio * 0.14) : Math.sin(time * 1.8) * 0.012;
  const pitch = speedRatio > 0.03 ? strideCos * (0.04 + speedRatio * 0.09) + terrainSlope : terrainSlope;
  const roll = THREE.MathUtils.clamp(-turnRate * 0.18 * speedRatio, -0.22, 0.22);

  pivot.position.y = horseContainer.userData.basePivotY + bob;
  pivot.rotation.x = THREE.MathUtils.lerp(pivot.rotation.x, pitch, 0.22);
  pivot.rotation.z = THREE.MathUtils.lerp(pivot.rotation.z, roll, 0.2);
}