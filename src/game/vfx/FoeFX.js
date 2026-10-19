import * as THREE from 'three';
import { ROSTER } from '../combat/Roster';

// A shared depth layer for every opponent's offence (bosses, quest duels, Versus CPU, online
// rivals), on top of whatever their own kit draws:
//   wind-up  - a coloured glint gathering at the striking hand (or the Stand), a ground ring and a
//              flicker of real light under heavy moves, so attacks read before they land;
//   impact   - a layered hit: white core flash, the attacker's colour around it, directional sparks
//              thrown out the far side, dust kicked up at the target's feet and a burst of real
//              light on the surroundings; heavy blows add a screen ripple and a ground shock ring;
//   shots    - a muzzle flash where projectiles leave the hand, and a glowing trail on any shot
//              that had none.
// Everything uses the existing pooled particles and the fixed light pool, so it adds no draw calls
// and no shader cost; rush flurries get the light layer only, rate-limited.

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();

export function installFoeFX(game) {
  const isFoe = (a) => !!a && !a.isPlayer && a !== game.player && (!game.player || a.team !== game.player.team);
  const colorOf = (a) => ROSTER[a.rosterKey]?.aura ?? a.kit?.color ?? 0xff6040;
  let lastLight = 0;
  const light = (p, color, intensity, life = 0.16, range = 10) => {
    const now = performance.now();
    if (now - lastLight < 90) return;
    lastLight = now;
    game.world?.lightBurst?.(p.x, p.y, p.z, color, intensity, life, range);
  };

  const windup = (f, move) => {
    const vfx = game.vfx;
    const c = colorOf(f);
    const heavy = move === 'heavy' || move === 'special';
    const src = f.stand?.summoned ? f.stand.chestWorld(_a) : f.jointWorld('handR', _a);
    vfx.hitSpark(src, c, heavy ? 1.0 : 0.55, heavy ? 0.14 : 0.09);
    vfx.burst(src, c, heavy ? 8 : 4, 2.2, 0.22, 0.3, { drag: 2 });
    if (heavy) {
      vfx.ring(_b.copy(f.pos).setY(f.pos.y + 0.08), c, 0.4, 2.6, 0.4, { alpha: 0.75 });
      light(src, c, 1.4, 0.22, 8);
    }
  };

  const impact = (ev) => {
    const vfx = game.vfx;
    const att = ev.attacker; const tgt = ev.target;
    if (!tgt?.chestWorld) return;
    const c = colorOf(att);
    const hit = ev.hit || {};
    const dmg = hit.damage || 0;
    const kind = hit.kind || 'light';
    const p = tgt.chestWorld(_a);
    _d.copy(tgt.pos).sub(att.pos).setY(0);
    if (_d.lengthSq() < 1e-4) _d.set(0, 0, 1); else _d.normalize();
    if (kind === 'rush') {
      if (Math.random() < 0.35) vfx.sparkBurst(p, c, 4, 7, _d, true);
      light(p, c, 0.9, 0.1, 7);
      return;
    }
    const heavy = kind === 'heavy' || dmg >= 12;
    const power = Math.min(2.2, 0.6 + dmg / 12);
    // a colour halo just behind the hit's own flash (the strike already draws its core spark)
    vfx.hitSpark(_b.copy(p).addScaledVector(_d, 0.25), c, 0.55 + power * 0.3, 0.13);
    // sparks blown out the far side of the target
    vfx.sparkBurst(p, c, Math.round(8 + power * 8), 8 + power * 3, _d, true);
    vfx.burst(p, c, Math.round(3 + power * 3), 3 + power, 0.18, 0.35, { drag: 2.5 });
    // dust at the feet
    vfx.smokePuff(_b.copy(tgt.pos).setY(tgt.pos.y + 0.15), 0x5a5048, heavy ? 4 : 2, heavy ? 1.1 : 0.7, 0.8, 0.5);
    light(p, c, heavy ? 2.6 : 1.4, heavy ? 0.22 : 0.14, heavy ? 12 : 8);
    if (heavy) {
      vfx.ring(p, c, 0.2, 1.0 + power * 0.7, 0.3, { vertical: true, face: vfx.cameraPos, alpha: 0.6 });
      vfx.ring(_b.copy(tgt.pos).setY(tgt.pos.y + 0.08), c, 0.3, 2.2 + power, 0.45, { alpha: 0.6 });
      if (tgt === game.player || tgt.isPlayer) game.screen?.shockwave(p, 0.45 + power * 0.15, 0.4);
    }
  };

  const unsub = game.combat.on((ev) => {
    if (!game.vfx) return;
    if (ev.type === 'attack' && isFoe(ev.attacker)) windup(ev.attacker, ev.move);
    else if (ev.type === 'hit' && isFoe(ev.attacker) && ev.result !== 'none') impact(ev);
  });

  // projectiles: muzzle flash + a trail for shots that have none
  const combat = game.combat;
  const spawn = combat.spawnProjectile.bind(combat);
  combat.spawnProjectile = (o) => {
    const p = spawn(o);
    if (p && isFoe(o.owner)) {
      const c = new THREE.Color(o.color ?? colorOf(o.owner));
      game.vfx.hitSpark(p.pos, c, 0.6, 0.08);
      if (!p.trail) p.trail = (pp, vfx) => { if (Math.random() < 0.6) vfx.glow.emit(pp.pos, pp.vel.clone().multiplyScalar(-0.05), c, 0.6, 0.22, 0.04, 0.28); };
    }
    return p;
  };
  return () => { unsub(); combat.spawnProjectile = spawn; };
}
