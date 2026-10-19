// Developer QA harness (only attached with ?qa or ?step=...). Drives inputs like a player would
// and reports what each encounter actually did, so boss kits can be smoke-tested quickly.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
export const tap = async (code, ms = 90) => { key('keydown', code); await sleep(ms); key('keyup', code); };
export const click = async (btn = 0) => {
  const el = window.__game.engine.renderer.domElement;
  el.dispatchEvent(new MouseEvent('mousedown', { button: btn, bubbles: true }));
  await sleep(80);
  window.dispatchEvent(new MouseEvent('mouseup', { button: btn }));
};

export async function bossQA(secs = 14, { attack = true, timestop = true } = {}) {
  const g = window.__game;
  const c = g.mode;
  if (!c?.objectiveData?.pos) return 'no objective';
  const tgt = c.objectiveData.pos;
  const dir = tgt.clone().sub(g.player.pos).setY(0).normalize();
  const p = tgt.clone().addScaledVector(dir, -30);
  p.y = g.world.groundAt(p.x, p.z, p.y + 60);
  g.player.pos.copy(p);
  for (let i = 0; i < 60 && !g.inCinematic; i += 1) await sleep(200);
  await sleep(2500);
  await tap('Space');
  await sleep(1500);
  const e = c.encounter;
  if (!e) return 'no encounter started';
  const actions = new Set();
  const events = {};
  const errors = [];
  const onErr = (ev) => errors.push(String(ev.message || ev.reason));
  window.addEventListener('error', onErr);
  window.addEventListener('unhandledrejection', onErr);
  const unsub = g.combat.on((ev) => { events[ev.type] = (events[ev.type] || 0) + 1; });
  await tap('Tab');
  const t0 = performance.now();
  let usedTs = false;
  while (performance.now() - t0 < secs * 1000) {
    if (e.boss.action) actions.add(e.boss.action.def.name);
    if (e.boss.stand?.action) actions.add(`stand:${e.boss.stand.action.def.name}`);
    if (attack) {
      if (g.player.distanceTo(e.boss) > 2.4) {
        const d = e.boss.pos.clone().sub(g.player.pos);
        g.camera.yaw = Math.atan2(-d.x, -d.z);
        key('keydown', 'KeyW');
      } else {
        key('keyup', 'KeyW');
        if (timestop && !usedTs && g.player.tsCharge >= 1) { usedTs = true; await tap('KeyR'); }
        await click(Math.random() < 0.8 ? 0 : 2);
      }
    }
    if (g.player.dead) break;
    await sleep(150);
  }
  key('keyup', 'KeyW');
  unsub();
  window.removeEventListener('error', onErr);
  window.removeEventListener('unhandledrejection', onErr);
  return {
    step: c.step.id, bossHp: `${Math.round(e.boss.hp)}/${e.boss.hpMax}`, phase: e.brain.phase,
    dioHp: Math.round(g.player.hp), dead: g.player.dead, actions: [...actions], events, errors,
    projectiles: g.combat.projectiles.length, hazards: g.combat.hazards.length, fps: Math.round(g.engine.fps),
  };
}

// Start the current step's boss encounter (walk up, skip the intro unless asked) and return it.
export async function startEncounter({ skipIntro = true } = {}) {
  const g = window.__game;
  const c = g.mode;
  if (c?.encounter) return c.encounter;
  if (!c?.objectiveData?.pos) return null;
  const tgt = c.objectiveData.pos;
  const dir = tgt.clone().sub(g.player.pos).setY(0).normalize();
  const p = tgt.clone().addScaledVector(dir, -30);
  p.y = g.world.groundAt(p.x, p.z, p.y + 60);
  g.player.pos.copy(p);
  for (let i = 0; i < 60 && !g.inCinematic; i += 1) await sleep(200);
  if (!skipIntro) {
    for (let i = 0; i < 300 && (g.inCinematic || !c.encounter); i += 1) await sleep(200);
    return c.encounter;
  }
  await sleep(2500);
  await tap('Space');
  for (let i = 0; i < 40 && (g.inCinematic || !c.encounter); i += 1) await sleep(200);
  await sleep(600);
  return c.encounter;
}

// Melee accuracy: place the player at set distances/angles from a stunned boss and count how
// many presses connect. Returns { scenario: { attacks, hits, blocked } }.
export async function meleeQA({ presses = 6, key = 0 } = {}) {
  const g = window.__game;
  const e = await startEncounter();
  if (!e) return 'no encounter';
  const pl = g.player; const boss = e.boss;
  const res = {};
  const place = (d, ang = 0) => {
    const p = boss.pos.clone().addScaledVector(boss.forward(), d);
    pl.pos.copy(p); pl.pos.y = g.world.groundAt(p.x, p.z, p.y + 3); pl.vel.set(0, 0, 0);
    pl.faceTowards(boss.pos, true); pl.yaw += ang; pl.targetYaw = pl.yaw;
    boss.cancelAction?.(); boss.vel.set(0, 0, 0);
  };
  const run = async (label, d, ang, n) => {
    pl.hp = pl.hpMax; pl.stun = 0; pl.energy = pl.energyMax; boss.hp = boss.hpMax;
    place(d, ang);
    await sleep(450);
    let hits = 0; let blocked = 0; let attacks = 0;
    const un = g.combat.on((ev) => {
      if (ev.attacker !== pl) return;
      if (ev.type === 'hit') hits += 1; else if (ev.type === 'blocked') blocked += 1; else if (ev.type === 'attack') attacks += 1;
    });
    for (let i = 0; i < n; i += 1) {
      // isolate the measurement: the boss and its hazards cannot interrupt the player
      boss.stun = Math.max(boss.stun, 0.7); boss.stunTotal = 0.7; boss.stand?.cancelAction?.();
      for (const h of [...g.combat.hazards]) g.combat.removeHazard(h);
      for (const pr of g.combat.projectiles) if (pr.team !== pl.team) pr.life = 0;
      pl.invuln = 0.6; pl.stun = 0;
      await click(key);
      await sleep(420);
    }
    await sleep(500);
    un();
    res[label] = { attacks, hits, blocked };
  };
  if (!pl.stand?.summoned) pl.stand?.summon(true);
  await run('stand 2.5m', 2.5, 0, presses);
  await run('stand 4.0m', 4.0, 0, presses);
  await run('stand 3m, facing 90deg off', 3, 1.57, presses);
  await run('stand 6m (out of range)', 6, 0, 3);
  pl.stand?.summon(false, true);
  await sleep(400);
  await run('no stand 1.4m', 1.4, 0, presses);
  await run('no stand 2.4m', 2.4, 0, presses);
  return res;
}

export function attachQA() {
  window.__qa = { bossQA, meleeQA, startEncounter, tap, click, sleep };
  // Background/embedded pages may receive no requestAnimationFrame callbacks; keep the
  // simulation stepping from a timer in that case so automated checks still run.
  const eng = window.__game?.engine;
  if (eng && !eng.__qaDriven) {
    eng.__qaDriven = true;
    let last = performance.now();
    const step = eng.step.bind(eng);
    eng.step = () => { last = performance.now(); step(); };
    setInterval(() => { if (performance.now() - last > 80) eng.step(); }, 16);
  }
}
