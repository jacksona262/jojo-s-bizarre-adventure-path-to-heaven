import React, { useEffect, useRef, useState } from 'react';
import { useUI } from '@/game/core/Store';
import { audio } from '@/game/core/Audio';
import { useNav } from './useNav';

const finish = (r) => window.__game?.mode?.resolveMinigame?.(r);
const CARD = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const rnd = (n) => 1 + Math.floor(Math.random() * n);

function Card({ v, hidden, glow }) {
  return (
    <div style={{ width: 92, height: 130, border: `1px solid ${glow ? '#ffd34d' : 'rgba(216,180,90,0.6)'}`, background: hidden ? 'repeating-linear-gradient(45deg,#2a1020,#2a1020 6px,#3a1830 6px,#3a1830 12px)' : 'linear-gradient(180deg,#f4ead2,#d8c8a0)', color: '#2a1a10', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel', fontWeight: 900, fontSize: 40, boxShadow: glow ? '0 0 20px #ffd34d' : '0 6px 18px rgba(0,0,0,0.6)' }}>
      {hidden ? '' : CARD[v]}
    </div>
  );
}

// Soul Ante: Daniel J. D'Arby's bluffing game. First to three souls.
export function Osiris({ rules }) {
  const [souls, setSouls] = useState([0, 0]);
  const [round, setRound] = useState(null);
  const [msg, setMsg] = useState("D'Arby shuffles with a showman's flourish.");
  const [peekUsed, setPeekUsed] = useState(false);
  const [peek, setPeek] = useState(false);
  const deal = () => {
    const mine = rnd(13); const his = rnd(13);
    const strong = his >= 9;
    const bluff = !strong && Math.random() < 0.32;
    const raise = strong || bluff;
    const tell = bluff && Math.random() < 0.6;
    setRound({ mine, his, raise, bluff, tell, revealed: false });
    setPeek(false);
    setMsg(raise ? (tell ? "D'Arby pushes a soul forward. His left eye twitches, just once." : "D'Arby pushes a soul forward. \"Raise.\"") : '"I hold," says D\'Arby, smiling.');
    audio.play('click');
  };
  useEffect(() => { deal(); }, []);
  const settle = (call) => {
    if (!round || round.revealed) return;
    let w = -1;
    if (call) { if (round.mine > round.his) w = 0; else if (round.his > round.mine) w = 1; } else if (round.raise) w = 1;
    const s = [...souls];
    if (w >= 0) s[w] += 1;
    setSouls(s);
    setRound({ ...round, revealed: true });
    setMsg(call ? (w === 0 ? `Your ${CARD[round.mine]} beats his ${CARD[round.his]}. A soul is yours.` : w === 1 ? `His ${CARD[round.his]} beats your ${CARD[round.mine]}. Osiris takes a soul.` : 'A tie. No soul changes hands.') : (round.raise ? `You fold. D'Arby takes the soul${round.bluff ? '... and shows a bluffed ' + CARD[round.his] : ''}.` : 'You fold. The round is void.'));
    audio.play(w === 0 ? 'quest' : w === 1 ? 'block' : 'click');
    setTimeout(() => {
      if (s[0] >= 3) finish('win');
      else if (s[1] >= 3) finish('lose');
      else deal();
    }, 2200);
  };
  const usePeek = () => { if (peekUsed || !round || round.revealed) return; setPeekUsed(true); setPeek(true); audio.play('timeStop'); setTimeout(() => audio.play('timeResume'), 1400); };
  const actions = [() => settle(true), () => settle(false), usePeek];
  const [idx, setIdx] = useNav(3, (i) => actions[i](), { horizontal: true });
  return (
    <div className="pth-overlay">
      <div className="pth-panel" style={{ width: 'min(820px, 94vw)', padding: 28, filter: peek ? 'hue-rotate(80deg) saturate(0.6)' : 'none', transition: 'filter .4s' }}>
        <div className="pth-h1">Osiris · Soul Ante</div>
        <div style={{ fontSize: 15, opacity: 0.75, marginTop: 6 }}>{rules}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, fontFamily: 'Cinzel', letterSpacing: '0.16em' }}>
          <div>DIO · {'✦'.repeat(souls[0])}{'·'.repeat(3 - souls[0])}</div>
          <div style={{ color: '#e0b070' }}>D&apos;ARBY · {'✦'.repeat(souls[1])}{'·'.repeat(3 - souls[1])}</div>
        </div>
        {round && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 70, marginTop: 20 }}>
            <div style={{ textAlign: 'center' }}><Card v={round.mine} /><div className="pth-h2" style={{ marginTop: 8 }}>Your card</div></div>
            <div style={{ textAlign: 'center' }}><Card v={round.his} hidden={!round.revealed && !peek} glow={peek} /><div className="pth-h2" style={{ marginTop: 8 }}>{round.raise ? 'Raised' : 'Held'}</div></div>
          </div>
        )}
        <div style={{ marginTop: 18, fontSize: 21, textAlign: 'center', minHeight: 56 }}>{msg}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12 }}>
          {['Call', 'Fold', peekUsed ? 'The World (used)' : 'The World · peek'].map((l, i) => (
            <button key={l} type="button" className={`pth-btn ${idx === i ? 'active' : ''}`} disabled={!round || round.revealed || (i === 2 && peekUsed)} onMouseEnter={() => setIdx(i)} onClick={actions[i]}>{l}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Atum's shell game: track the soul. Telence reads choices made in moving time.
export function Atum({ rules }) {
  const [order, setOrder] = useState([0, 1, 2]); // slot -> cup id
  const [token, setToken] = useState(0); // cup id holding the soul
  const [phase, setPhase] = useState('show'); // show | shuffle | choose | reveal
  const [stopped, setStopped] = useState(false);
  const [usedStop, setUsedStop] = useState(false);
  const [score, setScore] = useState([0, 0]);
  const [round, setRound] = useState(1);
  const [msg, setMsg] = useState('Telence lifts the middle cup. The soul glows beneath it.');
  const [lifted, setLifted] = useState(null);
  const stopRef = useRef(false);
  stopRef.current = stopped;
  const startRound = (r) => {
    const t = Math.floor(Math.random() * 3);
    setToken(t); setOrder([0, 1, 2]); setPhase('show'); setUsedStop(false); setStopped(false); setLifted(order.indexOf(t));
    setMsg(`Round ${r}. Watch the soul.`);
    setTimeout(() => { setLifted(null); setPhase('shuffle'); shuffle(6 + r * 3, 520 - r * 70); }, 1500);
  };
  const shuffle = (n, speed) => {
    let i = 0;
    const step = () => {
      if (stopRef.current) { setTimeout(step, 120); return; }
      if (i >= n) { setPhase('choose'); setMsg('Choose a cup. Atum is listening.'); return; }
      setOrder((o) => { const a = Math.floor(Math.random() * 3); let b = Math.floor(Math.random() * 3); if (b === a) b = (a + 1) % 3; const c = [...o]; [c[a], c[b]] = [c[b], c[a]]; return c; });
      audio.play('click');
      i += 1;
      setTimeout(step, speed);
    };
    step();
  };
  useEffect(() => { startRound(1); }, []);
  const choose = (slot) => {
    if (phase !== 'choose' && !(phase === 'shuffle' && stopped)) return;
    let cup = order[slot];
    let tk = token;
    const correct = cup === tk;
    // Atum reads a choice made in moving time and moves the soul away
    if (!stopped && correct && Math.random() < 0.65) {
      const others = [0, 1, 2].filter((c) => c !== cup);
      tk = others[Math.floor(Math.random() * 2)];
      setToken(tk);
    }
    const win = cup === tk;
    setPhase('reveal');
    setStopped(false);
    setLifted(slot);
    const s = [...score];
    s[win ? 0 : 1] += 1;
    setScore(s);
    setMsg(win ? (stopped ? 'Chosen in stopped time. Atum heard nothing. The soul is yours.' : 'Telence\'s smile falters. The soul is yours.') : (correct ? 'You were right, and Telence knew it. The soul was moved before the cup rose.' : 'Empty. Telence chuckles.'));
    audio.play(win ? 'quest' : 'block');
    setTimeout(() => {
      if (s[0] >= 2) finish('win');
      else if (s[1] >= 2) finish('lose');
      else { setRound(round + 1); startRound(round + 1); }
    }, 2300);
    void cup;
  };
  const stopTime = () => {
    if (usedStop || phase === 'reveal' || phase === 'show') return;
    setUsedStop(true); setStopped(true);
    audio.play('timeStop');
    setMsg('Time has stopped. The cups hang still, translucent. Choose; Atum cannot hear a frozen mind.');
  };
  const [idx, setIdx] = useNav(4, (i) => (i < 3 ? choose(i) : stopTime()), { horizontal: true });
  const slotX = (s) => 120 + s * 170;
  return (
    <div className="pth-overlay">
      <div className="pth-panel" style={{ width: 'min(820px, 94vw)', padding: 28, filter: stopped ? 'hue-rotate(110deg) saturate(0.55)' : 'none', transition: 'filter .4s' }}>
        <div className="pth-h1">Atum · The Soul Shell Game</div>
        <div style={{ fontSize: 15, opacity: 0.75, marginTop: 6 }}>{rules}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontFamily: 'Cinzel', letterSpacing: '0.16em' }}>
          <div>DIO · {'✦'.repeat(score[0])}</div><div>ROUND {round}</div><div style={{ color: '#d0a0ff' }}>TELENCE · {'✦'.repeat(score[1])}</div>
        </div>
        <div style={{ position: 'relative', height: 200, marginTop: 10 }}>
          {[0, 1, 2].map((cupId) => {
            const slot = order.indexOf(cupId);
            const up = lifted === slot;
            const showToken = cupId === token && (up || stopped);
            return (
              <div key={cupId} style={{ position: 'absolute', left: slotX(slot), top: 40, width: 110, transition: `left ${phase === 'shuffle' && !stopped ? 0.35 : 0}s ease` }}>
                {showToken && <div style={{ position: 'absolute', left: 35, top: 100, width: 40, height: 40, borderRadius: '50%', background: 'radial-gradient(circle,#fff,#c8a0ff 50%,transparent 70%)', boxShadow: '0 0 30px #c8a0ff' }} />}
                <button type="button" className="pth-interactive" onClick={() => choose(slot)} onMouseEnter={() => setIdx(slot)} style={{ position: 'relative', width: 110, height: 120, transform: `translateY(${up ? -60 : 0}px)`, transition: 'transform .35s ease', background: 'linear-gradient(180deg,#6a4a2a,#3a2614)', clipPath: 'polygon(18% 0,82% 0,100% 100%,0 100%)', border: 'none', cursor: 'pointer', opacity: stopped ? 0.45 : 1, outline: idx === slot ? '2px solid #ffd34d' : 'none' }} />
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 21, textAlign: 'center', minHeight: 56 }}>{msg}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 8 }}>
          <button type="button" className={`pth-btn ${idx === 3 ? 'active' : ''}`} disabled={usedStop || phase === 'reveal' || phase === 'show'} onMouseEnter={() => setIdx(3)} onClick={stopTime}>{usedStop ? 'The World (used this round)' : 'The World · stop time'}</button>
        </div>
      </div>
    </div>
  );
}

export default function Minigames() {
  const mg = useUI((s) => s.minigame);
  if (!mg) return null;
  if (mg.type === 'osiris') return <Osiris rules={mg.data.rules} />;
  if (mg.type === 'atum') return <Atum rules={mg.data.rules} />;
  return null;
}
