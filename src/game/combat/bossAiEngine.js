import * as THREE from 'three';
import { soundEngine } from '../audio/soundEngine';

/**
 * Canon-Inspired Boss & Versus Fighter AI Engine.
 * Drives distinct Stand mechanics, telegraphs, projectiles, hazards, clones,
 * gravity shifts, time erasure, and Star Platinum time-stop invasion.
 */
export function createBossCombatState(bossConfig, difficulty = 'normal') {
  const mult = difficulty === 'beginner' ? 0.75 : difficulty === 'expert' ? 1.25 : 1.0;
  return {
    config: bossConfig,
    hp: Math.round((bossConfig.maxHp || 1200) * mult),
    maxHp: Math.round((bossConfig.maxHp || 1200) * mult),
    phase: 1,
    state: 'idle', // 'idle' | 'walk' | 'run' | 'light_attack' | 'heavy_attack' | 'barrage' | 'block' | 'hit' | 'timestop_cast'
    stateTimer: 0,
    attackCooldown: 1.4,
    specialCooldown: 5.5,
    warningBanner: null,
    warningTimer: 0,
    // Stand-specific mechanic states
    parryActive: false, // Polnareff / Jotaro
    epitaphActive: false, // Diavolo foresight counter
    timeEraseTimer: 0, // Diavolo skipped time
    lifeReflectActive: false, // Giorno Gold Experience reflection
    gravityVector: { x: 0, z: 0, label: null }, // Pucci C-Moon
    jotaroInvasionRemaining: 0, // Jotaro moving inside DIO's Time Stop
    enemyTimeStopTimer: 0, // Jotaro's own Star Platinum Time Stop
    hazards: [], // Projectiles, flame lanes, emerald wires, Kira bombs, Sheer Heart Attack, restored walls
  };
}

export function updateBossAI({
  bossState,
  bossGroup,
  bossStandGroup,
  cloneGroups = [],
  playerPos,
  dt,
  elapsedTime,
  isPlayerTimeStopped,
  onDamagePlayer,
  onSpawnVfx,
  difficulty = 'normal',
}) {
  if (!bossState || !bossGroup || bossState.hp <= 0) return;

  const hpRatio = bossState.hp / bossState.maxHp;
  const newPhase = hpRatio < 0.35 ? 3 : hpRatio < 0.7 ? 2 : 1;
  if (newPhase > bossState.phase) {
    bossState.phase = newPhase;
    bossState.warningBanner = `${bossState.config.name.toUpperCase()} ENTERED PHASE ${newPhase}!`;
    bossState.warningTimer = 3.0;
    onSpawnVfx?.(bossGroup.position, bossState.config.auraColor || '#facc15', 2.4);
  }

  if (bossState.warningTimer > 0) {
    bossState.warningTimer = Math.max(0, bossState.warningTimer - dt);
    if (bossState.warningTimer === 0) bossState.warningBanner = null;
  }

  // Handle Player Time Stop — freeze boss & hazards UNLESS Jotaro invades stopped time!
  if (isPlayerTimeStopped) {
    const style = bossState.config.standStyle;
    if (
      (style === 'star_platinum_timestop' || style === 'star_platinum_awakened') &&
      bossState.phase >= 2 &&
      bossState.jotaroInvasionRemaining > 0
    ) {
      bossState.jotaroInvasionRemaining = Math.max(0, bossState.jotaroInvasionRemaining - dt);
      bossState.warningBanner = 'STAR PLATINUM IS MOVING INSIDE YOUR STOPPED TIME!';
      bossState.warningTimer = 0.5;
    } else {
      // Completely frozen in DIO's Time Stop!
      return;
    }
  } else {
    // Reset Jotaro invasion allowance for next Time Stop
    bossState.jotaroInvasionRemaining = bossState.config.standStyle === 'star_platinum_awakened' ? 2.5 : 1.6;
  }

  // Update active hazards (projectiles, bombs, flame waves, Sheer Heart Attack)
  updateBossHazards(bossState, playerPos, dt, onDamagePlayer, onSpawnVfx);

  // Decrement timers
  if (bossState.timeEraseTimer > 0) {
    bossState.timeEraseTimer = Math.max(0, bossState.timeEraseTimer - dt);
    if (bossState.timeEraseTimer === 0) {
      // Diavolo ambushes behind player at the instant Time Erasure ends!
      const behindX = playerPos.x - Math.sin(playerPos.rotY || 0) * 2.8;
      const behindZ = playerPos.z - Math.cos(playerPos.rotY || 0) * 2.8;
      bossGroup.position.x = behindX;
      bossGroup.position.z = behindZ;
      bossState.state = 'heavy_attack';
      bossState.stateTimer = 0.65;
      bossState.warningBanner = 'KING CRIMSON LEAPT PAST TIME — DODGE OR GUARD NOW!';
      bossState.warningTimer = 1.6;
      soundEngine.playAttackImpact('heavy');
    }
  }

  if (bossState.enemyTimeStopTimer > 0) {
    bossState.enemyTimeStopTimer = Math.max(0, bossState.enemyTimeStopTimer - dt);
  }

  const bPos = bossGroup.position;
  const dx = playerPos.x - bPos.x;
  const dz = playerPos.z - bPos.z;
  const dist = Math.hypot(dx, dz) || 0.001;
  const dirX = dx / dist;
  const dirZ = dz / dist;

  // Smoothly face player
  const targetAngle = Math.atan2(dx, dz);
  bossGroup.rotation.y = targetAngle;

  if (bossState.stateTimer > 0) {
    bossState.stateTimer = Math.max(0, bossState.stateTimer - dt);
    if (bossState.stateTimer === 0) {
      bossState.state = 'idle';
      bossState.parryActive = false;
      bossState.epitaphActive = false;
      bossState.lifeReflectActive = false;
    }
  }

  bossState.attackCooldown = Math.max(0, bossState.attackCooldown - dt);
  bossState.specialCooldown = Math.max(0, bossState.specialCooldown - dt);

  const speedScale = difficulty === 'beginner' ? 0.8 : difficulty === 'expert' ? 1.25 : 1.0;
  const style = bossState.config.standStyle || 'brawler';

  // Movement behavior based on Stand archetype
  if (bossState.state === 'idle' || bossState.state === 'walk' || bossState.state === 'run') {
    const preferredRange =
      style === 'emerald_barrier' || style === 'fire_lanes' ? 9.5 : style === 'bomb_traps' ? 6.5 : 3.2;

    if (dist > preferredRange + 1.2) {
      const moveSpeed = (style === 'rapier_fencing' && bossState.phase >= 2 ? 9.2 : 6.4) * speedScale;
      bPos.x += dirX * moveSpeed * dt;
      bPos.z += dirZ * moveSpeed * dt;
      bossState.state = moveSpeed > 7 ? 'run' : 'walk';
    } else if (dist < preferredRange - 2.0 && (style === 'emerald_barrier' || style === 'fire_lanes')) {
      // Kakyoin & Avdol kite backwards to maintain zoning range
      bPos.x -= dirX * 4.5 * dt;
      bPos.z -= dirZ * 4.5 * dt;
      bossState.state = 'walk';
    } else {
      // Circle strafe around player
      const strafeDir = Math.sin(elapsedTime * 0.9) > 0 ? 1 : -1;
      bPos.x += -dirZ * strafeDir * 3.2 * dt;
      bPos.z += dirX * strafeDir * 3.2 * dt;
      bossState.state = 'walk';
    }
  }

  // Stand positioning relative to Wielder
  if (bossStandGroup) {
    const lungeOffset =
      bossState.state === 'barrage' || bossState.state === 'heavy_attack' || bossState.state === 'light_attack'
        ? 1.65
        : -0.95;
    const sideOffset = lungeOffset > 0 ? 0.25 : 0.75;
    const tx = bPos.x + Math.sin(targetAngle) * lungeOffset + Math.cos(targetAngle) * sideOffset;
    const tz = bPos.z + Math.cos(targetAngle) * lungeOffset - Math.sin(targetAngle) * sideOffset;
    bossStandGroup.position.x = THREE.MathUtils.lerp(bossStandGroup.position.x, tx, 0.28);
    bossStandGroup.position.z = THREE.MathUtils.lerp(bossStandGroup.position.z, tz, 0.28);
    bossStandGroup.position.y = bPos.y + 0.18;
    bossStandGroup.rotation.y = targetAngle;
  }

  // Funny Valentine D4C Alternate-Universe Clones update
  if (style === 'dimensional_clones' && cloneGroups.length > 0) {
    cloneGroups.forEach((cg, idx) => {
      const angle = elapsedTime * 1.3 + idx * Math.PI;
      const radius = 5.5 + Math.sin(elapsedTime * 2) * 1.5;
      cg.visible = bossState.phase >= 2;
      if (cg.visible) {
        cg.position.set(
          bPos.x + Math.cos(angle) * radius,
          bPos.y,
          bPos.z + Math.sin(angle) * radius
        );
        cg.rotation.y = Math.atan2(playerPos.x - cg.position.x, playerPos.z - cg.position.z);
      }
    });
  }

  // Execute Unique Stand Special Ability when off cooldown
  if (bossState.specialCooldown <= 0) {
    triggerBossSignatureAbility(bossState, bPos, playerPos, dirX, dirZ, onDamagePlayer, onSpawnVfx);
    bossState.specialCooldown = Math.max(3.6, (7.0 - bossState.phase * 0.8) / speedScale);
    return;
  }

  // Execute Close/Mid-Range Attack when in range and off cooldown
  if (bossState.attackCooldown <= 0 && dist < 4.4) {
    bossState.state = Math.random() > 0.45 ? 'barrage' : 'heavy_attack';
    bossState.stateTimer = 0.75;
    bossState.attackCooldown = (1.65 - bossState.phase * 0.2) / speedScale;
    soundEngine.playAttackImpact('heavy');
    onSpawnVfx?.(
      new THREE.Vector3(bPos.x + dirX * 1.6, bPos.y + 1.2, bPos.z + dirZ * 1.6),
      bossState.config.auraColor || '#facc15',
      1.2
    );
    if (dist < 3.8) {
      onDamagePlayer(18 + bossState.phase * 5, `${bossState.config.standName} Strike`);
    }
  }
}

function triggerBossSignatureAbility(bossState, bPos, playerPos, dirX, dirZ, onDamagePlayer, onSpawnVfx) {
  const style = bossState.config.standStyle || 'brawler';
  bossState.state = 'heavy_attack';
  bossState.stateTimer = 0.95;

  switch (style) {
    case 'fire_lanes': {
      // Avdol: 3-lane Crossfire Hurricane flame projectiles
      bossState.warningBanner = "MAGICIAN'S RED: CROSSFIRE HURRICANE (3 FLAME LANES)!";
      bossState.warningTimer = 2.4;
      [-0.32, 0, 0.32].forEach((spread) => {
        const ang = Math.atan2(dirX, dirZ) + spread;
        bossState.hazards.push({
          type: 'projectile',
          label: 'Crossfire Hurricane',
          x: bPos.x,
          y: bPos.y + 1.2,
          z: bPos.z,
          vx: Math.sin(ang) * 15,
          vz: Math.cos(ang) * 15,
          radius: 1.4,
          damage: 28,
          color: '#f97316',
          ttl: 3.0,
        });
      });
      soundEngine.playAttackImpact('heavy');
      break;
    }

    case 'emerald_barrier': {
      // Kakyoin: 20-Meter Emerald Splash volley + barrier tripwire
      bossState.warningBanner = 'HIEROPHANT GREEN: 20-METER EMERALD SPLASH!';
      bossState.warningTimer = 2.4;
      for (let i = -2; i <= 2; i++) {
        const ang = Math.atan2(dirX, dirZ) + i * 0.14;
        bossState.hazards.push({
          type: 'projectile',
          label: 'Emerald Splash',
          x: bPos.x,
          y: bPos.y + 1.3,
          z: bPos.z,
          vx: Math.sin(ang) * 19,
          vz: Math.cos(ang) * 19,
          radius: 1.0,
          damage: 20,
          color: '#10b981',
          ttl: 2.5,
        });
      }
      // Place an emerald tripwire midway to player
      bossState.hazards.push({
        type: 'mine',
        label: 'Hierophant Barrier Thread',
        x: (bPos.x + playerPos.x) * 0.5,
        y: bPos.y + 0.4,
        z: (bPos.z + playerPos.z) * 0.5,
        radius: 2.3,
        damage: 32,
        color: '#34d399',
        ttl: 8.0,
      });
      break;
    }

    case 'rapier_fencing': {
      // Polnareff: Silver Chariot Parry Stance + Million Spitfires Dash
      bossState.parryActive = true;
      bossState.state = 'block';
      bossState.stateTimer = 1.4;
      bossState.warningBanner = 'SILVER CHARIOT PARRY STANCE — DO NOT ATTACK FRONTALLY!';
      bossState.warningTimer = 1.8;
      // Also fire rapier shockwave
      bossState.hazards.push({
        type: 'projectile',
        label: 'Shooting Star Blade',
        x: bPos.x,
        y: bPos.y + 1.2,
        z: bPos.z,
        vx: dirX * 22,
        vz: dirZ * 22,
        radius: 1.2,
        damage: 30,
        color: '#38bdf8',
        ttl: 1.8,
      });
      break;
    }

    case 'restoration_brawler': {
      // Josuke: Crazy Diamond restores broken ground into a homing rock barrier wave (Never heals himself!)
      bossState.warningBanner = 'CRAZY DIAMOND: TERRAIN RESTORATION SHOCKWAVE!';
      bossState.warningTimer = 2.2;
      bossState.hazards.push({
        type: 'projectile',
        label: 'Restored Pillar Wave',
        x: bPos.x + dirX * 2,
        y: bPos.y + 0.8,
        z: bPos.z + dirZ * 2,
        vx: dirX * 14,
        vz: dirZ * 14,
        radius: 2.0,
        damage: 34,
        color: '#ec4899',
        ttl: 2.4,
      });
      break;
    }

    case 'bomb_traps': {
      // Kira: Places Primary Bomb + deploys homing Sheer Heart Attack
      bossState.warningBanner = 'KILLER QUEEN: PRIMARY BOMB & SHEER HEART ATTACK DEPLOYED!';
      bossState.warningTimer = 2.6;
      bossState.hazards.push({
        type: 'mine',
        label: 'Killer Queen Primary Bomb',
        x: playerPos.x + (Math.random() - 0.5) * 3,
        y: bPos.y + 0.25,
        z: playerPos.z + (Math.random() - 0.5) * 3,
        radius: 2.4,
        damage: 38,
        color: '#c084fc',
        ttl: 6.0,
      });
      if (bossState.phase >= 2) {
        bossState.hazards.push({
          type: 'homing',
          label: 'Sheer Heart Attack ("LOOK OVER HERE!")',
          x: bPos.x + dirX * 2,
          y: bPos.y + 0.5,
          z: bPos.z + dirZ * 2,
          speed: 6.2,
          radius: 1.5,
          damage: 42,
          color: '#38bdf8',
          ttl: 5.5,
        });
      }
      break;
    }

    case 'time_erasure': {
      // Diavolo: Epitaph + 2.0s Time Erasure
      bossState.epitaphActive = true;
      bossState.timeEraseTimer = 2.0;
      bossState.warningBanner = 'KING CRIMSON: TIME ERASURE — PREPARE TO DODGE AS TIME RESUMES!';
      bossState.warningTimer = 2.4;
      soundEngine.playTimeStop(false);
      break;
    }

    case 'life_creation': {
      // Giorno: Gold Experience Life Reflection Shield + Vine Burst
      bossState.lifeReflectActive = true;
      bossState.stateTimer = 1.8;
      bossState.warningBanner = 'GOLD EXPERIENCE: LIFE CREATION SHIELD (REFLECTS DAMAGE) + VINE SNARE!';
      bossState.warningTimer = 2.2;
      bossState.hazards.push({
        type: 'mine',
        label: 'Golden Thorn Vine Burst',
        x: playerPos.x,
        y: bPos.y + 0.3,
        z: playerPos.z,
        radius: 2.5,
        damage: 30,
        color: '#facc15',
        ttl: 3.5,
      });
      break;
    }

    case 'dimensional_clones': {
      // Funny Valentine: D4C Dimensional Hop & Parallel Clone Volley
      bossState.warningBanner = 'D4C: PARALLEL UNIVERSE STEP — ALTERNATE VALENTINES ATTACKING!';
      bossState.warningTimer = 2.5;
      [-0.4, 0.4].forEach((offset) => {
        const ang = Math.atan2(dirX, dirZ) + offset;
        bossState.hazards.push({
          type: 'projectile',
          label: 'Dimensional Rift Wave',
          x: bPos.x,
          y: bPos.y + 1.2,
          z: bPos.z,
          vx: Math.sin(ang) * 16,
          vz: Math.cos(ang) * 16,
          radius: 1.6,
          damage: 34,
          color: '#f472b6',
          ttl: 2.6,
        });
      });
      break;
    }

    case 'gravity_inversion': {
      // Enrico Pucci: C-Moon Surface Gravity Vector Shift
      const dirs = [
        { x: 4.8, z: 0, label: 'EAST (+X)' },
        { x: -4.8, z: 0, label: 'WEST (-X)' },
        { x: 0, z: 4.8, label: 'SOUTH (+Z)' },
        { x: 0, z: -4.8, label: 'NORTH (-Z)' },
      ];
      const pick = dirs[Math.floor(Math.random() * dirs.length)];
      bossState.gravityVector = pick;
      bossState.warningBanner = `C-MOON GRAVITY INVERSION: PULLING ${pick.label}!`;
      bossState.warningTimer = 3.2;
      bossState.hazards.push({
        type: 'projectile',
        label: 'C-Moon Gravity Ring',
        x: bPos.x,
        y: bPos.y + 1.2,
        z: bPos.z,
        vx: dirX * 15,
        vz: dirZ * 15,
        radius: 1.9,
        damage: 38,
        color: '#22c55e',
        ttl: 2.8,
      });
      break;
    }

    case 'star_platinum_timestop':
    case 'star_platinum_awakened': {
      // Jotaro Kujo: Star Finger or Star Platinum: The World!
      if (bossState.phase >= 2 && Math.random() > 0.4) {
        bossState.enemyTimeStopTimer = 1.6;
        bossState.warningBanner = 'JOTARO: "STAR PLATINUM — THE WORLD!"';
        bossState.warningTimer = 2.2;
        soundEngine.playTimeStop(false);
        const dist = Math.hypot(playerPos.x - bPos.x, playerPos.z - bPos.z);
        if (dist < 14) {
          bPos.x = playerPos.x - dirX * 2.4;
          bPos.z = playerPos.z - dirZ * 2.4;
          onDamagePlayer(36, 'Star Platinum Time-Stop Ora Rush');
        }
      } else {
        bossState.warningBanner = 'STAR PLATINUM: STAR FINGER PIERCE!';
        bossState.warningTimer = 1.8;
        bossState.hazards.push({
          type: 'projectile',
          label: 'Star Finger',
          x: bPos.x,
          y: bPos.y + 1.3,
          z: bPos.z,
          vx: dirX * 24,
          vz: dirZ * 24,
          radius: 1.3,
          damage: 35,
          color: '#a855f7',
          ttl: 1.6,
        });
      }
      break;
    }

    default: {
      bossState.hazards.push({
        type: 'projectile',
        label: 'Stand Wave',
        x: bPos.x,
        y: bPos.y + 1.2,
        z: bPos.z,
        vx: dirX * 16,
        vz: dirZ * 16,
        radius: 1.4,
        damage: 25,
        color: '#eab308',
        ttl: 2.2,
      });
      break;
    }
  }
}

function updateBossHazards(bossState, playerPos, dt, onDamagePlayer, onSpawnVfx) {
  const remaining = [];
  for (const h of bossState.hazards) {
    h.ttl -= dt;
    if (h.ttl <= 0) continue;

    if (h.type === 'projectile') {
      h.x += h.vx * dt;
      h.z += h.vz * dt;
    } else if (h.type === 'homing') {
      const dx = playerPos.x - h.x;
      const dz = playerPos.z - h.z;
      const d = Math.hypot(dx, dz) || 1;
      h.x += (dx / d) * h.speed * dt;
      h.z += (dz / d) * h.speed * dt;
    }

    const distToPlayer = Math.hypot(playerPos.x - h.x, playerPos.z - h.z);
    if (distToPlayer < h.radius) {
      onDamagePlayer(h.damage, h.label);
      onSpawnVfx?.(new THREE.Vector3(h.x, h.y, h.z), h.color, 1.5);
      continue; // consumed on impact
    }
    remaining.push(h);
  }
  bossState.hazards = remaining;
}