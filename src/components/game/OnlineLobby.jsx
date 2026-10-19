import React, { useEffect, useRef, useState } from 'react';
import { ROSTER, VERSUS_ROSTER } from '@/game/combat/Roster';
import { ARENAS } from '@/game/modes/Versus';
import { NetSession } from '@/game/net/Net';
import { audio } from '@/game/core/Audio';
import { ui } from '@/game/core/Store';

// Online party: create a party (get a code) or join one with a code, then both players pick a
// fighter and ready up; the host picks the arena and starts a best-of-three 1v1.

const COLS = 4;
const NAME_KEY = 'pth.netName';
const loadName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };
const saveName = (n) => { try { localStorage.setItem(NAME_KEY, n); } catch { /* private mode */ } };

export default function OnlineLobby({ game }) {
  const [phase, setPhase] = useState('menu'); // menu | hosting | joining | lobby
  const [name, setName] = useState(loadName() || `Player${Math.floor(Math.random() * 900 + 100)}`);
  const [codeIn, setCodeIn] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [role, setRole] = useState(null);
  const [me, setMe] = useState({ pick: 'dio', ready: false });
  const [peer, setPeer] = useState({ name: '', pick: null, ready: false });
  const [arena, setArena] = useState(0);
  const [copied, setCopied] = useState(false);
  const sess = useRef(null);
  const st = useRef({});
  st.current = { me, peer, arena, role };

  const leave = (toVersus = false) => {
    sess.current?.close();
    sess.current = null;
    game.net = null;
    setPhase('menu'); setRole(null); setCode(''); setPeer({ name: '', pick: null, ready: false }); setMe((m) => ({ ...m, ready: false }));
    if (toVersus) ui.set({ screen: 'versusSelect' });
  };

  // never leave a half-open party behind when this screen goes away (except into the match)
  useEffect(() => () => { if (sess.current && !sess.current.inMatch) sess.current.close(); }, []);

  const wire = (s, r) => {
    sess.current = s;
    game.net = s;
    setRole(r);
    setPeer((p) => ({ ...p, name: s.peerName }));
    s.onClose = (reason) => { setErr(reason || 'Disconnected.'); leave(); };
    s.setHandler((m) => {
      if (m.t === 'hello') setPeer((p) => ({ ...p, name: m.name }));
      else if (m.t === 'pick') setPeer((p) => ({ ...p, pick: m.key, ready: false }));
      else if (m.t === 'ready') setPeer((p) => ({ ...p, ready: !!m.v, pick: m.key || p.pick }));
      else if (m.t === 'arena') setArena(m.i);
      else if (m.t === 'start' && r === 'guest') begin(m.sel);
    });
    s.send({ t: 'pick', key: st.current.me.pick });
    if (r === 'host') s.send({ t: 'arena', i: st.current.arena });
    setPhase('lobby');
    audio.play('quest');
  };

  const host = async () => {
    const n = name.trim() || 'Player';
    saveName(n);
    setErr(''); setPhase('hosting'); setCode('');
    try {
      const s = await NetSession.host(n, { onCode: setCode, onSession: (x) => { sess.current = x; } });
      wire(s, 'host');
    } catch (e) {
      if (sess.current?.closed) return;
      setErr(e.message || 'Could not create a party.'); leave();
    }
  };

  const join = async () => {
    const n = name.trim() || 'Player';
    const c = codeIn.trim().toUpperCase();
    if (c.length < 5) { setErr('Enter the 5-letter party code.'); return; }
    saveName(n);
    setErr(''); setPhase('joining');
    try {
      const s = await NetSession.join(c, n);
      setCode(c);
      wire(s, 'guest');
    } catch (e) {
      setErr(e.message || 'Could not join that party.'); leave();
    }
  };

  const pick = (key) => {
    if (me.ready) return;
    audio.play('uiSelect');
    setMe((m) => ({ ...m, pick: key }));
    sess.current?.send({ t: 'pick', key });
  };
  const toggleReady = () => {
    const v = !me.ready;
    audio.play('uiSelect');
    setMe((m) => ({ ...m, ready: v }));
    sess.current?.send({ t: 'ready', v, key: me.pick });
  };
  const chooseArena = (i) => {
    if (role !== 'host') return;
    setArena(i);
    sess.current?.send({ t: 'arena', i });
  };

  const begin = (sel) => {
    const s = sess.current;
    if (!s) return;
    s.inMatch = true;
    s.setHandler(null); // messages queue until the duel takes over
    s.onClose = null;
    audio.play('uiSelect');
    game.startVersus(sel);
  };

  const start = () => {
    const { me: m, peer: p, arena: a } = st.current;
    if (role !== 'host' || !m.ready || !p.ready || !p.pick) return;
    const base = { p1: m.pick, cpu: p.pick, arena: ARENAS[a].id };
    sess.current.send({ t: 'start', sel: { ...base, online: { role: 'guest' } } });
    begin({ ...base, online: { role: 'host' } });
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  const card = (title, who, data, isMe) => {
    const r = data.pick ? ROSTER[data.pick] : null;
    return (
      <div className="pth-panel" style={{ padding: 14, flex: 1, minWidth: 0, borderColor: data.ready ? '#7dff9a' : undefined }}>
        <div style={{ fontFamily: 'Cinzel', letterSpacing: '0.2em', fontSize: 12, color: '#d8b45a' }}>{title}</div>
        <div style={{ fontSize: 20, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{who || '…'}</div>
        <div style={{ marginTop: 6, color: r?.color || '#aaa', fontFamily: 'Cinzel' }}>{r ? r.name : 'Choosing…'}</div>
        <div style={{ fontSize: 14, opacity: 0.75 }}>{r ? `「${r.standName}」` : ''}</div>
        <div style={{ marginTop: 8, fontFamily: 'Cinzel', fontSize: 12, letterSpacing: '0.2em', color: data.ready ? '#7dff9a' : '#ff9a7a' }}>{data.ready ? 'READY' : (isMe ? 'NOT READY' : 'PICKING')}</div>
      </div>
    );
  };

  return (
    <div className="pth-overlay" style={{ background: 'radial-gradient(ellipse at 70% 40%, rgba(40,20,10,0.45), rgba(2,2,4,0.92))' }}>
      <div className="pth-panel pth-online" style={{ padding: 22, width: 'min(1040px, 96vw)', maxHeight: '94vh', overflowY: 'auto' }}>
        <div className="pth-h1">Online Party</div>
        <div style={{ fontFamily: 'Cinzel', letterSpacing: '0.2em', color: '#d8b45a', marginTop: 4, fontSize: 13 }}>1 V 1 · BEST OF THREE · PEER-TO-PEER</div>
        {err && <div style={{ marginTop: 12, color: '#ff8a7a', fontSize: 17 }}>{err}</div>}

        {phase === 'menu' && (
          <div style={{ display: 'grid', gap: 14, marginTop: 18, maxWidth: 520 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontFamily: 'Cinzel', fontSize: 12, letterSpacing: '0.2em' }}>YOUR NAME</span>
              <input className="pth-input" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
            </label>
            <button type="button" className="pth-btn active" onClick={host}>Create Party</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="pth-input" placeholder="PARTY CODE" value={codeIn} maxLength={5} style={{ flex: 1, textTransform: 'uppercase', letterSpacing: '0.3em' }} onChange={(e) => setCodeIn(e.target.value.replace(/[^a-z]/gi, ''))} onKeyDown={(e) => { if (e.key === 'Enter') join(); }} />
              <button type="button" className="pth-btn" onClick={join}>Join</button>
            </div>
            <div style={{ fontSize: 15, opacity: 0.7, lineHeight: 1.45 }}>Create a party and send the code to a friend, or enter theirs. You connect directly to each other; very strict networks (some workplaces and mobile carriers) can block that.</div>
            <div><button type="button" className="pth-btn" onClick={() => leave(true)}>Back</button></div>
          </div>
        )}

        {phase === 'hosting' && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontFamily: 'Cinzel', letterSpacing: '0.2em', fontSize: 13 }}>PARTY CODE</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: 'Cinzel Decorative, Cinzel', fontSize: 48, letterSpacing: '0.25em', color: '#ffd34d' }}>{code || '·····'}</div>
              {code && <button type="button" className="pth-btn" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>}
            </div>
            <div style={{ marginTop: 10, fontSize: 18 }}>{code ? 'Waiting for your opponent to join…' : 'Creating the party…'}</div>
            <div style={{ marginTop: 18 }}><button type="button" className="pth-btn" onClick={() => leave()}>Cancel</button></div>
          </div>
        )}

        {phase === 'joining' && (
          <div style={{ marginTop: 20, fontSize: 18 }}>
            Joining {codeIn.toUpperCase()}…
            <div style={{ marginTop: 18 }}><button type="button" className="pth-btn" onClick={() => leave()}>Cancel</button></div>
          </div>
        )}

        {phase === 'lobby' && (
          <>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              {card(role === 'host' ? 'YOU · HOST' : 'YOU', name, me, true)}
              {card(role === 'host' ? 'OPPONENT' : 'OPPONENT · HOST', peer.name, peer, false)}
            </div>
            <div style={{ fontFamily: 'Cinzel', letterSpacing: '0.2em', color: '#d8b45a', marginTop: 16, fontSize: 13 }}>CHOOSE YOUR FIGHTER{me.ready ? ' · LOCKED IN' : ''}</div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gap: 8, marginTop: 8 }}>
              {VERSUS_ROSTER.map((k) => {
                const r = ROSTER[k];
                return (
                  <button key={k} type="button" className={`pth-btn pth-vs-card ${me.pick === k ? 'active' : ''}`} style={{ borderColor: me.pick === k ? r.color : undefined, opacity: me.ready && me.pick !== k ? 0.4 : 1 }} onClick={() => pick(k)}>
                    <div style={{ color: r.color, fontSize: 12 }}>{r.name}</div>
                    <div style={{ fontFamily: 'Cormorant Garamond', textTransform: 'none', letterSpacing: 0, fontSize: 14, opacity: 0.8 }}>{r.standName}</div>
                    {peer.pick === k && <div style={{ fontSize: 10, color: '#ff8a8a' }}>OPPONENT</div>}
                  </button>
                );
              })}
            </div>
            <div style={{ fontFamily: 'Cinzel', letterSpacing: '0.2em', color: '#d8b45a', marginTop: 16, fontSize: 13 }}>ARENA{role !== 'host' ? ' · CHOSEN BY THE HOST' : ''}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {ARENAS.map((a, i) => <button key={a.id} type="button" className={`pth-btn ${arena === i ? 'active' : ''}`} style={{ opacity: role !== 'host' && arena !== i ? 0.45 : 1 }} onClick={() => chooseArena(i)}>{a.name}</button>)}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginTop: 18, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 15, opacity: 0.75 }}>Party {code} · {sess.current?.rtt ? `${Math.round(sess.current.rtt)} ms` : 'connected'}</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="pth-btn" onClick={() => leave()}>Leave</button>
                <button type="button" className={`pth-btn ${me.ready ? '' : 'active'}`} onClick={toggleReady}>{me.ready ? 'Unready' : 'Ready'}</button>
                {role === 'host' && <button type="button" className="pth-btn active" disabled={!me.ready || !peer.ready} style={{ opacity: me.ready && peer.ready ? 1 : 0.45 }} onClick={start}>Start Match</button>}
              </div>
            </div>
            {role !== 'host' && me.ready && peer.ready && <div style={{ marginTop: 8, fontSize: 15, opacity: 0.8, textAlign: 'right' }}>Waiting for the host to start…</div>}
          </>
        )}
      </div>
    </div>
  );
}
