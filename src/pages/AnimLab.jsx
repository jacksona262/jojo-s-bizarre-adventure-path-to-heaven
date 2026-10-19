import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PARTS } from '@/game/assets/manifest';
import { Character } from '@/game/actors/Character';
import * as Clips from '@/game/anim/Clips';
import * as Poses from '@/game/anim/Poses';

// Developer animation viewer: one character driven by the real in-game AnimController.
// Locomotion states move the character through a test terrain; clips can be scrubbed frame by
// frame with the striking limb's hitbox, active window and contact frame visualised.

const HUMANS = Object.keys(PARTS).filter((k) => PARTS[k].rig && PARTS[k].rig.type !== 'auto-horse');
const LOCO = {
  idle: [0, 0], 'idle (combat)': [0, 0], walk: [0, 2], jog: [0, 4.2], run: [0, 5.5], sprint: [0, 7],
  'strafe left': [2.6, 0], 'strafe right': [-2.6, 0], backpedal: [0, -2.4], 'diagonal fwd-left': [2.2, 2.2],
  'diagonal back-right': [-1.7, -1.7], 'turn in place': [0, 0], 'start/stop': [0, 0], jump: [0, 0], guard: [0, 0], float: [0, 0], 'float dash': [0, 6],
};
const CLIP_NAMES = Object.keys(Clips.ALL);
const SPECIAL = ['rush', 'hit front', 'hit back', 'hit left', 'hit right', 'heavy hit front', 'knockdown (back)', 'knockdown (front)', 'launch', 'death'];
const TERRAIN = {
  flat: () => 0,
  slope: (x, z) => z * 0.22,
  'side slope': (x) => x * 0.25,
  stairs: (x, z) => (z > 0 && z < 6 ? Math.floor(z / 0.45) * 0.17 : z >= 6 ? Math.floor(6 / 0.45) * 0.17 : 0),
  bumps: (x, z) => Math.sin(x * 1.3) * 0.12 + Math.sin(z * 0.9 + 1) * 0.15,
};

export default function AnimLab() {
  const mountRef = useRef(null);
  const qs = new URLSearchParams(window.location.search);
  const [part, setPart] = useState(qs.get('part') || 'dio');
  const [anim, setAnim] = useState(qs.get('anim') || 'walk');
  const [terrain, setTerrain] = useState(qs.get('terrain') || 'flat');
  const [rate, setRate] = useState(1);
  const [paused, setPaused] = useState(false);
  const [scrub, setScrub] = useState(0);
  const [skel, setSkel] = useState(false);
  const [ik, setIk] = useState(true);
  const [strip, setStrip] = useState(qs.has('strip'));
  const [view, setView] = useState(qs.get('view') || 'side');
  const [info, setInfo] = useState('');
  const S = useRef({});
  S.current.anim = anim; S.current.rate = rate; S.current.paused = paused; S.current.scrub = scrub; S.current.terrain = terrain; S.current.ik = ik;
  S.current.strip = strip; S.current.view = view;

  useEffect(() => {
    const el = mountRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x24272e);
    const cam = new THREE.PerspectiveCamera(38, el.clientWidth / el.clientHeight, 0.05, 300);
    const controls = new OrbitControls(cam, renderer.domElement);
    cam.position.set(4.2, 1.8, 3.2);
    controls.target.set(0, 1, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(4, 8, 6);
    scene.add(sun);

    // test terrain mesh
    const tg = new THREE.PlaneGeometry(60, 60, 240, 240);
    tg.rotateX(-Math.PI / 2);
    const terrainMesh = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: 0x5b5446, roughness: 0.95, flatShading: true }));
    scene.add(terrainMesh);
    const grid = new THREE.GridHelper(60, 120, 0x777777, 0x3a3a3a);
    grid.position.y = 0.002;
    scene.add(grid);
    let builtTerrain = '';
    const buildTerrain = () => {
      const fn = TERRAIN[S.current.terrain] || TERRAIN.flat;
      const pos = tg.attributes.position;
      for (let i = 0; i < pos.count; i += 1) pos.setY(i, fn(pos.getX(i), pos.getZ(i)));
      pos.needsUpdate = true;
      tg.computeVertexNormals();
      grid.visible = S.current.terrain === 'flat';
      builtTerrain = S.current.terrain;
    };

    // dummy target (capsule) for reach / hitbox tests
    const target = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.1, 4, 12), new THREE.MeshStandardMaterial({ color: 0x8090a0, transparent: true, opacity: 0.35 }));
    scene.add(target);
    const fakeTarget = { pos: new THREE.Vector3(0, 0, 1.5), radius: 0.42, height: 1.9, dead: false, chestWorld: (o = new THREE.Vector3()) => o.set(fakeTarget.pos.x, fakeTarget.pos.y + 1.3, fakeTarget.pos.z) };
    const hitSphere = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x44ff66, wireframe: true }));
    scene.add(hitSphere);

    const game = {
      clock: 0, engine: { camera: cam }, combat: null, time: null,
      world: { groundAt: (x, z) => (TERRAIN[S.current.terrain] || TERRAIN.flat)(x, z), collide() {}, waterAt: () => -1e9 },
    };
    let c = null; let helper = null; let disposed = false;
    const isStand = !!PARTS[part]?.stand;
    const ch = new Character(game, { partKey: part, height: PARTS[part]?.height || 1.9, style: part.startsWith('dio') ? 'dio' : isStand ? 'stand' : 'neutral' });
    ch.load().then(() => {
      if (disposed) return;
      c = ch;
      scene.add(c.group);
      helper = new THREE.SkeletonHelper(c.model);
      helper.visible = false;
      scene.add(helper);
    }).catch((e) => setInfo(`load error: ${e.message}`));

    const VIEWS = { side: [1, 0.12, 0], front: [0, 0.1, 1], back: [0, 0.15, -1], '3/4': [0.75, 0.25, 0.75] };
    const stripCam = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
    const placeCam = (camera, at, h, viewKey) => {
      const v = VIEWS[viewKey] || VIEWS.side;
      const dist = h * 2.9;
      camera.position.set(at.x + v[0] * dist, at.y + h * 0.55 + v[1] * dist, at.z + v[2] * dist);
      camera.lookAt(at.x, at.y + h * 0.5, at.z);
    };
    // Filmstrip: N phases of the current cycle/clip side by side in one frame.
    const renderStrip = () => {
      const N = 6;
      const W = el.clientWidth; const H = el.clientHeight;
      const name = S.current.anim;
      const fw = Math.floor(W / N);
      renderer.setScissorTest(true);
      renderer.setClearColor(0x24272e);
      const def = c.action?.def;
      const baseT = c.action ? c.action.t : 0;
      for (let i = 0; i < N; i += 1) {
        if (def) {
          const dur = def.dur > 50 ? 0.4 : def.dur;
          c.action.t = (i / (N - 1)) * dur;
        } else if (LOCO[name]) {
          c.anim.gait.u = i / N;
        } else if (c.knockdown > 0 || name.startsWith('knockdown') || name === 'launch') {
          c.knockdown = 1.75 * (1 - i / (N - 1)) + 0.0001;
        }
        c.anim.update(1e-6);
        c.group.updateMatrixWorld(true);
        stripCam.aspect = fw / H;
        stripCam.updateProjectionMatrix();
        placeCam(stripCam, c.pos, c.height, S.current.view);
        renderer.setViewport(i * fw, 0, fw, H);
        renderer.setScissor(i * fw, 0, fw, H);
        renderer.render(scene, stripCam);
      }
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, W, H);
      if (c.action) c.action.t = baseT;
    };
    const clock = new THREE.Clock();
    let t = 0; let yaw = 0; let animT = 0; let lastAnim = ''; let infoT = 0;
    const tick = () => {
      if (disposed) return;
      requestAnimationFrame(tick);
      if (builtTerrain !== S.current.terrain) buildTerrain();
      let dt = Math.min(clock.getDelta(), 0.05) * S.current.rate;
      if (S.current.paused) dt = 0;
      t += dt; game.clock = t;
      if (c?.anim) {
        const name = S.current.anim;
        if (name !== lastAnim) {
          lastAnim = name; animT = 0; yaw = 0;
          c.dead = false; c.knockdown = 0; c.action = null; c.guarding = false; c.floating = isStand || name.startsWith('float');
          c.pos.set(0, 0, 0); c.vel.set(0, 0, 0); c.anim.prevPos.copy(c.pos); c.anim.reaction = null; c.anim.launched = false;
          c.anim.gait.reset();
        }
        animT += dt;
        const fn = TERRAIN[S.current.terrain] || TERRAIN.flat;
        c.anim.ikEnabled = S.current.ik;
        c.onGround = true; c.vel.y = 0;
        c.combatStance = () => name === 'idle (combat)' || name === 'guard' || name.startsWith('strafe') || name.startsWith('backpedal') || name.startsWith('diagonal');
        let vx = 0; let vz = 0;
        if (LOCO[name]) {
          [vx, vz] = LOCO[name];
          if (name === 'turn in place') yaw = Math.sin(animT * 0.8) * 1.6;
          if (name === 'start/stop') { const ph = animT % 4; vz = ph < 2 ? 5.5 : 0; }
          if (name === 'jump') {
            const ph = animT % 1.6;
            const h = ph < 0.8 ? Math.sin(ph / 0.8 * Math.PI) * 0.9 : 0;
            c.onGround = ph >= 0.8; c.vel.y = ph < 0.8 ? Math.cos(ph / 0.8 * Math.PI) * 6 : 0;
            c.pos.y = fn(c.pos.x, c.pos.z) + h;
          }
          c.guarding = name === 'guard';
          const fx = Math.sin(yaw); const fz = Math.cos(yaw);
          c.pos.x += (fx * vz + fz * vx) * dt;
          c.pos.z += (fz * vz - fx * vx) * dt;
          if (Math.hypot(c.pos.x, c.pos.z) > 14) { c.pos.set(0, 0, 0); c.anim.prevPos.copy(c.pos); }
          c.action = null;
        } else if (CLIP_NAMES.includes(name) || name === 'rush') {
          const clip = Clips.ALL[name];
          const dur = clip ? clip.dur : 1.2;
          const tt = S.current.paused ? S.current.scrub * dur : animT % (dur + 0.35);
          if (!c.action || c.action.def.name !== name) c.action = { def: clip ? { name, clip, dur } : { name, rush: true, rate: 15, dur: 99 }, t: 0, opts: {}, data: { target: fakeTarget, aim: new THREE.Vector3(), aimL: new THREE.Vector3(), aimR: new THREE.Vector3() } };
          c.action.t = Math.min(tt, dur);
          fakeTarget.chestWorld(c.action.data.aim);
          fakeTarget.chestWorld(c.action.data.aimL).add(new THREE.Vector3(0.15, Math.sin(animT * 7) * 0.2, 0));
          fakeTarget.chestWorld(c.action.data.aimR).add(new THREE.Vector3(-0.15, Math.cos(animT * 6) * 0.2, 0));
          if (/knockdown|getUp|death|stagger|guard/.test(name)) c.action.data.aim = null;
        } else {
          c.action = null;
          const cyc = animT % 3.2;
          if (name.startsWith('hit') || name.startsWith('heavy hit')) {
            if (cyc < dt * 1.01 || (animT < 0.05 && cyc < 0.05)) {
              // direction the blow travels, in the victim's frame (+Z forward, +X left)
              const d = name.endsWith('front') ? [0, -1] : name.endsWith('back') ? [0, 1] : name.endsWith('left') ? [-1, 0] : [1, 0];
              c.anim.hit(new THREE.Vector3(d[0], 0, d[1]), name.startsWith('heavy') ? 2.6 : 1.2);
            }
          } else if (name.startsWith('knockdown') || name === 'launch') {
            c.knockTotal = 1.75; c.knockdown = Math.max(0, 1.75 - cyc);
            if (cyc < 0.02) c.anim.knock(new THREE.Vector3(0, 0, name.includes('front') ? 1 : -1));
            if (name === 'launch') { c.anim.launched = cyc < 0.6; c.onGround = cyc > 0.6; c.pos.y = cyc < 0.6 ? Math.sin(cyc / 0.6 * Math.PI) * 1.4 : fn(c.pos.x, c.pos.z); }
          } else if (name === 'death') {
            c.dead = cyc < 3; if (cyc < 0.02) c.anim.deathT = 0;
          }
        }
        if (!(name === 'jump' || name === 'launch')) c.pos.y = c.floating ? 0.4 : fn(c.pos.x, c.pos.z);
        c.yaw = yaw; c.group.rotation.y = yaw;
        c.t += dt;
        c.anim.update(dt || 1e-6);
        // follow camera
        controls.target.lerp(new THREE.Vector3(c.pos.x, c.pos.y + 1, c.pos.z), 0.15);
        // hitbox / target visualisation
        const def = c.action?.def;
        const clip = def?.clip;
        target.visible = !!def;
        fakeTarget.pos.set(c.pos.x + Math.sin(yaw) * 1.55, c.pos.y, c.pos.z + Math.cos(yaw) * 1.55);
        target.position.set(fakeTarget.pos.x, fakeTarget.pos.y + 0.95, fakeTarget.pos.z);
        hitSphere.visible = !!clip?.limb;
        if (clip?.limb) {
          const limb = clip.limb;
          const p = c.jointWorld(limb, new THREE.Vector3());
          const par = c.jointWorld(limb === 'handL' ? 'foreArmL' : limb === 'handR' ? 'foreArmR' : limb === 'footL' ? 'shinL' : 'shinR', new THREE.Vector3());
          const d = p.clone().sub(par); if (d.length() > 1e-4) p.addScaledVector(d.normalize(), 0.09 * c.height / 1.9);
          hitSphere.position.copy(p);
          hitSphere.scale.setScalar((c.floating ? 0.26 : 0.2) * c.height / 1.9);
          const t01 = c.action.t / def.dur;
          const active = t01 >= clip.active[0] && t01 <= clip.active[1];
          const contact = Math.abs(t01 - clip.contact) < 0.035;
          hitSphere.material.color.set(contact ? 0xff3030 : active ? 0x44ff66 : 0x777777);
        }
        if (helper) helper.visible = skelRef.current;
        infoT -= dt || 0.016;
        if (infoT <= 0) {
          infoT = 0.15;
          const t01 = def ? (c.action.t / def.dur) : 0;
          setInfo(`${c.anim.state} | t=${t01.toFixed(2)}${clip ? ` active ${clip.active[0]}-${clip.active[1]} contact ${clip.contact}` : ''} | speed ${Math.hypot(c.anim.vLocal.x, c.anim.vLocal.z).toFixed(1)} m/s | phase ${c.anim.gait.u.toFixed(2)} | springs ${c.anim.springs.joints.length} | face ${c.anim.face.bones.length}`);
        }
      }
      if (c?.anim && S.current.strip) { renderStrip(); return; }
      if (c && S.current.view !== 'free') {
        cam.setViewOffset(el.clientWidth, el.clientHeight, -190, 0, el.clientWidth, el.clientHeight);
        placeCam(cam, c.pos, c.height, S.current.view);
        controls.target.set(c.pos.x, c.pos.y + c.height * 0.5, c.pos.z);
      } else controls.update();
      renderer.render(scene, cam);
    };
    tick();
    const onResize = () => { renderer.setSize(el.clientWidth, el.clientHeight); cam.aspect = el.clientWidth / el.clientHeight; cam.updateProjectionMatrix(); };
    window.addEventListener('resize', onResize);
    window.__animlab = { scene, cam, controls, get c() { return c; }, Poses };
    return () => { disposed = true; window.removeEventListener('resize', onResize); renderer.dispose(); el.removeChild(renderer.domElement); };
  }, [part]);

  const skelRef = useRef(skel);
  skelRef.current = skel;
  const btn = (on) => ({ padding: '2px 7px', margin: 2, background: on ? '#c9a227' : '#333', color: '#fff', border: 0, cursor: 'pointer', font: '12px sans-serif' });
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#111' }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', top: 8, left: 8, color: '#fff', font: '12px sans-serif', background: 'rgba(0,0,0,.72)', padding: 8, width: 360, maxHeight: '94vh', overflow: 'auto' }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Animation Viewer (dev)</div>
        <select value={part} onChange={(e) => setPart(e.target.value)} style={{ color: '#000', width: '100%' }}>
          {HUMANS.map((k) => <option key={k} value={k}>{PARTS[k].label} ({k})</option>)}
        </select>
        <div style={{ marginTop: 6, opacity: 0.7 }}>Locomotion</div>
        <div>{Object.keys(LOCO).map((n) => <button key={n} type="button" style={btn(anim === n)} onClick={() => setAnim(n)}>{n}</button>)}</div>
        <div style={{ marginTop: 6, opacity: 0.7 }}>Clips</div>
        <div>{CLIP_NAMES.map((n) => <button key={n} type="button" style={btn(anim === n)} onClick={() => setAnim(n)}>{n}</button>)}</div>
        <div style={{ marginTop: 6, opacity: 0.7 }}>Reactions</div>
        <div>{SPECIAL.map((n) => <button key={n} type="button" style={btn(anim === n)} onClick={() => setAnim(n)}>{n}</button>)}</div>
        <div style={{ marginTop: 6, opacity: 0.7 }}>Terrain</div>
        <div>{Object.keys(TERRAIN).map((n) => <button key={n} type="button" style={btn(terrain === n)} onClick={() => setTerrain(n)}>{n}</button>)}</div>
        <div style={{ marginTop: 6 }}>
          speed {rate.toFixed(2)}× <input type="range" min="0.05" max="2" step="0.05" value={rate} onChange={(e) => setRate(+e.target.value)} />
        </div>
        <div>
          <button type="button" style={btn(paused)} onClick={() => setPaused(!paused)}>{paused ? 'paused' : 'pause'}</button>
          <button type="button" style={btn(skel)} onClick={() => setSkel(!skel)}>skeleton</button>
          <button type="button" style={btn(ik)} onClick={() => setIk(!ik)}>IK</button>
          <button type="button" style={btn(strip)} onClick={() => setStrip(!strip)}>filmstrip</button>
        </div>
        <div>view {['side', 'front', 'back', '3/4', 'free'].map((v) => <button key={v} type="button" style={btn(view === v)} onClick={() => setView(v)}>{v}</button>)}</div>
        {paused && <div>scrub <input type="range" min="0" max="1" step="0.005" value={scrub} onChange={(e) => setScrub(+e.target.value)} style={{ width: 240 }} /> {scrub.toFixed(3)}</div>}
        <div style={{ marginTop: 6, color: '#ffd780' }}>{info}</div>
        <div style={{ marginTop: 4, opacity: 0.6 }}>Hitbox: grey = startup/recovery, green = active, red = contact frame.</div>
      </div>
    </div>
  );
}
