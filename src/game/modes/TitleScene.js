import * as THREE from 'three';
import { Character } from '../actors/Character';
import * as Poses from '../anim/Poses';
import { audio } from '../core/Audio';

// The homepage: DIO seen from behind in three-quarter view on a near-black void, head turned
// back over his right shoulder, right hand raised to his face, blond hair lifting in a slow wind.
// A gold rim light carves him out of the dark; gold dust drifts; the camera breathes. It renders
// in its own scene (the world is never drawn behind the menu), so it is cheap and loads fast.
// Menu hovers change the staging: Versus summons a gold silhouette of The World behind him.

const BG = 0x050408;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.45, outer);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class TitleScene {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.hover = null;
    this.hoverK = 0;
    this.standK = 0;
    this.ready = false;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG);
    this.scene.fog = new THREE.FogExp2(BG, 0.075);
    this.balcony = null;   // no world focus: the world keeps streaming around Ebon in the background
  }

  async load() {
    const g = this.game;
    const s = this.scene;
    // DIO: a real Character so he gets the animation controller (hair springs, blinking)
    this.dio = new Character(g, { partKey: 'dioHome', name: 'DIO', style: 'dio', height: 1.95 });
    await this.dio.load();
    // three-quarter back view: the camera sits at his back-right (135 degrees from his facing)
    this.dio.yaw = 2.88;
    this.dio.group.rotation.y = this.dio.yaw;
    this.dio.override = (t) => this._pose(t);
    s.add(this.dio.group);
    // a gentle wind through the hair
    if (this.dio.anim?.springs) this.dio.anim.springs.wind = new THREE.Vector3();

    this.world = new Character(g, { partKey: 'theWorld', name: 'The World', style: 'stand', height: 2.3, floating: true });
    await this.world.load();
    for (const m of this.world.materials) {
      m.transparent = true; m.opacity = 0; m.depthWrite = false;
      if (m.color) m.color.lerp(new THREE.Color(0xffd36a), 0.55);
      if (m.emissive) { m.emissive.set(0x6a4a10); m.emissiveIntensity = 1; m.userData.baseEmissive = m.emissive.clone(); }
    }
    this.world.group.visible = false;
    this.world.override = (t) => Poses.crossArms(t);
    s.add(this.world.group);

    // lighting: gold rim from beyond him, cool soft key on the turned face, faint fill
    s.add(new THREE.HemisphereLight(0x221c2a, 0x020203, 0.1));
    this.rim = new THREE.SpotLight(0xffc066, 95, 14, 0.62, 0.85, 1.4);
    this.rim.position.set(-1.1, 3.4, -2.6);
    s.add(this.rim, this.rim.target);
    this.rim2 = new THREE.SpotLight(0xffb050, 16, 12, 0.5, 0.9, 1.4);
    this.rim2.position.set(2.2, 2.2, -2.0);
    s.add(this.rim2, this.rim2.target);
    this.face = new THREE.SpotLight(0xd8e0ff, 20, 10, 0.2, 0.85, 1.5);
    this.face.position.set(0.7, 2.25, 1.5);
    s.add(this.face, this.face.target);
    this.hairGlow = new THREE.PointLight(0xffd27a, 1.1, 2.2, 2);
    s.add(this.hairGlow);

    // backlight halo and a low, dark floor haze
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,196,96,0.55)', 'rgba(150,80,20,0.12)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.halo.scale.set(4.6, 4.6, 1);
    this.halo.position.set(-0.35, 1.75, -2.2);
    s.add(this.halo);
    this.menace = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(150,60,220,0.5)', 'rgba(60,10,90,0.12)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false }));
    this.menace.scale.set(5.5, 5.5, 1);
    this.menace.position.set(-1.1, 1.8, -1.6);
    s.add(this.menace);

    // drifting gold dust
    const N = 220;
    const pos = new Float32Array(N * 3);
    this.dustSeed = new Float32Array(N);
    for (let i = 0; i < N; i += 1) {
      pos[i * 3] = (Math.random() - 0.5) * 6;
      pos[i * 3 + 1] = Math.random() * 3.6;
      pos[i * 3 + 2] = -2.5 + Math.random() * 4.5;
      this.dustSeed[i] = Math.random() * 100;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dust = new THREE.Points(dg, new THREE.PointsMaterial({
      color: 0xffcf73, size: 0.022, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    this.dust = dust;
    s.add(dust);

    // render this scene instead of the world while the title is up
    this.prevScene = g.engine.renderPass.scene;
    g.engine.renderPass.scene = s;
    this.ready = true;
  }

  dispose() {
    const g = this.game;
    if (this.prevScene) g.engine.renderPass.scene = this.prevScene;
    this.dio?.remove();
    this.world?.remove();
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material?.map) o.material.map.dispose(); });
  }

  setHover(h) {
    if (h === this.hover) return;
    this.hover = h;
    if (h === 'versus') {
      this.world.group.visible = true;
      audio.play('summon');
    }
  }

  // DIO's pose: back three-quarter to the camera, head turned over the right shoulder,
  // right hand raised to the face (placed exactly by IK after the pose is applied).
  _pose(t) {
    const p = Poses.idle(t, 'dio');
    const br = Math.sin(t * 1.25);
    const look = Math.sin(t * 0.21) * 0.05;
    // weight on the left leg: hips roll and shift, chest counter-tilts (contrapposto)
    p.hips = [0, 0.06, -0.07];
    p.rootOff = [0.035, 0];
    p.spine = [-0.05, -0.14, 0.06];
    p.chest = [-0.1 + br * 0.012, -0.26, 0.05];
    p.neck = [0.08, -0.62 + look * 0.4, 0.02];
    p.head = [0.16 + Math.sin(t * 0.37) * 0.02, -0.98 + look, 0.16];
    p.uaR = [-0.55, -0.15, 0.82]; p.faR = [0.5, 0.75, 0.2];
    p.handR = [-0.6, 0.35, 0.5];
    p.uaL = [0.32, -0.9, -0.12]; p.faL = [0.12, -0.75, 0.45];
    p.thL = [0.06, -1, 0.04]; p.shL = [0.04, -1, -0.03];
    p.thR = [-0.16, -1, -0.12]; p.shR = [-0.08, -1, -0.2];
    if (this.hover === 'versus') {
      const k = this.hoverK;
      p.chest = [p.chest[0] - 0.06 * k, p.chest[1] - 0.08 * k, p.chest[2]];
      p.head = [p.head[0] - 0.08 * k, p.head[1], p.head[2]];
    }
    return p;
  }

  update(dt, realDt) {
    if (!this.ready) return;
    const g = this.game;
    this.t += realDt;
    const t = this.t;
    this.hoverK += ((this.hover ? 1 : 0) - this.hoverK) * Math.min(1, realDt * 2.5);

    // wind gusts through the hair and coat
    const wind = this.dio.anim?.springs?.wind;
    if (wind) {
      const gust = 0.5 + 0.5 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1.3);
      wind.set(1.6 + gust * 2.4, 0.6 + gust * 0.8, 0.8 + Math.sin(t * 1.9) * 0.6);
    }
    this.dio.update(realDt);
    // hand to the face: the wrist lands beside the right cheek, fingers towards the temple
    const rig = this.dio.rig;
    if (rig) {
      const head = rig.jointWorld('head', _v);
      const fx = Math.sin(this.dio.yaw); const fz = Math.cos(this.dio.yaw);
      const rx = -fz; const rz = fx;   // character's right
      _v2.set(head.x + rx * 0.09 + fx * 0.1, head.y + 0.08 + Math.sin(t * 0.9) * 0.006, head.z + rz * 0.09 + fz * 0.1);
      rig.reach('R', 'arm', _v2, 1, new THREE.Vector3(-0.8, -0.45, -0.25));
    }

    // The World answers the Versus hover
    const wantStand = this.hover === 'versus';
    this.standK += ((wantStand ? 1 : 0) - this.standK) * Math.min(1, realDt * 3);
    if (this.world.group.visible) {
      this.world.pos.set(-0.95, 0.25 + Math.sin(t * 2) * 0.04, -0.75);
      this.world.yaw = Math.PI + 0.35;
      this.world.group.rotation.y = this.world.yaw;
      this.world.group.scale.setScalar(0.85 + 0.15 * this.standK);
      for (const m of this.world.materials) m.opacity = this.standK * 0.55;
      this.world.update(realDt);
      if (this.standK < 0.01 && !wantStand) this.world.group.visible = false;
    }
    this.menace.material.opacity = this.standK * 0.5;

    // lights track the head; the rim breathes like a distant storm
    const head = rig ? rig.jointWorld('head', _v) : _v.set(0, 1.75, 0);
    this.rim.target.position.copy(head);
    this.rim2.target.position.copy(head);
    this.face.target.position.copy(head);
    this.hairGlow.position.set(head.x - 0.15, head.y + 0.35, head.z - 0.25);
    const storm = Math.max(0, Math.sin(t * 0.31) * Math.sin(t * 1.7 + 2)) ** 6;
    this.rim.intensity = 78 + storm * 110 + (this.hover === 'new' || this.hover === 'continue' ? 25 * this.hoverK : 0);
    this.face.intensity = 16 + (this.hover === 'load' ? 10 * this.hoverK : 0);
    this.halo.material.opacity = 0.8 + storm * 0.4;

    // dust drifts up and sideways with the wind
    const arr = this.dust.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      const sd = this.dustSeed[i / 3];
      arr[i] += (0.05 + Math.sin(t * 0.5 + sd) * 0.04) * realDt;
      arr[i + 1] += (0.06 + Math.sin(sd) * 0.03) * realDt;
      arr[i + 2] += Math.cos(t * 0.4 + sd) * 0.02 * realDt;
      if (arr[i + 1] > 3.6) arr[i + 1] = 0;
      if (arr[i] > 3) arr[i] = -3;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;

    // camera: behind his right shoulder, DIO on the right third, breathing drift; hovers nudge it
    const aspect = g.engine.camera.aspect || 1.6;
    // DIO sits on the right third on wide screens; on narrow screens he drifts towards centre
    const wide = Math.min(1, Math.max(0, (aspect - 0.75) / 0.85));
    const drift = Math.sin(t * 0.17) * 0.12;
    let px = 1.2 + drift; let py = 1.8 + Math.sin(t * 0.23) * 0.04; let pz = 2.0;
    let lx = 0.1 - 0.62 * wide; let ly = 1.5; const lz = -0.2;
    let fov = 44 - 9 * wide;
    const hk = this.hoverK;
    if (this.hover === 'versus') { px += 0.45 * hk; pz += 0.55 * hk; lx -= 0.35 * hk; fov += 4 * hk; }
    else if (this.hover === 'load') { px -= 0.2 * hk; pz -= 0.45 * hk; py += 0.05 * hk; ly += 0.12 * hk; }
    else if (this.hover === 'credits') { pz += 0.9 * hk; py += 0.3 * hk; fov += 3 * hk; }
    else if (this.hover === 'settings') { px += 0.15 * hk; }
    else if (this.hover === 'new' || this.hover === 'continue') { pz -= 0.25 * hk; }
    if (this.debugShot) { g.camera.setCinematic(this.debugShot.pos, this.debugShot.look, this.debugShot.fov); return; }
    g.camera.setCinematic(_v.set(px, py, pz), _v2.set(lx, ly, lz), fov);
  }
}
