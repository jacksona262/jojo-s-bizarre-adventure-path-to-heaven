import React, { useState } from 'react';
import { useNav } from './useNav';
import { Save } from '@/game/state/Save';
import { audio } from '@/game/core/Audio';
import { ui, useUI } from '@/game/core/Store';

const BASE_ITEMS = [
  { id: 'continue', label: 'Continue', hover: 'continue' },
  { id: 'new', label: 'New Game', hover: 'new' },
  { id: 'ngplus', label: 'New Game+', hover: 'new' },
  { id: 'versus', label: 'Versus', hover: 'versus' },
  { id: 'challenges', label: 'Challenges', hover: 'versus' },
  { id: 'hof', label: 'Hall of Fame', hover: 'credits' },
  { id: 'load', label: 'Load Game', hover: 'load' },
  { id: 'profile', label: 'Profile', hover: 'settings' },
  { id: 'settings', label: 'Settings', hover: 'settings' },
  { id: 'credits', label: 'Credits', hover: 'credits' },
];

export default function TitleMenu({ game }) {
  const hasSave = !!Save.latest();
  const account = useUI((s) => s.account);
  const completed = Save.list().some(({ data }) => data?.flags?.completed);
  const ITEMS = BASE_ITEMS.filter((it) => it.id !== 'ngplus' || completed);
  const [leaving, setLeaving] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const act = (i) => {
    const it = ITEMS[i];
    if (leaving) return;
    audio.init();
    if (it.id === 'continue') { if (!hasSave) return; audio.play('uiSelect'); setLeaving(true); game.continueGame(); }
    else if (it.id === 'new') {
      if (hasSave && !confirmNew) { setConfirmNew(true); audio.play('uiHover'); return; }
      setLeaving(true); game.newGame();
    } else if (it.id === 'versus') game.openVersusSelect();
    else if (it.id === 'load') { if (!hasSave) return; audio.play('uiSelect'); ui.set({ overlay: 'saves', savesMode: 'load', savesFrom: 'title' }); }
    else if (it.id === 'settings') { audio.play('uiSelect'); ui.set({ overlay: 'settings' }); }
    else if (it.id === 'ngplus') { audio.play('uiSelect'); setLeaving(true); game.newGamePlus(); }
    else if (it.id === 'challenges') { audio.play('uiSelect'); ui.set({ screen: 'challenges' }); }
    else if (it.id === 'hof') { audio.play('uiSelect'); ui.set({ screen: 'hallOfFame' }); }
    else if (it.id === 'profile') { audio.play('uiSelect'); ui.set({ overlay: 'profile' }); }
    else if (it.id === 'credits') { audio.play('uiSelect'); ui.set({ screen: 'credits', creditsFrom: 'title' }); }
  };
  const [index, setIndex] = useNav(ITEMS.length, act, {
    enabled: !leaving && !ui.get().overlay,
    initial: hasSave ? 0 : 1,
    onMove: (i) => { game.title?.setHover(ITEMS[i].hover); setConfirmNew(false); },
  });
  const hover = (i) => { setIndex(i); game.title?.setHover(ITEMS[i].hover); audio.play('uiHover'); };
  return (
    <>
      <div className="pth-vignette-left" />
      <div className={`pth-title-wrap ${leaving ? 'leaving' : ''}`} onMouseLeave={() => game.title?.setHover(null)}>
        <div className="pth-logo-top">JOJO&apos;S BIZARRE ADVENTURE</div>
        <div className="pth-logo-main">PATH TO<br />HEAVEN</div>
        <div className="pth-logo-rule" />
        <div className="pth-menu">
          {ITEMS.map((it, i) => {
            const disabled = (it.id === 'continue' || it.id === 'load') && !hasSave;
            const label = it.id === 'new' && confirmNew ? 'New Game · overwrite journey?' : it.id === 'profile' ? (account?.loggedIn ? `Profile · ${account.username || '…'}` : 'Sign In / Profile') : it.label;
            return (
              <button
                key={it.id}
                type="button"
                className={`pth-menu-item ${index === i ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                onMouseEnter={() => hover(i)}
                onFocus={() => hover(i)}
                onClick={() => act(i)}
                disabled={disabled}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="pth-menu-hint">Mouse, keyboard (W/S, Enter) or controller (D-Pad, A). Headphones recommended.</div>
        <div className="pth-title-foot">A fan-made tribute · All characters belong to Hirohiko Araki</div>
      </div>
    </>
  );
}
