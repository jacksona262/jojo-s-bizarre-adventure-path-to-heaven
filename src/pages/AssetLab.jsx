import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PARTS, ASSET_NOTES } from '@/game/assets/manifest';
import { instantiate } from '@/game/assets/AssetLibrary';
import * as Poses from '@/game/anim/Poses';
import { HorseAnimator } from '@/game/anim/HorseAnimator';

// QA tool: every manifest part side by side, with procedural animation applied.
const MODES = ['rest', 'idle', 'walk', 'run', 'punch', 'rush', 'guard', 'ride', 'dio'];

export default function AssetLab() {
  const mountRef = useRef(null);
  const [mode, setMode] = useState(new URLSearchParams(window.location.search).get('mode') || 'idle');
  const modeRef = useRef(mode);
  const [status, setStatus] = useState('loading…');
  const [only, setOnly] = useState(new URLSearchParams(window.location.search).get('part') || '');
  modeRef.current = mode;

  useEffect(() => {
    const el = mountRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x30343c);
    const cam = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.05, 500);
    cam.position.set(0, 2.5, 14);
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.target.set(0, 1, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 2.2);
    d.position.set(3, 6, 8);
    scene.add(d);
    scene.add(new THREE.GridHelper(80, 80, 0x666666, 0x444444));

    const keys = Object.keys(PARTS).filter((k) => !['streetProps', 'busShelter'].includes(k) && (!only || only.split(',').includes(k)));
    const items = [];
    const cols = Math.min(keys.length, 8);
    let done = 0;
    keys.forEach((k, i) => {
      instantiate(k).then((obj) => {
        const holder = new THREE.Group();
        holder.add(obj);
        holder.position.set((i % cols - (cols - 1) / 2) * 2.6, 0, -Math.floor(i / cols) * 3.2);
        scene.add(holder);
        const cv = document.createElement('canvas');
        cv.width = 256; cv.height = 48;
        const g = cv.getContext('2d');
        g.fillStyle = '#fff'; g.font = '22px sans-serif'; g.textAlign = 'center';
        g.fillText(k, 128, 32);
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
        spr.scale.set(1.6, 0.3, 1);
        spr.position.y = (PARTS[k].height || 2) + 0.35;
        holder.add(spr);
        const info = obj.userData.info;
        items.push({ k, obj, rig: obj.userData.rig, horse: info.horse ? new HorseAnimator(obj) : null });
        done += 1;
        setStatus(`${done}/${keys.length} loaded`);
      }).catch((e) => { console.error(k, e); setStatus(`error in ${k}: ${e.message}`); });
    });

    let raf;
    const clock = new THREE.Clock();
    let t = 0;
    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      t += dt;
      const m = modeRef.current;
      for (const it of items) {
        if (it.horse) {
          const gait = { rest: 0, idle: 0, walk: 1, run: 3, ride: 2 }[m] ?? 0;
          it.horse.update(dt, gait * 3.5, 0);
        }
        if (!it.rig) continue;
        let p;
        switch (m) {
          case 'rest': p = null; break;
          case 'walk': p = Poses.locomotion(t * 6, 1, t); break;
          case 'run': p = Poses.locomotion(t * 9, 2.2, t); break;
          case 'punch': p = Poses.punch((Math.floor(t / 0.6) % 2) ? 'L' : 'R', (t % 0.6) / 0.6); break;
          case 'rush': p = Poses.rush(t); break;
          case 'guard': p = Poses.block(); break;
          case 'ride': p = Poses.ride(t * 8, 1); break;
          case 'dio': p = Poses.dioPose(t); break;
          default: p = Poses.idle(t, PARTS[it.k].stand ? 'stand' : 'neutral');
        }
        if (p) it.rig.apply(p);
      }
      controls.update();
      renderer.render(scene, cam);
      raf = requestAnimationFrame(tick);
    };
    tick();
    const onResize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      cam.aspect = el.clientWidth / el.clientHeight;
      cam.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);
    window.__lab = { scene, cam, controls, items };
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [only]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#111' }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', top: 8, left: 8, color: '#fff', font: '13px sans-serif', background: 'rgba(0,0,0,.6)', padding: 8, maxWidth: 520 }}>
        <div style={{ marginBottom: 6 }}>Asset Lab — {status}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {MODES.map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} style={{ padding: '2px 8px', background: m === mode ? '#c9a227' : '#333', color: '#fff', border: 0 }}>{m}</button>
          ))}
        </div>
        <input value={only} onChange={(e) => setOnly(e.target.value)} placeholder="filter: part keys, comma separated" style={{ marginTop: 6, width: '100%', color: '#000' }} />
        <details style={{ marginTop: 6 }}><summary>Asset notes</summary><ul>{ASSET_NOTES.map((n) => <li key={n}>{n}</li>)}</ul></details>
      </div>
    </div>
  );
}
