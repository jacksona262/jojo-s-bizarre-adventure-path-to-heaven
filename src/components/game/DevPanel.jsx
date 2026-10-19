import React, { useEffect, useState } from 'react';
import { VERSUS_ROSTER, ROSTER } from '@/game/combat/Roster';
import { STEPS } from '@/game/story/Campaign';
import * as Dev from '@/game/dev/DevTools';

// Developer panel (only with ?dev, ?arena=... or localStorage pth.dev = 1). Toggle with the `
// (backquote) key. Combat: opponent behaviour, god mode, refill, hitboxes, slow motion, frame
// data and a live combat log. World: teleport to regions / places, horse, lightning. Story:
// chapter jump, cutscenes, encounters, sparring partners, abilities, dev checkpoints, AnimLab.
// Perf: the profiler's live report, memory and effect counts. Dev saves are sandboxed.

const btn = (on) => ({ padding: '2px 7px', margin: 2, background: on ? '#c9a227' : '#2a2620', color: '#fff', border: '1px solid #554a30', cursor: 'pointer', font: '11px sans-serif' });

function phaseOf(a) {
  const c = a?.def?.clip;
  if (!c?.active) return a ? `${a.def.name}` : '—';
  const t = a.t / a.def.dur;
  const ph = t < c.active[0] ? 'startup' : t <= c.active[1] ? 'ACTIVE' : 'recovery';
  return `${a.def.name} ${ph} t=${t.toFixed(2)} [${c.active[0]}–${c.active[1]}]`;
}

// Dev tools must never take the game down with them.
export default class DevPanelBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error('[dev panel]', err); }
  render() {
    if (this.state.err) return <div style={{ position: 'absolute', right: 8, bottom: 8, color: '#f88', font: '11px monospace', pointerEvents: 'auto' }}>dev panel error: {String(this.state.err.message)} <button type="button" onClick={() => this.setState({ err: null })}>retry</button></div>;
    return <DevPanel />;
  }
}

function WorldTab({ g }) {
  const [poi, setPoi] = useState(Dev.DEV_POIS[0]?.id);
  const pl = g.player;
  return (
    <>
      <div>pos {pl ? pl.pos.toArray().map((v) => v.toFixed(0)).join(', ') : '—'} · region {g.world?.currentRegion?.name || '—'}</div>
      <div style={{ marginTop: 4, color: '#bfa970' }}>teleport to region</div>
      <div>{Dev.DEV_REGIONS.map((r) => <button key={r.id} type="button" style={btn(g.world?.currentRegion?.id === r.id)} onClick={() => Dev.toRegion(g, r.id)}>{r.name.split(' ')[0]}</button>)}</div>
      <div style={{ marginTop: 4 }}>place <select value={poi} onChange={(e) => setPoi(e.target.value)} style={{ color: '#000', fontSize: 11, maxWidth: 200 }}>{Dev.DEV_POIS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select> <button type="button" style={btn(false)} onClick={() => Dev.toPOI(g, poi)}>go</button></div>
      <div style={{ marginTop: 4 }}>
        {g.horse && <button type="button" style={btn(false)} onClick={() => g.horse.summon(pl)}>whistle horse</button>}
        <button type="button" style={btn(false)} onClick={() => g.weather?.strike(null, true)}>lightning</button>
        <button type="button" style={btn(false)} onClick={() => { const w = g.weather; if (w) w.rainIntensity = w.rainIntensity > 0.05 ? 0 : 1; }}>rain</button>
        {['low', 'medium', 'high', 'ultra'].map((q) => <button key={q} type="button" style={btn(g.engine.quality === q)} onClick={() => g.applySettings({ quality: q })}>{q}</button>)}
      </div>
    </>
  );
}

function StoryTab({ g }) {
  const [step, setStep] = useState(STEPS[g.progress?.step ?? 0]?.id || STEPS[0].id);
  const [spar, setSpar] = useState('jotaro');
  const [busy, setBusy] = useState(false);
  const campaign = g.mode?.name === 'campaign';
  const u = g.progress?.upgrades || {};
  const run = async (fn) => { if (busy) return; setBusy(true); try { await fn(); } finally { setBusy(false); } };
  return (
    <>
      <div>mode {g.mode?.name} · step {campaign ? STEPS[g.progress.step]?.id : '—'} · saves {g.dev ? 'sandboxed' : 'live'}</div>
      <div style={{ marginTop: 4 }}>chapter <select value={step} onChange={(e) => setStep(e.target.value)} style={{ color: '#000', fontSize: 11, maxWidth: 190 }}>{STEPS.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.chapter}</option>)}</select> <button type="button" style={btn(false)} disabled={busy} onClick={() => run(() => Dev.jumpToStep(g, step))}>jump</button></div>
      <div style={{ marginTop: 4, color: '#bfa970' }}>cutscenes</div>
      <div>{Dev.DEV_SCENES.map((s) => <button key={s.label} type="button" style={btn(false)} disabled={busy} onClick={() => run(() => Dev.jumpToStep(g, s.step, { encounter: s.encounter }))}>{s.label}</button>)}</div>
      {campaign && (
        <>
          <div style={{ marginTop: 4 }}>
            <button type="button" style={btn(false)} disabled={busy} onClick={() => run(async () => { const { startEncounter } = await import('@/game/dev/QA'); await startEncounter(); })}>start this boss</button>
            spar <select value={spar} onChange={(e) => setSpar(e.target.value)} style={{ color: '#000', fontSize: 11 }}>{VERSUS_ROSTER.map((k) => <option key={k} value={k}>{ROSTER[k].name}</option>)}</select>
            <button type="button" style={btn(false)} disabled={busy} onClick={() => run(() => Dev.spawnSparring(g, spar))}>spawn</button>
          </div>
          <div style={{ marginTop: 4, color: '#bfa970' }}>abilities</div>
          <div>
            {['knives', 'tsAwareness'].map((k) => <button key={k} type="button" style={btn(!!u[k])} onClick={() => Dev.grant(g, k, !u[k])}>{k}</button>)}
            {['tsDuration', 'tsCooldown'].map((k) => <button key={k} type="button" style={btn(u[k] >= 4)} onClick={() => Dev.grant(g, k, ((u[k] || 0) + 1) % 5)}>{k} {u[k] || 0}</button>)}
            <button type="button" style={btn(false)} onClick={() => Dev.grantAll(g)}>grant all</button>
          </div>
          <div style={{ marginTop: 4 }}>
            <button type="button" style={btn(false)} onClick={() => Dev.devSave(g)}>save dev checkpoint</button>
            <button type="button" style={btn(false)} disabled={busy} onClick={() => run(() => Dev.devLoad(g))}>load it</button>
          </div>
        </>
      )}
      <div style={{ marginTop: 4 }}>
        <button type="button" style={btn(false)} onClick={() => Dev.openAnimLab(g)}>open AnimLab for {g.player?.partKey || 'dio'}</button>
        <button type="button" style={btn(false)} onClick={() => g.startVersus({ p1: 'dio', cpu: 'avdol', difficulty: 'normal', arena: 'street', dev: true })}>combat arena</button>
      </div>
    </>
  );
}

function DevPanel() {
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
        {['combat', 'world', 'story', 'perf'].map((t) => <button key={t} type="button" style={btn(tab === t)} onClick={() => setTab(t)}>{t}</button>)}
        <span style={{ flex: 1 }} />
        <button type="button" style={btn(false)} onClick={() => setOpen(false)}>hide `</button>
      </div>
      {tab === 'combat' && (
        <>
          {mode?.sel?.dev && (
            <>
              <div>opponent <select value={mode.sel.cpu} onChange={(e) => restart(e.target.value)} style={{ color: '#000', fontSize: 11 }}>{VERSUS_ROSTER.map((k) => <option key={k} value={k}>{ROSTER[k].name}</option>)}</select></div>
              <div>play as <select value={mode.sel.p1} onChange={(e) => g.startVersus({ ...mode.sel, p1: e.target.value, dev: true })} style={{ color: '#000', fontSize: 11 }}>{VERSUS_ROSTER.map((k) => <option key={k} value={k}>{ROSTER[k].name}</option>)}</select></div>
            </>
          )}
          <div>behaviour {['ai', 'dummy', 'guard', 'attack'].map((b) => <button key={b} type="button" style={btn(behaviour === b)} onClick={() => setBehaviour(b)}>{b}</button>)}</div>
          <div>
            <button type="button" style={btn(pl?.damageTakenMul === 0)} onClick={() => { if (pl) pl.damageTakenMul = pl.damageTakenMul === 0 ? 1 : 0; }}>god</button>
            <button type="button" style={btn(false)} onClick={refill}>refill</button>
            <button type="button" style={btn(g.devHitboxes)} onClick={() => { g.devHitboxes = !g.devHitboxes; }}>hitboxes</button>
            <button type="button" style={btn(g.engine.timeScale < 1)} onClick={() => { g.engine.timeScale = g.engine.timeScale < 1 ? 1 : 0.25; }}>slow 0.25x</button>
            <button type="button" style={btn(false)} onClick={() => { if (pl) { pl.tsCharge = 1; pl.kit?.signature?.(); } }}>time stop</button>
            <button type="button" style={btn(false)} onClick={() => { if (foe) { foe.hp = foe.hpMax; foe.revive?.(foe.hpMax); } }}>reset foe</button>
            <button type="button" style={btn(false)} onClick={() => Dev.resetEncounter(g)}>reset encounter</button>
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
      {tab === 'world' && <WorldTab g={g} />}
      {tab === 'story' && <StoryTab g={g} />}
      {tab === 'perf' && (
        <>
          <button type="button" style={btn(g.engine.prof?.enabled)} onClick={() => { const p = g.engine.prof; p.enabled = !p.enabled; p.reset(); }}>profiler {g.engine.prof?.enabled ? 'on' : 'off'}</button>
          <div>fps {g.engine.fps.toFixed(0)} · cpu {g.engine.cpuMs?.toFixed(2)} ms · quality {g.engine.quality}</div>
          {(() => { const m = Dev.memory(g); const v = g.vfx.stats(); return (
            <>
              <div>heap {m.heapMB ?? 'n/a'} MB · geo {m.geometries} · tex {m.textures} · programs {m.programs}</div>
              <div>vfx glow {v.glow} · smoke {v.smoke} · sparks {v.sparks} · rings {v.rings} · fists {v.fists} · hit {v.hitSparks} · ghosts {v.ghosts}</div>
              <div>screen fx: impact {g.screen.counts.impactFrame} · shock {g.screen.counts.shockwave} · level {g.screen.level}</div>
            </>
          ); })()}
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
