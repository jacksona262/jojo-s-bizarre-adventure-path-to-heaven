import * as THREE from 'three';
import { instantiate } from '../assets/AssetLibrary';
import { buildMansion } from '../world/Landmarks';
import { MANSION, SANCTUARY } from '../world/Layout';
import * as Poses from '../anim/Poses';
import { audio } from '../core/Audio';
import { ease } from '../camera/CameraRig';

// The homepage: DIO on the balcony of a frontier mansion overlooking the real valley,
// Ebon Crossing below and Heaven's Reach on the horizon. A directed camera loop plays behind
// the menu; hovering menu items nudges the camera.

const LOOP = 26;

export class TitleScene {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.hover = null;
    this.hoverK = 0;
    this.offset = new THREE.Vector3();
    this.lookOffset = new THREE.Vector3();
    this.ready = false;
  }

  async load() {
    const g = this.game;
    const world = g.world;
    const m = buildMansion(world, MANSION.x, MANSION.z, MANSION.y, Math.PI);
    this.mansion = m;
    g.engine.scene.add(m.group);
    this.lights = m.lights.map((l) => world.registerLight(l));
    this.balcony = m.balcony;
    this.dio = await instantiate('dioHome');
    this.dio.position.copy(this.balcony);
    this.dio.rotation.y = Math.PI; // facing north, away from the doorway
    g.engine.scene.add(this.dio);
    this.rig = this.dio.userData.rig;
    this.stand = await instantiate('theWorld');
    this.stand.visible = false;
    g.engine.scene.add(this.stand);
    this.standRig = this.stand.userData.rig;
    this.faceLight = new THREE.SpotLight(0xdfe8ff, 0, 12, 0.5, 0.6, 1.2);
    g.engine.scene.add(this.faceLight);
    g.engine.scene.add(this.faceLight.target);
    world.warm(this.balcony);
    this.ready = true;
  }

  dispose() {
    const g = this.game;
    if (this.mansion) { g.engine.scene.remove(this.mansion.group); this.mansion.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    for (const l of this.lights || []) { const i = g.world.lights.indexOf(l); if (i >= 0) g.world.lights.splice(i, 1); }
    if (this.dio) g.engine.scene.remove(this.dio);
    if (this.stand) g.engine.scene.remove(this.stand);
    if (this.faceLight) { g.engine.scene.remove(this.faceLight); g.engine.scene.remove(this.faceLight.target); }
  }

  setHover(h) {
    if (h !== this.hover) {
      this.hover = h;
      if (h === 'versus') {
        this.stand.visible = true;
        this.standT = 0;
        audio.play('summon');
        this.game.vfx.aura(this.balcony.clone().add(new THREE.Vector3(0, 1.2, 0.5)), 0xffd34d, 1, true);
      }
    }
  }

  // camera keyframes in a local frame around the balcony (north = -z world)
  _shot(t) {
    const b = this.balcony;
    const P = (x, y, z) => new THREE.Vector3(b.x + x, b.y + y, b.z + z);
    const keys = [
      { t: 0, pos: P(0.35, 2.1, 3.85), look: P(0, 1.5, -3) },      // behind DIO, from the doorway
      { t: 6, pos: P(0.5, 1.9, 2.3), look: P(0, 1.55, -1) },        // pushed in to his back
      { t: 9.5, pos: P(1.6, 1.75, 1.3), look: P(0, 1.65, 0) },       // over the shoulder as he turns
      { t: 11, pos: P(1.9, 1.7, 0.4), look: P(0, 1.7, 0) },          // face, lightning
      { t: 17, pos: P(-2.5, 2.6, 2.2), look: P(-30, 20, -400) },     // reveal the valley and the sanctuary
      { t: 22, pos: P(-1.4, 1.0, -2.6), look: P(0, 1.8, 0) },        // low front angle, imposing
      { t: LOOP, pos: P(0.35, 2.1, 3.85), look: P(0, 1.5, -3) },
    ];
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1].t) i += 1;
    const a = keys[i]; const c = keys[i + 1];
    const k = ease.inOut(Math.min(1, (t - a.t) / (c.t - a.t)));
    return { pos: a.pos.clone().lerp(c.pos, k), look: a.look.clone().lerp(c.look, k) };
  }

  update(dt, realDt) {
    if (!this.ready) return;
    const g = this.game;
    this.t = (this.t + realDt) % LOOP;
    const t = this.t;
    // DIO's performance
    let pose;
    if (t < 6) pose = Poses.idle(g.engine.time, 'dio');
    else if (t < 11) {
      pose = Poses.idle(g.engine.time, 'dio');
      const k = ease.inOut(Math.min(1, (t - 6) / 3));
      pose.head = [-0.05, 0.85 * k, 0.05];
      pose.chest = [-0.06, 0.3 * k, 0];
    } else if (t < 17) {
      pose = Poses.idle(g.engine.time, 'dio');
      const k = 1 - ease.inOut(Math.min(1, (t - 11) / 3));
      pose.head = [-0.05, 0.85 * k, 0.05];
      pose.chest = [-0.06, 0.3 * k, 0];
    } else {
      pose = Poses.lerpPose(Poses.idle(g.engine.time, 'dio'), Poses.dioPose(g.engine.time), ease.inOut(Math.min(1, (t - 17) / 2)) * (t < 24.5 ? 1 : 1 - (t - 24.5) / 1.5));
    }
    if (this.hover === 'versus') pose = Poses.lerpPose(pose, Poses.dioPose(g.engine.time), Math.min(1, this.hoverK * 1.5));
    if (this.rig) this.rig.apply(pose);
    // lightning on the face at ~10 s
    if (this._lastT !== undefined && this._lastT < 9.8 && t >= 9.8) g.weather.strike(this.balcony.clone().add(new THREE.Vector3(-60, 0, -300)), true);
    this._lastT = t;
    const head = this.rig ? this.rig.jointWorld('head') : this.balcony.clone().add(new THREE.Vector3(0, 1.7, 0));
    this.faceLight.position.copy(head).add(new THREE.Vector3(1.5, 1.2, -2.5));
    this.faceLight.target.position.copy(head);
    this.faceLight.intensity = g.weather.flash * 220 + 6;

    // The World behind him when Versus is hovered
    if (this.stand.visible) {
      this.standT = (this.standT || 0) + realDt;
      const want = this.hover === 'versus';
      const k = want ? Math.min(1, this.standT * 3) : Math.max(0, 1 - this.standT * 3);
      if (!want && k <= 0) this.stand.visible = false;
      this.stand.position.copy(this.balcony).add(new THREE.Vector3(0.9, 0.35 + Math.sin(g.engine.time * 2) * 0.05, 0.9));
      this.stand.rotation.y = Math.PI;
      this.stand.scale.setScalar(0.7 + 0.3 * k);
      this.standRig?.apply(Poses.crossArms(g.engine.time));
      if (want && Math.random() < realDt * 20) g.vfx.glow.emit(this.stand.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 2.4, (Math.random() - 0.5) * 1.2)), new THREE.Vector3(0, 1.5, 0), new THREE.Color(0xffd34d), 0.6, 0.35, 0.05, 0.8, { free: true });
    }

    // camera with hover offsets
    const s = this._shot(t);
    this.hoverK += ((this.hover ? 1 : 0) - this.hoverK) * Math.min(1, realDt * 2.5);
    const b = this.balcony;
    const tgtOff = new THREE.Vector3(); const tgtLook = new THREE.Vector3();
    if (this.hover === 'new') { tgtOff.set(-1.5, 2.2, 1.5); tgtLook.set(0, -40, -260); }
    else if (this.hover === 'versus') { tgtOff.copy(b).add(new THREE.Vector3(1.2, 1.6, -2.4)).sub(s.pos); tgtLook.copy(b).add(new THREE.Vector3(0.3, 1.5, 0.4)).sub(s.look); }
    else if (this.hover === 'settings') { tgtOff.set(0.4, 0.2, 0.4); }
    else if (this.hover === 'credits') { tgtOff.set(0, 3, 3); tgtLook.set(0, 30, -200); }
    this.offset.lerp(tgtOff, Math.min(1, realDt * 2));
    this.lookOffset.lerp(tgtLook, Math.min(1, realDt * 2));
    const pos = s.pos.add(this.offset.clone().multiplyScalar(this.hoverK));
    const look = s.look.add(this.lookOffset.clone().multiplyScalar(this.hoverK));
    g.camera.setCinematic(pos, look, 44);
    void SANCTUARY;
  }
}
