import * as THREE from 'three';

// Afterimages: frozen, translucent copies of a character's current pose that fade out in place
// (Stand dashes, dodges, time-stop movement). A copy shares the source geometry and owns only a
// snapshot of the skin matrices, so it costs one draw per kept sub-mesh and no skinning work on
// the CPU. Copies are pooled per actor and built at load time, so prewarm compiles their shaders.

const noop = () => {};
const MAX_PARTS = 10;        // largest sub-meshes only: a ghost reads as a silhouette

// Spectral look: nearly clear in the middle, bright at the silhouette (fresnel), so overlapping
// sub-meshes do not add up to a flat solid shape. Skinning chunks make it work on rigged meshes.
const GHOST_VERT = `
  #include <common>
  #include <skinning_pars_vertex>
  varying vec3 vN; varying vec3 vV;
  void main(){
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
    vN = normalize(normalMatrix * objectNormal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const GHOST_FRAG = `
  uniform vec3 uColor; uniform float uA; varying vec3 vN; varying vec3 vV;
  void main(){
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float a = (0.12 + 0.88 * pow(f, 1.8)) * uA;
    gl_FragColor = vec4(uColor * (0.55 + 0.9 * f), a);
  }`;

function ghostMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: GHOST_VERT, fragmentShader: GHOST_FRAG,
    uniforms: { uColor: { value: new THREE.Color() }, uA: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

class GhostSet {
  constructor(layer, actor, count) {
    this.actor = actor;
    this.items = [];
    const src = [];
    actor.model?.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position) src.push(o); });
    src.sort((a, b) => (b.geometry.index?.count ?? b.geometry.attributes.position.count) - (a.geometry.index?.count ?? a.geometry.attributes.position.count));
    const keep = src.slice(0, MAX_PARTS);
    for (let i = 0; i < count; i += 1) {
      const mat = ghostMaterial();
      const root = new THREE.Group();
      root.matrixAutoUpdate = false;
      root.visible = false;
      root.name = `ghost:${actor.name}`;
      const parts = [];
      for (const o of keep) {
        let g;
        if (o.isSkinnedMesh) {
          const sk = new THREE.Skeleton(o.skeleton.bones, o.skeleton.boneInverses);
          sk.computeBoneTexture();
          sk.update = noop;   // the snapshot is the pose
          g = new THREE.SkinnedMesh(o.geometry, mat);
          g.bindMode = o.bindMode;
          g.bind(sk, o.bindMatrix);
        } else g = new THREE.Mesh(o.geometry, mat);
        g.matrixAutoUpdate = false;
        g.frustumCulled = false;
        g.renderOrder = 3;
        root.add(g);
        parts.push({ src: o, g });
      }
      layer.add(root);
      this.items.push({ root, parts, mat, t: 0, life: 1, alpha: 0, active: false, born: 0 });
    }
    this.cursor = 0;
  }

  spawn(color, life, alpha, scale) {
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    for (const { src, g } of it.parts) {
      g.visible = src.visible && src.parent?.visible !== false;
      g.matrix.copy(src.matrixWorld);
      if (scale !== 1) g.matrix.scale(_s.setScalar(scale));
      g.matrixWorld.copy(g.matrix);
      if (src.isSkinnedMesh && src.skeleton.boneMatrices) {
        const a = src.skeleton.boneMatrices; const b = g.skeleton.boneMatrices;
        b.set(a.length <= b.length ? a : a.subarray(0, b.length));
        if (g.skeleton.boneTexture) g.skeleton.boneTexture.needsUpdate = true;
      }
    }
    it.mat.uniforms.uColor.value.set(color);
    it.mat.uniforms.uA.value = alpha;
    it.alpha = alpha; it.life = life; it.t = 0; it.active = true;
    it.root.visible = true;
  }

  update(dt) {
    let n = 0;
    for (const it of this.items) {
      if (!it.active) continue;
      it.t += dt;
      const k = it.t / it.life;
      if (k >= 1) { it.active = false; it.root.visible = false; continue; }
      it.mat.uniforms.uA.value = it.alpha * (1 - k) * (1 - k);
      n += 1;
    }
    return n;
  }

  dispose() {
    for (const it of this.items) {
      it.root.removeFromParent();
      it.mat.dispose();
      for (const { g } of it.parts) g.skeleton?.boneTexture?.dispose();
    }
    this.items.length = 0;
  }
}
const _s = new THREE.Vector3();

export class Afterimages {
  constructor(scene) {
    this.layer = new THREE.Group();
    this.layer.name = 'afterimages';
    scene.add(this.layer);
    this.sets = new Map();
    this.active = 0;
  }

  // Build an actor's pool up front (call after load); returns the set.
  prepare(actor, count = 4) {
    if (!actor?.model) return null;
    let s = this.sets.get(actor);
    if (!s) { s = new GhostSet(this.layer, actor, count); this.sets.set(actor, s); }
    return s;
  }

  spawn(actor, color = 0xffffff, { life = 0.26, alpha = 0.4, scale = 1 } = {}) {
    if (!actor?.model || !actor.group.visible) return;
    const s = this.sets.get(actor) || this.prepare(actor, 3);
    s?.spawn(color, life, alpha, scale);
  }

  release(actor) {
    const s = this.sets.get(actor);
    if (s) { s.dispose(); this.sets.delete(actor); }
  }

  update(dt) {
    let n = 0;
    for (const [actor, s] of this.sets) {
      // an actor that has left the scene (removed by a mode or a quest) frees its pool
      if (actor.group.parent) s.seen = true;
      else if (s.seen) { s.dispose(); this.sets.delete(actor); continue; }
      n += s.update(dt);
    }
    this.active = n;
  }

  clear() {
    for (const s of this.sets.values()) for (const it of s.items) { it.active = false; it.root.visible = false; }
  }
}
