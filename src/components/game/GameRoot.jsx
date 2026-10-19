import React, { useEffect, useRef, useState } from 'react';
import './game.css';
import { Game } from '@/game/Game';
import { useUI, ui } from '@/game/core/Store';
import { CREDITS } from '@/game/story/Script';
import { ASSET_NOTES } from '@/game/assets/manifest';
import { audio } from '@/game/core/Audio';
import TitleMenu from './TitleMenu';
import Hud from './Hud';
import Minigames from './Minigames';
import VersusSelect from './VersusSelect';
import { PauseMenu, SettingsPanel, Journal, RegionMap, Upgrades, Saves, Death, Results, ChoiceNav } from './Overlays';

function Loading() {
  const l = useUI((s) => s.loading);
  if (!l) return null;
  const a = l.assets;
  const p = Math.max(l.progress || 0, a && a.total ? (a.loaded / a.total) * 0.9 : 0);
  return (
    <div className="pth-loading">
      <div className="pth-loading-glyph">✦</div>
      <div className="pth-loading-label">{l.label}</div>
      <div className="pth-loading-bar"><i style={{ width: `${Math.round(p * 100)}%` }} /></div>
      {a && a.total > 0 && <div style={{ marginTop: 10, fontSize: 13, opacity: 0.5, fontFamily: 'Cinzel', letterSpacing: '0.2em' }}>{a.loaded} / {a.total} MODELS</div>}
    </div>
  );
}

function Credits({ game }) {
  const from = useUI((s) => s.creditsFrom);
  const done = async () => {
    ui.set({ creditsFrom: null });
    if (from === 'title') ui.set({ screen: 'title' });
    else { await game.toTitle(); }
  };
  useEffect(() => {
    const t = setTimeout(done, 47000);
    let raf;
    const loop = () => { raf = requestAnimationFrame(loop); if (game.input.pressed('skip') || game.input.pressed('back')) done(); };
    loop();
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div className="pth-credits" onClick={done}>
      <div className="pth-credits-roll">
        {CREDITS.map(([a, b], i) => (
          <div key={a} style={{ marginBottom: i === 0 ? 120 : 70 }}>
            <div style={{ fontFamily: i === 0 ? 'Cinzel Decorative, Cinzel' : 'Cinzel', fontSize: i === 0 ? 46 : 18, letterSpacing: i === 0 ? '0.06em' : '0.3em', color: '#d8b45a' }}>{a}</div>
            <div style={{ fontSize: i === 0 ? 30 : 21, marginTop: 10, color: '#efe4cc', maxWidth: 760, marginLeft: 'auto', marginRight: 'auto' }}>{b}</div>
          </div>
        ))}
        <div style={{ fontFamily: 'Cinzel', fontSize: 16, letterSpacing: '0.3em', color: '#d8b45a', marginBottom: 20 }}>ABOUT THE MODELS</div>
        <div style={{ maxWidth: 760, margin: '0 auto', fontSize: 17, lineHeight: 1.55, opacity: 0.8 }}>{ASSET_NOTES.map((n) => <p key={n} style={{ marginBottom: 10 }}>{n}</p>)}</div>
      </div>
      <div style={{ position: 'absolute', right: 24, bottom: 20, fontFamily: 'Cinzel', fontSize: 12, letterSpacing: '0.2em', opacity: 0.5 }}>SKIP</div>
    </div>
  );
}

export default function GameRoot() {
  const mountRef = useRef(null);
  const [game, setGame] = useState(null);
  const [error, setError] = useState(null);
  const screen = useUI((s) => s.screen);
  const overlay = useUI((s) => s.overlay);
  const minigame = useUI((s) => s.minigame);

  useEffect(() => {
    let g;
    try {
      g = new Game(mountRef.current);
      setGame(g);
      g.boot().catch((e) => { console.error(e); setError(e.message || String(e)); });
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
    }
    const unlock = () => audio.init();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => { g?.dispose(); };
  }, []);

  // click on the canvas captures the pointer during gameplay
  const onCanvasClick = () => {
    if (!game) return;
    audio.init();
    if ((screen === 'game' || screen === 'versus') && !overlay && !minigame) game.input.requestLock();
  };

  return (
    <div className="pth-root">
      <div ref={mountRef} className="pth-canvas" onClick={onCanvasClick} />
      {game && (screen === 'game' || screen === 'versus') && <Hud />}
      {game && (screen === 'game' || screen === 'versus') && <ChoiceNav />}
      {game && screen === 'title' && !overlay && <div className="pth-ui"><TitleMenu game={game} /></div>}
      {game && screen === 'versusSelect' && <div className="pth-ui"><VersusSelect game={game} /></div>}
      {game && screen === 'credits' && <Credits game={game} />}
      <div className="pth-ui">
        {game && overlay === 'pause' && <PauseMenu />}
        {game && overlay === 'settings' && <SettingsPanel />}
        {game && overlay === 'journal' && <Journal />}
        {game && overlay === 'map' && <RegionMap />}
        {game && overlay === 'upgrades' && <Upgrades />}
        {game && overlay === 'saves' && <Saves />}
        {game && overlay === 'death' && <Death />}
        {game && overlay === 'results' && <Results />}
        {game && minigame && <Minigames />}
      </div>
      {(screen === 'boot' || screen === 'loading') && <Loading />}
      {error && (
        <div className="pth-overlay">
          <div className="pth-panel" style={{ padding: 28, maxWidth: 620 }}>
            <div className="pth-h1">The storm failed to rise</div>
            <div style={{ marginTop: 12, fontSize: 18 }}>{error}</div>
            <div style={{ marginTop: 12, fontSize: 15, opacity: 0.7 }}>This game needs WebGL 2. Try a desktop browser with hardware acceleration enabled.</div>
          </div>
        </div>
      )}
    </div>
  );
}
