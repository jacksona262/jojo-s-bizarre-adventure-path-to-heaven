// Lightweight frame profiler: CPU section timings (EMA + max), GPU time via
// EXT_disjoint_timer_query_webgl2 when available, renderer stats and JS heap.
// Disabled unless enabled from the dev tools or ?prof.

const now = () => performance.now();

class Profiler {
  constructor() {
    this.enabled = false;
    this.sections = new Map(); // name -> { ema, max, last, start }
    this.frameMs = 0;
    this.frameMax = 0;
    this.frames = 0;
    this.spikes = 0;
    this.gpuMs = null;
    this._gpu = null;
    this.history = new Float32Array(240);
    this.hi = 0;
  }

  init(renderer) {
    const gl = renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (ext) this._gpu = { gl, ext, pending: [], free: [] };
    this.renderer = renderer;
  }

  begin(name) {
    if (!this.enabled) return;
    let s = this.sections.get(name);
    if (!s) { s = { ema: 0, max: 0, last: 0, start: 0 }; this.sections.set(name, s); }
    s.start = now();
  }

  end(name) {
    if (!this.enabled) return;
    const s = this.sections.get(name);
    if (!s) return;
    const d = now() - s.start;
    s.last = d;
    s.ema = s.ema * 0.95 + d * 0.05;
    s.max = Math.max(s.max * 0.995, d);
  }

  gpuBegin() {
    if (!this.enabled || !this._gpu) return;
    const { gl, ext, free } = this._gpu;
    const q = free.pop() || gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    this._gpu.cur = q;
  }

  gpuEnd() {
    if (!this.enabled || !this._gpu || !this._gpu.cur) return;
    const { gl, ext, pending, free } = this._gpu;
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    pending.push(this._gpu.cur);
    this._gpu.cur = null;
    while (pending.length) {
      const q = pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      pending.shift();
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        this.gpuMs = this.gpuMs === null ? ms : this.gpuMs * 0.9 + ms * 0.1;
      }
      free.push(q);
    }
  }

  frame(ms) {
    if (!this.enabled) return;
    this.frames += 1;
    this.frameMs = this.frameMs * 0.95 + ms * 0.05;
    this.frameMax = Math.max(this.frameMax * 0.995, ms);
    if (ms > 33) this.spikes += 1;
    this.history[this.hi] = ms;
    this.hi = (this.hi + 1) % this.history.length;
  }

  reset() {
    this.sections.clear();
    this.frameMs = 0; this.frameMax = 0; this.frames = 0; this.spikes = 0; this.gpuMs = null;
  }

  report() {
    const info = this.renderer?.info;
    const sec = {};
    for (const [k, s] of this.sections) sec[k] = { avg: +s.ema.toFixed(2), max: +s.max.toFixed(1) };
    const sorted = [...this.history].filter((x) => x > 0).sort((a, b) => a - b);
    const p = (q) => (sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))].toFixed(1) : 0);
    return {
      frameAvgMs: +this.frameMs.toFixed(2), frameMaxMs: +this.frameMax.toFixed(1), p50: p(0.5), p95: p(0.95), p99: p(0.99),
      spikesOver33ms: this.spikes, frames: this.frames,
      gpuMs: this.gpuMs === null ? 'unavailable' : +this.gpuMs.toFixed(2),
      calls: info?.render.calls, triangles: info?.render.triangles, geometries: info?.memory.geometries, textures: info?.memory.textures,
      programs: info?.programs?.length,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : 'n/a',
      sections: sec,
    };
  }
}

export const prof = new Profiler();
