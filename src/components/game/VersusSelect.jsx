import React, { useEffect, useRef, useState } from 'react';
import { ROSTER, VERSUS_ROSTER } from '@/game/combat/Roster';
import { ARENAS } from '@/game/modes/Versus';
import { audio } from '@/game/core/Audio';
import { ui } from '@/game/core/Store';
import { Save } from '@/game/state/Save';

const COLS = 4;
const DIFFS = ['easy', 'normal', 'hard'];

export default function VersusSelect({ game }) {
  const [stage, setStage] = useState('p1');
  const [cursor, setCursor] = useState(0);
  const [p1, setP1] = useState(null);
  const [cpu, setCpu] = useState(null);
  const [diff, setDiff] = useState(1);
  const [arena, setArena] = useState(0);
  const rec = Save.versusRecord();
  const st = useRef({});
  st.current = { stage, cursor, p1, cpu, diff, arena };
  const pick = (i) => {
    const key = VERSUS_ROSTER[i];
    audio.play('uiSelect');
    if (stage === 'p1') { setP1(key); setStage('cpu'); } else if (stage === 'cpu') { setCpu(key); setStage('opts'); }
  };
  const start = () => { if (!p1 || !cpu) return; audio.play('uiSelect'); game.startVersus({ p1, cpu, difficulty: DIFFS[diff], arena: ARENAS[arena].id }); };
  const back = () => {
    if (stage === 'opts') setStage('cpu'); else if (stage === 'cpu') setStage('p1'); else ui.set({ screen: 'title' });
  };
  useEffect(() => {
    let raf;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const inp = game.input; const s = st.current; const n = VERSUS_ROSTER.length;
      if (s.stage !== 'opts') {
        if (inp.pressed('left')) setCursor((c) => (c + n - 1) % n);
        if (inp.pressed('right')) setCursor((c) => (c + 1) % n);
        if (inp.pressed('up')) setCursor((c) => (c - COLS + n) % n);
        if (inp.pressed('down')) setCursor((c) => (c + COLS) % n);
        if (inp.pressed('confirm')) pick(s.cursor);
      } else {
        if (inp.pressed('left')) setDiff((d) => (d + 2) % 3);
        if (inp.pressed('right')) setDiff((d) => (d + 1) % 3);
        if (inp.pressed('up')) setArena((a) => (a + ARENAS.length - 1) % ARENAS.length);
        if (inp.pressed('down')) setArena((a) => (a + 1) % ARENAS.length);
        if (inp.pressed('confirm')) start();
      }
      if (inp.pressed('back')) back();
    };
    loop();
    return () => cancelAnimationFrame(raf);
  });
  const focusKey = VERSUS_ROSTER[cursor];
  const show = stage === 'opts' ? null : ROSTER[focusKey];
  return (
    <div className="pth-overlay" style={{ background: 'radial-gradient(ellipse at 70% 40%, rgba(40,20,10,0.45), rgba(2,2,4,0.9))' }}>
      <div className="pth-vs">
        <div className="pth-panel" style={{ padding: 22, minWidth: 0 }}>
          <div className="pth-h1">Versus</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
            <div style={{ fontFamily: 'Cinzel', letterSpacing: '0.2em', color: '#d8b45a' }}>{stage === 'p1' ? 'CHOOSE YOUR FIGHTER' : stage === 'cpu' ? 'CHOOSE THE CPU OPPONENT' : 'MATCH SETTINGS'} · RECORD {rec.wins}W {rec.losses}L</div>
            <button type="button" className="pth-btn active" onClick={() => { audio.play('uiSelect'); ui.set({ screen: 'onlineLobby' }); }}>Online Party · 1v1</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gap: 8, marginTop: 16 }}>
            {VERSUS_ROSTER.map((k, i) => {
              const r = ROSTER[k];
              const chosen = k === p1 || k === cpu;
              return (
                <button key={k} type="button" className={`pth-btn pth-vs-card ${cursor === i && stage !== 'opts' ? 'active' : ''}`} style={{ borderColor: chosen ? r.color : undefined, opacity: stage === 'opts' && !chosen ? 0.4 : 1 }} onMouseEnter={() => stage !== 'opts' && setCursor(i)} onClick={() => stage !== 'opts' && pick(i)}>
                  <div style={{ color: r.color, fontSize: 12 }}>{r.name}</div>
                  <div style={{ fontFamily: 'Cormorant Garamond', textTransform: 'none', letterSpacing: 0, fontSize: 14, opacity: 0.8 }}>{r.standName}</div>
                  {k === p1 && <div style={{ fontSize: 10, color: '#ffd34d' }}>P1</div>}
                  {k === cpu && <div style={{ fontSize: 10, color: '#ff8a8a' }}>CPU</div>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="pth-panel pth-vs-info" style={{ padding: 24, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {show ? (
            <>
              <div className="pth-vs-name" style={{ fontFamily: 'Cinzel Decorative, Cinzel', color: show.color }}>{show.name}</div>
              <div style={{ fontFamily: 'Cinzel', letterSpacing: '0.3em', marginTop: 4 }}>「{show.standName}」</div>
              <div style={{ marginTop: 18, fontSize: 18, lineHeight: 1.5 }}>
                <div>Health {show.vhp} · Power {show.power} · Speed {show.speed}</div>
                <div style={{ marginTop: 10, opacity: 0.8 }}>Light (LMB/X) · Heavy (RMB/Y) · Rush (F/RB) · Special A (G/LT) · Special B (T) · Signature (R/RT) · Guard (C/LB) · Dodge (Space/A)</div>
                <div style={{ marginTop: 8, opacity: 0.8 }}>Combos (Stand out): Light · Light · Heavy = Roundhouse · Light ×4 · Heavy = Barrage</div>
              </div>
            </>
          ) : (
            <>
              <div className="pth-h2">CPU Difficulty</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>{DIFFS.map((d, i) => <button key={d} type="button" className={`pth-btn ${diff === i ? 'active' : ''}`} onClick={() => setDiff(i)}>{d}</button>)}</div>
              <div className="pth-h2" style={{ marginTop: 18 }}>Arena</div>
              <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>{ARENAS.map((a, i) => <button key={a.id} type="button" className={`pth-btn ${arena === i ? 'active' : ''}`} style={{ textAlign: 'left' }} onClick={() => setArena(i)}>{a.name}</button>)}</div>
              <div style={{ marginTop: 16, fontSize: 17 }}>{ROSTER[p1]?.name} vs {ROSTER[cpu]?.name} · best of three rounds</div>
            </>
          )}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
            <button type="button" className="pth-btn" onClick={back}>Back</button>
            {stage === 'opts' && <button type="button" className="pth-btn active" onClick={start}>Fight</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
