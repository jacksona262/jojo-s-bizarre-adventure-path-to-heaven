# V2 audit — asset compatibility matrix and performance baseline

Recorded 2026-10-19 before any V2 gameplay change (V1 checkpoint `6ad5b7c702b88d89992c61c9`).

## 1. Asset compatibility matrix (all 28 supplied GLB files)

No file contains a usable animation clip. `giorno_giovanna__gold_experience.glb` carries four Mixamo
takes but every one is 0.00 s long (a single bind frame), so retargeting has nothing to retarget.
Every character is therefore driven by the procedural pose system + IK (V2 Phase 1), on either its
authored skeleton or a skeleton generated at load time.

Columns: joints mapped (of 19 canonical joints, +1 = spine2) · bind arm angle from vertical
(90 = T-pose) · torso correction needed for the action-pose bind (degrees) · hair / face bones ·
strategy.

| Part | File | Skeleton | Joints | Bind arms | Torso corr. | Hair | Face | Strategy |
|---|---|---|---|---|---|---|---|---|
| dio | main character.glb | authored (241 bones) | 20/19 | 31° (A) | 16° | 16 | 41 | procedural + IK, hair springs |
| theWorld | main character.glb | authored (same file) | 20/19 | 47° | 88° (crouched bind) | 0 | 15 | procedural + IK, torso correction |
| dioHome | loading screen…glb | authored (241) | 20/19 | 39° | 42° | 16 | 41 | homepage/cinematic, hair springs, jaw |
| dioHeaven | dio_over_heaven…glb | Valve biped (108) | 20/19 | 94° (T) | 33° | 0 | 0 | procedural + IK |
| polnareff | polnereff_eoh.glb | EoH (151) | 19/19 | 90° (T) | 11° | 10 | 17 | procedural + IK, hair springs |
| killerQueen | killer_queen.glb | EoH (136) | 19/19 | 90° | 19° | 0 | 17 | procedural + IK |
| giorno / goldExperience | giorno…glb | Mixamo (79 each) | 19/19 | 26° / 8° | 19° / 46° | 0 | 0 | procedural + IK (clips are 0 s) |
| valentine | funny_valentine…glb | SBR (151) | 19/19 | 41° | 63° | 24 | 41 | procedural + IK, hair springs |
| d4c | funny_valentine…glb | SBR (105) | 20/19 | 28° | 61° | 0 | 11 | procedural + IK |
| pucci | enrico_pucci…glb | SBR (209) | 19/19 | 89° | 12° | 9 | 85 | procedural + IK, hair springs |
| cmoon | c-moonsee_moon.glb | authored but names unreadable → auto | 19/19 | 45° | 0 | 0 | 0 | auto-rig + procedural |
| avdol, magiciansRed | muhammad_avdol…glb | none → auto-rig | 19/19 | 92° / 86° | 0 | – | – | auto-rig (coat excluded by T-pose band) |
| kakyoin, hierophant | noriaki_kakyoin…glb | none → auto-rig | 19/19 | 91° / 92° | 0 | – | – | auto-rig |
| josuke, crazyDiamond | josuke…glb | none → auto-rig | 19/19 | 93° / 91° | 0 | – | – | auto-rig |
| kira | yoshikage_kira…glb | none → auto-rig | 19/19 | 92° | 0 | – | – | auto-rig |
| diavolo | diavolo.glb | none → auto-rig | 19/19 | 90° | 0 | – | – | auto-rig |
| kingCrimson | king_crimson_asb.glb | none → auto-rig | 19/19 | 91° | 0 | – | – | auto-rig |
| jotaro, starPlatinum | jotaro…glb | none → auto-rig | 19/19 | 92° / 86° | 0 | – | – | auto-rig |
| mariah, holHorse, vanillaIce | separate files | none → auto-rig | 19/19 | 89–90° | 0 | – | – | auto-rig |
| ndoul (+ geb rigid) | n_doul__geb.glb | auto-rig / rigid | 19/19 | 91° | 0 | – | – | auto-rig; Geb animated as a deforming rigid mass |
| daniel, osiris | daniel…glb | none → auto-rig | 19/19 | 92° / 90° | 0 | – | – | auto-rig |
| telence, atum | telence…glb | none → auto-rig | 19/19 | 87° / 88° | 0 | – | – | auto-rig |
| enya | enya_the_hag_dr.glb | none → auto-rig | 19/19 | 27° (hunched) | 0 | – | – | auto-rig, 'old' idle style |
| speedwagon | robert_e.o…glb | none → auto-rig | 19/19 | 91° | 0 | – | – | auto-rig |
| horse (Slow Dancer) | slow_dancer…glb | none → auto quadruped | – | – | – | – | – | auto-horse + gait animator (spec-gloss restored) |
| arrow | stand_arrow.glb | rigid | – | – | – | – | – | prop |
| streetProps | street_props.glb | rigid | – | – | – | – | – | town props |
| busShelter | bus_shelter_diorama.glb | rigid | – | – | – | – | – | unused (modern vending machine is anachronistic) |

### Known GLB limitations (cannot be fixed in code)
- No animation clips anywhere: all motion is procedural/IK. Finger animation is impossible on the
  auto-rigged characters (fingers are fused into the hand mesh and weighted to the hand bone).
- Auto-rigged characters have no hair/face/cloth bones: hair and coats move rigidly with the head/torso.
  Facial expression is only possible on dio, dioHome, pucci, valentine, polnareff (and partially KQ).
- Auto-rig skin weights are heuristic: extreme poses (deep crouch, arms crossed tightly) can show
  stretching at the shoulders and hips of long coats (Avdol, Hol Horse).
- The World / D4C / Gold Experience are bound in crouched action poses; a torso correction is applied so
  the canonical pose system can stand them upright. Extreme spine bends on these rigs deform more.
- C-Moon's authored bones have corrupted names and are replaced by a generated skeleton.
- The World Over Heaven, Bastet, Emperor, Cream and Justice have no meshes in the supplied files.

## 2. Performance baseline (V1, before V2)

Environment: Claude desktop app preview browser (Chrome 152 / ANGLE Metal), Apple M4, 10 cores, 16 GB;
viewport 686×715 CSS px, DPR 2, render pixel ratio 1.25 (quality "high"), vsync-capped at 60 Hz.
Profiler: `?prof` (src/game/dev/Profiler.js) — frame interval percentiles over a 240-frame window,
CPU section EMAs, GPU time via EXT_disjoint_timer_query_webgl2 (unreliable in absolute terms on Apple GPUs:
it reports clock-scaled times; frame intervals are the trustworthy number).

| Scenario | avg ms | p95 | p99 | spikes >33 ms | CPU total | draw calls | triangles | programs | heap |
|---|---|---|---|---|---|---|---|---|---|
| Title (mansion balcony) | 16.69 | 18.6 | 18.8 | 0 | 2.0 ms | 108 | 296k | 77 | 115 MB |
| Ebon town idle | 16.70 | 18.5 | 18.7 | 0 | 2.7 ms | 155 | 372k | 88 | 151 MB |
| Gallop north 15 m/s, 20 s (z 0 → −288) | 16.68 | 17.7 | 18.7 | **5 (115–134 ms)** | 2.1 ms (max 50.6) | 124 | 381k | **88 → 195** | 142 MB |
| Avdol fight 22 s incl. rush + time stop | 16.59 | 18.7 | 18.7 | 1 | 3.0 ms | 141 | 417k | 116 | 147 MB |
| Same fight, render resized to 1920×1080 ×1.25 | 16.70 | 18.4 | 18.6 | 0 | – | 158 | – | – | – |
| Same fight, 2560×1440 ×1.25 (3200×1800 px) | 16.69 | 18.5 | 18.6 | 0 | – | 158 | – | – | – |

Load: title interactive ≈ 7.7 s after navigation (whole world built before the title shows).

### Root causes found
1. **Traversal hitches (115–134 ms)**: shader programs jump from 88 to 195 while riding. The light pool
   toggles `PointLight.visible`, which changes the scene's light count and forces every lit material to
   recompile (World._updateLights). Fix: keep the pool lights permanently visible with intensity 0.
2. CPU frame cost is low (2–3 ms); the M4 is not GPU-bound at 1080p/1440p. Weaker GPUs will be: the
   pipeline is RenderPass (HalfFloat) → UnrealBloom (5 mips) → OutputPass → FinalShader (full-res).
   OutputPass + FinalShader can be merged, and quality presets should scale bloom and shadows.
3. Global instanced vegetation is drawn with frustumCulled=false (all instances, both passes).

### Gameplay/animation defects reproduced (V1)
- Walk/run cycle bends the knee during stance instead of swing; stride not tied to distance → foot sliding.
- No strafe/backpedal/turn-in-place animation: legs walk forward while moving sideways or backwards.
- Attack hits are a timed cone check, not tied to the fist; the Stand never travels to the target.
- No line-of-sight test: hits pass through walls. Facing is not snapped before attacks.
- Knockdown keeps the body upright (no root rotation), no get-up.
- Hair and coats are rigid even on rigs that have hair bones.
