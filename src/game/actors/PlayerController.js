import * as THREE from 'three';
import { audio } from '../core/Audio';
import { ui } from '../core/Store';

// Maps input to DIO (or any fighter in Versus). Camera-relative movement, combat, riding, interaction.

const WALK = 2.0;
const SPRINT = 7.0;

export class PlayerController {
  constructor(game, fighter, { allowHorse = true, allowInteract = true } = {}) {
    this.game = game;
    this.f = fighter;
    this.allowHorse = allowHorse;
    this.allowInteract = allowInteract;
    this.stepT = 0;
    this.interactTarget = null;
    this.lockCooldown = 0;
  }

  get input() { return this.game.input; }

  update(dt, realDt) {
    const g = this.game;
    const f = this.f;
    const input = this.input;
    const kit = f.kit;
    if (!input || g.inCinematic || g.paused || g.overlayOpen) {
      if (kit?.rushing) kit.rush(false, dt);
      if (f.guarding) kit?.guard(false);
      f.steer(0, 0, dt);
      return;
    }
    if (f.dead) return;
    // frozen in someone else's stopped time: only time-stop (awareness) responds
    if (f.isFrozen()) {
      if (input.pressed('timestop')) kit?.signature?.();
      return;
    }
    const { f: cf, r: cr } = g.camera.basis();
    const mx = input.axes.moveX; const my = input.axes.moveY;
    const move = new THREE.Vector3().addScaledVector(cr, mx).addScaledVector(cf, my);
    const mag = Math.min(1, move.length());
    if (mag > 0.01) move.normalize();

    // ---------------------------------------------------------------- riding
    if (f.mounted) {
      const h = f.mounted;
      h.controls.throttle = Math.max(0, my);
      h.controls.brake = my < -0.3;
      h.controls.steer = mx;
      h.controls.gallop = input.down('sprint');
      if (input.pressed('interact') && h.speed < 6) { h.dismount(); audio.play('step'); }
      this._prompt(h.speed < 6 ? 'Dismount' : null, 'interact');
      this._lock(realDt);
      return;
    }

    // ---------------------------------------------------------------- lock-on
    this._lock(realDt);

    // ---------------------------------------------------------------- combat input
    const actionsVoid = f.actionsVoid;
    if (!actionsVoid) {
      kit.guard(input.down('guard') && !kit.rushing);
      if (input.pressed('dodge')) kit.dodge(mag > 0.1 ? move : null);
      if (input.down('rush') || kit.rushing) kit.rush(input.down('rush'), dt);
      if (!kit.rushing && !f.guarding) {
        if (input.pressed('light')) kit.light();
        if (input.pressed('heavy')) kit.heavy();
        if (input.pressed('knockback')) kit.specialA();
        if (input.pressed('heavenAbility')) kit.specialB();
        if (input.pressed('timestop')) kit.signature();
      }
      if (input.pressed('stand') && f.stand && !f.busy()) f.stand.summon();
    } else {
      // King Crimson erasure: inputs still animate, but nothing the player does lands
      if (input.pressed('light') || input.pressed('heavy')) { kit.light(); }
    }

    // ---------------------------------------------------------------- movement
    let speed = 0;
    const sprint = input.down('sprint') && mag > 0.5 && f.stamina > 1 && !f.guarding;
    f.sprinting = sprint && !f.busy();
    if (mag > 0.05 && f.canAct() || (f.guarding && mag > 0.05)) {
      speed = f.guarding ? WALK * 0.7 : sprint ? SPRINT : mag < 0.5 ? WALK : f.moveSpeed;
      if (f.sprinting) f.stamina = Math.max(0, f.stamina - dt * 12);
    }
    if (f.rootedUntil > g.clock) speed = 0;
    if (f.slowUntil > g.clock) speed *= 0.5;
    if (f.gravityInverted > g.clock) speed *= 0.3;
    if (!f.busy() || f.guarding) {
      f.steer(move.x * speed, move.z * speed, dt, f.sprinting ? 9 : 12);
      if (f.lockTarget && !f.lockTarget.dead && (f.guarding || g.combat.enemiesOf(f).length)) f.faceTowards(f.lockTarget.pos);
      else if (speed > 0.1) f.targetYaw = Math.atan2(move.x, move.z);
    } else if (f.action && !f.action.def.move && !f.action.def.tick) {
      f.steer(0, 0, dt);
    }

    // footsteps + noise (used by the Geb encounter)
    const sp = f.moved || 0;
    f.noise = sp < 0.3 ? 0 : sp < 2.5 ? 0.25 : sp < 5 ? 0.6 : 1;
    if (sp > 0.5 && f.onGround) {
      this.stepT -= dt * (sp / 1.6);
      if (this.stepT <= 0) { this.stepT = 1; if (!g.time.stopped || g.time.allowed.has(f)) audio.play('step', { power: Math.min(1.4, sp / 4) }); }
    }

    // ---------------------------------------------------------------- interaction
    if (this.allowInteract && g.world) {
      let it = null;
      const horse = this.allowHorse ? g.horse : null;
      if (horse && horse.group.parent && !horse.rider && horse.pos.distanceTo(f.pos) < 2.8 && !g.combatActive) {
        it = { label: 'Mount Slow Dancer', onInteract: () => horse.mount(f) };
      }
      const near = g.world.nearestInteractable(f.pos, 2.4);
      if (near && (!it || near.priority)) it = near;
      this._prompt(it ? it.label : null, 'interact');
      if (it && input.pressed('interact') && f.canAct()) it.onInteract?.(f);
    }
    if (this.allowHorse && input.pressed('horse') && g.horse && !g.combatActive && !g.horseForbidden) {
      g.horse.summon(f);
      g.vfx.text(f.chestWorld(new THREE.Vector3()).add(new THREE.Vector3(0, 0.8, 0)), '♪', '#ffffff', 0.8, 0.6);
    }
  }

  _prompt(text, action) {
    const cur = ui.get().prompt;
    const next = text ? { text, action } : null;
    if ((cur?.text || null) !== (next?.text || null)) ui.set({ prompt: next });
  }

  _lock(realDt) {
    const g = this.game;
    const f = this.f;
    this.lockCooldown -= realDt;
    if (this.input.pressed('lock') && this.lockCooldown <= 0) {
      this.lockCooldown = 0.2;
      if (f.lockTarget) { f.lockTarget = null; } else {
        // nearest enemy roughly in front of the camera
        const { f: cf } = g.camera.basis();
        let best = null; let bs = -Infinity;
        for (const e of g.combat.enemiesOf(f)) {
          const d = e.pos.clone().sub(f.pos); const dist = d.length();
          if (dist > 35) continue;
          const score = d.setY(0).normalize().dot(cf) * 2 - dist / 20;
          if (score > bs) { bs = score; best = e; }
        }
        f.lockTarget = best;
      }
    }
    if (f.lockTarget && (f.lockTarget.dead || f.lockTarget.untargetable)) f.lockTarget = null;
    g.camera.lock = f.lockTarget;
  }
}
