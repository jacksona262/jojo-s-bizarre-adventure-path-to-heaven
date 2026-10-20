import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useUI, ui } from '@/game/core/Store';
import { audio } from '@/game/core/Audio';
import { Save } from '@/game/state/Save';
import { ROSTER } from '@/game/combat/Roster';
import { Account } from '@/game/online/Account';
import { CloudSaves } from '@/game/online/CloudSaves';
import { formatRunTime, allAchievements, MAIN_BOSSES, SIDE_QUESTS } from '@/game/online/Progress';
import { fetchBoard } from '@/game/online/Leaderboard';
import { LORE_COUNT } from '@/game/story/Lore';
import { unlockedBosses } from '@/game/modes/Challenge';

// V3 account, progression and competition screens.

const g = () => window.__game;
const DIFFS = ['story', 'normal', 'hard'];
const fmtDate = (t) => (t ? new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
const useAccount = () => {
  const [, force] = useState(0);
  useEffect(() => Account.on(() => force((n) => n + 1)), []);
  return Account;
};
const Panel = ({ children, w = 720, style }) => <div className="pth-panel pth-scroll v3-panel" style={{ width: `min(${w}px, 94vw)`, maxHeight: '90vh', padding: '24px 28px', ...style }}>{children}</div>;
const Tabs = ({ value, set, opts }) => (
  <div className="v3-tabs">{opts.map(([k, label]) => <button key={k} type="button" className={`v3-tab ${value === k ? 'active' : ''}`} onClick={() => { audio.play('uiHover'); set(k); }}>{label}</button>)}</div>
);
const Stat = ({ label, value }) => <div className="v3-stat"><span>{label}</span><b>{value}</b></div>;

// ------------------------------------------------------------------ username (mandatory)
export function UsernameGate() {
  const acc = useAccount();
  const [name, setName] = useState('');
  const [msg, setMsg] = useState({ text: '', ok: false });
  const [busy, setBusy] = useState(false);
  const t = useRef(null);
  const change = acc.profile != null;
  const check = (v) => {
    setName(v);
    clearTimeout(t.current);
    const err = acc.validateUsername(v);
    if (err) { setMsg({ text: v ? err : '', ok: false }); return; }
    setMsg({ text: 'Checking…', ok: false });
    t.current = setTimeout(async () => {
      try { const ok = await acc.isAvailable(v); setMsg({ text: ok ? 'Available' : 'That username is taken.', ok }); } catch { setMsg({ text: 'Could not check right now.', ok: false }); }
    }, 400);
  };
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await acc.claimUsername(name);
      audio.play('quest');
      ui.set({ account: { ...ui.get().account, needsUsername: false, username: acc.username }, overlay: change ? 'profile' : null });
    } catch (e) { setMsg({ text: e.message, ok: false }); }
    setBusy(false);
  };
  return (
    <div className="pth-overlay" style={{ zIndex: 60 }}>
      <Panel w={520}>
        <div className="pth-h1">{change ? 'Change Username' : 'Choose Your Name'}</div>
        <p className="v3-p">{change ? 'Usernames can be changed once a week.' : 'Every player needs a unique name. It appears on your profile, saves and the Hall of Fame.'}</p>
        <input className="pth-input" style={{ width: '100%', marginTop: 12 }} autoFocus maxLength={20} placeholder="e.g. DIO_Heaven" value={name} onChange={(e) => check(e.target.value.replace(/\s/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter' && msg.ok) submit(); }} />
        <div className={`v3-hint ${msg.ok ? 'ok' : ''}`}>{msg.text || '3–20 letters, numbers or underscores.'}</div>
        <div className="v3-row-end">
          {change ? <button type="button" className="pth-btn" onClick={() => ui.set({ overlay: 'profile' })}>Cancel</button> : <button type="button" className="pth-btn" onClick={() => acc.logout()}>Sign out</button>}
          <button type="button" className="pth-btn active" disabled={!msg.ok || busy} onClick={submit}>{busy ? 'Saving…' : 'Confirm'}</button>
        </div>
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ guest journey import
export function GuestImport() {
  const a = useUI((s) => s.account);
  if (!a?.guestImport?.length || a.needsUsername) return null;
  const done = (imported) => {
    Save.writeRaw('meta.guestOffer', { at: Date.now(), imported });
    ui.set({ account: { ...a, guestImport: null } });
  };
  const doImport = () => { const n = CloudSaves.importGuest(Save.guestSaves()); audio.play('quest'); done(n); };
  return (
    <div className="pth-overlay" style={{ zIndex: 55 }}>
      <Panel w={560}>
        <div className="pth-h1">Bring Your Journey?</div>
        <p className="v3-p">This device has progress from playing while signed out. Copy it into your account? It goes into empty slots only; nothing in your account is replaced, and the guest saves stay on this device.</p>
        <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>{a.guestImport.map((s) => <div key={s.slot} className="v3-line">{s.slot === 'auto' ? 'Checkpoint' : s.slot} · {s.chapter} · {new Date(s.savedAt).toLocaleString()}</div>)}</div>
        <div className="v3-row-end">
          <button type="button" className="pth-btn" onClick={() => done(0)}>Not now</button>
          <button type="button" className="pth-btn active" onClick={doImport}>Import</button>
        </div>
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ profile + account settings
export function ProfilePanel() {
  const acc = useAccount();
  const back = () => ui.set({ overlay: null });
  if (!acc.loggedIn) {
    return (
      <div className="pth-overlay">
        <Panel w={560}>
          <div className="pth-h1">Your Account</div>
          <p className="v3-p">You are playing as a guest: progress stays on this device. Sign in to keep your journey in the cloud on every device, earn achievements on your profile and appear in the Hall of Fame.</p>
          <div className="v3-row-end">
            <button type="button" className="pth-btn" onClick={back}>Back</button>
            <button type="button" className="pth-btn" onClick={() => acc.register()}>Create account</button>
            <button type="button" className="pth-btn active" onClick={() => acc.login()}>Sign in</button>
          </div>
        </Panel>
      </div>
    );
  }
  const p = acc.profile;
  const st = p?.stats || {};
  const ach = allAchievements();
  const got = ach.filter((x) => x.at).length;
  const fav = Object.entries(p?.fighter_usage || {}).sort((a, b) => b[1] - a[1])[0];
  const bests = Object.entries(p?.bests || {}).sort();
  return (
    <div className="pth-overlay">
      <Panel w={860}>
        <div className="v3-head">
          <div>
            <div className="pth-h1">{p?.username || 'Unnamed'}</div>
            <div className="v3-sub">Joined {fmtDate(p?.created_date)} · {acc.user?.email}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="pth-btn" onClick={() => ui.set({ overlay: 'username' })}>Change username</button>
            <button type="button" className="pth-btn" onClick={() => acc.logout()}>Sign out</button>
          </div>
        </div>
        <div className="v3-stats">
          <Stat label="Story completions" value={st.completions || 0} />
          <Stat label="Fastest story" value={st.fastest_ms ? formatRunTime(st.fastest_ms) : '—'} />
          <Stat label="Seals broken" value={`${(st.bosses || []).filter((b) => MAIN_BOSSES.includes(b)).length} / 10`} />
          <Stat label="Quests completed" value={`${(st.side_quests || []).length} / ${SIDE_QUESTS.length}`} />
          <Stat label="Lore pages" value={`${(st.lore || []).length} / ${LORE_COUNT}`} />
          <Stat label="Total playtime" value={formatRunTime(st.playtime_ms || 0).slice(0, 8)} />
          <Stat label="Deaths" value={st.deaths || 0} />
          <Stat label="Versus" value={`${st.versus_wins || 0}W · ${st.versus_losses || 0}L`} />
          <Stat label="Favourite fighter" value={fav ? ROSTER[fav[0]]?.name || fav[0] : '—'} />
          <Stat label="Boss Rush clears" value={st.bossrush || 0} />
        </div>
        <div className="pth-h2" style={{ marginTop: 18 }}>Achievements · {got} / {ach.length}</div>
        <div className="v3-ach">
          {ach.map((a) => (
            <div key={a.id} className={`v3-ach-item ${a.at ? 'got' : ''}`} title={a.desc}>
              <b>{a.at ? '✦' : '◇'} {a.name}</b><span>{a.desc}</span>{a.at && <i>{fmtDate(a.at)}</i>}
            </div>
          ))}
        </div>
        {bests.length > 0 && (
          <>
            <div className="pth-h2" style={{ marginTop: 18 }}>Personal Bests</div>
            <div className="v3-bests">{bests.map(([k, v]) => <div key={k} className="v3-line"><span>{bestLabel(k)}</span><b>{formatRunTime(v.ms)}</b></div>)}</div>
          </>
        )}
        {acc.offline && <div className="v3-hint">Profile changes are waiting for a connection.</div>}
        <div className="v3-row-end"><button type="button" className="pth-btn active" onClick={back}>Close</button></div>
      </Panel>
    </div>
  );
}

function bestLabel(k) {
  const [a, b, c, d] = k.split(':');
  const diff = (x) => (x ? ` · ${x}` : '');
  if (a === 'story') return `Story ${b === '100' ? '100%' : 'Any%'}${diff(c)}`;
  if (a === 'boss') return `${ROSTER[b]?.name || b} trial${diff(c)}${d ? ' · modded' : ''}`;
  if (a === 'bossrush') return `Boss Rush${diff(b)}${c ? ' · modded' : ''}`;
  return k;
}

// ------------------------------------------------------------------ Hall of Fame
export function HallOfFame() {
  const acc = useAccount();
  const [cat, setCat] = useState('any');
  const [diff, setDiff] = useState('normal');
  const [boss, setBoss] = useState('avdol');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null);
  const category = cat === 'boss' ? `boss:${boss}` : cat;
  useEffect(() => {
    let alive = true;
    setData(null); setErr('');
    fetchBoard(category, diff).then((d) => { if (alive) setData(d); }).catch((e) => { if (alive) setErr(e.message || 'Could not load the Hall of Fame.'); });
    return () => { alive = false; };
  }, [category, diff]);
  const back = () => ui.set({ screen: 'title' });
  const mine = data?.all?.find((r) => r.rec.created_by_id === acc.id);
  const wr = data?.rows?.[0];
  return (
    <div className="pth-overlay v3-hof">
      <Panel w={980}>
        <div className="v3-head">
          <div>
            <div className="v3-hof-title">PATH TO HEAVEN — HALL OF FAME</div>
            <div className="v3-unverified">UNVERIFIED · times are measured in the player&apos;s browser and checked for plausibility</div>
          </div>
          <button type="button" className="pth-btn" onClick={back}>Back</button>
        </div>
        <Tabs value={cat} set={setCat} opts={[['any', 'Any%'], ['100', '100%'], ['bossrush', 'Boss Rush'], ['boss', 'Boss Trials'], ['ngplus', 'New Game+']]} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <Tabs value={diff} set={setDiff} opts={DIFFS.map((d) => [d, d])} />
          {cat === 'boss' && <select className="pth-input v3-select" value={boss} onChange={(e) => setBoss(e.target.value)}>{MAIN_BOSSES.map((b) => <option key={b} value={b}>{ROSTER[b].name}</option>)}</select>}
        </div>
        {(mine || wr) && (
          <div className="v3-compare">
            {wr && <span>World record: <b>{formatRunTime(wr.rec.time_ms)}</b> by {wr.rec.username}</span>}
            {mine ? <span>Your rank: <b>#{mine.rank}</b> of {data.all.length} · {formatRunTime(mine.rec.time_ms)}{wr && mine.rank > 1 ? ` (+${formatRunTime(mine.rec.time_ms - wr.rec.time_ms)})` : ''}</span> : acc.loggedIn ? <span>No ranked run yet in this category.</span> : <span>Sign in to appear here.</span>}
          </div>
        )}
        <div className="v3-table">
          <div className="v3-tr v3-th"><span>Rank</span><span>Username</span><span>Time</span><span>Difficulty</span><span>Date</span></div>
          {!data && !err && <div className="v3-empty">Loading…</div>}
          {err && <div className="v3-empty">{err}</div>}
          {data && !data.rows.length && <div className="v3-empty">No times recorded yet. Be the first to reach Heaven.</div>}
          {data?.rows.map((r) => (
            <button key={r.rec.id} type="button" className={`v3-tr ${r.rec.created_by_id === acc.id ? 'me' : ''}`} onClick={() => setOpen(r)}>
              <span>#{r.rank}</span><span>{r.rec.username}</span><span className="v3-time">{formatRunTime(r.rec.time_ms)}</span><span>{r.rec.difficulty}</span><span>{fmtDate(r.rec.completed_at || r.rec.created_date)}</span>
            </button>
          ))}
        </div>
        {data && data.rejected > 0 && <div className="v3-hint">{data.rejected} submission{data.rejected === 1 ? '' : 's'} failed the run checks and {data.rejected === 1 ? 'is' : 'are'} not shown.</div>}
        {open && <RunSummary row={open} close={() => setOpen(null)} />}
      </Panel>
    </div>
  );
}

function RunSummary({ row, close }) {
  const r = row.rec;
  const splits = Object.entries(r.splits || {}).sort((a, b) => a[1] - b[1]);
  return (
    <div className="pth-overlay" style={{ zIndex: 70 }} onClick={close}>
      <Panel w={560} style={{ cursor: 'default' }}>
        <div onClick={(e) => e.stopPropagation()}>
          <div className="pth-h1">#{row.rank} · {r.username}</div>
          <div className="v3-sub">{r.category} · {r.difficulty} · v{r.version} · {fmtDate(r.completed_at || r.created_date)}</div>
          <div className="v3-stats" style={{ marginTop: 12 }}>
            <Stat label="Time" value={formatRunTime(r.time_ms)} />
            <Stat label="Deaths" value={r.deaths ?? 0} />
            {r.playtime_ms ? <Stat label="Playtime" value={formatRunTime(r.playtime_ms).slice(0, 8)} /> : null}
            {r.lore != null ? <Stat label="Lore pages" value={`${r.lore} / ${LORE_COUNT}`} /> : null}
          </div>
          {splits.length > 0 && <><div className="pth-h2" style={{ marginTop: 14 }}>Splits</div>{splits.map(([k, v]) => <div key={k} className="v3-line"><span>{ROSTER[k]?.name || (k === 'jotaroFinal' ? 'Jotaro (Final)' : k)}</span><b>{formatRunTime(v)}</b></div>)}</>}
          <div className="pth-h2" style={{ marginTop: 14 }}>Run checks</div>
          {row.checks.map((c) => <div key={c.label} className="v3-line"><span>{c.label}</span><b style={{ color: c.ok ? '#8fe08f' : '#ff8a7a' }}>{c.ok ? 'pass' : 'fail'}</b></div>)}
          <div className="v3-row-end"><button type="button" className="pth-btn active" onClick={close}>Close</button></div>
        </div>
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ story results
export function RunResults() {
  const r = useUI((s) => s.runResults);
  if (!r) return null;
  const cont = () => { audio.play('uiSelect'); g()?.mode?._resultsDone?.(); };
  return (
    <div className="pth-overlay" style={{ background: 'radial-gradient(ellipse at center, rgba(60,40,10,0.55), rgba(0,0,0,0.94))' }}>
      <Panel w={640}>
        <div className="v3-hof-title" style={{ textAlign: 'center' }}>THE MAN ON THE THRONE</div>
        <div className="v3-bigtime">{formatRunTime(r.storyMs)}</div>
        <div className="v3-sub" style={{ textAlign: 'center' }}>Official story time{r.isPb ? ' · NEW PERSONAL BEST' : r.prevPb ? ` · personal best ${formatRunTime(r.prevPb)}` : ''}</div>
        <div className="v3-stats" style={{ marginTop: 16 }}>
          <Stat label="Total playtime" value={formatRunTime(r.totalMs).slice(0, 8)} />
          <Stat label="Bosses defeated" value={r.bosses} />
          <Stat label="Quests completed" value={r.sideQuests} />
          <Stat label="Lore pages" value={`${r.lore} / ${r.loreTotal}`} />
          <Stat label="Deaths" value={r.deaths} />
          <Stat label="Difficulty" value={r.difficulty} />
          <Stat label="Hall of Fame" value={r.rank ? `#${r.rank.rank} of ${r.rank.of}` : r.submit === 'pending' ? 'submitting…' : r.submit === 'ok' ? 'submitted' : '—'} />
        </div>
        {r.submit && r.submit !== 'ok' && r.submit !== 'pending' && <div className="v3-hint">{r.submit}</div>}
        <div className="v3-row-end"><button type="button" className="pth-btn active" onClick={cont}>Continue</button></div>
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ lore page
export function LorePage() {
  const L = useUI((s) => s.lorePage);
  if (!L) return null;
  const close = () => { ui.set({ lorePage: null }); g()?.setPaused(false); };
  return (
    <div className="pth-overlay" onClick={close}>
      <div className="v3-lore" onClick={(e) => e.stopPropagation()}>
        <div className="v3-lore-n">LORE PAGE {L.n ? `${L.n} / ${L.total}` : ''}</div>
        <div className="v3-lore-title">{L.title}</div>
        <div className="v3-lore-text">{L.text}</div>
        <div className="v3-row-end"><button type="button" className="pth-btn active" onClick={close}>Close</button></div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ challenges
export function ChallengeMenu() {
  const [mods, setMods] = useState({ nohit: false, limitTs: false, aggro: false });
  const bosses = useMemo(() => unlockedBosses(), []);
  const back = () => ui.set({ screen: 'title' });
  const go = (cfg) => { audio.play('uiSelect'); g().startChallenge({ ...cfg, mods }); };
  const toggle = (k) => setMods((m) => ({ ...m, [k]: !m[k] }));
  return (
    <div className="pth-overlay">
      <Panel w={860}>
        <div className="v3-head"><div className="pth-h1">Challenges</div><button type="button" className="pth-btn" onClick={back}>Back</button></div>
        <p className="v3-p">Replay any Seal-bearer you have defeated, or face all ten in a row. Your story saves are never touched. Best times go to your profile and the Hall of Fame (unmodified runs only).</p>
        <div className="pth-h2" style={{ marginTop: 14 }}>Boss Rematch · Time Trial</div>
        <div className="v3-bossgrid">
          {MAIN_BOSSES.map((k) => {
            const open = bosses.includes(k);
            const pb = Account.profile?.bests?.[`boss:${k}:${g().settings.difficulty}`] || Save.raw(`meta.pb.boss:${k}:${g().settings.difficulty}`);
            return (
              <button key={k} type="button" className={`v3-boss ${open ? '' : 'locked'}`} disabled={!open} style={{ '--c': ROSTER[k].color }} onClick={() => go({ type: 'boss', bosses: [k] })}>
                <b>{open ? ROSTER[k].name : 'Locked'}</b><span>{open ? `「${ROSTER[k].standName}」` : 'Defeat in the story'}</span>{open && pb && <i>PB {formatRunTime(pb.ms)}</i>}
              </button>
            );
          })}
        </div>
        <div className="pth-h2" style={{ marginTop: 16 }}>Boss Rush</div>
        <div className="v3-rush">
          <span>All ten Seal-bearers back to back. One clock; deaths restart the current fight and the clock keeps running.</span>
          <button type="button" className="pth-btn active" disabled={bosses.length < MAIN_BOSSES.length} onClick={() => go({ type: 'rush' })}>{bosses.length < MAIN_BOSSES.length ? `Defeat all ten first (${bosses.length}/10)` : 'Begin Boss Rush'}</button>
        </div>
        <div className="pth-h2" style={{ marginTop: 16 }}>Modifiers <span style={{ opacity: 0.6, fontSize: 11 }}>(unranked)</span></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {[['nohit', 'No-hit'], ['limitTs', 'Two time stops per fight'], ['aggro', 'Aggressive bosses']].map(([k, l]) => <button key={k} type="button" className={`pth-btn ${mods[k] ? 'active' : ''}`} onClick={() => toggle(k)}>{mods[k] ? '✦ ' : ''}{l}</button>)}
        </div>
        <div className="v3-hint">Difficulty follows your Settings ({g().settings.difficulty}).</div>
      </Panel>
    </div>
  );
}

export function ChallengeResults() {
  const r = useUI((s) => s.challengeResults);
  if (!r) return null;
  const game = g();
  const again = () => { const m = game.mode; game.startChallenge({ ...m.cfg }); };
  const leave = async () => { ui.set({ overlay: null }); game.overlayOpen = false; await game.toTitle(); ui.set({ screen: 'challenges' }); };
  return (
    <div className="pth-overlay">
      <Panel w={600}>
        <div className="pth-h1">{r.cleared ? (r.rush ? 'Boss Rush Cleared' : 'Seal Broken') : 'Defeated'}</div>
        {r.cleared && <div className="v3-bigtime">{formatRunTime(r.rush ? r.total : r.splits[0]?.ms)}</div>}
        {r.isPb && <div className="v3-sub" style={{ textAlign: 'center' }}>NEW PERSONAL BEST</div>}
        <div className="v3-stats" style={{ marginTop: 12 }}>
          <Stat label="Deaths" value={r.deaths} />
          <Stat label="Difficulty" value={r.difficulty} />
          {r.rush && <Stat label="Seals" value={`${r.splits.length} / 10`} />}
        </div>
        {r.splits.length > 0 && r.rush && <><div className="pth-h2" style={{ marginTop: 12 }}>Splits</div>{r.splits.map((s) => <div key={s.key} className="v3-line"><span>{ROSTER[s.key].name}{s.noHit ? ' · no hit' : ''}</span><b>{formatRunTime(s.ms)}</b></div>)}</>}
        {r.submit && r.submit !== 'ok' && <div className="v3-hint">{r.submit}</div>}
        {r.submit === 'ok' && <div className="v3-hint ok">Submitted to the Hall of Fame.</div>}
        <div className="v3-row-end">
          <button type="button" className="pth-btn" onClick={leave}>Challenges</button>
          <button type="button" className="pth-btn active" onClick={again}>Try again</button>
        </div>
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ small HUD pieces
export function AchievementToast() {
  const a = useUI((s) => s.achievement);
  if (!a) return null;
  return <div key={a.key} className="v3-achtoast"><span>ACHIEVEMENT</span><b>{a.name}</b><i>{a.desc}</i></div>;
}

export function CloudBadge() {
  const c = useUI((s) => s.cloud);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!c) return undefined;
    setShow(true);
    if (c.state === 'saved' || c.state === 'synced') { const t = setTimeout(() => setShow(false), 2600); return () => clearTimeout(t); }
    return undefined;
  }, [c?.at]);
  if (!c || !show) return null;
  const icon = { saving: '☁…', pending: '☁…', syncing: '☁…', saved: '☁✓', synced: '☁✓', error: '☁!', conflict: '☁⇄' }[c.state] || '☁';
  return <div className={`v3-cloud ${c.state}`} title={c.msg}><b>{icon}</b><span>{c.msg}</span></div>;
}

export function RunTimerHud() {
  const show = useUI((s) => s.showRunTimer);
  const [, tick] = useState(0);
  useEffect(() => { if (!show) return undefined; const t = setInterval(() => tick((n) => n + 1), 100); return () => clearInterval(t); }, [show]);
  const run = g()?.mode?.name === 'campaign' ? g().progress?.run : null;
  if (!show || !run) return null;
  return <div className={`v3-runtimer ${run.done ? 'done' : ''}`}>{formatRunTime(run.done ? run.finishMs : run.storyMs)}</div>;
}
