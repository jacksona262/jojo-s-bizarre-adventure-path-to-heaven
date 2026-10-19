import React, { useEffect, useRef, useState } from 'react';
import { ROSTER, VERSUS_ROSTER } from '@/game/combat/Roster';
import { ARENAS } from '@/game/modes/Versus';
import { audio } from '@/game/core/Audio';
import { ui } from '@/game/core/Store';
import { Save } from '@/game/state/Save';
import { portrait } from '@/game/ui/Portraits';

// Fighting-game character select: the roster as a strip of portrait tiles along the bottom, the
// two picks as large art on either side with VS between them, then stage + difficulty, then FIGHT.

const DIFFS = ['easy', 'normal', 'hard'];
const RANDOM = '__random';
const TILES = [...VERSUS_ROSTER, RANDOM];
const ARENA_TINT = { street: '#c08a4a', courtyard: '#8aa0c8', bridge: '#c86a3a', estate: '#7ac86a', cloister: '#8a7ae0', sanctum: '#f0d080' };

// rendered portraits, filled in as they finish
function usePortraits(keys) {
  const [map, setMap] = useState({});
  useEffect(() => {
    let alive = true;
    for (const k of keys) {
      portrait(k).then((v) => { if (alive && v) setMap((m) => (m[k] ? m : { ...m, [k]: v })); });
    }
    return () => { alive = false; };
  }, [keys.join('|')]);
  return map;
}

const stat = (v, max) => Math.max(0.08, Math.min(1, v / max));

function SideArt({ side, keyName, art, label, locked }) {
  const r = keyName && keyName !== RANDOM ? ROSTER[keyName] : null;
  const color = r?.color || '#888';
  return (
    <div className={`fs-side fs-${side} ${locked ? 'locked' : ''}`} style={{ '--c': color }}>
      <div className="fs-side-glow" />
      {r && art?.full ? <img key={keyName} className="fs-art" src={art.full} alt={r.name} draggable={false} /> : <div className="fs-art fs-art-empty">{keyName === RANDOM ? '?' : r ? r.name[0] : ''}</div>}
      <div className="fs-tag">{label}{locked ? ' · READY' : ''}</div>
      <div className="fs-nameplate">
        <div className="fs-name">{r ? r.name : keyName === RANDOM ? 'Random' : '—'}</div>
        <div className="fs-stand">{r ? `「${r.standName}」` : ''}</div>
        {r && (
          <div className="fs-stats">
            {[['HEALTH', stat(r.vhp, 340)], ['POWER', stat(r.power - 0.7, 0.55)], ['SPEED', stat(r.speed - 3.4, 1.6)]].map(([n, v]) => (
              <div key={n} className="fs-stat"><span>{n}</span><i><b style={{ width: `${v * 100}%` }} /></i></div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function VersusSelect({ game }) {
  const [stage, setStage] = useState('p1');     // p1 | cpu | stage
  const [cursor, setCursor] = useState(0);
  const [p1, setP1] = useState(null);
  const [cpu, setCpu] = useState(null);
  const [diff, setDiff] = useState(1);
  const [arena, setArena] = useState(0);
  const rec = Save.versusRecord();
  const arts = usePortraits(VERSUS_ROSTER);
  const st = useRef({});
  const cols = typeof window !== 'undefined' && window.innerWidth < 700 ? 4 : 9;
  st.current = { stage, cursor, p1, cpu, diff, arena, cols };

  const resolve = (k) => (k === RANDOM ? VERSUS_ROSTER[Math.floor(Math.random() * VERSUS_ROSTER.length)] : k);
  const pick = (i) => {
    const key = resolve(TILES[i]);
    audio.play('uiSelect');
    if (st.current.stage === 'p1') { setP1(key); setStage('cpu'); } else if (st.current.stage === 'cpu') { setCpu(key); setStage('stage'); }
  };
  const start = () => {
    const s = st.current;
    if (!s.p1 || !s.cpu) return;
    audio.play('uiSelect');
    game.startVersus({ p1: s.p1, cpu: s.cpu, difficulty: DIFFS[s.diff], arena: ARENAS[s.arena].id });
  };
  const back = () => {
    const s = st.current;
    audio.play('uiHover');
    if (s.stage === 'stage') { setCpu(null); setStage('cpu'); } else if (s.stage === 'cpu') { setP1(null); setStage('p1'); } else ui.set({ screen: 'title' });
  };
  useEffect(() => {
    let raf;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const inp = game.input; const s = st.current; const n = TILES.length;
      if (s.stage !== 'stage') {
        let c = s.cursor;
        if (inp.pressed('left')) c = (c + n - 1) % n;
        if (inp.pressed('right')) c = (c + 1) % n;
        if (inp.pressed('up')) c = (c - s.cols + n) % n;
        if (inp.pressed('down')) c = (c + s.cols) % n;
        if (c !== s.cursor) { setCursor(c); audio.play('uiHover'); }
        if (inp.pressed('confirm')) pick(s.cursor);
      } else {
        if (inp.pressed('up')) setDiff((d) => (d + 2) % 3);
        if (inp.pressed('down')) setDiff((d) => (d + 1) % 3);
        if (inp.pressed('left')) setArena((a) => (a + ARENAS.length - 1) % ARENAS.length);
        if (inp.pressed('right')) setArena((a) => (a + 1) % ARENAS.length);
        if (inp.pressed('confirm')) start();
      }
      if (inp.pressed('back')) back();
    };
    loop();
    return () => cancelAnimationFrame(raf);
  });

  const hover = TILES[cursor];
  const leftKey = p1 || (stage === 'p1' ? hover : null);
  const rightKey = cpu || (stage === 'cpu' ? hover : null);
  const banner = stage === 'p1' ? 'Choose your fighter' : stage === 'cpu' ? 'Choose your opponent' : 'Select the stage';

  return (
    <div className="fs-root">
      <div className="fs-bg" />
      <div className="fs-top">
        <button type="button" className="fs-back" onClick={back}>‹ Back</button>
        <div className="fs-banner">{banner}</div>
        <div className="fs-top-right">
          <span className="fs-record">RECORD {rec.wins}W · {rec.losses}L</span>
          <button type="button" className="fs-online" onClick={() => { audio.play('uiSelect'); ui.set({ screen: 'onlineLobby' }); }}>Online 1v1</button>
        </div>
      </div>

      <div className="fs-stage">
        <SideArt side="l" keyName={leftKey} art={arts[leftKey]} label="1P" locked={!!p1} />
        <div className="fs-vs"><span>V</span><span>S</span></div>
        <SideArt side="r" keyName={rightKey} art={arts[rightKey]} label="CPU" locked={!!cpu} />
      </div>

      {stage !== 'stage' ? (
        <div className="fs-grid" style={{ '--cols': cols }}>
          {TILES.map((k, i) => {
            const r = k === RANDOM ? null : ROSTER[k];
            const isHover = i === cursor;
            return (
              <button
                key={k}
                type="button"
                className={`fs-tile ${isHover ? (stage === 'p1' ? 'hover-p1' : 'hover-cpu') : ''} ${k === p1 ? 'is-p1' : ''}`}
                style={{ '--c': r?.color || '#bbb' }}
                onMouseEnter={() => { if (cursor !== i) { setCursor(i); audio.play('uiHover'); } }}
                onClick={() => pick(i)}
                aria-label={r ? r.name : 'Random'}
              >
                <span className="fs-tile-in">
                  {r && arts[k]?.bust ? <img src={arts[k].bust} alt="" draggable={false} /> : <em>{r ? r.name[0] : '?'}</em>}
                </span>
                {k === p1 && <b className="fs-chip p1">1P</b>}
                {isHover && <b className={`fs-chip ${stage === 'p1' ? 'p1' : 'cpu'}`}>{stage === 'p1' ? '1P' : 'CPU'}</b>}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="fs-stagesel">
          <div className="fs-arenas">
            {ARENAS.map((a, i) => (
              <button key={a.id} type="button" className={`fs-arena ${arena === i ? 'active' : ''}`} style={{ '--c': ARENA_TINT[a.id] || '#aaa' }} onClick={() => setArena(i)} onDoubleClick={start}>
                <span className="fs-arena-art" />
                <span className="fs-arena-name">{a.name}</span>
              </button>
            ))}
          </div>
          <div className="fs-stage-bottom">
            <div className="fs-diff">
              <span>CPU</span>
              {DIFFS.map((d, i) => <button key={d} type="button" className={diff === i ? 'active' : ''} onClick={() => setDiff(i)}>{d}</button>)}
            </div>
            <div className="fs-rules">Best of three · 99 seconds · Light ×2 · Heavy = Roundhouse · Light ×4 · Heavy = Barrage</div>
            <button type="button" className="fs-fight" onClick={start}>Fight</button>
          </div>
        </div>
      )}
    </div>
  );
}
