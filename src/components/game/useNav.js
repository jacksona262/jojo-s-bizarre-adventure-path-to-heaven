import { useEffect, useRef, useState } from 'react';
import { audio } from '@/game/core/Audio';

// Keyboard/controller navigation for menus. Polls the game's unified input each frame.
export function useNav(count, onSelect, { enabled = true, onBack = null, initial = 0, onMove = null, horizontal = false } = {}) {
  const [index, setIndex] = useState(initial);
  const ref = useRef({ index, count, onSelect, onBack, onMove });
  ref.current = { index, count, onSelect, onBack, onMove };
  useEffect(() => {
    if (!enabled) return undefined;
    let raf;
    const mountedAt = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const g = window.__game;
      if (!g) return;
      // the key press that opened this menu must not also act inside it
      if (performance.now() - mountedAt < 200) return;
      const inp = g.input;
      const r = ref.current;
      const prev = horizontal ? 'left' : 'up';
      const next = horizontal ? 'right' : 'down';
      // menu nav must not fire on WASD while typing into inputs
      if (document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      if (inp.pressed(prev)) { const i = (r.index - 1 + r.count) % r.count; setIndex(i); r.onMove?.(i); audio.play('uiHover'); }
      if (inp.pressed(next)) { const i = (r.index + 1) % r.count; setIndex(i); r.onMove?.(i); audio.play('uiHover'); }
      if (inp.pressed('confirm')) { r.onSelect?.(r.index); }
      if (inp.pressed('back') && r.onBack) r.onBack();
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [enabled, horizontal]);
  return [index, setIndex];
}
