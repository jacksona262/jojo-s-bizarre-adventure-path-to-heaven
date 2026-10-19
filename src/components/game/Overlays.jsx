import React, { useState } from 'react';
import { useUI, ui, toast } from '@/game/core/Store';
import { useNav } from './useNav';
import { Save } from '@/game/state/Save';
import { audio } from '@/game/core/Audio';
import { BINDINGS } from '@/game/core/Input';
import { QUESTS } from '@/game/story/Script';
import { STEPS } from '@/game/story/Campaign';
import { ASSET_NOTES } from '@/game/assets/manifest';
import { ROSTER } from '@/game/combat/Roster';

const g = () => window.__game;

function MenuList({ items, onBack, title, sub }) {
  const act = (i) => { const it = items[i]; if (!it.disabled) { audio.play('uiSelect'); it.fn(); } };
  const [index, setIndex] = useNav(items.length, act, { onBack });
  return (
    <div className="pth-panel" style={{ padding: '28px 34px', minWidth: 360 }}>
      <div className="pth-h1" style={{ marginBottom: 6 }}>{title}</div>
      {sub && <div style={{ marginBottom: 14, color: 'rgba(239,228,204,0.6)' }}>{sub}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        {items.map((it, i) => (
          <button key={it.label} type="button" disabled={it.disabled} className={`pth-btn ${index === i ? 'active' : ''}`} onMouseEnter={() => setIndex(i)} onClick={() => act(i)}>{it.label}</button>
        ))}
      </div>
    </div>
  );
}

export function PauseMenu() {
  const game = g();
  const camp = game?.mode?.name === 'campaign';
  const items = [
    { label: 'Resume', fn: () => game.setPaused(false) },
    ...(camp ? [
      { label: 'Save Journey', fn: () => ui.set({ overlay: 'saves', savesMode: 'save' }) },
      { label: 'Load Journey', fn: () => ui.set({ overlay: 'saves', savesMode: 'load' }) },
      { label: 'Journal', fn: () => ui.set({ overlay: 'journal' }) },
      { label: 'Region Map', fn: () => ui.set({ overlay: 'map' }) },
      { label: 'Stand Upgrades', fn: () => ui.set({ overlay: 'upgrades' }) },
    ] : []),
    { label: 'Settings', fn: () => ui.set({ overlay: 'settings', settingsFrom: 'pause' }) },
    { label: camp ? 'Quit to Title' : 'Leave the Duel', fn: async () => { if (camp) game.mode.autosave(); game.setPaused(false); await game.fadeOut(0.6); game.toTitle(); } },
  ];
  return <div className="pth-overlay"><MenuList title="Paused" sub={camp ? game.progress.chapterName : 'Versus'} items={items} onBack={() => game.setPaused(false)} /></div>;
}

export function SettingsPanel() {
  const game = g();
  const [s, setS] = useState({ ...game.settings });
  const from = ui.get().settingsFrom;
  const close = () => { ui.set({ overlay: from === 'pause' ? 'pause' : null, settingsFrom: null }); };
  useNav(1, () => {}, { onBack: close });
  const set = (k, v) => { const n = { ...s, [k]: v }; setS(n); game.applySettings({ [k]: v }); };
  const Row = ({ label, children }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', alignItems: 'center', gap: 14, padding: '6px 0', borderBottom: '1px solid rgba(216,180,90,0.12)' }}>
      <div className="pth-h2" style={{ fontSize: 12 }}>{label}</div><div>{children}</div>
    </div>
  );
  const Seg = ({ k, opts }) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {opts.map((o) => <button key={o} type="button" className={`pth-btn ${s[k] === o ? 'active' : ''}`} style={{ padding: '5px 10px', fontSize: 11 }} onClick={() => set(k, o)}>{typeof o === 'boolean' ? (o ? 'on' : 'off') : o}</button>)}
    </div>
  );
  const Slider = ({ k, min = 0, max = 1, step = 0.05 }) => <input className="pth-slider" type="range" min={min} max={max} step={step} value={s[k]} onChange={(e) => set(k, Number(e.target.value))} />;
  return (
    <div className="pth-overlay">
      <div className="pth-panel pth-scroll" style={{ padding: '26px 32px', width: 'min(760px, 92vw)', maxHeight: '86vh' }}>
        <div className="pth-h1">Settings</div>
        <Row label="Graphics"><Seg k="quality" opts={['low', 'medium', 'high', 'ultra']} /></Row>
        <Row label="Difficulty"><Seg k="difficulty" opts={['story', 'normal', 'hard']} /></Row>
        <Row label="Master volume"><Slider k="master" /></Row>
        <Row label="Music"><Slider k="music" /></Row>
        <Row label="Effects"><Slider k="sfx" /></Row>
        <Row label="Ambience"><Slider k="ambience" /></Row>
        <Row label="Look sensitivity"><Slider k="sensitivity" min={0.3} max={2.5} step={0.05} /></Row>
        <Row label="Invert look Y"><Seg k="invertY" opts={[false, true]} /></Row>
        <Row label="Screen effects"><Seg k="screenFx" opts={['full', 'reduced', 'off']} /></Row>
        <Row label="Show FPS"><Seg k="showFps" opts={[false, true]} /></Row>
        <div className="pth-h2" style={{ marginTop: 18 }}>Controls</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 18px', fontSize: 15, marginTop: 8 }}>
          {Object.entries(BINDINGS).filter(([k]) => !['up', 'down', 'left', 'right', 'confirm', 'back', 'skip'].includes(k)).map(([k, b]) => (
            <React.Fragment key={k}>
              <div style={{ color: '#e8d6a8' }}>{b.label}</div>
              <div style={{ color: 'rgba(239,228,204,0.75)' }}>{[...b.keys.map((x) => x.replace('Key', '').replace('Left', '')), ...b.mouse.map((m) => ['LMB', 'MMB', 'RMB'][m])].join(' / ')}</div>
              <div style={{ color: 'rgba(239,228,204,0.55)' }}>{b.pad.map((p) => ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', 'D↑', 'D↓', 'D←', 'D→'][p]).join(' / ')}</div>
            </React.Fragment>
          ))}
          <div style={{ color: '#e8d6a8' }}>Move / Look</div><div>WASD · Mouse</div><div>Left / Right stick</div>
        </div>
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}><button type="button" className="pth-btn active" onClick={close}>Done</button></div>
      </div>
    </div>
  );
}

export function Journal() {
  const game = g();
  const p = game.progress;
  const step = STEPS[p.step];
  const back = () => game.setPaused(false);
  useNav(1, () => {}, { onBack: back });
  const quests = STEPS.map((s, i) => ({ s, i })).filter(({ s }) => s.quest || s.boss);
  return (
    <div className="pth-overlay">
      <div className="pth-panel" style={{ width: 'min(1000px, 94vw)', height: 'min(80vh, 720px)', padding: 28, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
        <div className="pth-scroll">
          <div className="pth-h1">Journal</div>
          <div style={{ color: '#d8b45a', fontFamily: 'Cinzel', letterSpacing: '0.18em', marginTop: 6 }}>{p.chapterName}</div>
          {step?.quest && <div style={{ marginTop: 10, fontSize: 18, fontStyle: 'italic' }}>{QUESTS[step.quest].summary}</div>}
          <div className="pth-h2" style={{ marginTop: 22 }}>The Road North</div>
          {quests.map(({ s, i }) => (
            <div key={s.id} style={{ padding: '6px 0', borderBottom: '1px solid rgba(216,180,90,0.1)', opacity: i > p.step ? 0.35 : 1, color: i === p.step ? '#fff1cc' : undefined }}>
              {i < p.step ? '✦ ' : i === p.step ? '◆ ' : '· '}
              {s.boss ? `${ROSTER[s.boss].name} · ${ROSTER[s.boss].standName}${s.final ? ' (Final)' : ''}` : QUESTS[s.quest].title}
            </div>
          ))}
        </div>
        <div className="pth-scroll">
          <div className="pth-h2">Clues</div>
          {p.clues.length ? p.clues.map((c) => <div key={c} style={{ marginTop: 10, fontSize: 18, borderLeft: '2px solid #a080e0', paddingLeft: 10 }}>{c}</div>) : <div style={{ marginTop: 10, opacity: 0.6 }}>Nothing yet.</div>}
          <div className="pth-h2" style={{ marginTop: 22 }}>Stand Fragments: {p.fragments}</div>
          <div className="pth-h2" style={{ marginTop: 22 }}>Playtime: {Math.floor((p.playtime || 0) / 60)} min</div>
          <div style={{ marginTop: 26, textAlign: 'right' }}><button type="button" className="pth-btn" onClick={back}>Close</button></div>
        </div>
      </div>
    </div>
  );
}

export function RegionMap() {
  const game = g();
  const data = game.mode?.mapData?.();
  const back = () => game.setPaused(false);
  useNav(1, () => {}, { onBack: back });
  if (!data) return null;
  const zMin = -11700; const zMax = 300;
  const W = 300; const H = 'min(78vh, 760px)';
  const toY = (z) => ((zMax - z) / (zMax - zMin)) * 100;
  const toX = (x) => 50 + (x / 900) * 50;
  return (
    <div className="pth-overlay">
      <div className="pth-panel" style={{ padding: 22, display: 'flex', gap: 26 }}>
        <div style={{ position: 'relative', width: W, height: H, background: 'radial-gradient(ellipse at center, rgba(60,50,30,0.35), rgba(10,8,6,0.9))', border: '1px solid rgba(216,180,90,0.3)' }}>
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
            <polyline fill="none" stroke="rgba(216,180,90,0.5)" strokeWidth="0.6" points={[...Array(60)].map((_, i) => { const z = zMax - (i / 59) * (zMax - zMin); return `${toX(data.regions.reduce((a, r) => (Math.abs(r.z - z) < Math.abs(a.z - z) ? r : a)).x)},${toY(z)}`; }).join(' ')} />
          </svg>
          {data.regions.map((r) => <div key={r.id} style={{ position: 'absolute', left: 8, top: `${toY(r.z)}%`, transform: 'translateY(-50%)', fontFamily: 'Cinzel', fontSize: 11, letterSpacing: '0.12em', color: r.name === data.current ? '#fff1cc' : 'rgba(239,228,204,0.55)' }}>{r.name}</div>)}
          {data.pois.map((p) => <div key={p.id} title={p.label} style={{ position: 'absolute', left: `${toX(p.x)}%`, top: `${toY(p.z)}%`, transform: 'translate(-50%,-50%) rotate(45deg)', width: p.current ? 11 : 7, height: p.current ? 11 : 7, background: p.done ? 'rgba(216,180,90,0.35)' : p.kind === 'boss' ? '#c04040' : '#7ac0ff', boxShadow: p.current ? '0 0 10px #ffd34d' : 'none', border: p.current ? '1px solid #ffd34d' : 'none' }} />)}
          {data.objective && <div style={{ position: 'absolute', left: `${toX(data.objective.x)}%`, top: `${toY(data.objective.z)}%`, transform: 'translate(-50%,-50%)', color: '#ffd34d', fontSize: 16 }}>◎</div>}
          {data.player && <div style={{ position: 'absolute', left: `${toX(data.player.x)}%`, top: `${toY(data.player.z)}%`, transform: 'translate(-50%,-50%)', width: 10, height: 10, borderRadius: '50%', background: '#ffd34d', boxShadow: '0 0 12px #ffd34d' }} />}
          <div style={{ position: 'absolute', right: 8, top: 6, fontFamily: 'Cinzel', fontSize: 10, color: '#d8b45a' }}>N ▲</div>
        </div>
        <div style={{ width: 300 }}>
          <div className="pth-h1">Region Map</div>
          <div style={{ marginTop: 8, fontSize: 18 }}>You are in <b style={{ color: '#fff1cc' }}>{data.current}</b>.</div>
          <div style={{ marginTop: 18, fontSize: 16, lineHeight: 1.6 }}>
            <div><span style={{ color: '#c04040' }}>◆</span> Seal-bearer</div>
            <div><span style={{ color: '#7ac0ff' }}>◆</span> Story quest</div>
            <div><span style={{ color: '#ffd34d' }}>◎</span> Current objective</div>
          </div>
          <div style={{ marginTop: 18, fontSize: 15, opacity: 0.7 }}>The valley runs north for about eleven kilometres. Each region lies roughly three minutes apart at Slow Dancer&apos;s canter.</div>
          <div style={{ marginTop: 24 }}><button type="button" className="pth-btn" onClick={back}>Close</button></div>
        </div>
      </div>
    </div>
  );
}

const UPGRADES = [
  { k: 'vitality', label: 'Vitality', desc: '+40 maximum health', max: 3, cost: (l) => 2 + l },
  { k: 'energy', label: 'Stand Energy', desc: '+20 maximum Stand energy', max: 3, cost: (l) => 2 + l },
  { k: 'rush', label: 'Rush Efficiency', desc: 'Stand Rush drains 18% less energy', max: 2, cost: (l) => 3 + l },
  { k: 'counter', label: 'Counter Window', desc: 'Perfect counters are easier to time', max: 2, cost: (l) => 3 + l },
  { k: 'tsDuration', label: 'Stolen Seconds', desc: '+1 s of stopped time', max: 4, cost: (l) => 3 + l * 2 },
  { k: 'tsCooldown', label: 'Swift Return', desc: 'Time stop recharges faster', max: 4, cost: (l) => 3 + l * 2 },
];

export function Upgrades() {
  const game = g();
  const [, force] = useState(0);
  const p = game.progress;
  const back = () => game.setPaused(false);
  const open = !!p.flags.enya;
  const buy = (u) => {
    const lvl = p.upgrades[u.k] || 0;
    if (!open || lvl >= u.max || p.fragments < u.cost(lvl)) return;
    p.fragments -= u.cost(lvl);
    p.upgrades[u.k] = lvl + 1;
    game.mode.applyUpgrades?.();
    audio.play('quest');
    force((n) => n + 1);
  };
  const [index, setIndex] = useNav(UPGRADES.length, (i) => buy(UPGRADES[i]), { onBack: back });
  return (
    <div className="pth-overlay">
      <div className="pth-panel" style={{ width: 'min(780px, 94vw)', padding: 28 }}>
        <div className="pth-h1">Stand Upgrades</div>
        <div style={{ marginTop: 6, fontSize: 18 }}>{open ? 'Enya grinds your Stand Fragments into the Stand itself.' : 'Enya the Hag in Hollow Pines can strengthen The World. Story victories grant upgrades along the way.'}</div>
        <div style={{ marginTop: 6, fontFamily: 'Cinzel', color: '#d8b45a', letterSpacing: '0.16em' }}>FRAGMENTS: {p.fragments}</div>
        <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
          {UPGRADES.map((u, i) => {
            const lvl = p.upgrades[u.k] || 0;
            const cost = u.cost(lvl);
            const can = open && lvl < u.max && p.fragments >= cost;
            return (
              <button key={u.k} type="button" className={`pth-btn ${index === i ? 'active' : ''}`} style={{ display: 'grid', gridTemplateColumns: '200px 1fr 120px 90px', textAlign: 'left', alignItems: 'center', opacity: can || lvl >= u.max ? 1 : 0.55 }} onMouseEnter={() => setIndex(i)} onClick={() => buy(u)}>
                <span>{u.label}</span>
                <span style={{ fontFamily: 'Cormorant Garamond', textTransform: 'none', letterSpacing: 0, fontSize: 16 }}>{u.desc}</span>
                <span style={{ color: '#f1c862' }}>{'✦'.repeat(lvl)}{'·'.repeat(u.max - lvl)}</span>
                <span>{lvl >= u.max ? 'MAX' : `${cost} ✧`}</span>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 14, fontSize: 15, opacity: 0.75 }}>
          Story unlocks: {p.upgrades.knives ? '✦ Thrown Knives ' : '· Thrown Knives '} {p.upgrades.tsAwareness ? '✦ Move in stopped time' : '· Move in stopped time'}
        </div>
        <div style={{ marginTop: 18, textAlign: 'right' }}><button type="button" className="pth-btn" onClick={back}>Close</button></div>
      </div>
    </div>
  );
}

export function Saves() {
  const game = g();
  const mode = useUI((s) => s.savesMode) || 'save';
  const [, force] = useState(0);
  const slots = Save.list().filter((s) => mode === 'load' || s.slot !== 'auto');
  const fromTitle = useUI((s) => s.savesFrom) === 'title';
  const back = () => ui.set({ overlay: fromTitle ? null : 'pause', savesFrom: null });
  const act = async (i) => {
    const s = slots[i];
    if (mode === 'save') { game.mode.saveTo(s.slot); force((n) => n + 1); } else if (s.data) { ui.set({ overlay: null, savesFrom: null }); game.setPaused(false); await game.continueGame(s.slot); }
  };
  const [index, setIndex] = useNav(slots.length, act, { onBack: back });
  return (
    <div className="pth-overlay">
      <div className="pth-panel" style={{ width: 'min(620px, 92vw)', padding: 28 }}>
        <div className="pth-h1">{mode === 'save' ? 'Save Journey' : 'Load Journey'}</div>
        <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
          {slots.map((s, i) => (
            <button key={s.slot} type="button" className={`pth-btn ${index === i ? 'active' : ''}`} style={{ textAlign: 'left' }} onMouseEnter={() => setIndex(i)} onClick={() => act(i)} disabled={mode === 'load' && !s.data}>
              {s.slot === 'auto' ? 'Checkpoint' : `Slot ${s.slot.slice(-1)}`} · {s.data ? `${s.data.chapterName} · ${new Date(s.data.savedAt).toLocaleString()}` : 'Empty'}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 18, textAlign: 'right' }}><button type="button" className="pth-btn" onClick={back}>Back</button></div>
      </div>
    </div>
  );
}

export function Death() {
  const game = g();
  const items = [
    { label: 'Retry', fn: () => game.mode.retry() },
    { label: 'Load Checkpoint', fn: () => game.mode.loadCheckpoint() },
    { label: 'Quit to Title', fn: async () => { ui.set({ overlay: null }); game.overlayOpen = false; game.toTitle(); } },
  ];
  return <div className="pth-overlay" style={{ background: 'radial-gradient(ellipse at center, rgba(60,0,0,0.5), rgba(0,0,0,0.92))' }}><MenuList title="DIO has fallen" sub="The road north is not finished with you." items={items} /></div>;
}

export function Results() {
  const game = g();
  const r = useUI((s) => s.versusResult);
  if (!r) return null;
  const items = [
    { label: 'Rematch', fn: () => game.mode.rematch() },
    { label: 'Character Select', fn: async () => { ui.set({ overlay: null }); game.overlayOpen = false; await game.toTitle(); game.openVersusSelect(); } },
    { label: 'Title Screen', fn: async () => { ui.set({ overlay: null }); game.overlayOpen = false; await game.fadeOut(0.5); game.toTitle(); } },
  ];
  return (
    <div className="pth-overlay">
      <MenuList title={r.winner === 0 ? 'Victory' : 'Defeat'} sub={`${ROSTER[r.p1].name} ${r.wins[0]} – ${r.wins[1]} ${ROSTER[r.cpu].name} · Record ${r.record.wins}W ${r.record.losses}L`} items={items} />
    </div>
  );
}

export function ChoiceNav() {
  const choice = useUI((s) => s.choice);
  const game = g();
  const n = choice ? choice.options.length : 1;
  const [index] = useNav(n, (i) => game?.seq.pick(choice.options[i].id), { enabled: !!choice });
  if (!choice) return null;
  return (
    <div className="pth-choice pth-panel">
      <div className="pth-h2">{choice.prompt}</div>
      {choice.options.map((o, i) => (
        <button key={o.id} type="button" className={`pth-choice-opt ${index === i ? 'active' : ''}`} onClick={() => game?.seq.pick(o.id)}>{i + 1}. {o.label}</button>
      ))}
    </div>
  );
}

export function AssetNotes() {
  return <ul style={{ fontSize: 14, opacity: 0.75 }}>{ASSET_NOTES.map((n) => <li key={n}>{n}</li>)}</ul>;
}

export { toast };
