import * as THREE from 'three';
import { Character } from '../actors/Character';
import * as Poses from '../anim/Poses';

// The homepage: DIO seen from behind on a black void, left hand at his jaw, head turned to his
// left, blond hair moving in a slow wind. A warm key light sculpts his back from above-left and a
// rim light catches the hair from beyond him; there is no visible light source and nothing else in
// frame. He stands on the left of the screen; the menu lives in the dark on the right. The scene
// renders on its own (the world is never drawn behind the menu), so it is cheap and loads fast.

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// Framing and lighting, relative to DIO (he faces -z; +x is his right). Exposed as `title.cfg` so
// the shot can be adjusted live from the console while developing.
const CFG = {
  camX: -0.22, camY: 1.66, dist: 1.08, lookY: 1.64, fov: 40,
  screenX: 0.37,                    // where DIO sits across the screen (0 = left edge)
  refAspect: 1.78,                  // `dist` frames him for 16:9; narrower screens pull back to keep his width
  portrait: { dist: 2.45, camY: 1.4, lookY: 1.2 },   // phones: he fills the top half, the menu sits below
  key: { x: -1.8, y: 3.2, z: 2.1, i: 18 },
  rim: { x: 1.35, y: 2.6, z: -1.8, i: 14 },
  kick: { x: -1.6, y: 1.4, z: -1.2, i: 4 },
  fill: 0.04,
  bloom: { strength: 0.22, threshold: 0.92 },   // only a whisper of glow on the hair, no haze
  pose: { neck: 0.4, head: 0.62, pitch: 0.14, roll: -0.08, chest: 0.12 },
  // left arm: upper arm hanging down and out, forearm rising so the fingers rest on his cheek
  arm: { ua: [0.4, -0.85, 0.3], fa: [-0.3, 0.7, 0.62], hand: [0.4, -0.9, -0.9] },
};

export class TitleScene {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.hover = null;
    this.hoverK = 0;
    this.ready = false;
    this.cfg = JSON.parse(JSON.stringify(CFG));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.085);
    this.balcony = null;   // no world focus: the world keeps streaming around Ebon in the background
  }

  async load() {
    const g = this.game;
    const s = this.scene;
    // DIO: a real Character so he gets the animation controller (hair springs, blinking)
    this.dio = new Character(g, { partKey: 'dioHome', name: 'DIO', style: 'dio', height: 1.95 });
    await this.dio.load();
    this.dio.yaw = Math.PI;      // his back to the camera
    this.dio.group.rotation.y = this.dio.yaw;
    this.dio.override = (t) => this._pose(t);
    s.add(this.dio.group);
    if (this.dio.anim?.springs) this.dio.anim.springs.wind = new THREE.Vector3();

    // a floor the key light barely reaches, fading into the black: just enough to place him
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x18171b, roughness: 0.96, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);

    const C = this.cfg;
    this.hemi = new THREE.HemisphereLight(0x2a2630, 0x000000, C.fill);
    s.add(this.hemi);
    // key: warm, high and to his left on the camera side, carving the shoulder blades and the raised arm
    this.key = new THREE.SpotLight(0xffe4c4, C.key.i, 12, 0.55, 0.9, 1.3);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.bias = -0.0004;
    s.add(this.key, this.key.target);
    // rim: from beyond him on the right, outlining the hair and the far edge of the back
    this.rim = new THREE.SpotLight(0xffd88a, C.rim.i, 10, 0.5, 0.85, 1.4);
    s.add(this.rim, this.rim.target);
    // kicker: a faint cool edge on his left so the raised arm separates from the dark
    this.kick = new THREE.SpotLight(0xb8c4ff, C.kick.i, 8, 0.6, 0.9, 1.5);
    s.add(this.kick, this.kick.target);

    // render this scene instead of the world while the title is up, with a softer bloom
    this.prevScene = g.engine.renderPass.scene;
    g.engine.renderPass.scene = s;
    const b = g.engine.bloom;
    if (b) { this.prevBloom = { strength: b.strength, threshold: b.threshold }; b.strength = C.bloom.strength; b.threshold = C.bloom.threshold; }
    this.ready = true;
  }

  dispose() {
    const g = this.game;
    if (this.prevScene) g.engine.renderPass.scene = this.prevScene;
    if (this.prevBloom && g.engine.bloom) Object.assign(g.engine.bloom, this.prevBloom);
    this.dio?.remove();
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material?.map) o.material.map.dispose(); });
  }

  setHover(h) { this.hover = h; }

  // From behind: shoulders nearly square to the lens, weight on the right leg, chest turned a touch
  // to his left, head turned left and dipped, the left hand brought up to his cheek.
  _pose(t) {
    const P = this.cfg.pose;
    const A = this.cfg.arm;
    const p = Poses.idle(t, 'dio');
    const br = Math.sin(t * 1.2);
    const look = Math.sin(t * 0.21) * 0.04;
    p.hips = [0, -0.05, 0.06];
    p.rootOff = [-0.03, 0];
    p.spine = [-0.04, P.chest * 0.5, -0.04];
    p.chest = [-0.08 + br * 0.012, P.chest, -0.04];
    p.neck = [P.pitch * 0.5, P.neck + look * 0.4, P.roll * 0.5];
    p.head = [P.pitch + Math.sin(t * 0.37) * 0.015, P.head + look, P.roll];
    const hb = Math.sin(t * 0.9) * 0.012;   // the hand drifts with his breathing
    p.uaL = [A.ua[0], A.ua[1] + hb, A.ua[2]]; p.faL = A.fa;
    p.handL = A.hand;
    p.uaR = [-0.22, -0.95, -0.06]; p.faR = [-0.1, -0.92, 0.25];
    p.thR = [-0.06, -1, 0.04]; p.shR = [-0.04, -1, -0.03];
    p.thL = [0.15, -1, -0.1]; p.shL = [0.08, -1, -0.18];
    return p;
  }

  update(dt, realDt) {
    if (!this.ready) return;
    const g = this.game;
    const C = this.cfg;
    this.t += realDt;
    const t = this.t;
    this.hoverK += ((this.hover ? 1 : 0) - this.hoverK) * Math.min(1, realDt * 2.5);

    // a slow wind from his left lifts the hair to the right
    const wind = this.dio.anim?.springs?.wind;
    if (wind) {
      const gust = 0.5 + 0.5 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1.3);
      wind.set(1.4 + gust * 2.2, 0.5 + gust * 0.6, 0.5 + Math.sin(t * 1.7) * 0.4);
    }
    this.dio.update(realDt);

    const rig = this.dio.rig;
    const head = rig ? rig.jointWorld('head', _v) : _v.set(0, 1.78, 0);

    // lights follow DIO (placed relative to him)
    const d = this.dio.pos;
    const place = (L, o, tgt) => { L.position.set(d.x + o.x, d.y + o.y, d.z + o.z); L.target.position.copy(tgt); L.intensity = o.i; };
    place(this.key, C.key, _v2.set(d.x, d.y + 1.45, d.z));
    place(this.rim, C.rim, head);
    place(this.kick, C.kick, _v2.set(d.x, d.y + 1.5, d.z));
    this.hemi.intensity = C.fill;
    if (this.hover === 'new' || this.hover === 'continue') this.key.intensity += 8 * this.hoverK;

    // camera: behind him and a touch to his left, so more of the raised arm's side of the back shows.
    // DIO sits on the left of wide screens (the menu is on the right); portrait screens centre him.
    const aspect = g.engine.camera.aspect || 1.6;
    const portrait = aspect < 0.85;
    // on any landscape screen he keeps the same share of the width, so the right ~44% (the menu
    // column) stays clear; portrait screens centre him behind the overlaid menu
    const sx = portrait ? 0.5 : C.screenX;
    const dist = portrait ? C.portrait.dist : C.dist * Math.max(1, C.refAspect / aspect);
    const camY = portrait ? C.portrait.camY : C.camY;
    const lookY = portrait ? C.portrait.lookY : C.lookY;
    const fov = C.fov + (this.hover === 'credits' ? 3 * this.hoverK : 0) - (this.hover === 'new' || this.hover === 'continue' ? 1.5 * this.hoverK : 0);
    const halfW = dist * Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect;
    const lookX = (0.5 - sx) * 2 * halfW;
    const drift = Math.sin(t * 0.17) * 0.03;
    const px = d.x + C.camX + drift; const py = d.y + camY + Math.sin(t * 0.23) * 0.012; const pz = d.z + dist;
    if (this.debugShot) { g.camera.setCinematic(this.debugShot.pos, this.debugShot.look, this.debugShot.fov); return; }
    g.camera.setCinematic(_v.set(px, py, pz), _v2.set(d.x + lookX + drift, d.y + lookY, d.z), fov);
  }
}
