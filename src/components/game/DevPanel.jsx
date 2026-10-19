import React, { useEffect, useState } from 'react';
import { VERSUS_ROSTER, ROSTER } from '@/game/combat/Roster';

// Developer panel (only with ?dev, ?arena=... or localStorage pth.dev = 1). Toggle with the `
// (backquote) key. Combat: opponent behaviour, god mode, refill, hitboxes, slow motion, frame
// data and a live combat log. Perf: the profiler's live report.

const btn = (on) => ({ padding: '2px 7px', margin: 2, background: on ? '#c9a227' : '#2a2620', color: '#fff', border: '1px solid #554a30', cursor: 'pointer', font: '11px sans-serif' });

function phaseOf(a) {
  const c = a?.def?.clip;
  if (!c) return a ? `${a.def.name}` : '—';
  const t = a.t / a.def.dur;
  const ph = t < c.active[0] ? 'startup' : t <= c.active[1] ? 'ACTIVE' : 'recovery';
  return `${a.def.name} ${ph} t=${t.toFixed(2)} [${c.active[0]}–${c.active[1]}]`;
}

export default function DevPanel() {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState('combat');
  const [, setTick] = useState(0);
  const [log, setLog] = useState([]);
  const [behaviour, setBehaviour] = useState('ai');
  const g = window.__game;

  useEffect(() => {
    const iv = setInterval(() => setTick((n) => n + 1), 150);
    const onKey = (e) => { if (e.code === 'Backquote') setOpen((o) => !o); };
    window.addEventListener('keydown', onKey);
    const un = g?.combat.on((ev) => {
      if (!['hit', 'blocked', 'countered', 'guardBreak', 'queued', 'timeStop', 'timeResume', 'reflect'].includes(ev.type)) return;
      const n = (c) => (c ? (c.name || c.id || '?').split(' ')[0] : '');
      const line = `${ev.type}${ev.attacker ? ` ${n(ev.attacker)}→${n(ev.target)}` : ''}${ev.hit ? ` ${Math.round(ev.hit.damage || 0)} ${ev.hit.kind || ''}` : ''}${ev.result ? ` (${ev.result})` : ''}`;
      setLog((l) => [line, ...l].slice(0, 10));
    });
    return () => { clearInterval(iv); window.removeEventListener('keydown', onKey); un?.(); };
  }, []);

  // opponent behaviour is enforced every tick
  const mode = g?.mode;
  const brain = mode?.brain || mode?.encounter?.brain;
  const foe = mode?.p2 || mode?.encounter?.boss;
  useEffect(() => {
    if (!brain || !foe) return;
    brain.enabled = behaviour === 'ai' || behaviour === 'attack';
    if (behaviour === 'guard') foe.kit?.guard(true); else if (foe.guarding && behaviour !== 'ai') foe.kit?.guard(false);
    if (behaviour === 'attack') { brain.reactCool = 99; }
  });

  if (!g) return null;
  const pl = g.player;
  if (!open) return <div style={{ position: 'absolute', right: 8, bottom: 8, zIndex: 50 }}><button type="button" style={btn(false)} onClick={() => setOpen(true)}>dev `</button></div>;
  const rep = g.engine.prof?.enabled ? g.engine.prof.report() : null;
  const refill = () => { if (!pl) return; pl.hp = pl.hpMax; pl.energy = pl.energyMax; pl.stamina = pl.staminaMax; pl.tsCharge = 1; };
  const restart = (cpu) => g.startVersus({ p1: mode?.sel?.p1 || 'dio', cpu, difficulty: mode?.sel?.difficulty || 'normal', arena: mode?.sel?.arena || 'street', dev: true });

  return (
    <div style={{ position: 'absolute', right: 8, bottom: 8, width: 330, maxHeight: '58vh', overflow: 'auto', zIndex: 50, background: 'rgba(8,6,4,0.88)', border: '1px solid #554a30', color: '#e8dcc0', font: '11px/1.35 monospace', padding: 8, pointerEvents: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
        <b style={{ color: '#ffd34d', marginRight: 8 }}>DEV</b>
        {['combat', 'perf'].map((t) => <button key={t} type="button" style={btn(tab === t)} onClick={() => setTab(t)}>{t}</button>)}
        <span style={{ flex: 1 }} />
        <button type="button" style={btn(false)} onClick={() => setOpen(false)}>hide `</button>
      </div>
      {tab === 'combat' && (
        <>
          {mode?.sel?.dev && (
            <div>opponent <select value={mode.sel.cpu} onChange={(e) => restart(e.target.value)} style={{ color: '#000', fontSize: 11 }}>{VERSUS_ROSTER.map((k) => <option key={k} value={k}>{ROSTER[k].name}</option>)}</select></div>
          )}
          <div>behaviour {['ai', 'dummy', 'guard', 'attack'].map((b) => <button key={b} type="button" style={btn(behaviour === b)} onClick={() => setBehaviour(b)}>{b}</button>)}</div>
          <div>
            <button type="button" style={btn(pl?.damageTakenMul === 0)} onClick={() => { if (pl) pl.damageTakenMul = pl.damageTakenMul === 0 ? 1 : 0; }}>god</button>
            <button type="button" style={btn(false)} onClick={refill}>refill</button>
            <button type="button" style={btn(g.devHitboxes)} onClick={() => { g.devHitboxes = !g.devHitboxes; }}>hitboxes</button>
            <button type="button" style={btn(g.engine.timeScale < 1)} onClick={() => { g.engine.timeScale = g.engine.timeScale < 1 ? 1 : 0.25; }}>slow 0.25x</button>
            <button type="button" style={btn(false)} onClick={() => { if (pl) { pl.tsCharge = 1; pl.kit?.signature?.(); } }}>time stop</button>
            <button type="button" style={btn(false)} onClick={() => { if (foe) { foe.hp = foe.hpMax; foe.revive?.(foe.hpMax); } }}>reset foe</button>
          </div>
          <div style={{ marginTop: 4, color: '#bfa970' }}>player {pl ? `${Math.round(pl.hp)}/${pl.hpMax} · ${pl.anim?.state}` : '—'}</div>
          <div>  move: {phaseOf(pl?.action)}</div>
          <div>  stand: {pl?.stand?.summoned ? `${pl.stand.anim?.state} · ${pl.stand.mode} · ${phaseOf(pl.stand.action)}` : 'dismissed'}</div>
          {foe && <div style={{ color: '#bfa970' }}>foe {Math.round(foe.hp)}/{foe.hpMax} · {foe.anim?.state}{foe.guarding ? ' · GUARD' : ''}{foe.stun > 0 ? ` · stun ${foe.stun.toFixed(2)}` : ''}</div>}
          {foe && <div>  move: {phaseOf(foe.action)} {brain ? `· ai ${brain.enabled ? 'on' : 'off'} ph${brain.phase}` : ''}</div>}
          {g.time.state && <div style={{ color: '#9effd0' }}>time {g.time.state.kind} {g.time.state.remaining.toFixed(1)}s · queued {g.combat.queued.length}</div>}
          <div style={{ marginTop: 4, color: '#bfa970' }}>combat log</div>
          {log.map((l, i) => <div key={i} style={{ opacity: 1 - i * 0.07 }}>{l}</div>)}
        </>
      )}
      {tab === 'perf' && (
        <>
          <button type="button" style={btn(g.engine.prof?.enabled)} onClick={() => { const p = g.engine.prof; p.enabled = !p.enabled; p.reset(); }}>profiler {g.engine.prof?.enabled ? 'on' : 'off'}</button>
          <div>fps {g.engine.fps.toFixed(0)} · cpu {g.engine.cpuMs?.toFixed(2)} ms</div>
          {rep && (
            <>
              <div>frame avg {rep.frameAvgMs} · p95 {rep.p95} · p99 {rep.p99} · spikes {rep.spikesOver33ms}</div>
              <div>gpu {String(rep.gpuMs)} ms · calls {rep.calls} · tris {rep.triangles}</div>
              <div>geo {rep.geometries} · tex {rep.textures} · programs {rep.programs} · heap {rep.heapMB} MB</div>
              {Object.entries(rep.sections).map(([k, v]) => <div key={k}>  {k.padEnd(9)} {v.avg.toFixed(2)} ms (max {v.max})</div>)}
            </>
          )}
        </>
      )}
    </div>
  );
}
