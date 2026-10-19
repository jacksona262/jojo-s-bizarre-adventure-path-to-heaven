import * as THREE from 'three';
import { audio } from '../core/Audio';

// Permanent stormy night: sky dome, moon, clouds, lightning, rain, fog and lights.
// Simulation time (sim) halts during a time stop: rain hangs in the air, clouds freeze.

const SKY_VERT = `
  varying vec3 vDir;
  void main(){
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
    gl_Position.z = gl_Position.w; // at far plane
  }`;

const SKY_FRAG = `
  uniform float uTime; uniform float uFlash; uniform vec3 uMoonDir; uniform float uCloud; uniform vec3 uTint; uniform float uHeaven;
  varying vec3 vDir;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<6;i++){ s+=noise(p)*a; p*=2.03; a*=0.5; } return s; }
  void main(){
    vec3 d = normalize(vDir);
    float h = clamp(d.y, -0.2, 1.0);
    vec3 zenith = vec3(0.012, 0.018, 0.04);
    vec3 horizon = vec3(0.05, 0.065, 0.1);
    vec3 col = mix(horizon, zenith, pow(max(h, 0.0), 0.55));
    // stars
    vec2 sp = d.xz / max(d.y + 0.25, 0.05) * 120.0;
    float st = step(0.9965, hash(floor(sp))) * smoothstep(0.1, 0.4, h);
    // moon
    float md = dot(d, normalize(uMoonDir));
    float disc = smoothstep(0.9993, 0.9996, md);
    float glow = pow(max(md, 0.0), 180.0) * 0.6 + pow(max(md, 0.0), 12.0) * 0.12;
    vec3 moonCol = vec3(0.85, 0.9, 1.0);
    // clouds on a plane projection
    vec2 cp = d.xz / max(d.y + 0.12, 0.04) * 1.4 + vec2(uTime * 0.012, uTime * 0.02);
    float c1 = fbm(cp);
    float c2 = fbm(cp * 2.3 + vec2(-uTime * 0.02, 0.0) + c1);
    float cloud = smoothstep(0.38 - uCloud * 0.2, 0.75, c1 * 0.7 + c2 * 0.5);
    float thin = smoothstep(0.3, 0.6, c1);
    // moon behind clouds: lit cloud edges
    float moonLit = pow(max(md, 0.0), 6.0);
    vec3 cloudCol = mix(vec3(0.03, 0.035, 0.05), vec3(0.16, 0.18, 0.24), moonLit * (1.0 - cloud * 0.5));
    cloudCol += vec3(0.5, 0.55, 0.7) * uFlash * (0.4 + c2);
    vec3 sky = col + st * vec3(0.8) * (1.0 - thin) + moonCol * disc * (1.0 - cloud * 0.92) + moonCol * glow * (1.0 - cloud * 0.6);
    col = mix(sky, cloudCol, cloud * smoothstep(-0.05, 0.12, h));
    col += uFlash * vec3(0.12, 0.14, 0.2) * (1.0 - cloud);
    col = mix(col, col * uTint, 0.5);
    col += uHeaven * vec3(0.25, 0.2, 0.08) * (0.5 + c2);
    // below horizon: fade to fog colour
    col = mix(vec3(0.03, 0.04, 0.06), col, smoothstep(-0.12, 0.02, d.y));
    gl_FragColor = vec4(col, 1.0);
  }`;

const RAIN_VERT = `
  uniform float uTime; uniform vec3 uCam; uniform vec2 uWind; uniform float uSize;
  attribute vec3 aOff; attribute float aEnd;
  varying float vA;
  void main(){
    vec3 box = vec3(70.0, 42.0, 70.0);
    vec3 fall = vec3(uWind.x, -22.0, uWind.y) * uTime;
    vec3 p = mod(aOff * box + fall - uCam + box * 0.5, box) - box * 0.5 + uCam;
    // streak: second vertex trails along the velocity
    vec3 vel = normalize(vec3(uWind.x, -22.0, uWind.y));
    p -= vel * aEnd * uSize;
    vA = 1.0 - aEnd * 0.8;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;

const RAIN_FRAG = `
  uniform float uFlash; varying float vA;
  void main(){ gl_FragColor = vec4(vec3(0.55, 0.62, 0.75) + uFlash * 0.6, 0.28 * vA); }`;

export class Weather {
  constructor(engine) {
    this.engine = engine;
    const scene = engine.scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.sim = 0;
    this.moonDir = new THREE.Vector3(-0.35, 0.55, -0.75).normalize();

    // sky
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, depthWrite: false, side: THREE.BackSide, fog: false,
      uniforms: { uTime: { value: 0 }, uFlash: { value: 0 }, uMoonDir: { value: this.moonDir }, uCloud: { value: 0.6 }, uTint: { value: new THREE.Color(1, 1, 1) }, uHeaven: { value: 0 } },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    // lights
    this.hemi = new THREE.HemisphereLight(0x6a7cae, 0x2a2018, 1.05);
    scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0xa9bdf0, 1.6);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    const sc = this.moon.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
    this.moon.shadow.bias = -0.0006;
    this.moon.shadow.normalBias = 0.04;
    scene.add(this.moon);
    scene.add(this.moon.target);
    this.rim = new THREE.DirectionalLight(0x7d8fc8, 0.55);
    scene.add(this.rim);
    this.baseHemi = 1.05; this.baseMoon = 1.6;

    scene.fog = new THREE.FogExp2(0x0b0f17, 0.0045);
    this.fogBase = 0.0045;
    this.fogTarget = 0.0045;
    scene.background = new THREE.Color(0x05070b);

    // rain
    const N = 9000;
    const off = new Float32Array(N * 2 * 3);
    const end = new Float32Array(N * 2);
    for (let i = 0; i < N; i += 1) {
      const x = Math.random(); const y = Math.random(); const z = Math.random();
      for (let k = 0; k < 2; k += 1) {
        off[(i * 2 + k) * 3] = x; off[(i * 2 + k) * 3 + 1] = y; off[(i * 2 + k) * 3 + 2] = z;
        end[i * 2 + k] = k;
      }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    rg.setAttribute('aOff', new THREE.BufferAttribute(off, 3));
    rg.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.rainMat = new THREE.ShaderMaterial({
      vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2(3, 1.5) }, uSize: { value: 0.9 }, uFlash: { value: 0 } },
    });
    this.rain = new THREE.LineSegments(rg, this.rainMat);
    this.rain.frustumCulled = false;
    scene.add(this.rain);
    this.rainIntensity = 1;

    // lightning bolt mesh pool
    this.boltMat = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.bolt = new THREE.Mesh(new THREE.BufferGeometry(), this.boltMat);
    this.bolt.frustumCulled = false;
    scene.add(this.bolt);
    this.flash = 0;
    this.flashSeq = [];
    this.nextStrike = 4 + Math.random() * 6;
    this.scheduled = [];
    this.enabled = true;
    this.strikeRate = 1;
    this.heaven = 0;
  }

  setRegion(region) {
    const dens = { hollow: 0.009, gravewater: 0.008, rift: 0.006, heaven: 0.0052, bleak: 0.005, redstone: 0.0042, ember: 0.0036, ebon: 0.0042, iron: 0.0048 };
    this.fogTarget = dens[region?.id] ?? 0.0045;
  }

  // Strike lightning now; optional world position for a visible bolt.
  strike(at = null, big = false) {
    const seq = big ? [1.2, 0.15, 0.9, 0.05, 0.6] : [0.9, 0.1, 0.55];
    this.flashSeq = seq.map((v, i) => ({ t: i * 0.06, v }));
    this.flashT = 0;
    const cam = this.engine.camera.position;
    const pos = at ? at.clone() : cam.clone().add(new THREE.Vector3((Math.random() - 0.5) * 900, 0, -200 - Math.random() * 700));
    if (!at) pos.y = cam.y;
    this._makeBolt(pos);
    const dist = pos.distanceTo(cam);
    audio.play('thunder', { distance: Math.min(1, dist / 1200) });
    if (this.onStrike) this.onStrike(pos);
  }

  _makeBolt(base) {
    const pts = [];
    let p = base.clone().add(new THREE.Vector3(0, 420, 0));
    const steps = 18;
    for (let i = 0; i <= steps; i += 1) {
      pts.push(p.clone());
      p = p.add(new THREE.Vector3((Math.random() - 0.5) * 40, -420 / steps, (Math.random() - 0.5) * 40));
    }
    const w = 1.8;
    const verts = [];
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i]; const b = pts[i + 1];
      verts.push(a.x - w, a.y, a.z, a.x + w, a.y, a.z, b.x - w, b.y, b.z, a.x + w, a.y, a.z, b.x + w, b.y, b.z, b.x - w, b.y, b.z);
      verts.push(a.x, a.y, a.z - w, a.x, a.y, a.z + w, b.x, b.y, b.z - w, a.x, a.y, a.z + w, b.x, b.y, b.z + w, b.x, b.y, b.z - w);
    }
    this.bolt.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    this.bolt.geometry = g;
    this.boltMat.opacity = 1;
  }

  // simDt: frozen during time stop. realDt: always advances.
  update(simDt, realDt, focus) {
    this.sim += simDt;
    const cam = this.engine.camera.position;
    this.sky.position.copy(cam);
    this.skyMat.uniforms.uTime.value = this.sim;
    this.rainMat.uniforms.uTime.value = this.sim;
    this.rainMat.uniforms.uCam.value.copy(cam);
    this.rain.visible = this.rainIntensity > 0.05;
    const f = this.engine.scene.fog;
    f.density += (this.fogTarget - f.density) * Math.min(1, realDt * 0.5);

    // lightning (pauses during time stop)
    if (this.enabled && simDt > 0) {
      this.nextStrike -= simDt * this.strikeRate;
      if (this.nextStrike <= 0) {
        this.strike();
        this.nextStrike = 7 + Math.random() * 14;
      }
    }
    if (this.flashSeq.length) {
      this.flashT += realDt;
      let v = 0;
      for (const s of this.flashSeq) if (this.flashT >= s.t) v = s.v;
      if (this.flashT > this.flashSeq[this.flashSeq.length - 1].t + 0.08) { this.flashSeq = []; v = 0; }
      this.flash = Math.max(this.flash * 0.8, v);
    } else {
      this.flash *= Math.exp(-realDt * 9);
    }
    this.boltMat.opacity = Math.max(0, this.boltMat.opacity - realDt * 4);
    const fl = this.flash;
    this.skyMat.uniforms.uFlash.value = fl;
    this.rainMat.uniforms.uFlash.value = fl;
    this.skyMat.uniforms.uHeaven.value = this.heaven;
    this.hemi.intensity = this.baseHemi + fl * 1.6;
    this.moon.intensity = this.baseMoon + fl * 2.5;

    // shadow camera follows the focus point, snapped to texels to avoid shimmer
    const fp = focus || cam;
    const snap = 140 / this.moon.shadow.mapSize.x;
    const tx = Math.round(fp.x / snap) * snap; const tz = Math.round(fp.z / snap) * snap;
    this.moon.target.position.set(tx, fp.y, tz);
    this.moon.position.set(tx + this.moonDir.x * 200, fp.y + this.moonDir.y * 200, tz + this.moonDir.z * 200);
    this.rim.position.set(fp.x - this.moonDir.x * 100, fp.y + 60, fp.z - this.moonDir.z * 100);
    this.rim.target = this.moon.target;
  }

  onQuality(s) {
    this.moon.shadow.mapSize.set(s.shadows, s.shadows);
    if (this.moon.shadow.map) { this.moon.shadow.map.dispose(); this.moon.shadow.map = null; }
  }
}
