import * as THREE from 'three';

// Region atmosphere: one cloud of floating particles around the camera, animated entirely on the
// GPU (no per-frame CPU work beyond a few uniforms). Each region sets its own look — drifting
// embers on Ember Flats, fireflies in Hollow Pines, marsh wisps, ash on Bleakwater Ridge, violet
// motes in the Rift, rising gold in Heaven's Reach — and the cloud crossfades between them.
// It freezes with the rest of the world in stopped time.

const VERT = `
  attribute vec3 seed;
  uniform float uTime; uniform vec3 uCam; uniform vec3 uBox; uniform vec3 uVel; uniform float uSwirl;
  uniform float uSize; uniform float uBlink; uniform float uYOff;
  varying float vA;
  void main(){
    vec3 p = seed * uBox + uVel * uTime;
    p.x += sin(uTime * 0.7 + seed.y * 40.0) * uSwirl;
    p.z += cos(uTime * 0.6 + seed.x * 40.0) * uSwirl;
    p.y += sin(uTime * 0.9 + seed.z * 30.0) * uSwirl * 0.5;
    vec3 c = uCam + vec3(0.0, uYOff, 0.0);
    vec3 rel = mod(p - c + uBox * 0.5, uBox) - uBox * 0.5;
    vec4 mv = viewMatrix * vec4(c + rel, 1.0);
    float fade = 1.0 - smoothstep(uBox.x * 0.32, uBox.x * 0.5, length(rel.xz));
    fade *= 1.0 - smoothstep(uBox.y * 0.35, uBox.y * 0.5, abs(rel.y));
    float b = 0.5 + 0.5 * sin(uTime * (1.3 + seed.x * 2.6) + seed.y * 25.0);
    vA = fade * mix(1.0, smoothstep(0.35, 1.0, b), uBlink);
    gl_PointSize = uSize * (300.0 / max(0.5, -mv.z)) * (0.55 + seed.z * 0.9);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = `
  uniform vec3 uColor; uniform float uAlpha; varying float vA;
  void main(){
    vec2 q = gl_PointCoord * 2.0 - 1.0; float d = dot(q, q);
    float a = smoothstep(1.0, 0.0, d); a *= a;
    if (a * vA * uAlpha < 0.004) discard;
    gl_FragColor = vec4(uColor, a * vA * uAlpha);
  }`;

// box: size of the wrapped volume around the camera; vel: drift (m/s); swirl: wander radius
export const ATMOS = {
  ebon: { color: 0xb8b0a0, alpha: 0.18, size: 0.09, box: [44, 14, 44], vel: [0.4, -0.05, 0.2], swirl: 0.6, blink: 0, yOff: 0, count: 0.45 },
  ember: { color: 0xff7a2a, alpha: 0.85, size: 0.12, box: [50, 16, 50], vel: [0.6, 0.55, 0.3], swirl: 0.8, blink: 0.6, yOff: 1, count: 1 },
  redstone: { color: 0xc8805a, alpha: 0.22, size: 0.1, box: [46, 12, 46], vel: [1.6, 0.05, 0.4], swirl: 0.4, blink: 0, yOff: 0, count: 0.7 },
  hollow: { color: 0xd8ff7a, alpha: 0.95, size: 0.13, box: [48, 10, 48], vel: [0.05, 0.02, 0.05], swirl: 1.4, blink: 1, yOff: -1.5, count: 0.75 },
  iron: { color: 0xa0a4b0, alpha: 0.16, size: 0.08, box: [44, 14, 44], vel: [0.2, -0.25, 0.1], swirl: 0.5, blink: 0, yOff: 0, count: 0.5 },
  gravewater: { color: 0x9affc8, alpha: 0.7, size: 0.16, box: [50, 6, 50], vel: [0.1, 0.03, 0.08], swirl: 1.1, blink: 0.9, yOff: -2.5, count: 0.6 },
  bleak: { color: 0xe8ecf4, alpha: 0.4, size: 0.09, box: [44, 18, 44], vel: [1.1, -0.9, 0.4], swirl: 0.7, blink: 0, yOff: 2, count: 1 },
  rift: { color: 0xb07aff, alpha: 0.7, size: 0.12, box: [50, 16, 50], vel: [0.0, 0.35, 0.0], swirl: 1.6, blink: 0.4, yOff: 1, count: 0.85 },
  heaven: { color: 0xffe2a0, alpha: 0.8, size: 0.13, box: [50, 18, 50], vel: [0.05, 0.5, 0.05], swirl: 1.0, blink: 0.3, yOff: 2, count: 1 },
};

const COUNTS = { low: 160, medium: 320, high: 520, ultra: 720 };
const MAX = 720;

export class Atmosphere {
  constructor(scene) {
    const g = new THREE.BufferGeometry();
    const seed = new Float32Array(MAX * 3);
    for (let i = 0; i < seed.length; i += 1) seed[i] = Math.random();
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(44, 14, 44) },
        uVel: { value: new THREE.Vector3() }, uSwirl: { value: 0.5 }, uSize: { value: 0.1 }, uBlink: { value: 0 },
        uYOff: { value: 0 }, uColor: { value: new THREE.Color() }, uAlpha: { value: 0 },
      },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
    this.t = 0;
    this.cfg = null;
    this.next = null;
    this.fade = 0;          // 0..1 current look strength
    this.quality = 'high';
    this._apply(ATMOS.ebon);
  }

  setRegion(id) {
    const cfg = ATMOS[id];
    if (!cfg || cfg === this.cfg || cfg === this.next) return;
    this.next = cfg;    // fade the current look out, then swap
  }

  _apply(cfg) {
    const u = this.mat.uniforms;
    this.cfg = cfg;
    u.uColor.value.set(cfg.color);
    u.uBox.value.set(...cfg.box);
    u.uVel.value.set(...cfg.vel);
    u.uSwirl.value = cfg.swirl; u.uSize.value = cfg.size; u.uBlink.value = cfg.blink; u.uYOff.value = cfg.yOff;
    this.points.geometry.setDrawRange(0, Math.floor((COUNTS[this.quality] || COUNTS.high) * cfg.count));
  }

  onQuality(name) { this.quality = name; if (this.cfg) this._apply(this.cfg); }

  update(simDt, realDt, cam) {
    this.t += simDt;
    const u = this.mat.uniforms;
    u.uTime.value = this.t;
    u.uCam.value.copy(cam);
    if (this.next) {
      this.fade = Math.max(0, this.fade - realDt * 0.8);
      if (this.fade <= 0) { this._apply(this.next); this.next = null; }
    } else this.fade = Math.min(1, this.fade + realDt * 0.5);
    u.uAlpha.value = this.cfg.alpha * this.fade;
  }
}
