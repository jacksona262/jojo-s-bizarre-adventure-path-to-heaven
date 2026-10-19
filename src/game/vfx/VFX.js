import * as THREE from 'three';
import { Afterimages } from './Afterimage';

// Particle + mesh effects. Every effect can be frozen by time stop (unless marked free).
// Frequently spawned meshes (rings, rush fists, hit sparks) come from fixed pools with their
// materials built once, so a long rush or a boss fight allocates no GPU resources mid-combat.

const GLOW_VERT = `
  attribute float aSize; attribute vec4 aColor; attribute float aShape;
  varying vec4 vColor; varying float vShape;
  void main(){
    vColor = aColor; vShape = aShape;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (420.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const GLOW_FRAG = `
  varying vec4 vColor; varying float vShape;
  void main(){
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = length(p);
    float a;
    if (vShape < 0.5) a = smoothstep(1.0, 0.0, d);                 // soft glow
    else if (vShape < 1.5) a = smoothstep(1.0, 0.6, d) * smoothstep(0.2, 0.55, d) * 1.4; // ring
    else if (vShape < 2.5) { float s = abs(p.x) + abs(p.y); a = smoothstep(1.0, 0.7, s); } // gem/diamond
    else { a = smoothstep(1.0, 0.0, d); a *= a; }                  // tight core
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  }`;
const SMOKE_FRAG = `
  varying vec4 vColor; varying float vShape;
  void main(){
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = length(p);
    float a = smoothstep(1.0, 0.2, d);
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor.rgb, vColor.a * a * 0.6);
  }`;

class PointPool {
  constructor(scene, n, additive, frag) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.base = new Float32Array(n * 4);
    this.size = new Float32Array(n);
    this.size0 = new Float32Array(n);
    this.size1 = new Float32Array(n);
    this.shape = new Float32Array(n);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.free = new Uint8Array(n);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aColor', this.aCol);
    g.setAttribute('aSize', this.aSize);
    g.setAttribute('aShape', new THREE.BufferAttribute(this.shape, 1).setUsage(THREE.DynamicDrawUsage));
    this.geom = g;
    const m = new THREE.ShaderMaterial({
      vertexShader: GLOW_VERT, fragmentShader: frag, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  emit(p, v, color, alpha, size0, size1, life, opts = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.base[i * 4] = color.r; this.base[i * 4 + 1] = color.g; this.base[i * 4 + 2] = color.b; this.base[i * 4 + 3] = alpha;
    this.size0[i] = size0; this.size1[i] = size1;
    this.life[i] = life; this.max[i] = life;
    this.drag[i] = opts.drag ?? 1.5;
    this.grav[i] = opts.gravity ?? 0;
    this.shape[i] = opts.shape ?? 0;
    this.free[i] = opts.free ? 1 : 0;
    this.geom.attributes.aShape.needsUpdate = true;
  }

  update(dt, frozen) {
    for (let i = 0; i < this.n; i += 1) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; this.size[i] = 0; continue; }
      const fz = frozen && !this.free[i];
      if (!fz) {
        this.life[i] -= dt;
        const d = Math.exp(-this.drag[i] * dt);
        this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt; this.vel[i * 3 + 2] *= d;
        this.pos[i * 3] += this.vel[i * 3] * dt;
        this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
        this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      }
      const t = 1 - Math.max(0, this.life[i]) / this.max[i];
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      const fade = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
      this.col[i * 4] = this.base[i * 4]; this.col[i * 4 + 1] = this.base[i * 4 + 1]; this.col[i * 4 + 2] = this.base[i * 4 + 2];
      this.col[i * 4 + 3] = this.base[i * 4 + 3] * Math.max(0, fade);
    }
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
  }
}

class SparkPool {
  constructor(scene, n) {
    this.n = n;
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3);
    this.c = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.len = new Float32Array(n); this.free = new Uint8Array(n);
    this.verts = new Float32Array(n * 6);
    this.cols = new Float32Array(n * 6);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    this.aP = new THREE.BufferAttribute(this.verts, 3).setUsage(THREE.DynamicDrawUsage);
    this.aC = new THREE.BufferAttribute(this.cols, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aP);
    g.setAttribute('color', this.aC);
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 6;
    scene.add(this.lines);
  }

  emit(p, v, color, life, len = 0.06, free = false) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.n;
    this.p[i * 3] = p.x; this.p[i * 3 + 1] = p.y; this.p[i * 3 + 2] = p.z;
    this.v[i * 3] = v.x; this.v[i * 3 + 1] = v.y; this.v[i * 3 + 2] = v.z;
    this.c[i * 3] = color.r; this.c[i * 3 + 1] = color.g; this.c[i * 3 + 2] = color.b;
    this.life[i] = life; this.max[i] = life; this.len[i] = len; this.free[i] = free ? 1 : 0;
  }

  update(dt, frozen) {
    for (let i = 0; i < this.n; i += 1) {
      const o = i * 6;
      if (this.life[i] <= 0) { for (let k = 0; k < 6; k += 1) this.cols[o + k] = 0; continue; }
      if (!(frozen && !this.free[i])) {
        this.life[i] -= dt;
        this.v[i * 3 + 1] -= 9 * dt;
        const d = Math.exp(-2 * dt);
        this.v[i * 3] *= d; this.v[i * 3 + 2] *= d;
        this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      }
      const k = Math.max(0, this.life[i] / this.max[i]);
      const L = this.len[i];
      this.verts[o] = this.p[i * 3]; this.verts[o + 1] = this.p[i * 3 + 1]; this.verts[o + 2] = this.p[i * 3 + 2];
      this.verts[o + 3] = this.p[i * 3] - this.v[i * 3] * L; this.verts[o + 4] = this.p[i * 3 + 1] - this.v[i * 3 + 1] * L; this.verts[o + 5] = this.p[i * 3 + 2] - this.v[i * 3 + 2] * L;
      for (let j = 0; j < 2; j += 1) {
        const f = j === 0 ? k : k * 0.2;
        this.cols[o + j * 3] = this.c[i * 3] * f; this.cols[o + j * 3 + 1] = this.c[i * 3 + 1] * f; this.cols[o + j * 3 + 2] = this.c[i * 3 + 2] * f;
      }
    }
    this.aP.needsUpdate = true; this.aC.needsUpdate = true;
  }
}

const RING_FRAG = `
  uniform vec3 uColor; uniform float uAlpha; uniform float uSoft; varying vec2 vUv;
  void main(){
    vec2 p = vUv * 2.0 - 1.0; float d = length(p);
    float a = smoothstep(1.0, 1.0 - uSoft, d) * smoothstep(0.55, 0.95, d);
    gl_FragColor = vec4(uColor, a * uAlpha);
  }`;
const UV_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';

// Anime hit spark: a white-hot core with uneven tapering rays, tinted by the Stand's colour.
const SPARK_FRAG = `
  uniform vec3 uColor; uniform float uK; uniform float uSeed; varying vec2 vUv;
  float h(float n){ return fract(sin(n * 91.345 + uSeed * 13.71) * 47453.31); }
  void main(){
    vec2 p = vUv * 2.0 - 1.0; float r = length(p);
    float a = atan(p.y, p.x) / 6.28318 + 0.5;
    float N = 11.0;
    float sec = floor(a * N); float fa = fract(a * N) - 0.5;
    float len = (0.42 + 0.58 * h(sec)) * (0.75 + 0.25 * uK);
    float w = max(0.0, 1.0 - r / len) * 0.5;
    float ray = smoothstep(w, w * 0.45, abs(fa)) * step(r, len);
    float core = smoothstep(0.3, 0.05, r) * (1.0 - uK * 0.6);
    float m = max(ray, core);
    if (m < 0.02) discard;
    vec3 c = mix(uColor, vec3(1.0), smoothstep(0.55, 0.0, r));
    gl_FragColor = vec4(c, m * (1.0 - smoothstep(0.45, 1.0, uK)));
  }`;

// Time-stop signature: a clock face whose hands spin and then freeze.
const DIAL_FRAG = `
  uniform vec3 uColor; uniform float uA; uniform float uH1; uniform float uH2; varying vec2 vUv;
  float hand(vec2 p, float ang, float len, float w){ vec2 d = vec2(sin(ang), cos(ang)); float t = clamp(dot(p, d), -0.06, len); return smoothstep(w, w * 0.3, length(p - d * t)); }
  void main(){
    vec2 p = vUv * 2.0 - 1.0; float r = length(p);
    float ring = smoothstep(0.025, 0.0, abs(r - 0.93)) + 0.55 * smoothstep(0.012, 0.0, abs(r - 0.84));
    float s = fract(atan(p.x, p.y) / 6.28318 * 12.0); float dd = min(s, 1.0 - s);
    float tick = smoothstep(0.09, 0.03, dd) * step(0.7, r) * step(r, 0.84);
    float hands = hand(p, uH1, 0.46, 0.04) + hand(p, uH2, 0.7, 0.026) + smoothstep(0.06, 0.03, r);
    float m = clamp(ring + tick + hands, 0.0, 1.0);
    if (m < 0.02) discard;
    gl_FragColor = vec4(uColor, m * uA);
  }`;

class MeshPool {
  constructor(scene, make, cap) { this.scene = scene; this.make = make; this.cap = cap; this.free = []; this.n = 0; }
  get() {
    let m = this.free.pop();
    if (!m) {
      if (this.n >= this.cap) return null;
      m = this.make(); this.n += 1; this.scene.add(m);
    }
    m.visible = true;
    return m;
  }
  put(m) { m.visible = false; this.free.push(m); }
  // build `n` up front (hidden) so prewarm compiles the material
  fill(n) { const t = []; for (let i = 0; i < n; i += 1) { const m = this.get(); if (m) t.push(m); } for (const m of t) this.put(m); }
  get used() { return this.n - this.free.length; }
}

const _col = new THREE.Color();
const _col2 = new THREE.Color();
const _ax = new THREE.Vector3();
const _q = new THREE.Vector3();

function ringUpdate(e, k) {
  const d = e.data;
  const r = d.r0 + (d.r1 - d.r0) * (1 - (1 - k) ** 2);
  e.mesh.scale.set(r * 2, r * 2, 1);
  e.mesh.material.uniforms.uAlpha.value = (1 - k) * d.alpha;
}
function fistUpdate(e, k) {
  const d = e.data;
  e.mesh.position.copy(d.start).addScaledVector(d.dir, k * d.travel);
  e.mesh.material.opacity = 0.85 * (1 - k);
  const s = d.scale * (1 + 0.25 * k);
  e.mesh.scale.set(s, s, s * (1 + 0.6 * k));
}
function sparkUpdate(e, k) {
  const d = e.data;
  const s = d.size * (0.55 + 0.45 * Math.min(1, k * 4)) * (1 + 0.25 * k);
  e.mesh.scale.set(s, s, 1);
  e.mesh.material.uniforms.uK.value = k;
}

function textCanvas(text, color, stroke = '#120818') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.font = '900 120px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", Georgia, serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 14; g.strokeStyle = stroke; g.strokeText(text, 256, 84);
  g.fillStyle = color; g.fillText(text, 256, 84);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class VFX {
  constructor(scene) {
    this.scene = scene;
    this.glow = new PointPool(scene, 4000, true, GLOW_FRAG);
    this.smoke = new PointPool(scene, 1200, false, SMOKE_FRAG);
    this.sparks = new SparkPool(scene, 1500);
    this.meshes = [];
    this.frozen = false;
    this._v = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this.ringGeo = new THREE.PlaneGeometry(1, 1);
    this.fistGeo = new THREE.SphereGeometry(0.16, 10, 8);
    this.fistGeo.scale(1, 1, 2.4);
    this.textCache = new Map();
    this.ringPool = new MeshPool(scene, () => {
      const m = new THREE.Mesh(this.ringGeo, new THREE.ShaderMaterial({
        vertexShader: UV_VERT, fragmentShader: RING_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 1 }, uSoft: { value: 0.25 } },
      }));
      m.renderOrder = 7; m.frustumCulled = false;
      return m;
    }, 64);
    this.fistPool = new MeshPool(scene, () => {
      const m = new THREE.Mesh(this.fistGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.renderOrder = 6; m.frustumCulled = false;
      m.userData.start = new THREE.Vector3(); m.userData.dir = new THREE.Vector3();
      return m;
    }, 96);
    this.sparkPool = new MeshPool(scene, () => {
      const m = new THREE.Mesh(this.ringGeo, new THREE.ShaderMaterial({
        vertexShader: UV_VERT, fragmentShader: SPARK_FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color() }, uK: { value: 0 }, uSeed: { value: 0 } },
      }));
      m.renderOrder = 8; m.frustumCulled = false;
      return m;
    }, 32);
    this.ringPool.fill(16); this.fistPool.fill(24); this.sparkPool.fill(8);
    // one clock dial, reused by every time stop
    this.dial = new THREE.Mesh(this.ringGeo, new THREE.ShaderMaterial({
      vertexShader: UV_VERT, fragmentShader: DIAL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color() }, uA: { value: 0 }, uH1: { value: 0 }, uH2: { value: 0 } },
    }));
    this.dial.visible = false; this.dial.renderOrder = 4; this.dial.frustumCulled = false;
    scene.add(this.dial);
    this.dialState = null;
    this.afterimages = new Afterimages(scene);
  }

  // Reuse a pooled mesh; when the pool is exhausted the oldest live effect of that kind is recycled.
  _acquire(pool) {
    const m = pool.get();
    if (m) return m;
    const i = this.meshes.findIndex((e) => e.pool === pool);
    if (i < 0) return null;
    const e = this.meshes[i];
    this.meshes.splice(i, 1);
    e.mesh.visible = true;
    return e.mesh;
  }

  _pooled(pool, mesh, life, free, update, data) {
    this.meshes.push({ mesh, t: 0, life, free, update, pool, data });
  }

  rnd(s = 1) { return (Math.random() - 0.5) * 2 * s; }

  // ------------------------------------------------------------- primitives
  burst(p, color, n = 20, speed = 6, size = 0.4, life = 0.5, opts = {}) {
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    for (let i = 0; i < n; i += 1) {
      this._v.set(this.rnd(), this.rnd() * 0.8 + (opts.up || 0), this.rnd()).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      this.glow.emit(p, this._v, c, opts.alpha ?? 1, size * (0.6 + Math.random() * 0.6), size * (opts.grow ?? 0.2), life * (0.6 + Math.random() * 0.6), opts);
    }
  }

  sparkBurst(p, color, n = 16, speed = 9, dir = null, free = false) {
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    for (let i = 0; i < n; i += 1) {
      this._v.set(this.rnd(), this.rnd() * 0.6 + 0.3, this.rnd());
      if (dir) this._v.addScaledVector(dir, 1.4);
      this._v.normalize().multiplyScalar(speed * (0.5 + Math.random()));
      this.sparks.emit(p, this._v, c, 0.25 + Math.random() * 0.3, 0.03, free);
    }
  }

  smokePuff(p, color = 0x2a2622, n = 6, size = 1.6, life = 1.6, up = 1) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i += 1) {
      this._v.set(this.rnd(0.8), up * (0.4 + Math.random()), this.rnd(0.8));
      this._p.copy(p).add(this._v.clone().multiplyScalar(0.3));
      this.smoke.emit(this._p, this._v, c, 0.7, size * 0.5, size * 1.6, life * (0.7 + Math.random() * 0.6), { drag: 1.2 });
    }
  }

  ring(p, color, r0, r1, life = 0.5, opts = {}) {
    const mesh = this._acquire(this.ringPool);
    if (!mesh) return null;
    const u = mesh.material.uniforms;
    u.uColor.value.set(color);
    u.uSoft.value = opts.soft ?? 0.25;
    u.uAlpha.value = opts.alpha ?? 1;
    mesh.position.copy(p);
    mesh.rotation.set(0, 0, 0);
    if (opts.vertical) { if (opts.face) mesh.lookAt(opts.face); } else mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(r0 * 2, r0 * 2, 1);
    this._pooled(this.ringPool, mesh, life, opts.free, ringUpdate, { r0, r1, alpha: opts.alpha ?? 1 });
    return mesh;
  }

  // Camera-facing star-shaped hit spark (the anime "impact flash").
  hitSpark(p, color, size = 1.2, life = 0.13) {
    const mesh = this._acquire(this.sparkPool);
    if (!mesh) return;
    const u = mesh.material.uniforms;
    u.uColor.value.set(color);
    u.uK.value = 0;
    u.uSeed.value = Math.random() * 100;
    mesh.position.copy(p);
    if (this.cameraPos) mesh.lookAt(this.cameraPos);
    mesh.rotateZ(Math.random() * Math.PI * 2);
    mesh.scale.set(size * 0.55, size * 0.55, 1);
    this._pooled(this.sparkPool, mesh, life, true, sparkUpdate, { size });
  }

  // A short bright cut through the impact point (Silver Chariot's rapier).
  slash(p, dir, color = 0xffffff, len = 1.1) {
    const c = _col2.set(color);
    _ax.set(this.rnd(), this.rnd() * 0.7, this.rnd());
    if (dir) _ax.addScaledVector(_q.set(-dir.z, 0, dir.x), 1.2);
    _ax.normalize();
    for (let i = 0; i < 9; i += 1) {
      const s = (i / 8 - 0.5) * len;
      this._p.copy(p).addScaledVector(_ax, s);
      this._v.copy(_ax).multiplyScalar(10 + Math.random() * 4);
      this.sparks.emit(this._p, this._v, c, 0.09 + Math.random() * 0.05, 0.016, true);
    }
  }

  // Time-stop signature: a clock face behind the user whose hands whirl, then freeze.
  clockDial(center, color, life = 1.8, size = 3.4) {
    this.dialState = { center: center.clone(), t: 0, life, size, spin: 9 + Math.random() * 4, base: Math.random() * 6.28 };
    this.dial.material.uniforms.uColor.value.set(color);
    this.dial.visible = true;
  }

  _updateDial(realDt) {
    const s = this.dialState;
    if (!s) return;
    s.t += realDt;
    const k = s.t / s.life;
    if (k >= 1) { this.dialState = null; this.dial.visible = false; return; }
    const u = this.dial.material.uniforms;
    const spinK = Math.min(1, s.t / 0.7);
    const a = s.base + s.spin * (1 - (1 - spinK) ** 3);
    u.uH2.value = a; u.uH1.value = a / 12 + 1.2;
    u.uA.value = Math.min(1, s.t / 0.12) * (k < 0.55 ? 0.85 : 0.85 * (1 - (k - 0.55) / 0.45));
    const m = this.dial;
    m.position.copy(s.center);
    if (this.cameraPos) {
      _ax.copy(s.center).sub(this.cameraPos).normalize();
      m.position.addScaledVector(_ax, 0.9);
      m.lookAt(this.cameraPos);
    }
    const sc = s.size * (0.85 + 0.15 * Math.min(1, s.t / 0.2));
    m.scale.set(sc, sc, 1);
  }

  // Ground telegraph: a disc that fills up until the attack lands. Returns the mesh.
  warn(p, radius, dur, color = 0xff3020, free = false) {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uK: { value: 0 }, uC: { value: new THREE.Color(color) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uK; uniform vec3 uC; varying vec2 vUv;
        void main(){ vec2 p = vUv*2.0-1.0; float d = length(p); if (d > 1.0) discard;
          float edge = smoothstep(0.9, 1.0, d) * 0.9;
          float fill = step(d, uK) * 0.28 + smoothstep(uK - 0.04, uK, d) * step(d, uK) * 0.5;
          gl_FragColor = vec4(uC, edge + fill); }`,
    });
    const mesh = new THREE.Mesh(this.ringGeo, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(p);
    mesh.position.y += 0.06;
    mesh.scale.set(radius * 2, radius * 2, 1);
    mesh.renderOrder = 4;
    return this.addMesh(mesh, dur, (e, k) => { m.uniforms.uK.value = k; }, free);
  }

  // Line telegraph between two ground points.
  warnLine(a, b, width, dur, color = 0xff3020) {
    const len = a.distanceTo(b);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, len), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -Math.atan2(b.x - a.x, b.z - a.z) + Math.PI;
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.position.y += 0.07;
    return this.addMesh(mesh, dur, (e, k) => { m.opacity = 0.15 + 0.45 * k + Math.sin(k * 40) * 0.05; });
  }

  // Afterimage fists for Stand rushes.
  fist(from, dir, color, life = 0.16, scale = 1, travel = 0.9) {
    const mesh = this._acquire(this.fistPool);
    if (!mesh) return;
    mesh.material.color.set(color);
    mesh.material.opacity = 0.85;
    const d = mesh.userData;
    d.start.copy(from); d.dir.copy(dir).normalize();
    d.scale = scale; d.travel = travel;
    mesh.position.copy(from);
    _q.copy(from).add(d.dir);
    mesh.lookAt(_q);
    mesh.scale.setScalar(scale);
    this._pooled(this.fistPool, mesh, life, true, fistUpdate, d);
  }

  // The "hundred fists" of a Stand rush: several staggered afterimage fists around the striking arm.
  rushFists(from, to, color, n = 2) {
    _ax.copy(to).sub(from);
    const len = _ax.length() || 1;
    _ax.divideScalar(len);
    for (let i = 0; i < n; i += 1) {
      this._p.copy(from).add(_q.set(this.rnd(0.28), this.rnd(0.22), this.rnd(0.28))).addScaledVector(_ax, -0.25 - Math.random() * 0.3);
      this.fist(this._p, _ax, color, 0.09 + Math.random() * 0.06, 0.8 + Math.random() * 0.4, Math.min(1.1, len + 0.3));
    }
  }

  afterimage(actor, color, opts) { this.afterimages.spawn(actor, color, opts); }

  // JoJo-style onomatopoeia / menacing text floating in the world.
  text(p, str, color = '#c04cff', life = 1.6, size = 1.4, free = true) {
    const key = `${str}|${color}`;
    if (!this.textCache.has(key)) this.textCache.set(key, textCanvas(str, color));
    const m = new THREE.SpriteMaterial({ map: this.textCache.get(key), transparent: true, depthWrite: false, depthTest: false });
    const s = new THREE.Sprite(m);
    s.position.copy(p);
    s.scale.set(size * 3.2, size, 1);
    s.renderOrder = 20;
    this.scene.add(s);
    const start = p.clone();
    const drift = new THREE.Vector3(this.rnd(0.3), 0.5, this.rnd(0.3));
    this.meshes.push({ mesh: s, t: 0, life, free, update: (e, k) => { s.position.copy(start).addScaledVector(drift, k); m.opacity = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85; const w = 1 + Math.sin(k * 30) * 0.03; s.scale.set(size * 3.2 * w, size * w, 1); } });
  }

  menacing(p, kana = 'ゴ', count = 4, color = '#b04cff') {
    for (let i = 0; i < count; i += 1) {
      const q = p.clone().add(new THREE.Vector3(this.rnd(1.6), Math.random() * 1.6, this.rnd(1.6)));
      setTimeout(() => this.text(q, kana, color, 1.8, 0.7 + Math.random() * 0.5), i * 140);
    }
  }

  // Generic short-lived mesh with custom update.
  addMesh(mesh, life, update, free = false) {
    this.scene.add(mesh);
    this.meshes.push({ mesh, t: 0, life, free, update });
    return mesh;
  }

  // ------------------------------------------------------------- composites
  impact(p, color = 0xffe0a0, power = 1, dir = null, style = null) {
    const c = _col.set(color);
    this.burst(p, c, Math.floor(8 * power), 5 * power, 0.32 * power, 0.32);
    this.sparkBurst(p, c, Math.floor(8 + 8 * power), 8 + 4 * power, dir);
    this.hitSpark(p, c, 0.8 + 0.7 * power, power > 1.3 ? 0.17 : 0.12);
    if (power > 1.2) this.ring(p, c, 0.2, 1.6 * power, 0.35, { vertical: true, face: this.cameraPos });
    if (style) this.impactStyle(style, p, power, dir);
  }

  // Each Stand's blows carry their own signature on top of the shared impact.
  impactStyle(style, p, power = 1, dir = null) {
    const n = Math.max(2, Math.round(4 * power));
    switch (style) {
      case 'fire': this.flame(p, n, 0.4 + 0.2 * power, true); if (power > 1.2) this.smokePuff(p, 0x2a1a10, 2, 0.9, 1, 1); break;
      case 'emerald': this.burst(p, 0x3cff8a, n + 2, 6, 0.24, 0.45, { shape: 2, gravity: 6 }); break;
      case 'slash': this.slash(p, dir, 0xffffff, 0.8 + 0.4 * power); break;
      case 'diamond': this.burst(p, 0xffb0e8, n, 2.5, 0.24, 0.6, { shape: 2, up: 0.8, drag: 3 }); break;
      case 'bomb': this.burst(p, 0xffa050, 3, 2, 0.45 * power, 0.28, { grow: 1.6 }); if (power > 1.2) this.smokePuff(p, 0x3a2a24, 2, 0.8, 0.8, 0.8); break;
      case 'crimson': this.burst(p, 0xff2030, n, 4, 0.3, 0.4, { drag: 4, shape: 1 }); break;
      case 'life': this.burst(p, 0x9aff60, n, 2, 0.2, 0.8, { shape: 2, up: 1.2, drag: 2.5 }); break;
      case 'dimension': this.sparkBurst(p, 0xffffff, n + 2, 12, dir); break;
      case 'gravity':
        for (let i = 0; i < n + 2; i += 1) {
          _ax.set(this.rnd(), this.rnd(), this.rnd()).normalize();
          this._p.copy(p).addScaledVector(_ax, 0.9);
          this._v.copy(_ax).multiplyScalar(-3.2);
          this.glow.emit(this._p, this._v, _col2.set(0x6aff7a), 0.9, 0.22, 0.05, 0.28, { drag: 0.5 });
        }
        break;
      case 'star': this.burst(p, 0xe8f0ff, n, 7, 0.2, 0.3, { shape: 2 }); break;
      case 'time': if (power >= 1) this.ring(p, 0x9effd0, 0.1, 0.8 * power, 0.22, { vertical: true, face: this.cameraPos, soft: 0.15, alpha: 0.7 }); break;
      case 'heaven': this.burst(p, 0xfff6e0, n, 4, 0.28, 0.5, { shape: 2, up: 0.5 }); break;
      case 'void': this.smokePuff(p, 0x1a0a2a, 2, 0.9, 0.7, 0.3); break;
      case 'water': this.burst(p, 0x9ad8ff, n + 3, 5, 0.16, 0.6, { gravity: 9, up: 0.6 }); break;
      case 'magnet': case 'bullet': this.sparkBurst(p, 0xfff6d8, n, 10, dir); break;
      default: break;
    }
  }

  // Stand summon: a pillar of light erupts from the user, rings blast out along the ground, motes
  // spiral up around the Stand as it materialises, and the menacing glyphs rise.
  standSummon(userPos, standPos, color, kana = 'ゴ', cssColor = '#ffd34d') {
    const c = new THREE.Color(color);
    const white = _col2.set(0xffffff);
    const foot = userPos.clone(); foot.y -= 1.2;
    // pillar: a thin bright core inside a wider coloured sheath, both collapsing inwards
    this.beam(foot.clone(), foot.clone().add(_q.set(0, 5, 0)), 0xffffff, 0.07, 0.3, 0.8);
    this.beam(foot.clone(), foot.clone().add(_q.set(0, 4.2, 0)), c, 0.32, 0.4, 0.28);
    // ground shockwaves and a ring facing the lens
    this.ring(foot.clone().add(_q.set(0, 0.05, 0)), c, 0.3, 3.4, 0.55, { soft: 0.4 });
    this.ring(foot.clone().add(_q.set(0, 0.05, 0)), white, 0.2, 2.2, 0.35, { soft: 0.2, alpha: 0.8 });
    this.ring(standPos.clone(), c, 0.3, 2.6, 0.45, { vertical: true, face: this.cameraPos, alpha: 0.85 });
    this.hitSpark(standPos.clone(), c, 2.6, 0.22);
    // spiralling motes that sweep up around the Stand
    for (let i = 0; i < 46; i += 1) {
      const a = (i / 46) * Math.PI * 6 + Math.random() * 0.4;
      const r = 0.9 + Math.random() * 0.4;
      this._p.set(standPos.x + Math.cos(a) * r, foot.y + (i / 46) * 3 + Math.random() * 0.2, standPos.z + Math.sin(a) * r);
      this._v.set(-Math.sin(a) * 2.6 - Math.cos(a) * 0.6, 1.8 + Math.random() * 1.6, Math.cos(a) * 2.6 - Math.sin(a) * 0.6);
      this.glow.emit(this._p, this._v, i % 4 === 0 ? white : c, 0.95, 0.3, 0.05, 0.6 + Math.random() * 0.5, { drag: 1.2 });
    }
    // sparks shooting up out of the pillar
    for (let i = 0; i < 26; i += 1) {
      this._v.set(this.rnd(2.5), 7 + Math.random() * 6, this.rnd(2.5));
      this.sparks.emit(foot, this._v, i % 3 ? c : white, 0.35 + Math.random() * 0.3, 0.05);
    }
    this.burst(standPos.clone(), c, 18, 3.5, 0.45, 0.5, { up: 0.6 });
    this.smokePuff(foot.clone().add(_q.set(0, 0.1, 0)), 0x1a1612, 5, 1.4, 1.1, 0.6);
    this.menacing(standPos.clone().add(_q.set(0, 0.6, 0)), kana, 3, cssColor);
  }

  // Dismiss: the Stand breaks up into motes that drift up and fade.
  standDismiss(standPos, color) {
    const c = new THREE.Color(color);
    for (let i = 0; i < 30; i += 1) {
      this._p.set(standPos.x + this.rnd(0.4), standPos.y - 0.8 + Math.random() * 2, standPos.z + this.rnd(0.4));
      this._v.set(this.rnd(1.2), 1 + Math.random() * 1.5, this.rnd(1.2));
      this.glow.emit(this._p, this._v, c, 0.8, 0.25, 0.02, 0.5 + Math.random() * 0.3, { drag: 1.5 });
    }
    this.ring(standPos.clone(), c, 0.6, 0.1, 0.3, { vertical: true, face: this.cameraPos, alpha: 0.6 });
  }

  aura(p, color, power = 1, free = false) {
    const c = new THREE.Color(color);
    for (let i = 0; i < 30 * power; i += 1) {
      const a = Math.random() * Math.PI * 2;
      this._p.set(p.x + Math.cos(a) * 0.6, p.y - 1 + Math.random() * 2, p.z + Math.sin(a) * 0.6);
      this._v.set(Math.cos(a) * 0.6, 2 + Math.random() * 2, Math.sin(a) * 0.6);
      this.glow.emit(this._p, this._v, c, 0.8, 0.35, 0.05, 0.7, { drag: 1, free });
    }
    this.ring(new THREE.Vector3(p.x, p.y - 1.1, p.z), c, 0.3, 2.4 * power, 0.5, { free });
  }

  flame(p, n = 6, scale = 1, free = false) {
    for (let i = 0; i < n; i += 1) {
      this._v.set(this.rnd(0.6), 2 + Math.random() * 2.5, this.rnd(0.6)).multiplyScalar(scale);
      this._p.copy(p).add(new THREE.Vector3(this.rnd(0.3 * scale), 0, this.rnd(0.3 * scale)));
      const c = new THREE.Color().setHSL(0.03 + Math.random() * 0.07, 1, 0.5 + Math.random() * 0.2);
      this.glow.emit(this._p, this._v, c, 0.9, 0.7 * scale, 0.1, 0.5 + Math.random() * 0.4, { drag: 1.5, free });
    }
    if (Math.random() < 0.3) this.smoke.emit(p.clone().add(new THREE.Vector3(0, 1.2 * scale, 0)), new THREE.Vector3(0, 1.4, 0), new THREE.Color(0x1a1612), 0.5, 0.8 * scale, 2.2 * scale, 1.5, { drag: 0.8 });
  }

  // world-space expanding dome for time stop
  timeDome(center, color = 0xd8ffe8, maxR = 60, life = 1.1) {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uA: { value: 1 }, uC: { value: new THREE.Color(color) } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uA; uniform vec3 uC; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); gl_FragColor = vec4(uC, f * uA * 0.8); }',
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), m);
    mesh.position.copy(center);
    return this.addMesh(mesh, life, (e, k) => { const r = 0.5 + maxR * (1 - (1 - k) ** 3); mesh.scale.setScalar(r); m.uniforms.uA.value = 1 - k; }, true);
  }

  // A burning wall segment (Magician's Red)
  fireWall(a, b, height = 2.5, life = 4) {
    const len = a.distanceTo(b);
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uT: { value: 0 }, uA: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uT; uniform float uA; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec2 p = vec2(vUv.x * 8.0, vUv.y * 2.0 - uT * 2.5);
          float f = n(p) * 0.6 + n(p * 2.3) * 0.4;
          float shape = smoothstep(1.0, 0.0, vUv.y + f * 0.5 - 0.25);
          vec3 c = mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.85, 0.3), shape);
          gl_FragColor = vec4(c, shape * uA);
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, height), m);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.position.y += height / 2;
    mesh.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2;
    return this.addMesh(mesh, life, (e, k, dt) => { m.uniforms.uT.value += dt; m.uniforms.uA.value = Math.min(1, k * 8) * Math.min(1, (1 - k) * 4); });
  }

  // Gem-like projectile mesh (Emerald Splash)
  gem(color = 0x30ff80, size = 0.18) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(size, 0), m);
    mesh.scale.z = 1.8;
    return mesh;
  }

  orb(color = 0xff6020, size = 0.35) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(size * 0.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(size, 14, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(core, halo);
    return g;
  }

  // Growing vine between two points (Gold Experience / Hierophant tendrils)
  vine(a, b, color = 0x2f7a2a, radius = 0.09, life = 3, grow = 0.4, emissive = 0x000000) {
    const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(this.rnd(0.6), 0.8 + Math.random(), this.rnd(0.6)));
    const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
    const geo = new THREE.TubeGeometry(curve, 24, radius, 6, false);
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, emissive, emissiveIntensity: 1.2 });
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = true;
    const total = geo.index.count;
    geo.setDrawRange(0, 0);
    return this.addMesh(mesh, life, (e, k) => {
      const g = Math.min(1, (k * life) / grow);
      geo.setDrawRange(0, Math.floor(total * g / 6) * 6);
      if (k > 0.85) mesh.scale.setScalar(1 - (k - 0.85) / 0.15 * 0.9);
    });
  }

  // Dimensional tear (D4C)
  tear(p, height = 3, life = 1.5) {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uT: { value: 0 }, uA: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uT; uniform float uA; varying vec2 vUv;
        void main(){
          float x = abs(vUv.x - 0.5 - 0.06 * sin(vUv.y * 18.0 + uT * 5.0));
          float w = 0.04 + 0.12 * sin(vUv.y * 3.14159);
          float a = smoothstep(w, 0.0, x);
          vec3 c = mix(vec3(0.6, 0.85, 1.0), vec3(1.0), smoothstep(w * 0.4, 0.0, x));
          gl_FragColor = vec4(c, a * uA);
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, height), m);
    mesh.position.copy(p); mesh.position.y += height / 2;
    return this.addMesh(mesh, life, (e, k, dt) => {
      m.uniforms.uT.value += dt;
      m.uniforms.uA.value = Math.min(1, k * 6) * Math.min(1, (1 - k) * 3);
      if (this.cameraPos) mesh.lookAt(this.cameraPos.x, mesh.position.y, this.cameraPos.z);
    });
  }

  beam(a, b, color, width = 0.3, life = 0.3, opacity = 0.9) {
    const len = a.distanceTo(b);
    const geo = new THREE.CylinderGeometry(width, width, len, 8, 1, true);
    geo.rotateX(Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.lookAt(b);
    return this.addMesh(mesh, life, (e, k) => { m.opacity = opacity * (1 - k); mesh.scale.set(1 - k * 0.7, 1 - k * 0.7, 1); });
  }

  // ------------------------------------------------------------- update
  update(dt, realDt, cameraPos) {
    this.cameraPos = cameraPos;
    this.glow.update(this.frozen ? realDt : dt, this.frozen);
    this.smoke.update(this.frozen ? realDt : dt, this.frozen);
    this.sparks.update(this.frozen ? realDt : dt, this.frozen);
    for (let i = this.meshes.length - 1; i >= 0; i -= 1) {
      const e = this.meshes[i];
      if (this.frozen && !e.free) continue;
      const step = e.free ? realDt : dt;
      e.t += step;
      const k = Math.min(1, e.t / e.life);
      e.update(e, k, step);
      if (k >= 1) {
        if (e.pool) e.pool.put(e.mesh);
        else {
          this.scene.remove(e.mesh);
          e.mesh.traverse?.((o) => { if (o.material && !o.material.map) o.material.dispose(); if (o.geometry && o.geometry !== this.ringGeo && o.geometry !== this.fistGeo) o.geometry.dispose(); });
        }
        this.meshes.splice(i, 1);
      }
    }
    this._updateDial(realDt);
    this.afterimages.update(realDt);
  }

  stats() {
    let glow = 0; let smoke = 0; let sparks = 0;
    for (let i = 0; i < this.glow.n; i += 1) if (this.glow.life[i] > 0) glow += 1;
    for (let i = 0; i < this.smoke.n; i += 1) if (this.smoke.life[i] > 0) smoke += 1;
    for (let i = 0; i < this.sparks.n; i += 1) if (this.sparks.life[i] > 0) sparks += 1;
    return { glow, smoke, sparks, meshes: this.meshes.length, rings: this.ringPool.used, fists: this.fistPool.used, hitSparks: this.sparkPool.used, ghosts: this.afterimages.active };
  }

  clear() {
    for (const e of this.meshes) { if (e.pool) e.pool.put(e.mesh); else this.scene.remove(e.mesh); }
    this.meshes.length = 0;
    this.glow.life.fill(0); this.smoke.life.fill(0); this.sparks.life.fill(0);
    this.dialState = null; this.dial.visible = false;
    this.afterimages.clear();
  }
}
