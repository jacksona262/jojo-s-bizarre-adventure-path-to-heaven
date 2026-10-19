// Fully procedural, original audio: ambience, sound effects and a generative score.
// Nothing here is sampled from existing recordings.

const A_MINOR = [57, 60, 62, 64, 67, 69, 72, 74, 76]; // A minor pentatonic-ish (MIDI)
const D_PHRYG = [50, 51, 55, 57, 58, 62, 63, 65];
const midi = (m) => 440 * 2 ** ((m - 69) / 12);

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volumes = { master: 0.8, music: 0.55, sfx: 0.85, ambience: 0.7 };
    this.music = { mode: 'none', next: 0, step: 0, intensity: 0 };
    this.rainLevel = 0;
    this.windLevel = 0;
    this.frozen = false;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(ctx.destination);
    this.musicBus = ctx.createGain(); this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain(); this.ambBus.connect(this.master);
    // shared reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.8, 2.2);
    this.revSend = ctx.createGain(); this.revSend.gain.value = 0.35;
    this.revSend.connect(this.reverb).connect(this.master);
    this.noise = this._noiseBuffer('white');
    this.pink = this._noiseBuffer('pink');
    this.brown = this._noiseBuffer('brown');
    this._startAmbience();
    this.applyVolumes();
  }

  applyVolumes(v) {
    if (v) Object.assign(this.volumes, v);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * (this.frozen ? 0.25 : 1), t, 0.1);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.volumes.ambience * (this.frozen ? 0.0 : 1), t, this.frozen ? 0.05 : 0.4);
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c += 1) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
    }
    return buf;
  }

  _noiseBuffer(kind) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0; let b1 = 0; let b2 = 0; let last = 0;
    for (let i = 0; i < len; i += 1) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'pink') {
        b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
      } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    return buf;
  }

  _src(buf, loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = loop;
    return s;
  }

  _env(gainNode, t, a, peak, d, sustain = 0) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
  }

  // ------------------------------------------------------------ ambience
  _startAmbience() {
    const ctx = this.ctx;
    // rain: pink noise through bandpass + high shelf hiss
    const rain = this._src(this.pink, true);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.4;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    rain.connect(bp).connect(hp).connect(this.rainGain).connect(this.ambBus);
    rain.start();
    // patter: white noise with fast random gate
    const pat = this._src(this.noise, true);
    const pf = ctx.createBiquadFilter(); pf.type = 'highpass'; pf.frequency.value = 3800;
    this.patGain = ctx.createGain(); this.patGain.gain.value = 0;
    pat.connect(pf).connect(this.patGain).connect(this.ambBus);
    pat.start();
    // wind: brown noise with moving lowpass
    const wind = this._src(this.brown, true);
    this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = 'lowpass'; this.windFilter.frequency.value = 400; this.windFilter.Q.value = 3;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.ambBus);
    wind.start();
  }

  setWeather(rain, wind) {
    this.rainLevel = rain; this.windLevel = wind;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(0.32 * rain, t, 0.8);
    this.patGain.gain.setTargetAtTime(0.05 * rain, t, 0.8);
    this.windGain.gain.setTargetAtTime(0.28 * wind, t, 1.2);
  }

  setFrozen(on) {
    this.frozen = on;
    this.applyVolumes();
  }

  tickAmbience(time) {
    if (!this.ctx || this.frozen) return;
    const t = this.ctx.currentTime;
    this.windFilter.frequency.setTargetAtTime(280 + Math.sin(time * 0.23) * 160 + Math.sin(time * 0.71) * 90, t, 0.5);
  }

  // ------------------------------------------------------------ sfx primitives
  _noiseHit({ freq = 800, q = 1, type = 'bandpass', dur = 0.15, gain = 0.5, attack = 0.002, buf = null, rate = 1, delay = 0, rev = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const s = this._src(buf || this.noise);
    s.playbackRate.value = rate;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    s.connect(f).connect(g).connect(this.sfxBus);
    if (rev) { const r = ctx.createGain(); r.gain.value = rev; g.connect(r).connect(this.revSend); }
    this._env(g, t, attack, gain, dur);
    s.start(t, Math.random() * 2);
    s.stop(t + attack + dur + 0.1);
    return f;
  }

  _tone({ freq = 220, type = 'sine', dur = 0.3, gain = 0.3, attack = 0.005, slideTo = null, delay = 0, rev = 0, bus = null }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    o.connect(g).connect(bus || this.sfxBus);
    if (rev) { const r = ctx.createGain(); r.gain.value = rev; g.connect(r).connect(this.revSend); }
    this._env(g, t, attack, gain, dur);
    o.start(t); o.stop(t + attack + dur + 0.05);
    return o;
  }

  // Karplus-Strong plucked string (used by the score and UI).
  pluck(freq, { gain = 0.25, decay = 0.985, delay = 0, bright = 3000, bus = null } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const burst = this._src(this.noise);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(gain, t); bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    const dl = ctx.createDelay(0.05); dl.delayTime.value = 1 / freq;
    const fb = ctx.createGain(); fb.gain.value = decay;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = bright;
    const out = ctx.createGain(); out.gain.setValueAtTime(1, t); out.gain.setTargetAtTime(0.0001, t + 1.5, 0.6);
    burst.connect(bg).connect(dl);
    dl.connect(lp).connect(fb).connect(dl);
    lp.connect(out).connect(bus || this.musicBus);
    const rs = ctx.createGain(); rs.gain.value = 0.25; out.connect(rs).connect(this.revSend);
    burst.start(t, Math.random()); burst.stop(t + 0.05);
    setTimeout(() => { try { out.disconnect(); dl.disconnect(); fb.disconnect(); } catch { /* already gone */ } }, (delay + 4) * 1000);
  }

  // ------------------------------------------------------------ game sfx
  play(name, opts = {}) {
    if (!this.ctx) return;
    const p = opts.power ?? 1;
    switch (name) {
      case 'punch':
        this._noiseHit({ freq: 180 + Math.random() * 60, q: 0.8, type: 'lowpass', dur: 0.12, gain: 0.55 * p });
        this._noiseHit({ freq: 1800, q: 1.5, dur: 0.05, gain: 0.18 * p });
        this._tone({ freq: 90, slideTo: 45, dur: 0.12, gain: 0.35 * p });
        break;
      case 'hit':
        this._noiseHit({ freq: 240, type: 'lowpass', dur: 0.2, gain: 0.7 * p, rev: 0.2 });
        this._tone({ freq: 70, slideTo: 35, dur: 0.22, gain: 0.5 * p });
        this._noiseHit({ freq: 3200, q: 2, dur: 0.06, gain: 0.25 * p });
        break;
      case 'heavyHit':
        this._noiseHit({ freq: 160, type: 'lowpass', dur: 0.45, gain: 0.9, rev: 0.4 });
        this._tone({ freq: 55, slideTo: 28, dur: 0.5, gain: 0.7 });
        this._noiseHit({ freq: 900, q: 0.7, dur: 0.25, gain: 0.35 });
        break;
      case 'block':
        this._noiseHit({ freq: 2600, q: 6, dur: 0.12, gain: 0.35 });
        this._tone({ freq: 620, type: 'triangle', dur: 0.18, gain: 0.12 });
        break;
      case 'counter':
        this._tone({ freq: 1320, type: 'triangle', dur: 0.5, gain: 0.25, rev: 0.6 });
        this._tone({ freq: 1980, type: 'sine', dur: 0.6, gain: 0.15, delay: 0.03, rev: 0.6 });
        this._noiseHit({ freq: 4000, q: 3, dur: 0.1, gain: 0.3 });
        break;
      case 'whoosh':
        this._noiseHit({ freq: 700 + Math.random() * 300, q: 1.2, dur: 0.18, gain: 0.22 * p, attack: 0.04 });
        break;
      case 'dodge':
        this._noiseHit({ freq: 500, q: 0.8, dur: 0.25, gain: 0.3, attack: 0.05 });
        break;
      case 'summon': {
        const f = this._noiseHit({ freq: 300, q: 4, dur: 0.6, gain: 0.35, attack: 0.15, rev: 0.6 });
        if (f) f.frequency.exponentialRampToValueAtTime(3000, this.ctx.currentTime + 0.6);
        this._tone({ freq: 110, type: 'sawtooth', dur: 0.7, gain: 0.12, slideTo: 220, rev: 0.5 });
        break;
      }
      case 'timeStop': {
        // reverse swell -> heavy toll -> silence with a clock
        const f = this._noiseHit({ freq: 200, q: 2, dur: 0.9, gain: 0.5, attack: 0.8, rev: 0.5 });
        if (f) f.frequency.exponentialRampToValueAtTime(6000, this.ctx.currentTime + 0.85);
        this._tone({ freq: 65, type: 'sine', dur: 2.8, gain: 0.7, delay: 0.85, rev: 0.9 });
        this._tone({ freq: 130.8, type: 'triangle', dur: 2.4, gain: 0.25, delay: 0.85, rev: 0.9 });
        this._tone({ freq: 196, type: 'sine', dur: 2.0, gain: 0.12, delay: 0.86, rev: 0.9 });
        break;
      }
      case 'timeResume': {
        const f = this._noiseHit({ freq: 6000, q: 1.5, dur: 0.6, gain: 0.4, attack: 0.02, rev: 0.4 });
        if (f) f.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.6);
        this._tone({ freq: 220, slideTo: 880, type: 'triangle', dur: 0.35, gain: 0.15 });
        break;
      }
      case 'tick':
        this._noiseHit({ freq: 5200, q: 12, dur: 0.03, gain: 0.25 });
        this._tone({ freq: 2400, type: 'square', dur: 0.015, gain: 0.04 });
        break;
      case 'heartbeat':
        this._tone({ freq: 55, slideTo: 40, dur: 0.14, gain: 0.5 });
        this._tone({ freq: 50, slideTo: 38, dur: 0.16, gain: 0.4, delay: 0.22 });
        break;
      case 'fire':
        this._noiseHit({ freq: 900, q: 0.6, dur: 0.5, gain: 0.35 * p, attack: 0.05, buf: this.pink });
        this._noiseHit({ freq: 200, type: 'lowpass', dur: 0.4, gain: 0.3 * p });
        break;
      case 'emerald':
        for (let i = 0; i < 5; i += 1) this._tone({ freq: 1800 + Math.random() * 1600, type: 'sine', dur: 0.15, gain: 0.07, delay: i * 0.03, rev: 0.5 });
        break;
      case 'sword':
        this._tone({ freq: 2200 + Math.random() * 400, type: 'triangle', dur: 0.35, gain: 0.12, rev: 0.4 });
        this._tone({ freq: 3300, type: 'sine', dur: 0.4, gain: 0.06, rev: 0.4 });
        this._noiseHit({ freq: 5000, q: 2, dur: 0.08, gain: 0.25 });
        break;
      case 'restore': {
        for (let i = 0; i < 6; i += 1) this._tone({ freq: midi(84 - i * 3), type: 'sine', dur: 0.25, gain: 0.06, delay: i * 0.05, rev: 0.7 });
        break;
      }
      case 'explosion':
        this._noiseHit({ freq: 120, type: 'lowpass', dur: 1.2, gain: 1.0 * p, buf: this.brown, rev: 0.6 });
        this._noiseHit({ freq: 600, q: 0.5, dur: 0.6, gain: 0.5 * p });
        this._tone({ freq: 50, slideTo: 25, dur: 0.9, gain: 0.7 * p });
        break;
      case 'click':
        this._noiseHit({ freq: 3000, q: 8, dur: 0.03, gain: 0.3 });
        break;
      case 'erase': {
        const o = this._tone({ freq: 800, slideTo: 60, type: 'sawtooth', dur: 0.7, gain: 0.18, rev: 0.6 });
        this._noiseHit({ freq: 1500, q: 0.6, dur: 0.6, gain: 0.3, attack: 0.3 });
        void o;
        break;
      }
      case 'epitaph':
        this._tone({ freq: 880, type: 'square', dur: 0.08, gain: 0.05 });
        this._tone({ freq: 660, type: 'square', dur: 0.08, gain: 0.05, delay: 0.1 });
        break;
      case 'dimension': {
        const f = this._noiseHit({ freq: 400, q: 8, dur: 0.8, gain: 0.35, attack: 0.2, rev: 0.7 });
        if (f) { f.frequency.exponentialRampToValueAtTime(2400, this.ctx.currentTime + 0.4); f.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.9); }
        this._tone({ freq: 233, type: 'triangle', dur: 0.9, gain: 0.1, rev: 0.8 });
        break;
      }
      case 'gravity':
        this._tone({ freq: 70, slideTo: 30, type: 'sine', dur: 1.0, gain: 0.6 });
        this._noiseHit({ freq: 120, type: 'lowpass', dur: 0.8, gain: 0.4, buf: this.brown });
        break;
      case 'life':
        for (let i = 0; i < 4; i += 1) this._tone({ freq: midi(72 + [0, 4, 7, 12][i]), type: 'sine', dur: 0.4, gain: 0.08, delay: i * 0.06, rev: 0.7 });
        break;
      case 'thunder': {
        const d = opts.distance ?? 0.5;
        this._noiseHit({ freq: 2000 * (1 - d) + 200, q: 0.3, dur: 0.25, gain: 0.5 * (1 - d), buf: this.noise, delay: d * 0.8 });
        this._noiseHit({ freq: 90, type: 'lowpass', dur: 3.5, gain: 0.9 - d * 0.4, buf: this.brown, attack: 0.08, delay: d * 1.2, rev: 0.5 });
        break;
      }
      case 'hoof':
        this._noiseHit({ freq: opts.wood ? 900 : 260, q: 1.4, type: 'bandpass', dur: 0.07, gain: 0.22 * p });
        this._tone({ freq: 110, slideTo: 70, dur: 0.06, gain: 0.12 * p });
        break;
      case 'step':
        this._noiseHit({ freq: opts.wood ? 700 : 320, q: 1.1, dur: 0.06, gain: 0.08 * p });
        break;
      case 'neigh': {
        const ctx = this.ctx; const t = ctx.currentTime;
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(520, t); o.frequency.linearRampToValueAtTime(900, t + 0.25); o.frequency.linearRampToValueAtTime(380, t + 1.1);
        const lfo = ctx.createOscillator(); lfo.frequency.value = 18; const lg = ctx.createGain(); lg.gain.value = 40;
        lfo.connect(lg).connect(o.frequency);
        const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 1100; f1.Q.value = 5;
        const g = ctx.createGain(); o.connect(f1).connect(g).connect(this.sfxBus);
        const r = ctx.createGain(); r.gain.value = 0.3; g.connect(r).connect(this.revSend);
        this._env(g, t, 0.05, 0.25, 1.1);
        o.start(t); lfo.start(t); o.stop(t + 1.2); lfo.stop(t + 1.2);
        break;
      }
      case 'bullet':
        this._noiseHit({ freq: 1500, q: 0.5, dur: 0.18, gain: 0.7, rev: 0.5 });
        this._tone({ freq: 160, slideTo: 60, dur: 0.15, gain: 0.4 });
        break;
      case 'splash':
        this._noiseHit({ freq: 1200, q: 0.6, dur: 0.35, gain: 0.35 * p, attack: 0.01, buf: this.pink });
        break;
      case 'void':
        this._tone({ freq: 45, type: 'sawtooth', dur: 0.8, gain: 0.25 });
        this._noiseHit({ freq: 300, q: 3, dur: 0.8, gain: 0.25, attack: 0.3 });
        break;
      case 'uiHover': this._tone({ freq: 1400, type: 'sine', dur: 0.05, gain: 0.04 }); break;
      case 'uiSelect': this.pluck(midi(76), { gain: 0.3, bus: this.sfxBus }); this.pluck(midi(81), { gain: 0.2, delay: 0.05, bus: this.sfxBus }); break;
      case 'quest': [69, 72, 76, 81].forEach((m, i) => this.pluck(midi(m), { gain: 0.25, delay: i * 0.12, bus: this.sfxBus })); break;
      case 'stinger':
        this._tone({ freq: 73.4, type: 'sawtooth', dur: 1.6, gain: 0.25, rev: 0.8 });
        this._tone({ freq: 77.8, type: 'sawtooth', dur: 1.6, gain: 0.2, rev: 0.8 });
        this._noiseHit({ freq: 100, type: 'lowpass', dur: 1.4, gain: 0.6, buf: this.brown, rev: 0.6 });
        break;
      case 'menacing':
        for (let i = 0; i < 4; i += 1) this._tone({ freq: 98, type: 'square', dur: 0.12, gain: 0.05, delay: i * 0.5 });
        break;
      default: break;
    }
  }

  // ------------------------------------------------------------ generative score
  setMusic(mode, intensity = 0.5) {
    this.music.mode = mode;
    this.music.intensity = intensity;
    if (this.ctx) this.music.next = Math.max(this.music.next, this.ctx.currentTime + 0.05);
    if (mode !== this._padMode) this._startPad(mode);
  }

  _startPad(mode) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (this.pad) {
      const old = this.pad;
      old.gain.gain.setTargetAtTime(0.0001, t, 1.2);
      setTimeout(() => old.oscs.forEach((o) => { try { o.stop(); } catch { /* stopped */ } }), 5000);
      this.pad = null;
    }
    this._padMode = mode;
    if (mode === 'none') return;
    const roots = { title: [45, 52, 57, 60], explore: [45, 52, 60, 64], boss: [38, 45, 50, 53], heaven: [50, 57, 62, 66, 69], tension: [40, 47, 50, 55], versus: [43, 50, 55, 58], credits: [45, 52, 57, 64] };
    const notes = roots[mode] || roots.explore;
    const gain = ctx.createGain(); gain.gain.value = 0.0001;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = mode === 'heaven' ? 2200 : 900; lp.Q.value = 0.7;
    gain.connect(lp).connect(this.musicBus);
    const rs = ctx.createGain(); rs.gain.value = 0.5; lp.connect(rs).connect(this.revSend);
    const oscs = [];
    for (const n of notes) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator(); o.type = mode === 'heaven' ? 'triangle' : 'sawtooth';
        o.frequency.value = midi(n); o.detune.value = det;
        const g = ctx.createGain(); g.gain.value = 0.035;
        o.connect(g).connect(gain); o.start(); oscs.push(o);
      }
    }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 350;
    lfo.connect(lg).connect(lp.frequency); lfo.start(); oscs.push(lfo);
    gain.gain.setTargetAtTime(mode === 'boss' ? 0.55 : 0.45, t, 2.0);
    this.pad = { gain, oscs };
  }

  tickMusic() {
    if (!this.ctx || this.music.mode === 'none') return;
    const ctx = this.ctx;
    const m = this.music;
    const ahead = ctx.currentTime + 0.25;
    while (m.next < ahead) {
      const t = m.next - ctx.currentTime;
      const s = m.step;
      if (this.frozen) {
        if (s % 4 === 0) this.play('tick');
        m.next += 0.5; m.step += 1;
        continue;
      }
      switch (m.mode) {
        case 'title':
        case 'credits': {
          // slow solitary guitar over the pad
          if (s % 2 === 0) this.pluck(midi(A_MINOR[[0, 4, 3, 5, 2, 4, 1, 3][(s / 2) % 8]] - 12), { gain: 0.22, delay: t, decay: 0.992, bright: 1800 });
          if (s % 8 === 5) this.pluck(midi(A_MINOR[6]), { gain: 0.12, delay: t + 0.1, decay: 0.99 });
          m.next += 0.75; break;
        }
        case 'explore': {
          const pat = [0, null, 2, null, 4, 3, null, 1, 0, null, 5, null, 4, null, 2, null];
          const n = pat[s % 16];
          if (n !== null && Math.random() < 0.85) this.pluck(midi(A_MINOR[n] - 12), { gain: 0.16, delay: t, decay: 0.988, bright: 2200 });
          if (s % 16 === 0) this.pluck(midi(45 - 12), { gain: 0.25, delay: t, decay: 0.995, bright: 600 });
          m.next += 0.42; break;
        }
        case 'tension': {
          if (s % 2 === 0) this._tone({ freq: midi(40), type: 'triangle', dur: 0.3, gain: 0.12, delay: t, bus: this.musicBus });
          if (s % 8 === 7) this.pluck(midi(D_PHRYG[1]), { gain: 0.14, delay: t, decay: 0.98 });
          m.next += 0.5; break;
        }
        case 'boss':
        case 'versus': {
          // driving war drums, ostinato and stabs
          const i = m.intensity;
          if (s % 4 === 0 || (s % 8 === 6 && i > 0.4)) {
            this._tone({ freq: 62, slideTo: 38, dur: 0.25, gain: 0.5, delay: t, bus: this.musicBus });
            this._noiseHit({ freq: 140, type: 'lowpass', dur: 0.2, gain: 0.35, delay: t });
          }
          if (s % 8 === 4) this._noiseHit({ freq: 1800, q: 0.6, dur: 0.18, gain: 0.25 + i * 0.1, delay: t, rev: 0.2 });
          const bass = [38, 38, 41, 38, 43, 41, 38, 36][s % 8];
          this.pluck(midi(bass), { gain: 0.2, delay: t, decay: 0.97, bright: 900 });
          if (i > 0.55 && s % 16 === 0) {
            this._tone({ freq: midi(62), type: 'sawtooth', dur: 0.5, gain: 0.08, delay: t, rev: 0.4, bus: this.musicBus });
            this._tone({ freq: midi(65), type: 'sawtooth', dur: 0.5, gain: 0.07, delay: t, rev: 0.4, bus: this.musicBus });
          }
          if (i > 0.75 && s % 2 === 1) this._noiseHit({ freq: 6000, q: 1, dur: 0.03, gain: 0.08, delay: t });
          m.next += 0.19 - i * 0.03; break;
        }
        case 'heaven': {
          if (s % 3 === 0) this._tone({ freq: midi([74, 78, 81, 86, 81, 78][(s / 3) % 6]), type: 'sine', dur: 1.6, gain: 0.09, delay: t, rev: 1, bus: this.musicBus });
          if (s % 6 === 0) this._tone({ freq: midi(50), type: 'triangle', dur: 2.2, gain: 0.18, delay: t, rev: 0.8, bus: this.musicBus });
          m.next += 0.4; break;
        }
        default: m.next += 0.5;
      }
      m.step += 1;
    }
  }
}

export const audio = new AudioEngine();
