import * as THREE from 'three';

// Particle + mesh effects. Every effect can be frozen by time stop (unless marked free).

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
    const m = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: RING_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 1 }, uSoft: { value: opts.soft ?? 0.25 } },
    });
    const mesh = new THREE.Mesh(this.ringGeo, m);
    mesh.position.copy(p);
    if (opts.vertical) { if (opts.face) mesh.lookAt(opts.face); } else mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 7;
    this.scene.add(mesh);
    this.meshes.push({ mesh, t: 0, life, free: opts.free, update: (e, k) => { const r = r0 + (r1 - r0) * (1 - (1 - k) ** 2); mesh.scale.set(r * 2, r * 2, 1); m.uniforms.uAlpha.value = (1 - k) * (opts.alpha ?? 1); } });
    return mesh;
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
  fist(from, dir, color, life = 0.16, scale = 1) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(this.fistGeo, m);
    mesh.position.copy(from);
    mesh.lookAt(from.clone().add(dir));
    mesh.scale.setScalar(scale);
    this.scene.add(mesh);
    const start = from.clone();
    this.meshes.push({ mesh, t: 0, life, free: true, update: (e, k) => { mesh.position.copy(start).addScaledVector(dir, k * 0.9); m.opacity = 0.85 * (1 - k); } });
  }

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
  impact(p, color = 0xffe0a0, power = 1, dir = null) {
    this.burst(p, color, Math.floor(10 * power), 5 * power, 0.35 * power, 0.35);
    this.sparkBurst(p, color, Math.floor(10 + 8 * power), 8 + 4 * power, dir);
    this.burst(p, 0xffffff, 1, 0, 1.6 * power, 0.12, { shape: 3 });
    if (power > 1.2) this.ring(p, color, 0.2, 1.6 * power, 0.35, { vertical: true, face: this.cameraPos });
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

  beam(a, b, color, width = 0.3, life = 0.3) {
    const len = a.distanceTo(b);
    const geo = new THREE.CylinderGeometry(width, width, len, 8, 1, true);
    geo.rotateX(Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.lookAt(b);
    return this.addMesh(mesh, life, (e, k) => { m.opacity = 0.9 * (1 - k); mesh.scale.set(1 - k * 0.7, 1 - k * 0.7, 1); });
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
        this.scene.remove(e.mesh);
        e.mesh.traverse?.((o) => { if (o.material && !o.material.map) o.material.dispose(); if (o.geometry && o.geometry !== this.ringGeo && o.geometry !== this.fistGeo) o.geometry.dispose(); });
        this.meshes.splice(i, 1);
      }
    }
  }

  clear() {
    for (const e of this.meshes) this.scene.remove(e.mesh);
    this.meshes.length = 0;
    this.glow.life.fill(0); this.smoke.life.fill(0); this.sparks.life.fill(0);
  }
}
