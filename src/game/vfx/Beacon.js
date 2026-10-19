import * as THREE from 'three';

// Objective waypoint: a column of gold light with energy bands racing up it, a rotating rune
// ring on the ground with a pulse that ripples outward, a spinning diamond hovering over the spot
// and motes drifting up the column. Far away only the column reads (a landmark on the horizon);
// close in, the column fades so it never blinds the player, and the ring and diamond take over.

const PILLAR_VERT = `
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){
    vUv = uv;
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const PILLAR_FRAG = `
  uniform float uT; uniform float uA; uniform vec3 uC; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){
    float face = abs(dot(normalize(vN), normalize(vV)));
    float core = pow(face, 2.5);                       // bright through the middle, soft edges
    float bands = smoothstep(0.75, 1.0, sin(vUv.y * 90.0 - uT * 6.0) * 0.5 + 0.5);
    float streak = smoothstep(0.92, 1.0, sin(vUv.y * 23.0 - uT * 2.3 + vUv.x * 18.0) * 0.5 + 0.5);
    float fade = smoothstep(0.0, 0.04, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
    float a = (0.25 * core + 0.35 * bands * core + 0.4 * streak) * fade * uA;
    gl_FragColor = vec4(mix(uC, vec3(1.0), core * 0.5 + bands * 0.3), a);
  }`;
const RING_FRAG = `
  uniform float uT; uniform float uA; uniform vec3 uC; varying vec2 vUv;
  void main(){
    vec2 p = vUv * 2.0 - 1.0; float r = length(p); float ang = atan(p.y, p.x);
    float ring1 = smoothstep(0.03, 0.0, abs(r - 0.88));
    float dashes = step(0.5, fract(ang * 24.0 / 6.28318 + uT * 0.25)) * smoothstep(0.035, 0.0, abs(r - 0.74));
    float ticks = step(0.85, fract(ang * 8.0 / 6.28318 - uT * 0.12)) * smoothstep(0.08, 0.0, abs(r - 0.6));
    float pulse = fract(uT * 0.45); float wave = smoothstep(0.05, 0.0, abs(r - pulse)) * (1.0 - pulse);
    float glow = smoothstep(0.6, 0.0, r) * 0.18;
    float a = (ring1 * 0.9 + dashes * 0.7 + ticks * 0.6 + wave * 0.8 + glow) * uA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(mix(uC, vec3(1.0), ring1 * 0.4 + wave * 0.5), a);
  }`;
const UV_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';

export class Beacon {
  constructor(scene, color = 0xffd36a) {
    this.group = new THREE.Group();
    const c = new THREE.Color(color);
    this.t = 0;
    this.pillarMat = new THREE.ShaderMaterial({
      vertexShader: PILLAR_VERT, fragmentShader: PILLAR_FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uT: { value: 0 }, uA: { value: 1 }, uC: { value: c } },
    });
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 140, 20, 1, true), this.pillarMat);
    this.pillar.position.y = 70;
    this.ringMat = new THREE.ShaderMaterial({
      vertexShader: UV_VERT, fragmentShader: RING_FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uT: { value: 0 }, uA: { value: 1 }, uC: { value: c } },
    });
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.08;
    this.diamondMat = new THREE.MeshBasicMaterial({ color: c.clone().lerp(new THREE.Color(0xffffff), 0.35), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), this.diamondMat);
    this.diamond.scale.y = 1.7;
    this.diamondWire = new THREE.LineSegments(new THREE.EdgesGeometry(this.diamond.geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
    this.diamond.add(this.diamondWire);
    // motes rising up the column
    const N = 70;
    this.moteSeed = new Float32Array(N * 3);
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i += 1) { this.moteSeed[i * 3] = Math.random() * 6.28; this.moteSeed[i * 3 + 1] = Math.random(); this.moteSeed[i * 3 + 2] = 0.4 + Math.random() * 1.2; }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.motesMat = new THREE.PointsMaterial({ color: c, size: 0.16, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.motes = new THREE.Points(mg, this.motesMat);
    this.motes.frustumCulled = false;
    this.group.add(this.pillar, this.ring, this.diamond, this.motes);
    this.group.renderOrder = 3;
    scene.add(this.group);
  }

  setPosition(x, y, z) { this.group.position.set(x, y, z); }

  // distance: metres from the player (horizontal)
  update(dt, distance) {
    this.t += dt;
    const t = this.t;
    const near = distance == null ? 1 : Math.min(1, Math.max(0, (distance - 12) / 40));   // 0 close, 1 far
    this.pillarMat.uniforms.uT.value = t;
    this.pillarMat.uniforms.uA.value = 0.25 + 0.75 * near;
    const ringVis = distance == null ? 1 : 1 - Math.min(1, Math.max(0, (distance - 60) / 40));
    this.ringMat.uniforms.uT.value = t;
    this.ringMat.uniforms.uA.value = ringVis;
    this.ring.rotation.z = t * 0.2;
    this.diamond.position.y = 3.2 + Math.sin(t * 2) * 0.25;
    this.diamond.rotation.y = t * 1.6;
    this.diamond.visible = ringVis > 0.02;
    this.diamondMat.opacity = 0.75 * ringVis;
    // the marker grows with distance so it stays readable
    const s = 1 + Math.min(3, (distance || 0) / 40);
    this.diamond.scale.set(s, s * 1.7, s);
    const arr = this.motes.geometry.attributes.position.array;
    for (let i = 0; i < arr.length / 3; i += 1) {
      const a = this.moteSeed[i * 3] + t * 0.8; const h = (this.moteSeed[i * 3 + 1] + t * 0.12 * this.moteSeed[i * 3 + 2]) % 1;
      const r = 0.6 + 0.6 * Math.sin(a * 1.7 + i);
      arr[i * 3] = Math.cos(a) * r; arr[i * 3 + 1] = h * 14; arr[i * 3 + 2] = Math.sin(a) * r;
    }
    this.motes.geometry.attributes.position.needsUpdate = true;
    this.motesMat.opacity = 0.9 * Math.max(ringVis, 0.3);
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  }
}
