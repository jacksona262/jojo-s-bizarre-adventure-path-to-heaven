import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { prof } from '../dev/Profiler';

// Final pass: ACES tone mapping + sRGB output (formerly a separate OutputPass; merged to save a
// full-resolution pass), then grading, vignette, grain and every Stand screen effect.
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1.3 },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0.9 },
    uGrain: { value: 0.045 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    // The World / Star Platinum time stop: 0..1 amount, expanding sphere radius in screen units
    uTimeStop: { value: 0 },
    uTsWave: { value: 0 },
    uTsCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uTsTint: { value: new THREE.Color(0.55, 0.85, 0.75) },
    // King Crimson time erasure
    uErase: { value: 0 },
    // D4C dimensional overlay
    uDim: { value: 0 },
    // Heaven reality fracture
    uHeaven: { value: 0 },
    // Gravity distortion (C-Moon)
    uGravity: { value: 0 },
    uFade: { value: 0 },
    uDamage: { value: 0 },
    uSaturation: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes;
    uniform float uVignette, uGrain, uFlash, uTimeStop, uTsWave, uErase, uDim, uHeaven, uGravity, uFade, uDamage, uSaturation;
    uniform vec3 uFlashColor, uTsTint; uniform vec2 uTsCenter;
    uniform float uExposure;
    varying vec2 vUv;
    // three.js ACESFilmicToneMapping + sRGB transfer, identical to OutputPass
    vec3 pthRRT(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 pthAces(vec3 color){
      const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      color *= uExposure / 0.6;
      color = ACESInputMat * color;
      color = pthRRT(color);
      color = ACESOutputMat * color;
      return clamp(color, 0.0, 1.0);
    }
    vec3 pthSRGB(vec3 c){ return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
    vec3 display(vec3 hdr){ return pthSRGB(pthAces(hdr)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
    void main(){
      vec2 uv = vUv;
      vec2 asp = vec2(uRes.x/uRes.y, 1.0);
      // gravity lensing
      if (uGravity > 0.001) {
        vec2 d = (uv-0.5)*asp; float r = length(d);
        uv += normalize(d+1e-5) * sin(r*18.0 - uTime*6.0) * 0.006 * uGravity / asp;
        uv.y += sin(uv.x*10.0 + uTime*2.0) * 0.004 * uGravity;
      }
      // King Crimson: fragmented, skipped frames
      if (uErase > 0.001) {
        float band = floor(uv.y * 14.0 + floor(uTime*9.0));
        float shift = (hash(vec2(band, floor(uTime*12.0))) - 0.5) * 0.06 * uErase;
        uv.x += shift;
      }
      // D4C: tearing seam between worlds
      if (uDim > 0.001) {
        float seam = abs(uv.x - 0.5 - 0.25*sin(uv.y*3.0 + uTime*0.7));
        uv.x += (seam < 0.08 ? 0.03 * uDim * sign(uv.x-0.5) : 0.0);
      }
      vec3 col;
      float ca = 0.0015 + uDim*0.012 + uErase*0.008 + uHeaven*0.006 + uTimeStop*0.003;
      vec2 cdir = (uv-0.5);
      col.r = texture2D(tDiffuse, uv + cdir*ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - cdir*ca).b;
      col = display(col);

      float lum = dot(col, vec3(0.299,0.587,0.114));
      col = mix(vec3(lum), col, uSaturation);

      // Time stop: colour inversion wave then a desaturated green-tinted frozen world
      if (uTimeStop > 0.001 || uTsWave > 0.001) {
        float r = length((uv-uTsCenter)*asp);
        float ring = smoothstep(uTsWave-0.12, uTsWave, r) * (1.0 - smoothstep(uTsWave, uTsWave+0.04, r));
        float inside = 1.0 - smoothstep(uTsWave-0.02, uTsWave+0.02, r);
        vec3 inv = vec3(1.0) - col;
        vec3 frozen = mix(vec3(lum), col, 0.18) * uTsTint * 1.15;
        vec3 tsCol = mix(col, frozen, uTimeStop);
        tsCol = mix(tsCol, inv, inside * step(0.001, uTsWave) * (1.0 - uTimeStop*0.85));
        tsCol += ring * vec3(0.9, 0.85, 0.4) * 0.6;
        col = tsCol;
      }
      if (uErase > 0.001) {
        col = mix(col, vec3(lum*1.2, lum*0.15, lum*0.25) + vec3(0.25,0.0,0.03), uErase*0.75);
        float sk = step(0.985, hash(vec2(floor(uv.y*240.0), floor(uTime*20.0))));
        col += sk * uErase * vec3(0.6,0.05,0.1);
      }
      if (uDim > 0.001) {
        vec3 alt = display(texture2D(tDiffuse, vec2(1.0-uv.x, uv.y)).rgb);
        col = mix(col, col*0.6 + alt.bgr*0.5, uDim*0.35);
        float seam = abs(vUv.x - 0.5 - 0.25*sin(vUv.y*3.0 + uTime*0.7));
        col += (1.0 - smoothstep(0.0, 0.03, seam)) * uDim * vec3(0.7,0.9,1.0);
      }
      if (uHeaven > 0.001) {
        vec2 p = (uv-0.5)*asp*6.0;
        float cracks = 0.0;
        for (int i=0;i<3;i++){
          float a = float(i)*2.1 + 0.3;
          vec2 dir = vec2(cos(a), sin(a));
          float lineD = abs(dot(p, vec2(-dir.y, dir.x)) + noise(p*1.7 + float(i))*0.6);
          cracks += (1.0 - smoothstep(0.0, 0.05, lineD)) * step(0.0, dot(p, dir) + 3.0);
        }
        col = mix(col, col*vec3(1.15,1.08,0.9) + vec3(0.08,0.07,0.03), uHeaven*0.5);
        col += cracks * uHeaven * vec3(1.0,0.92,0.7);
      }
      // grading: cool night with warm highlights
      col = mix(col, col*vec3(0.92,0.98,1.08), 0.35);
      col += vec3(0.012,0.008,0.0) * smoothstep(0.5, 1.0, lum);
      // damage pulse
      float edge = length((vUv-0.5)*vec2(1.2,1.0));
      col = mix(col, vec3(0.5,0.0,0.02), uDamage * smoothstep(0.35, 0.75, edge));
      // vignette + grain
      col *= mix(1.0, smoothstep(0.95, 0.25, edge), uVignette);
      col += (hash(vUv*uRes + fract(uTime*7.3)) - 0.5) * uGrain;
      col = mix(col, uFlashColor, uFlash);
      col = mix(col, vec3(0.0), uFade);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export const QUALITY = {
  low: { pixelRatio: 0.75, shadows: 1024, bloom: false, maxLights: 4, drawDistance: 260, grass: 0.35, trees: 0.5 },
  medium: { pixelRatio: 1.0, shadows: 1536, bloom: true, maxLights: 6, drawDistance: 340, grass: 0.6, trees: 0.75 },
  high: { pixelRatio: 1.25, shadows: 2048, bloom: true, maxLights: 8, drawDistance: 430, grass: 1.0, trees: 1.0 },
  ultra: { pixelRatio: 2.0, shadows: 4096, bloom: true, maxLights: 10, drawDistance: 520, grass: 1.3, trees: 1.2 },
};

export class Engine {
  constructor(canvasParent) {
    this.parent = canvasParent;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.3;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.style.display = 'block';
    r.domElement.style.width = '100%';
    r.domElement.style.height = '100%';
    r.domElement.tabIndex = 0;
    canvasParent.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2200);
    this.composer = new EffectComposer(r);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.fx = this.final.uniforms;

    this.quality = 'high';
    this.settings = QUALITY.high;
    this.clock = new THREE.Clock();
    this.time = 0;        // real seconds
    this.timeScale = 1;   // global slow motion
    this.hitstop = 0;     // seconds of freeze-frame remaining
    this.systems = [];
    this.running = false;
    this.fps = 60;
    this._fpsAcc = 0; this._fpsN = 0;
    this._resize = () => this.resize();
    window.addEventListener('resize', this._resize);
    this.resize();
    r.info.autoReset = false;
    prof.init(r);
    this.prof = prof;
    if (new URLSearchParams(window.location.search).has('prof')) prof.enabled = true;
  }

  setQuality(q) {
    this.quality = QUALITY[q] ? q : 'high';
    this.settings = QUALITY[this.quality];
    this.bloom.enabled = this.settings.bloom;
    this.resize();
    for (const s of this.systems) if (s.onQuality) s.onQuality(this.settings);
  }

  resize() {
    const w = this.parent.clientWidth || window.innerWidth;
    const h = this.parent.clientHeight || window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.settings.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.setSize(Math.floor(w * pr / 2), Math.floor(h * pr / 2));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fx.uRes.value.set(w * pr, h * pr);
  }

  add(system) { this.systems.push(system); return system; }
  remove(system) { this.systems = this.systems.filter((s) => s !== system); }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    const loop = () => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(loop);
      this.step();
    };
    loop();
  }

  step() {
    const t0 = performance.now();
    const raw = Math.min(this.clock.getDelta(), 0.1);
    this.renderer.info.reset();
    this.time += raw;
    this._fpsAcc += raw; this._fpsN += 1;
    if (this._fpsAcc > 0.5) { this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; }
    let dt = raw * this.timeScale;
    if (this.hitstop > 0) { this.hitstop -= raw; dt *= 0.05; }
    this.fx.uTime.value = this.time;
    prof.begin('update');
    for (const s of this.systems) if (s.update) s.update(dt, raw);
    prof.end('update');
    prof.begin('render');
    prof.gpuBegin();
    this.composer.render(raw);
    prof.gpuEnd();
    prof.end('render');
    prof.frame(raw * 1000);
    this.cpuMs = performance.now() - t0;
    if (prof.enabled) { prof.begin('cpuTotal'); prof.sections.get('cpuTotal').start = t0; prof.end('cpuTotal'); }
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._resize);
    this.renderer.dispose();
    this.composer.dispose?.();
    if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
  }
}
