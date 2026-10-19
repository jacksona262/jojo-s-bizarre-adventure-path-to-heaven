import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useUI, ui } from '@/game/core/Store';

const KEYS = {
  kbm: { interact: 'E', skip: 'Space', light: 'LMB', confirm: 'Enter' },
  pad: { interact: 'B', skip: 'A', light: 'X', confirm: 'A' },
};

function Bar({ cls, value, max }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return <div className={`pth-bar ${cls}`}><b style={{ width: `${pct}%` }} /><i style={{ width: `${pct}%` }} /></div>;
}

// Fighting-game health bar: angled gold frame, segment ticks, a white damage trail that drains
// after a beat, and a low-health pulse. `mirror` fills from the right (opponent side).
function FgBar({ cls, value, max, mirror = false, ticks = 10 }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className={`pth-fgbar ${cls} ${mirror ? 'mirror' : ''} ${pct < 25 ? 'low' : ''}`}>
      <b style={{ width: `${pct}%` }} />
      <i style={{ width: `${pct}%` }} />
      <s>{[...Array(ticks - 1)].map((_, k) => <u key={k} style={{ left: `${((k + 1) / ticks) * 100}%` }} />)}</s>
    </div>
  );
}

function PlayerPanel({ hud }) {
  const heaven = hud.heaven;
  return (
    <div className="pth-fg pth-fg-p1">
      <div className="pth-fg-head">
        <div className={`pth-fg-emblem ${heaven ? 'heaven' : ''}`}><span>{heaven ? '天' : 'D'}</span></div>
        <div className="pth-fg-names">
          <div className="pth-fg-name" style={{ color: heaven ? '#fff2c8' : '#ffd34d' }}>{heaven ? 'DIO · HEAVEN' : 'DIO'}</div>
          <div className="pth-fg-stand">{heaven ? 'THE WORLD OVER HEAVEN' : 'THE WORLD'}<span className={`pth-fg-standon ${hud.stand ? 'on' : ''}`}>{hud.stand ? 'STAND ✦' : 'STAND ·'}</span></div>
        </div>
      </div>
      <FgBar cls="hp" value={hud.hp} max={hud.hpMax} />
      <FgBar cls="en" value={hud.energy} max={hud.energyMax} ticks={4} />
      <FgBar cls="st" value={hud.stamina} max={100} ticks={1} />
      {hud.mounted && (
        <div className="pth-fg-horse">SLOW DANCER · {String(hud.gait || 'idle').toUpperCase()} · {hud.horseSpeed} KM/H<FgBar cls="st" value={hud.horseStamina} max={100} ticks={1} /></div>
      )}
    </div>
  );
}

function BossPanel({ boss }) {
  return (
    <div className="pth-fg pth-fg-p2">
      <div className="pth-fg-head mirror">
        <div className="pth-fg-emblem boss" style={{ borderColor: boss.color }}><span style={{ color: boss.color }}>{(boss.name || '?').trim()[0]}</span></div>
        <div className="pth-fg-names">
          <div className="pth-fg-name" style={{ color: boss.color }}>{boss.name}</div>
          <div className="pth-fg-stand">{boss.stand}{boss.overwritten ? ' · OVERWRITTEN' : ''}</div>
        </div>
      </div>
      <FgBar cls="boss" value={boss.hp} max={boss.hpMax} mirror />
      {boss.poise != null && <FgBar cls={`poise ${boss.poise < 30 ? 'cracking' : ''}`} value={boss.poise} max={100} mirror ticks={1} />}
      <div className="pth-pips mirror">{[...Array(boss.phases || 1)].map((_, i) => <div key={i} className={`pth-pip ${i < boss.phase ? 'on' : ''}`} />)}</div>
    </div>
  );
}

function ComboCounter({ combo }) {
  if (!combo) return null;
  return (
    <div className="pth-combo" key={combo.id}>
      <div className="pth-combo-n">{combo.n}</div>
      <div className="pth-combo-label">HITS</div>
      <div className="pth-combo-dmg">{combo.dmg} DMG</div>
    </div>
  );
}

// Lock-on reticle: positioned every animation frame (not through React) so it never lags.
function LockReticle() {
  const ref = useRef(null);
  useEffect(() => {
    let raf;
    const v = new THREE.Vector3();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = ref.current;
      const g = window.__game;
      const lock = g?.camera?.lock;
      if (!el) return;
      if (!lock || lock.dead || g.inCinematic || !g.player) { el.style.opacity = '0'; return; }
      v.set(lock.pos.x, lock.pos.y + (lock.height || 1.9) + 0.35, lock.pos.z).project(g.engine.camera);
      if (v.z > 1) { el.style.opacity = '0'; return; }
      const w = g.engine.renderer.domElement.clientWidth; const h = g.engine.renderer.domElement.clientHeight;
      el.style.opacity = '1';
      el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div ref={ref} className="pth-lock"><span>◆</span></div>;
}

function TsRing({ ts, dur, heaven }) {
  const r = 30; const c = 2 * Math.PI * r;
  const ready = ts >= 1;
  return (
    <div className="pth-ts">
      <svg width="74" height="74" viewBox="0 0 74 74">
        <circle cx="37" cy="37" r={r} fill="rgba(0,0,0,0.55)" stroke="rgba(216,180,90,0.35)" strokeWidth="3" />
        <circle cx="37" cy="37" r={r} fill="none" stroke={ready ? (heaven ? '#fff2c8' : '#ffd34d') : '#7a6a40'} strokeWidth="4" strokeDasharray={`${c * Math.min(1, ts)} ${c}`} transform="rotate(-90 37 37)" style={{ filter: ready ? 'drop-shadow(0 0 6px #ffd34d)' : 'none' }} />
        {[...Array(12)].map((_, i) => <line key={i} x1="37" y1="9" x2="37" y2="13" stroke="rgba(255,230,170,0.5)" strokeWidth="1.5" transform={`rotate(${i * 30} 37 37)`} />)}
      </svg>
      <div className="pth-ts-label">{ready ? <span>THE<br />WORLD<br /><small>{dur ? `${dur}s` : ''}</small></span> : `${Math.floor(ts * 100)}%`}</div>
    </div>
  );
}

export default function Hud() {
  const hud = useUI((s) => s.hud);
  const boss = useUI((s) => s.boss);
  const objective = useUI((s) => s.objective);
  const prompt = useUI((s) => s.prompt);
  const subtitle = useUI((s) => s.subtitle);
  const choice = useUI((s) => s.choice);
  const toast = useUI((s) => s.toast);
  const region = useUI((s) => s.region);
  const letterbox = useUI((s) => s.letterbox);
  const card = useUI((s) => s.card);
  const bossCard = useUI((s) => s.bossCard);
  const timeStop = useUI((s) => s.timeStop);
  const device = useUI((s) => s.device);
  const noise = useUI((s) => s.noise);
  const clash = useUI((s) => s.clash);
  const announce = useUI((s) => s.announce);
  const versus = useUI((s) => s.versus);
  const overlay = useUI((s) => s.overlay);
  const debug = useUI((s) => s.debug);
  const combo = useUI((s) => s.combo);
  const keys = KEYS[device] || KEYS.kbm;
  const game = window.__game;
  const showHud = hud && !letterbox && !overlay;

  return (
    <div className={`pth-ui ${letterbox ? 'pth-letterbox' : ''}`}>
      {showHud && !versus && <PlayerPanel hud={hud} />}
      {showHud && hud.ts != null && <div className="pth-ts-corner"><TsRing ts={hud.ts} dur={versus ? 0 : hud.tsDur} heaven={hud.heaven} /></div>}
      {showHud && <LockReticle />}
      {showHud && <ComboCounter combo={combo} />}
      {showHud && versus && (
        <>
          {[versus.p1, versus.p2].map((p, i) => (
            <div key={i} className={`pth-fg ${i === 0 ? 'pth-fg-p1' : 'pth-fg-p2'}`}>
              <div className={`pth-fg-head ${i ? 'mirror' : ''}`}>
                <div className="pth-fg-emblem" style={{ borderColor: p.color }}><span style={{ color: p.color }}>{(p.name || '?').trim()[0]}</span></div>
                <div className="pth-fg-names">
                  <div className="pth-fg-name" style={{ color: p.color }}>{p.name}</div>
                  <div className="pth-fg-stand">{p.stand}{p.overwritten ? ' · OVERWRITTEN' : ''}</div>
                </div>
              </div>
              <FgBar cls={i ? 'boss' : 'hp'} value={p.hp} max={p.hpMax} mirror={i === 1} />
              <FgBar cls="en" value={p.energy} max={p.energyMax} ticks={4} mirror={i === 1} />
              {i === 1 && p.poise != null && <FgBar cls={`poise ${p.poise < 30 ? 'cracking' : ''}`} value={p.poise} max={100} mirror ticks={1} />}
              <div className={`pth-fg-wins ${i ? 'mirror' : ''}`}>{[...Array(2)].map((_, k) => <span key={k} className={k < versus.wins[i] ? 'on' : ''}>✦</span>)}</div>
            </div>
          ))}
          <div className="pth-fg-timer">{versus.timer}</div>
        </>
      )}
      {showHud && boss && !versus && <BossPanel boss={boss} />}
      {showHud && boss && !versus && <div className="pth-fg-vs">VS</div>}
      {showHud && objective && !boss && (
        <>
          <div className="pth-objective">
            <div className="pth-obj-title">{objective.title}</div>
            <div className="pth-obj-text">{objective.text}</div>
            {objective.distance != null && <div style={{ fontFamily: 'Cinzel', color: '#d8b45a', marginTop: 4 }}>{objective.distance} m</div>}
          </div>
          {objective.bearing != null && (
            <div className="pth-compass">
              <div className="pth-compass-mark" style={{ left: `${50 + Math.max(-48, Math.min(48, (objective.bearing / Math.PI) * 100))}%` }}>◆</div>
            </div>
          )}
        </>
      )}
      {showHud && noise != null && (
        <div style={{ position: 'absolute', left: '50%', bottom: '30%', transform: 'translateX(-50%)', width: 220, textAlign: 'center', fontFamily: 'Cinzel', fontSize: 12, letterSpacing: '0.2em', color: noise >= 0.6 ? '#ff7a6a' : '#9fd0ff' }}>
          NOISE<Bar cls={noise >= 0.6 ? 'hp' : 'st'} value={noise * 100} max={100} />
        </div>
      )}
      {showHud && prompt && <div className="pth-prompt"><span className="pth-key">{keys.interact}</span>{prompt.text}</div>}
      {timeStop && (
        <div className="pth-timestop" style={timeStop.variant === 'erase' ? { color: '#ffd0d0', textShadow: '0 0 18px rgba(255,40,60,0.9)' } : timeStop.variant === 'starPlatinum' ? { color: '#e0e0ff', textShadow: '0 0 18px rgba(140,130,255,0.9)' } : undefined}>
          {timeStop.variant === 'erase' ? 'TIME ERASED' : 'TIME HAS STOPPED'}<br /><span style={{ fontSize: 30 }}>{timeStop.remaining.toFixed(1)}</span>
        </div>
      )}
      {subtitle && (
        <div className="pth-sub">
          {subtitle.speaker && <span className="pth-sub-speaker" style={{ color: subtitle.color || '#d8b45a' }}>{subtitle.speaker}</span>}
          <span style={subtitle.speaker ? undefined : { fontStyle: 'italic', color: '#d8ccb0' }}>{subtitle.text}</span>
        </div>
      )}
      {letterbox && !choice && <div className="pth-skip">{keys.skip} · SKIP</div>}
      {card && (
        <div className="pth-card">
          <div className="pth-card-1">{card[0]}</div>
          <div className="pth-card-2">{card[1]}</div>
        </div>
      )}
      {bossCard && (
        <div className="pth-bosscard">
          <div className="pth-bosscard-name" style={{ color: bossCard.color }}>{bossCard.name}</div>
          <div className="pth-bosscard-stand">「{bossCard.stand}」</div>
        </div>
      )}
      {region && !letterbox && <div key={region.id} className="pth-region"><div className="pth-region-name">{region.name}</div><div className="pth-region-blurb">{region.blurb}</div></div>}
      <div className="pth-toasts">{toast && <div key={toast.id} className={`pth-toast ${toast.kind}`}>{toast.text}</div>}</div>
      {clash && (
        <div className="pth-clash">
          <div className="pth-h1" style={{ fontSize: 20 }}>CLASH! Press {keys.light} rapidly</div>
          <div className="pth-clash-bar"><div style={{ width: `${clash.meter * 100}%`, background: 'linear-gradient(90deg,#9c6a1e,#ffd34d)' }} /><div style={{ flex: 1, background: 'linear-gradient(90deg,#5a4cc8,#2a1a6a)' }} /></div>
          <div style={{ fontFamily: 'Cinzel', marginTop: 6 }}>{clash.time.toFixed(1)}</div>
        </div>
      )}
      {announce && <div className="pth-announce"><div key={announce.text} className="pth-announce-text">{announce.text}</div>{announce.sub && <div className="pth-announce-sub">{announce.sub}</div>}</div>}
      {debug && <div style={{ position: 'absolute', right: 8, bottom: 8, fontFamily: 'monospace', fontSize: 11, color: '#aaa' }}>{debug}</div>}
      {/* click-to-capture hint for pointer lock */}
      {showHud && game && !game.input.pointerLocked && device === 'kbm' && !ui.get().minigame && (
        <div style={{ position: 'absolute', right: 26, bottom: 26, fontFamily: 'Cinzel', fontSize: 11, letterSpacing: '0.18em', color: 'rgba(239,228,204,0.5)' }}>CLICK TO CONTROL THE CAMERA · OR DRAG TO LOOK</div>
      )}
    </div>
  );
}
