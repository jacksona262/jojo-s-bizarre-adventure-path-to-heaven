import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  instantiateModel,
  preloadAll28Assets,
  subscribeAssetStatus,
} from '@/game/assets/gltfLoader';
import {
  FRONTIER_REGIONS,
  MAIN_BOSSES,
  MANDATORY_QUESTS,
} from '@/game/data/campaignData';
import {
  buildFrontierWorld,
  getTerrainHeight,
} from '@/game/world/frontierBuilder';
import {
  updateCharacterAnimation,
  updateHorseAnimation,
} from '@/game/animation/proceduralAnimator';
import {
  createBossCombatState,
  updateBossAI,
} from '@/game/combat/bossAiEngine';
import { soundEngine } from '@/game/audio/soundEngine';

export default function JoJoWorldViewport({
  appPhase, // 'title' | 'campaign' | 'versus'
  campaignState,
  settings,
  activeCutscene,
  versusConfig,
  onSyncHud,
  onAssetProgress,
  onAssetStatusUpdate,
  onTriggerBossIntro,
  onTriggerBossVictory,
  onOpenQuestModal,
  onPlayerDefeated,
  onVersusRoundEnd,
  actionBusRef,
}) {
  const mountRef = useRef(null);
  const stateRef = useRef({
    appPhase,
    campaignState,
    settings,
    activeCutscene,
    versusConfig,
  });

  useEffect(() => {
    stateRef.current = {
      appPhase,
      campaignState,
      settings,
      activeCutscene,
      versusConfig,
    };
  }, [appPhase, campaignState, settings, activeCutscene, versusConfig]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. INITIALIZE THREE.JS SCENE, CAMERA & RENDERER (Permanent Night)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050811);
    scene.fog = new THREE.FogExp2(0x060a17, 0.0075);

    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.2,
      1400
    );

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = settings.brightness || 1.08;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. PERMANENT NIGHTTIME LIGHTING (Moonlight + Indigo Fill + Lightning Flash)
    const hemiLight = new THREE.HemisphereLight(0x4f75ff, 0x151118, 0.95);
    scene.add(hemiLight);

    const moonLight = new THREE.DirectionalLight(0x93c5fd, 1.85);
    moonLight.position.set(-60, 120, 40);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.width = 1024;
    moonLight.shadow.mapSize.height = 1024;
    moonLight.shadow.camera.near = 10;
    moonLight.shadow.camera.far = 350;
    const d = 65;
    moonLight.shadow.camera.left = -d;
    moonLight.shadow.camera.right = d;
    moonLight.shadow.camera.top = d;
    moonLight.shadow.camera.bottom = -d;
    scene.add(moonLight);

    const lightningLight = new THREE.PointLight(0xe0f2fe, 0, 600);
    lightningLight.position.set(0, 140, -200);
    scene.add(lightningLight);

    // 3. BUILD THE 9-REGION FRONTIER WORLD
    const world = buildFrontierWorld(scene);

    // 4. RUNTIME ACTORS & CONTAINERS
    const actors = {
      titleDio: null,
      playerNormalDio: null,
      playerHeavenDio: null,
      playerStand: null, // ZA WARUDO_496 from main character.glb
      playerAuraMesh: null,
      timeStopDome: null,
      horse: null, // Slow Dancer
      bossGroups: new Map(), // bossIndex -> { wielder, stand, clones: [] }
      questNpcGroups: new Map(), // questIndex -> { wielder, stand, nodeMeshes: [] }
      hazardMeshes: [],
      vfxBursts: [],
    };

    // Player Aura & Time-Stop Sphere Dome
    const auraGeo = new THREE.CylinderGeometry(0.85, 1.15, 2.3, 16, 1, true);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    actors.playerAuraMesh = new THREE.Mesh(auraGeo, auraMat);
    scene.add(actors.playerAuraMesh);

    const domeGeo = new THREE.SphereGeometry(1, 32, 24);
    const domeMat = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.0,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    actors.timeStopDome = new THREE.Mesh(domeGeo, domeMat);
    scene.add(actors.timeStopDome);

    // 5. LIVE GAMEPLAY SIMULATION STATE (Mutated at 60fps without React re-renders)
    const sim = {
      playerPos: new THREE.Vector3(
        campaignState.playerPosition?.x || 0,
        0,
        campaignState.playerPosition?.z || -25
      ),
      playerRotY: campaignState.playerRotationY ?? Math.PI,
      playerVel: new THREE.Vector3(),
      playerState: 'idle',
      playerStateTimer: 0,
      hp: campaignState.stats.hp,
      maxHp: campaignState.stats.maxHp,
      standEnergy: campaignState.stats.standEnergy,
      maxStandEnergy: campaignState.stats.maxStandEnergy,
      standSummoned: true,
      isMounted: false,
      horsePos: new THREE.Vector3(
        campaignState.horsePosition?.x || 4.5,
        0,
        campaignState.horsePosition?.z || -28
      ),
      horseRotY: campaignState.horseRotationY ?? Math.PI,
      horseSpeed: 0,
      horseStamina: 100,
      timeStopActive: false,
      timeStopRemaining: 0,
      timeStopCooldown: 0,
      lockOnActive: false,
      cameraYaw: Math.PI,
      cameraPitch: 0.24,
      lightningFlash: 0,
      hoofStepTimer: 0,
      activeBossCombat: null, // created when engaging a boss or Versus CPU
      activeBossIndex: null,
      completedQuestNodes: new Set(),
      contextAction: null, // { label, onExecute }
    };

    // 6. LOAD & INSTANTIATE ALL 28 GLB MODELS
    const unsubStatus = subscribeAssetStatus((list) => {
      onAssetStatusUpdate?.(list);
    });

    preloadAll28Assets((done, total, meta) => {
      onAssetProgress?.(done, total, meta);
    });

    // Instantiate Title Screen Cinematic DIO (`loading screen  and home screen animated model.glb`)
    instantiateModel('dio_cinematic', { targetHeightOverride: 2.15, hideBackdropPlane: true })
      .then((m) => {
        actors.titleDio = m;
        scene.add(m);
      })
      .catch(() => {});

    // Instantiate Playable Normal DIO + Separable Rigged The World (`main character.glb`)
    instantiateModel('dio_normal', { part: 'wielder', targetHeightOverride: 1.95 })
      .then((m) => {
        actors.playerNormalDio = m;
        scene.add(m);
      })
      .catch(() => {});

    instantiateModel('dio_normal', { part: 'stand', targetHeightOverride: 2.08 })
      .then((m) => {
        actors.playerStand = m;
        scene.add(m);
      })
      .catch(() => {});

    // Instantiate Playable Heaven Ascension DIO (`dio_over_heaven__eyes_of_heaven_model.glb`)
    instantiateModel('dio_heaven', { targetHeightOverride: 2.02 })
      .then((m) => {
        m.visible = false;
        actors.playerHeavenDio = m;
        scene.add(m);
      })
      .catch(() => {});

    // Instantiate Rideable Slow Dancer (`slow_dancer_jojo_steel_ball_run.glb`)
    instantiateModel('horse_slow_dancer', { targetHeightOverride: 2.15 })
      .then((m) => {
        actors.horse = m;
        scene.add(m);
      })
      .catch(() => {});

    // Instantiate All 10 Main Bosses + Final Rematch & their Paired/Split Stands
    MAIN_BOSSES.forEach((bCfg) => {
      const entry = { wielder: null, stand: null, clones: [], ringMesh: null };
      actors.bossGroups.set(bCfg.index, entry);

      // Arena perimeter ring marker
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(bCfg.arenaRadius - 0.5, bCfg.arenaRadius, 48),
        new THREE.MeshBasicMaterial({
          color: bCfg.auraColor || '#eab308',
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.35,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      const by = getTerrainHeight(bCfg.position.x, bCfg.position.z);
      ring.position.set(bCfg.position.x, by + 0.08, bCfg.position.z);
      scene.add(ring);
      entry.ringMesh = ring;

      const hasEmbeddedStand = Boolean(
        bCfg.assetId === 'boss_avdol' ||
          bCfg.assetId === 'boss_kakyoin' ||
          bCfg.assetId === 'boss_josuke' ||
          bCfg.assetId === 'boss_giorno' ||
          bCfg.assetId === 'boss_valentine' ||
          bCfg.assetId === 'boss_jotaro'
      );

      instantiateModel(bCfg.assetId, {
        part: hasEmbeddedStand ? 'wielder' : 'full',
        targetHeightOverride: 1.95,
      })
        .then((wielder) => {
          wielder.position.set(bCfg.position.x, by, bCfg.position.z);
          scene.add(wielder);
          entry.wielder = wielder;
        })
        .catch(() => {});

      if (hasEmbeddedStand) {
        instantiateModel(bCfg.assetId, { part: 'stand', targetHeightOverride: 2.05 })
          .then((stand) => {
            stand.position.set(bCfg.position.x + 1.1, by + 0.2, bCfg.position.z - 0.9);
            scene.add(stand);
            entry.stand = stand;
          })
          .catch(() => {});
      } else if (bCfg.standAssetId) {
        instantiateModel(bCfg.standAssetId, { targetHeightOverride: 2.02 })
          .then((stand) => {
            stand.position.set(bCfg.position.x + 1.1, by + 0.2, bCfg.position.z - 0.9);
            scene.add(stand);
            entry.stand = stand;
          })
          .catch(() => {});
      }

      // Funny Valentine D4C Parallel Universe Clones (using the supplied Valentine GLB)
      if (bCfg.standStyle === 'dimensional_clones') {
        for (let c = 0; c < 2; c++) {
          instantiateModel('boss_valentine', { part: 'wielder', targetHeightOverride: 1.92 })
            .then((cloneModel) => {
              cloneModel.visible = false;
              scene.add(cloneModel);
              entry.clones.push(cloneModel);
            })
            .catch(() => {});
        }
      }
    });

    // Instantiate All 9 Mandatory Quest NPCs & Interactive Objective Nodes
    MANDATORY_QUESTS.forEach((qCfg) => {
      const qEntry = { wielder: null, stand: null, nodeMeshes: [] };
      actors.questNpcGroups.set(qCfg.index, qEntry);

      const qy = getTerrainHeight(qCfg.npcPosition.x, qCfg.npcPosition.z);
      const hasSplit =
        qCfg.npcAssetId === 'npc_ndoul' ||
        qCfg.npcAssetId === 'npc_daniel_darby' ||
        qCfg.npcAssetId === 'npc_telence_darby';

      instantiateModel(qCfg.npcAssetId, {
        part: hasSplit ? 'wielder' : 'full',
        targetHeightOverride: 1.88,
      })
        .then((npc) => {
          npc.position.set(qCfg.npcPosition.x, qy, qCfg.npcPosition.z);
          scene.add(npc);
          qEntry.wielder = npc;
        })
        .catch(() => {});

      if (hasSplit) {
        instantiateModel(qCfg.npcAssetId, { part: 'stand', targetHeightOverride: 1.85 })
          .then((stand) => {
            stand.position.set(qCfg.npcPosition.x + 1.2, qy + 0.15, qCfg.npcPosition.z - 0.8);
            scene.add(stand);
            qEntry.stand = stand;
          })
          .catch(() => {});
      }

      // Create glowing interactive pillars/totems for the 3 nodes of each quest
      qCfg.nodes.forEach((nodeDef) => {
        const ny = getTerrainHeight(nodeDef.x, nodeDef.z);
        const pillarGroup = new THREE.Group();
        pillarGroup.position.set(nodeDef.x, ny, nodeDef.z);

        const ped = new THREE.Mesh(
          new THREE.CylinderGeometry(0.55, 0.75, 2.2, 8),
          new THREE.MeshStandardMaterial({
            color: 0x312e81,
            emissive: 0xd97706,
            emissiveIntensity: 0.7,
            roughness: 0.35,
          })
        );
        ped.position.y = 1.1;
        pillarGroup.add(ped);

        const beacon = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.45, 0),
          new THREE.MeshBasicMaterial({ color: 0xfacc15, wireframe: true })
        );
        beacon.position.y = 2.75;
        pillarGroup.add(beacon);

        pillarGroup.userData = { nodeDef, questIndex: qCfg.index, beacon };
        scene.add(pillarGroup);
        qEntry.nodeMeshes.push(pillarGroup);
      });
    });

    // 7. VFX HELPER (Impact bursts, punch trails, lightning bolts)
    function spawnVfxBurst(pos, colorHex = '#facc15', scale = 1.0) {
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.45 * scale, 1),
        new THREE.MeshBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: 0.9,
          wireframe: true,
        })
      );
      mesh.position.copy(pos);
      scene.add(mesh);
      actors.vfxBursts.push({ mesh, ttl: 0.35, maxTtl: 0.35 });
    }

    // 8. PLAYER COMBAT & HORSE ACTIONS
    function triggerPlayerAttack(type = 'light') {
      if (sim.isMounted) return;
      soundEngine.init();
      const isHeaven = stateRef.current.campaignState.isHeavenDio;
      const pwrMult = 1 + (stateRef.current.campaignState.upgrades.standPowerLevel - 1) * 0.18 + (isHeaven ? 0.45 : 0);

      if (type === 'barrage') {
        if (sim.standEnergy < 18) return;
        sim.standEnergy = Math.max(0, sim.standEnergy - 18);
        sim.playerState = 'barrage';
        sim.playerStateTimer = 0.85;
      } else if (type === 'heavy') {
        if (sim.standEnergy < 12) return;
        sim.standEnergy = Math.max(0, sim.standEnergy - 12);
        sim.playerState = 'heavy_attack';
        sim.playerStateTimer = 0.55;
      } else {
        sim.playerState = 'light_attack';
        sim.playerStateTimer = 0.35;
      }

      soundEngine.playAttackImpact(isHeaven && type === 'heavy' ? 'overwrite' : type);

      const forwardX = Math.sin(sim.playerRotY);
      const forwardZ = Math.cos(sim.playerRotY);
      const hitCenter = new THREE.Vector3(
        sim.playerPos.x + forwardX * 2.2,
        sim.playerPos.y + 1.2,
        sim.playerPos.z + forwardZ * 2.2
      );
      spawnVfxBurst(hitCenter, isHeaven ? '#fef08a' : '#facc15', type === 'barrage' ? 1.8 : 1.2);

      // Check hit against active Boss or Versus opponent
      if (sim.activeBossCombat && sim.activeBossIndex !== null) {
        const bEntry = actors.bossGroups.get(sim.activeBossIndex);
        if (bEntry?.wielder) {
          const dist = Math.hypot(
            bEntry.wielder.position.x - sim.playerPos.x,
            bEntry.wielder.position.z - sim.playerPos.z
          );
          const reach = isHeaven ? 5.8 : 4.6;
          if (dist <= reach) {
            // Check enemy counter stances (unless Time Stop is active!)
            if (!sim.timeStopActive) {
              if (sim.activeBossCombat.parryActive) {
                sim.hp = Math.max(1, sim.hp - 22);
                sim.activeBossCombat.warningBanner = 'SILVER CHARIOT PARRIED YOUR FRONTAL ATTACK!';
                sim.activeBossCombat.warningTimer = 1.5;
                return;
              }
              if (sim.activeBossCombat.epitaphActive) {
                sim.hp = Math.max(1, sim.hp - 25);
                sim.activeBossCombat.warningBanner = 'EPITAPH FORESAW AND COUNTERED YOUR STRIKE!';
                sim.activeBossCombat.warningTimer = 1.5;
                return;
              }
              if (sim.activeBossCombat.lifeReflectActive) {
                sim.hp = Math.max(1, sim.hp - 20);
                sim.activeBossCombat.warningBanner = 'GOLD EXPERIENCE LIFE CREATION REFLECTED YOUR DAMAGE!';
                sim.activeBossCombat.warningTimer = 1.5;
                return;
              }
            }

            const baseDmg = type === 'barrage' ? 95 : type === 'heavy' ? 68 : 36;
            const dmg = Math.round(baseDmg * pwrMult);
            sim.activeBossCombat.hp = Math.max(0, sim.activeBossCombat.hp - dmg);
            sim.activeBossCombat.state = 'hit';
            sim.activeBossCombat.stateTimer = 0.3;
            spawnVfxBurst(
              bEntry.wielder.position.clone().add(new THREE.Vector3(0, 1.3, 0)),
              '#ef4444',
              1.6
            );

            // Check Boss / Versus Victory!
            if (sim.activeBossCombat.hp <= 0) {
              const defeatedIndex = sim.activeBossIndex;
              sim.activeBossCombat = null;
              sim.activeBossIndex = null;
              if (stateRef.current.appPhase === 'versus') {
                onVersusRoundEnd?.('player');
              } else {
                onTriggerBossVictory?.(defeatedIndex);
              }
            }
          }
        }
      }
    }

    function triggerTimeStop() {
      if (sim.timeStopActive || sim.timeStopCooldown > 0) return;
      const isHeaven = stateRef.current.campaignState.isHeavenDio;
      const tsLevel = stateRef.current.campaignState.upgrades.timeStopLevel || 1;
      const duration = (isHeaven ? 7.5 : 3.5) + (tsLevel - 1) * 1.1;

      sim.timeStopActive = true;
      sim.timeStopRemaining = duration;
      sim.timeStopCooldown = isHeaven ? 8.0 : Math.max(9.0, 14.0 - tsLevel * 1.0);
      sim.playerState = 'timestop_cast';
      sim.playerStateTimer = 0.65;
      soundEngine.playTimeStop(isHeaven);
    }

    function summonSlowDancer() {
      soundEngine.playWhistle();
      const sideX = sim.playerPos.x + Math.cos(sim.playerRotY) * 3.2;
      const sideZ = sim.playerPos.z - Math.sin(sim.playerRotY) * 3.2;
      sim.horsePos.set(sideX, getTerrainHeight(sideX, sideZ), sideZ);
      sim.horseRotY = sim.playerRotY;
      spawnVfxBurst(sim.horsePos.clone().add(new THREE.Vector3(0, 1, 0)), '#38bdf8', 1.4);
    }

    function toggleMountHorse() {
      if (sim.isMounted) {
        sim.isMounted = false;
        sim.playerPos.x += 1.8;
        sim.playerPos.y = getTerrainHeight(sim.playerPos.x, sim.playerPos.z);
        return;
      }
      const dist = Math.hypot(sim.horsePos.x - sim.playerPos.x, sim.horsePos.z - sim.playerPos.z);
      if (dist > 7.5) {
        summonSlowDancer();
      }
      sim.isMounted = true;
      sim.horsePos.set(sim.playerPos.x, sim.playerPos.y, sim.playerPos.z);
      sim.horseRotY = sim.playerRotY;
    }

    // Expose imperative methods to parent UI via actionBusRef
    if (actionBusRef) {
      actionBusRef.current = {
        triggerTimeStop,
        summonSlowDancer,
        toggleMountHorse,
        toggleStand: () => {
          sim.standSummoned = !sim.standSummoned;
          soundEngine.playStandSummon(stateRef.current.campaignState.isHeavenDio);
        },
        triggerContextAction: () => {
          if (sim.contextAction?.onExecute) {
            sim.contextAction.onExecute();
          }
        },
        teleportTo: (x, z, rotY = Math.PI) => {
          const y = getTerrainHeight(x, z);
          sim.playerPos.set(x, y, z);
          sim.playerRotY = rotY;
          sim.horsePos.set(x + 3.5, getTerrainHeight(x + 3.5, z + 2), z + 2);
          sim.activeBossCombat = null;
          sim.activeBossIndex = null;
        },
        startBossEncounter: (bossIndex, difficulty = 'normal') => {
          const bCfg = MAIN_BOSSES[bossIndex];
          if (!bCfg) return;
          sim.isMounted = false;
          const spawnZ = bCfg.position.z + 14;
          sim.playerPos.set(bCfg.position.x, getTerrainHeight(bCfg.position.x, spawnZ), spawnZ);
          sim.playerRotY = Math.PI;
          sim.hp = sim.maxHp;
          sim.standEnergy = sim.maxStandEnergy;
          sim.activeBossIndex = bossIndex;
          sim.activeBossCombat = createBossCombatState(bCfg, difficulty);
          const bEntry = actors.bossGroups.get(bossIndex);
          if (bEntry?.wielder) {
            bEntry.wielder.position.set(
              bCfg.position.x,
              getTerrainHeight(bCfg.position.x, bCfg.position.z),
              bCfg.position.z
            );
          }
        },
        startVersusEncounter: (cfg) => {
          const arenaZ = cfg.arena?.z || -260;
          sim.isMounted = false;
          sim.playerPos.set(0, getTerrainHeight(0, arenaZ + 12), arenaZ + 12);
          sim.playerRotY = Math.PI;
          sim.hp = cfg.playerFighter?.hp || 1200;
          sim.maxHp = sim.hp;
          sim.standEnergy = 100;

          const matchBossIdx = MAIN_BOSSES.findIndex(
            (b) => b.assetId === cfg.cpuFighter.assetId
          );
          const slotIdx = matchBossIdx >= 0 ? matchBossIdx : 99;
          const customCfg =
            matchBossIdx >= 0
              ? { ...MAIN_BOSSES[matchBossIdx], position: { x: 0, z: arenaZ } }
              : {
                  index: 99,
                  id: cfg.cpuFighter.id,
                  assetId: cfg.cpuFighter.assetId,
                  name: cfg.cpuFighter.name,
                  standName: cfg.cpuFighter.standName,
                  position: { x: 0, z: arenaZ },
                  arenaRadius: 32,
                  maxHp: cfg.cpuFighter.hp || 1150,
                  auraColor: cfg.cpuFighter.color || '#facc15',
                  standStyle:
                    cfg.cpuFighter.assetId === 'npc_hol_horse'
                      ? 'emerald_barrier'
                      : cfg.cpuFighter.assetId === 'npc_mariah'
                      ? 'gravity_inversion'
                      : cfg.cpuFighter.assetId === 'npc_ndoul'
                      ? 'fire_lanes'
                      : 'time_erasure',
                  counterplayTip: cfg.cpuFighter.specialName,
                };

          sim.activeBossIndex = slotIdx;
          sim.activeBossCombat = createBossCombatState(customCfg, cfg.difficulty);

          if (slotIdx === 99) {
            const prev = actors.bossGroups.get(99);
            if (prev?.wielder) scene.remove(prev.wielder);
            if (prev?.stand) scene.remove(prev.stand);
            const entry = { wielder: null, stand: null, clones: [] };
            actors.bossGroups.set(99, entry);
            instantiateModel(cfg.cpuFighter.assetId, {
              part: cfg.cpuFighter.splitStand || cfg.cpuFighter.standFromDualRig ? 'wielder' : 'full',
              targetHeightOverride: 1.92,
            }).then((w) => {
              w.position.set(0, getTerrainHeight(0, arenaZ), arenaZ);
              scene.add(w);
              entry.wielder = w;
            });
          } else {
            const bEntry = actors.bossGroups.get(slotIdx);
            if (bEntry?.wielder) {
              bEntry.wielder.position.set(0, getTerrainHeight(0, arenaZ), arenaZ);
            }
          }
        },
        completeQuestStepNode: (nodeId) => {
          sim.completedQuestNodes.add(nodeId);
        },
        getPlayerPose: () => ({
          playerPosition: { x: sim.playerPos.x, y: sim.playerPos.y, z: sim.playerPos.z },
          playerRotationY: sim.playerRotY,
          horsePosition: { x: sim.horsePos.x, y: sim.horsePos.y, z: sim.horsePos.z },
          horseRotationY: sim.horseRotY,
        }),
      };
    }

    // 9. KEYBOARD & MOUSE INPUT LISTENERS
    const keys = {};
    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      keys[k] = true;
      if (stateRef.current.appPhase === 'title' || stateRef.current.activeCutscene) return;

      if (k === 'f') triggerTimeStop();
      if (k === 'q') {
        sim.standSummoned = !sim.standSummoned;
        soundEngine.playStandSummon(stateRef.current.campaignState.isHeavenDio);
      }
      if (k === 'h') summonSlowDancer();
      if (k === 'e') toggleMountHorse();
      if (k === 'j') triggerPlayerAttack('light');
      if (k === 'k') triggerPlayerAttack('heavy');
      if (k === 'l' || k === 'r') triggerPlayerAttack('barrage');
      if (k === 'g' && sim.contextAction?.onExecute) {
        sim.contextAction.onExecute();
      }
      if (k === 'tab') {
        e.preventDefault();
        sim.lockOnActive = !sim.lockOnActive;
      }
      if (k === ' ') {
        // Evasive Dodge
        sim.playerState = 'dodge';
        sim.playerStateTimer = 0.42;
        const dashDirX = Math.sin(sim.playerRotY);
        const dashDirZ = Math.cos(sim.playerRotY);
        sim.playerPos.x += dashDirX * 3.8;
        sim.playerPos.z += dashDirZ * 3.8;
      }
    };
    const onKeyUp = (e) => {
      keys[e.key.toLowerCase()] = false;
    };

    let isPointerDragging = false;
    const onMouseDown = (e) => {
      if (stateRef.current.appPhase === 'title' || stateRef.current.activeCutscene) return;
      if (e.button === 0) {
        isPointerDragging = true;
        triggerPlayerAttack('light');
      } else if (e.button === 2) {
        triggerPlayerAttack('heavy');
      }
    };
    const onMouseUp = () => {
      isPointerDragging = false;
    };
    const onMouseMove = (e) => {
      if (isPointerDragging) {
        sim.cameraYaw -= e.movementX * 0.005;
        sim.cameraPitch = THREE.MathUtils.clamp(
          sim.cameraPitch + e.movementY * 0.003,
          0.08,
          0.75
        );
      }
    };
    const onContextMenu = (e) => e.preventDefault();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    container.addEventListener('contextmenu', onContextMenu);

    // Resize handler
    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    // 10. MAIN 60FPS GAME LOOP
    let clock = new THREE.Clock();
    let animFrameId = null;
    let lastHudSync = 0;

    function animate() {
      animFrameId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();
      const { appPhase: curPhase, campaignState: curCamp, settings: curSettings, activeCutscene: curCut } =
        stateRef.current;

      renderer.toneMappingExposure = curSettings.brightness || 1.08;

      // Occasional distant lightning & thunder (frozen during Time Stop!)
      if (!sim.timeStopActive) {
        if (Math.random() < 0.004 && !curSettings.reducedFlashing) {
          sim.lightningFlash = 1.0;
          soundEngine.playThunder();
        }
        sim.lightningFlash = Math.max(0, sim.lightningFlash - dt * 2.8);
      }
      lightningLight.intensity = sim.lightningFlash * 14.0;
      lightningLight.position.set(sim.playerPos.x + 30, 140, sim.playerPos.z - 120);

      // Update Rain Particles around camera/player (frozen in mid-air during Time Stop!)
      world.rainSystem.position.set(sim.playerPos.x, sim.playerPos.y, sim.playerPos.z);
      world.skyGroup.position.set(sim.playerPos.x * 0.85, 0, sim.playerPos.z * 0.85);
      if (!sim.timeStopActive) {
        const rPos = world.rainSystem.geometry.attributes.position;
        for (let i = 0; i < rPos.count; i++) {
          let ry = rPos.getY(i) - 26 * dt;
          if (ry < 0) ry = 42;
          rPos.setY(i, ry);
        }
        rPos.needsUpdate = true;
      }

      // === TITLE SCREEN SHOWCASE MODE ===
      if (curPhase === 'title') {
        if (actors.titleDio) {
          actors.titleDio.visible = true;
          const ty = getTerrainHeight(2.2, -18);
          actors.titleDio.position.set(2.2, ty, -18);
          actors.titleDio.rotation.y = -0.45 + Math.sin(elapsed * 0.5) * 0.12;
          updateCharacterAnimation(actors.titleDio, 'idle', elapsed, 0, false);
        }
        if (actors.playerNormalDio) actors.playerNormalDio.visible = false;
        if (actors.playerHeavenDio) actors.playerHeavenDio.visible = false;
        if (actors.playerStand) actors.playerStand.visible = false;
        if (actors.horse) {
          actors.horse.visible = true;
          actors.horse.position.set(5.2, getTerrainHeight(5.2, -23), -23);
          actors.horse.rotation.y = -0.7;
          updateHorseAnimation(actors.horse, elapsed, 0, 0, 0);
        }

        camera.position.set(0.4 + Math.sin(elapsed * 0.3) * 0.35, getTerrainHeight(0, -14) + 1.65, -13.5);
        camera.lookAt(1.5, getTerrainHeight(2.2, -18) + 1.35, -18);
        renderer.render(scene, camera);
        return;
      }

      // Hide dedicated title model during gameplay
      if (actors.titleDio) actors.titleDio.visible = false;

      // Poll Gamepad API if connected
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = gamepads[0];
      let gpMoveX = 0;
      let gpMoveZ = 0;
      if (gp) {
        if (Math.abs(gp.axes[0]) > 0.18) gpMoveX = gp.axes[0];
        if (Math.abs(gp.axes[1]) > 0.18) gpMoveZ = gp.axes[1];
        if (gp.buttons[0]?.pressed && sim.playerStateTimer <= 0) triggerPlayerAttack('light');
        if (gp.buttons[1]?.pressed && sim.playerStateTimer <= 0) triggerPlayerAttack('heavy');
        if (gp.buttons[2]?.pressed && sim.playerStateTimer <= 0) triggerPlayerAttack('barrage');
        if (gp.buttons[3]?.pressed) triggerTimeStop();
      }

      // Time-Stop timers & dome VFX
      if (sim.timeStopActive) {
        sim.timeStopRemaining = Math.max(0, sim.timeStopRemaining - dt);
        actors.timeStopDome.position.copy(sim.playerPos);
        actors.timeStopDome.scale.setScalar(42 + Math.sin(elapsed * 6) * 2);
        actors.timeStopDome.material.opacity = 0.24;
        if (sim.timeStopRemaining <= 0) {
          sim.timeStopActive = false;
          actors.timeStopDome.material.opacity = 0;
          soundEngine.playTimeResume();
        }
      } else {
        actors.timeStopDome.material.opacity = 0;
        if (sim.timeStopCooldown > 0) {
          sim.timeStopCooldown = Math.max(0, sim.timeStopCooldown - dt);
        }
      }

      // Regenerate Stand Energy
      sim.standEnergy = Math.min(sim.maxStandEnergy, sim.standEnergy + 9.5 * dt);

      // Player Movement (On-Foot vs Mounted on Slow Dancer)
      let inForward = (keys['w'] || keys['arrowup'] ? 1 : 0) - (keys['s'] || keys['arrowdown'] ? 1 : 0) - gpMoveZ;
      let inTurn = (keys['a'] || keys['arrowleft'] ? 1 : 0) - (keys['d'] || keys['arrowright'] ? 1 : 0) - gpMoveX;
      const isSprinting = Boolean(keys['shift']);

      if (curCut) {
        inForward = 0;
        inTurn = 0;
      }

      if (sim.isMounted) {
        // HORSEBACK RIDING MECHANICS (Walk / Trot / Canter / Gallop)
        const enduranceMult = 1 + (curCamp.upgrades.horseEnduranceLevel - 1) * 0.12;
        const maxHorseSpeed = (isSprinting && sim.horseStamina > 5 ? 25.0 : 17.5) * enduranceMult;

        if (Math.abs(inForward) > 0.05) {
          sim.horseSpeed = THREE.MathUtils.lerp(sim.horseSpeed, inForward * maxHorseSpeed, dt * 3.2);
          if (isSprinting && inForward > 0) {
            sim.horseStamina = Math.max(0, sim.horseStamina - 11 * dt);
          } else {
            sim.horseStamina = Math.min(100, sim.horseStamina + 8 * dt);
          }
        } else {
          sim.horseSpeed = THREE.MathUtils.lerp(sim.horseSpeed, 0, dt * 4.5);
          sim.horseStamina = Math.min(100, sim.horseStamina + 16 * dt);
        }

        // Speed-dependent turning
        const turnSensitivity = THREE.MathUtils.lerp(2.4, 1.25, Math.abs(sim.horseSpeed) / 26);
        sim.horseRotY += inTurn * turnSensitivity * dt;

        const nextX = sim.horsePos.x + Math.sin(sim.horseRotY) * sim.horseSpeed * dt;
        const nextZ = sim.horsePos.z + Math.cos(sim.horseRotY) * sim.horseSpeed * dt;

        // Obstacle collision check
        const blocked = world.colliders.some((c) => Math.hypot(nextX - c.x, nextZ - c.z) < c.r + 1.2);
        if (!blocked) {
          sim.horsePos.x = THREE.MathUtils.clamp(nextX, -180, 180);
          sim.horsePos.z = THREE.MathUtils.clamp(nextZ, -4820, 75);
        } else {
          sim.horseSpeed *= 0.2;
        }

        const hY = getTerrainHeight(sim.horsePos.x, sim.horsePos.z);
        const aheadY = getTerrainHeight(
          sim.horsePos.x + Math.sin(sim.horseRotY) * 2,
          sim.horsePos.z + Math.cos(sim.horseRotY) * 2
        );
        const slope = THREE.MathUtils.clamp((aheadY - hY) * 0.25, -0.35, 0.35);
        sim.horsePos.y = hY;

        // Sync DIO onto Slow Dancer's saddle
        sim.playerPos.set(sim.horsePos.x, sim.horsePos.y + 0.95, sim.horsePos.z);
        sim.playerRotY = sim.horseRotY;
        sim.playerState = 'mounted';

        const speedRatio = Math.min(1, Math.abs(sim.horseSpeed) / 22);
        if (speedRatio > 0.08) {
          sim.hoofStepTimer -= dt * (1.8 + speedRatio * 3.8);
          if (sim.hoofStepTimer <= 0) {
            sim.hoofStepTimer = 1.0;
            const surf = sim.horsePos.z < -2580 && sim.horsePos.z > -3120 ? 'water' : 'dirt';
            soundEngine.playHoofbeat(surf, speedRatio);
          }
        }
        updateHorseAnimation(actors.horse, elapsed, speedRatio, inTurn, slope);
      } else {
        // ON-FOOT THIRD-PERSON ACTION MOVEMENT
        if (sim.playerStateTimer > 0) {
          sim.playerStateTimer = Math.max(0, sim.playerStateTimer - dt);
        } else if (keys['shift']) {
          sim.playerState = 'block';
        } else if (Math.abs(inForward) > 0.05 || Math.abs(inTurn) > 0.05) {
          sim.playerRotY += inTurn * 2.8 * dt;
          const walkSpeed = inForward * 9.5;
          const nextX = sim.playerPos.x + Math.sin(sim.playerRotY) * walkSpeed * dt;
          const nextZ = sim.playerPos.z + Math.cos(sim.playerRotY) * walkSpeed * dt;
          const blocked = world.colliders.some((c) => Math.hypot(nextX - c.x, nextZ - c.z) < c.r + 0.8);
          if (!blocked) {
            sim.playerPos.x = THREE.MathUtils.clamp(nextX, -180, 180);
            sim.playerPos.z = THREE.MathUtils.clamp(nextZ, -4820, 75);
          }
          sim.playerState = Math.abs(walkSpeed) > 6 ? 'run' : 'walk';
        } else {
          sim.playerState = 'idle';
        }

        // Apply C-Moon Gravity Shift if fighting Pucci and not in Time Stop!
        if (sim.activeBossCombat?.gravityVector?.label && !sim.timeStopActive) {
          sim.playerPos.x += sim.activeBossCombat.gravityVector.x * dt * 0.65;
          sim.playerPos.z += sim.activeBossCombat.gravityVector.z * dt * 0.65;
        }

        sim.playerPos.y = getTerrainHeight(sim.playerPos.x, sim.playerPos.z);
        updateHorseAnimation(actors.horse, elapsed, 0, 0, 0);
      }

      // Update Slow Dancer mesh transform
      if (actors.horse) {
        actors.horse.visible = curPhase === 'campaign';
        actors.horse.position.copy(sim.horsePos);
        actors.horse.rotation.y = sim.horseRotY;
      }

      // Update Playable DIO Model (Normal DIO vs Heaven Ascension DIO)
      const isHeaven = Boolean(curCamp.isHeavenDio);
      const activePlayerModel = isHeaven ? actors.playerHeavenDio : actors.playerNormalDio;
      const inactivePlayerModel = isHeaven ? actors.playerNormalDio : actors.playerHeavenDio;
      if (inactivePlayerModel) inactivePlayerModel.visible = false;

      if (activePlayerModel) {
        activePlayerModel.visible = true;
        activePlayerModel.position.copy(sim.playerPos);
        activePlayerModel.rotation.y = sim.playerRotY;
        const speedRatio = sim.isMounted
          ? Math.min(1, Math.abs(sim.horseSpeed) / 22)
          : sim.playerState === 'run'
          ? 0.9
          : sim.playerState === 'walk'
          ? 0.5
          : 0;
        updateCharacterAnimation(activePlayerModel, sim.playerState, elapsed, speedRatio, false);
      }

      // Update The World / The World Over Heaven Stand position & animation
      if (actors.playerStand) {
        actors.playerStand.visible = sim.standSummoned && !sim.isMounted;
        if (actors.playerStand.visible) {
          const isAttacking =
            sim.playerState === 'light_attack' ||
            sim.playerState === 'heavy_attack' ||
            sim.playerState === 'barrage';
          const fwdDist = isAttacking ? 1.55 : -0.95;
          const rightDist = isAttacking ? 0.15 : 0.72;
          const sx =
            sim.playerPos.x +
            Math.sin(sim.playerRotY) * fwdDist +
            Math.cos(sim.playerRotY) * rightDist;
          const sz =
            sim.playerPos.z +
            Math.cos(sim.playerRotY) * fwdDist -
            Math.sin(sim.playerRotY) * rightDist;

          actors.playerStand.position.x = THREE.MathUtils.lerp(actors.playerStand.position.x, sx, 0.32);
          actors.playerStand.position.z = THREE.MathUtils.lerp(actors.playerStand.position.z, sz, 0.32);
          actors.playerStand.position.y = sim.playerPos.y + 0.22;
          actors.playerStand.rotation.y = sim.playerRotY;
          updateCharacterAnimation(actors.playerStand, sim.playerState, elapsed, 0.8, true);
        }
      }

      // Update Player Stand Aura
      if (actors.playerAuraMesh) {
        actors.playerAuraMesh.position.set(sim.playerPos.x, sim.playerPos.y + 1.1, sim.playerPos.z);
        actors.playerAuraMesh.material.color.set(isHeaven ? '#fef08a' : '#eab308');
        actors.playerAuraMesh.material.opacity = sim.standSummoned
          ? 0.16 + Math.sin(elapsed * 5) * 0.06
          : 0;
      }

      // === CHECK PROXIMITY FOR QUESTS, BOSS INTROS & CONTEXT INTERACTIONS ===
      sim.contextAction = null;
      if (curPhase === 'campaign' && !curCut) {
        // Check active quest nodes & NPC
        const curQuest = MANDATORY_QUESTS[curCamp.currentQuestIndex];
        if (curQuest && !curCamp.questsCompleted.includes(curQuest.index)) {
          const qEntry = actors.questNpcGroups.get(curQuest.index);
          if (qEntry?.wielder) {
            updateCharacterAnimation(qEntry.wielder, 'idle', elapsed, 0, false);
            const distNpc = Math.hypot(
              qEntry.wielder.position.x - sim.playerPos.x,
              qEntry.wielder.position.z - sim.playerPos.z
            );
            if (distNpc < 6.5) {
              sim.contextAction = {
                label: `Speak with ${curQuest.npcName} (${curQuest.title.split(':')[0]})`,
                onExecute: () => onOpenQuestModal?.(curQuest, null),
              };
            }
          }

          qEntry?.nodeMeshes.forEach((nm) => {
            const { nodeDef, beacon } = nm.userData;
            const isDone = sim.completedQuestNodes.has(nodeDef.id);
            nm.visible = !isDone;
            if (!isDone && beacon) {
              beacon.rotation.y = elapsed * 2.2;
              const dNode = Math.hypot(nm.position.x - sim.playerPos.x, nm.position.z - sim.playerPos.z);
              if (dNode < 6.0) {
                sim.contextAction = {
                  label: `Inspect ${nodeDef.label}`,
                  onExecute: () => onOpenQuestModal?.(curQuest, nodeDef),
                };
              }
            }
          });
        }

        // Check Boss Arena Entry or Active Boss AI
        const targetBossIdx = curCamp.currentBossIndex;
        const bCfg = MAIN_BOSSES[targetBossIdx];
        if (bCfg && !curCamp.bossesDefeated.includes(targetBossIdx)) {
          const distBoss = Math.hypot(
            bCfg.position.x - sim.playerPos.x,
            bCfg.position.z - sim.playerPos.z
          );
          if (!sim.activeBossCombat && distBoss < bCfg.arenaRadius * 0.85) {
            sim.isMounted = false;
            sim.activeBossIndex = targetBossIdx;
            sim.activeBossCombat = createBossCombatState(bCfg, 'normal');
            onTriggerBossIntro?.(bCfg);
          }
        }
      }

      // === UPDATE ACTIVE BOSS AI & HAZARDS ===
      if (sim.activeBossCombat && sim.activeBossIndex !== null && !curCut) {
        const bEntry = actors.bossGroups.get(sim.activeBossIndex);
        if (bEntry?.wielder) {
          updateBossAI({
            bossState: sim.activeBossCombat,
            bossGroup: bEntry.wielder,
            bossStandGroup: bEntry.stand,
            cloneGroups: bEntry.clones,
            playerPos: { x: sim.playerPos.x, y: sim.playerPos.y, z: sim.playerPos.z, rotY: sim.playerRotY },
            dt,
            elapsedTime: elapsed,
            isPlayerTimeStopped: sim.timeStopActive,
            difficulty: stateRef.current.versusConfig?.difficulty || 'normal',
            onDamagePlayer: (dmg) => {
              const mitigated = sim.playerState === 'block' ? dmg * 0.25 : sim.playerState === 'dodge' ? 0 : dmg;
              if (mitigated > 0) {
                sim.hp = Math.max(0, sim.hp - mitigated);
                if (sim.hp <= 0) {
                  // Restart current boss checkpoint
                  sim.hp = sim.maxHp;
                  sim.activeBossCombat.hp = sim.activeBossCombat.maxHp;
                  onPlayerDefeated?.();
                }
              }
            },
            onSpawnVfx: spawnVfxBurst,
          });

          bEntry.wielder.position.y = getTerrainHeight(
            bEntry.wielder.position.x,
            bEntry.wielder.position.z
          );
          updateCharacterAnimation(bEntry.wielder, sim.activeBossCombat.state, elapsed, 0.8, false);
          if (bEntry.stand) {
            updateCharacterAnimation(bEntry.stand, sim.activeBossCombat.state, elapsed, 0.8, true);
          }

          // Lock-on orientation
          if (sim.lockOnActive && !sim.isMounted) {
            sim.playerRotY = Math.atan2(
              bEntry.wielder.position.x - sim.playerPos.x,
              bEntry.wielder.position.z - sim.playerPos.z
            );
          }
        }
      }

      // Render active boss projectiles/mines in 3D space
      actors.hazardMeshes.forEach((hm) => scene.remove(hm));
      actors.hazardMeshes.length = 0;
      if (sim.activeBossCombat?.hazards?.length) {
        sim.activeBossCombat.hazards.forEach((h) => {
          const m = new THREE.Mesh(
            new THREE.SphereGeometry(h.type === 'mine' ? 0.75 : 0.45, 10, 10),
            new THREE.MeshBasicMaterial({ color: h.color || '#ef4444', wireframe: h.type === 'mine' })
          );
          m.position.set(h.x, getTerrainHeight(h.x, h.z) + 0.9, h.z);
          scene.add(m);
          actors.hazardMeshes.push(m);
        });
      }

      // Update VFX bursts
      for (let i = actors.vfxBursts.length - 1; i >= 0; i--) {
        const b = actors.vfxBursts[i];
        b.ttl -= dt;
        if (b.ttl <= 0) {
          scene.remove(b.mesh);
          actors.vfxBursts.splice(i, 1);
        } else {
          b.mesh.scale.multiplyScalar(1.06);
          b.mesh.material.opacity = b.ttl / b.maxTtl;
        }
      }

      // === CAMERA CHOREOGRAPHY (Cutscene vs Horseback vs Third-Person Combat) ===
      if (curCut) {
        // Dynamic sweeping in-engine camera during cutscenes
        const orbitAngle = elapsed * 0.35;
        const focusX = curCut.focusPos?.x ?? sim.playerPos.x;
        const focusZ = curCut.focusPos?.z ?? sim.playerPos.z;
        const focusY = getTerrainHeight(focusX, focusZ) + 1.5;
        camera.position.set(
          focusX + Math.sin(orbitAngle) * 6.5,
          focusY + 1.4 + Math.sin(elapsed * 0.5) * 0.5,
          focusZ + Math.cos(orbitAngle) * 6.5
        );
        camera.lookAt(focusX, focusY, focusZ);
      } else {
        const camDist = sim.isMounted ? 8.2 : 5.8;
        const camHeight = sim.isMounted ? 3.2 : 2.35;
        const behindAngle = sim.playerRotY + Math.PI;
        const desiredCamX = sim.playerPos.x + Math.sin(behindAngle) * camDist;
        const desiredCamZ = sim.playerPos.z + Math.cos(behindAngle) * camDist;
        const terrainAtCam = getTerrainHeight(desiredCamX, desiredCamZ);
        const desiredCamY = Math.max(sim.playerPos.y + camHeight, terrainAtCam + 1.2);

        camera.position.lerp(new THREE.Vector3(desiredCamX, desiredCamY, desiredCamZ), 0.16);
        camera.lookAt(
          sim.playerPos.x + Math.sin(sim.playerRotY) * 2.5,
          sim.playerPos.y + 1.45,
          sim.playerPos.z + Math.cos(sim.playerRotY) * 2.5
        );
      }

      renderer.render(scene, camera);

      // Throttled HUD sync (every ~120ms so React never re-renders at 60fps)
      if (elapsed - lastHudSync > 0.12) {
        lastHudSync = elapsed;
        const curRegion =
          FRONTIER_REGIONS.find(
            (r) => sim.playerPos.z <= r.zStart && sim.playerPos.z >= r.zEnd
          ) || FRONTIER_REGIONS[0];

        onSyncHud?.({
          hp: sim.hp,
          maxHp: sim.maxHp,
          standEnergy: sim.standEnergy,
          maxStandEnergy: sim.maxStandEnergy,
          standSummoned: sim.standSummoned,
          timeStopActive: sim.timeStopActive,
          timeStopCooldown: sim.timeStopCooldown,
          isMounted: sim.isMounted,
          horseStamina: sim.horseStamina,
          lockOnActive: sim.lockOnActive,
          currentRegion: curRegion,
          bossState: sim.activeBossCombat ? { ...sim.activeBossCombat } : null,
          contextPrompt: sim.contextAction?.label || null,
        });
      }
    }

    animate();

    return () => {
      unsubStatus();
      if (animFrameId) cancelAnimationFrame(animFrameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="relative w-screen h-screen overflow-hidden bg-[#050811] cursor-crosshair"
    />
  );
}