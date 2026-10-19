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

## 3. V2 results (recorded 2026-10-19 after Phases 1–9)

Same environment as the baseline: Claude desktop preview browser, Chrome 152 / ANGLE Metal, Apple M4,
viewport 686×715 CSS px, DPR 2, render pixel ratio 1.25, quality "high", vsync 60 Hz. Same profiler (`?prof`).
Frame-interval numbers are capped by vsync on this machine; CPU time and spikes are the meaningful deltas.
Weaker GPUs were **not** available for testing.

| Scenario | avg ms | p95 | p99 | spikes >33 ms | CPU avg (max) | draw calls | triangles | programs | V1 for comparison |
|---|---|---|---|---|---|---|---|---|---|
| Title (new DIO homepage scene) | 16.58 | 18.7 | 18.8 | 0 | 1.68 (3.2) ms | 25 | 11k | 43 | 108 calls · 296k tris · 77 programs |
| Ebon town idle (main street) | 16.67 | 18.6 | 18.7 | 0 | 3.46 (4.4) ms | 156 | 255k | 91 | 155 · 372k · 88 |
| Gallop 15 m/s, 20 s (z 0 → −227) | 16.64 | 18.0 | 18.5 | **0** (max 17.5 ms) | 2.78 (3.5) ms | 138 | 278k | **89 (flat)** | **5 spikes 115–134 ms**, programs 88 → 195 |
| Empty wilderness, heavy rain (Ember Flats, off-road) | 16.68 | 18.0 | 18.5 | 0 | 3.96 (4.3) ms | 144 | 368k | 89 | – |
| Avdol fight 22 s (3 rushes, 2 time stops, 55 hits) | 16.67 | 17.9 | 18.2 | 1 | 2.88 (3.1) ms | 170 | 251k | 104 | 141 · 417k · 116 · 1 spike · 3.0 ms |
| Finale vs Jotaro 22 s, Heaven DIO (6 impact frames, 10 shockwaves) | 16.66 | 18.6 | 18.7 | 1 | 2.81 (14.5) ms | 101 | 192k | 104 | – |
| Extended run 159 s (1 km gallop + 60 s fight) | 60 fps every sample | – | – | – | – | – | – | 89 → 103 when Jotaro loads, then flat | – |

Memory: the GLTF cache kept each file's parser (raw .glb buffer, JSON, dependency caches) for the whole
session. Dropping it after load cut the settled town heap from 412–429 MB to 241–261 MB (total heap
462 → 310 MB). It is still above V1's 151 MB because V2 keeps more character templates resident; the heap does
not grow over a 159 s session (277–294 MB after GC). Load: title interactive at 7.2 s (V1 7.7 s).

## 4. Complete gameplay loop (spec 9.2) — all 21 steps run in the browser

Steps 1–15 ran as one continuous playthrough from a fresh New Game (inputs synthesized as key/mouse events,
QA saves sandboxed). Later beats used the `?step=` shortcut and the dev QA harness (`window.__qa`).

| # | Step | Result / evidence |
|---|---|---|
| 1–2 | Launch, homepage | title in 7.2 s, menu complete, no console errors |
| 3–4 | New Game, opening cinematic | 42 s directed sequence (establishing, tracking ride, hoof close-up, town, Pucci) |
| 5–6 | Control, move/sprint/dodge | run 4.4 m/s in 0.1 s, sprint 7.0 m/s, stop in 0.1 s, dodge 3.6 m |
| 7–9 | Summon, light/heavy, rush | jabL→jabR→hookL→uppercutR, heavyR, 1.2 s rush + finisher |
| 10 | Time stop | locked in the prologue by design; 2 stops in the Avdol fight, queued hits released |
| 11 | Fight Avdol | won by the scripted player (one death + Retry), 60 fps, 7 staggers |
| 12 | Quest | q1 complete: Speedwagon talk + choice, 3 camps, report → clue + fragment |
| 13–14 | Ride Slow Dancer, cross regions | 393 m in 38 s, gallop 15 m/s; Ebon → Ember at z −702 |
| 15 | Save & reload | slot 1 → Quit → Load: same step, position, flags, fragments |
| 16 | Later bosses | Kakyoin, Diavolo (Epitaph, 2 time erasures), Pucci triggered and fought |
| 17 | Heaven DIO | heaven cinematic, player becomes dioHeaven |
| 18 | Final encounter | Jotaro (760 HP) defeated by Heaven DIO in 65 s, no errors |
| 19–20 | Ending, homepage | ending cinematic → credits → title automatically |
| 21 | Versus | DIO vs Avdol, best of three to the results screen (CPU won 2–1), record saved |

## 5. Regression combinations (spec 9.3)

| Combination | Result |
|---|---|
| Time stop with 14 enemy projectiles in flight | frozen (0 m moved), resume and expire afterwards |
| Time stop across a phase threshold | queued hits leave HP untouched during the stop, phase 2 → 3 at release |
| Pause during combat | boss, projectiles and clock frozen; resume OK |
| Save during a fight | refused with a message; slot not written |
| Reload near a boss arena | saved 75 m out → reload → walk in → intro after 4.3 s |
| Skip a cinematic | one press; end state restored (Stand, pose, time-stop FX, weather) |
| Defeat a boss mid-special (Kakyoin tendrils, 11 projectiles, 1 hazard) | victory plays, everything cleaned up |
| Mount/dismount against buildings (4 walls) | neither DIO nor the horse ends inside geometry |
| Change graphics quality mid-fight (low/ultra/medium/high) | no errors |
| Streaming across chunks/regions (1 km gallop) | geometry count plateaus, 60 fps |
| Enter/exit Versus | title afterwards: 0 actors, 0 fighters, 0 afterimage pools, 0 VFX meshes |
| Restart after defeat | Retry restores phase HP and positions |
| Rapid lock-on switching (30 switches, 3 targets) | never drops; dead target hands over |
| Open/close Pause, Journal, Map, Upgrades 16× | no stuck pause (after the Upgrades fix) |
| Extended run 159 s | no heap growth, flat programs |

## 6. Bugs found and fixed during Phase 9 testing
- Journal cinematic: camera pulled into the desk for ~12 s (look point inside the desk collider) →
  occlusion now starts after leaving a prop the look point rests in; new over-the-shoulder and close-up.
- Summoned horse galloped **away** from the player (steering sign inverted) → fixed; far/stuck horse is
  re-placed out of sight; mount radius now covers where she stops.
- Boss encounters did not refill DIO (loading a low-HP save into a boss) → every duel starts fresh.
- Heaven reveal held one static pose for ~10 s → gestures, talking, a second shot.
- Ending first shot showed an empty courtyard (Jotaro thrown far) → actors staged before the ending.
- Versus select: the info panel covered the roster below ~1000 px → responsive layout.
- Homepage: title overlapped DIO's head on near-square viewports → framing pushes him right.
- Dev invincibility never worked (`damageTakenMul = 0` treated as "unset"); time-stop releases ignored
  damage multipliers (Hierophant's barrier included) → both fixed.
- Stand Upgrades menu could not be closed with its own key.
- Dev/QA sessions could overwrite the player's real saves → sandboxed save namespace for dev/QA.

## 7. Remaining work and limits (honest list)
- Not tested on weaker GPUs, real gamepads, Safari/Firefox, or touch. The M4 is far from GPU-bound.
- Audio was verified structurally (graph, filters, every sound plays without error), not by ear.
- Full-length play of all 9 quests and all 10 boss fights to completion by a human was not done; the
  automated player defeated Avdol and Jotaro and fought every other boss for 30–40 s.
- Heap is ~100 MB above V1 (more resident templates); unloading unused character templates per region would
  bring it down.
- GLB limitations in §1 still apply (no clips, fused fingers, rigid hair/coats on auto-rigged models, no
  meshes for The World Over Heaven, Bastet, Emperor, Cream, Justice).
