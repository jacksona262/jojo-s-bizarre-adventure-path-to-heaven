// Procedural Web Audio API Sound, Storm Ambience, Horse Hoofbeat & Stand SFX Synthesizer
// 100% original synthesized audio — no copyrighted tracks or external audio files required.

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.stormNode = null;
    this.stormGain = null;
    this.musicInterval = null;
    this.isMuted = false;
    this.settings = {
      masterVolume: 0.75,
      sfxVolume: 0.85,
      stormVolume: 0.55,
      musicVolume: 0.45,
    };
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.settings.masterVolume;
    this.masterGain.connect(this.ctx.destination);

    this.startStormAmbience();
    this.startAmbientScore();
  }

  updateSettings(partial) {
    this.settings = { ...this.settings, ...partial };
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.isMuted ? 0 : this.settings.masterVolume,
        this.ctx.currentTime,
        0.05
      );
    }
    if (this.stormGain && this.ctx) {
      this.stormGain.gain.setTargetAtTime(
        this.settings.stormVolume * 0.18,
        this.ctx.currentTime,
        0.1
      );
    }
  }

  startStormAmbience() {
    if (!this.ctx || this.stormNode) return;
    // Generate 3 seconds of pink/brown wind + rain noise buffer
    const bufferSize = this.ctx.sampleRate * 3;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.03 * white) / 1.03;
      lastOut = data[i];
      data[i] *= 1.8;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.7;

    this.stormGain = this.ctx.createGain();
    this.stormGain.gain.value = this.settings.stormVolume * 0.16;

    noise.connect(filter);
    filter.connect(this.stormGain);
    this.stormGain.connect(this.masterGain);
    noise.start();
    this.stormNode = noise;
  }

  startAmbientScore() {
    if (!this.ctx || this.musicInterval) return;
    // Dark western minor arpeggio notes (D minor / Phrygian gothic frontier feel)
    const scale = [146.83, 155.56, 174.61, 220.0, 233.08, 293.66, 261.63, 196.0];
    let step = 0;
    this.musicInterval = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running' || this.isMuted) return;
      if (this.settings.musicVolume <= 0.01) return;
      const freq = scale[step % scale.length];
      step++;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = step % 3 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq * 0.5, now);

      const vol = 0.04 * this.settings.musicVolume;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 2.9);
    }, 2400);
  }

  playThunder() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 1.8);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(240, now);
    filter.frequency.exponentialRampToValueAtTime(55, now + 1.8);

    gain.gain.setValueAtTime(0.32 * this.settings.stormVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.9);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 2.0);
  }

  playHoofbeat(surface = 'dirt', speedRatio = 0.5) {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const baseFreq = surface === 'water' ? 280 : surface === 'wood' ? 190 : 125;
    osc.type = surface === 'water' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(baseFreq * (0.9 + Math.random() * 0.2), now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.085);

    const vol = Math.min(0.22, 0.08 + speedRatio * 0.12) * this.settings.sfxVolume;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playWhistle() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1150, now);
    osc.frequency.linearRampToValueAtTime(1680, now + 0.18);
    osc.frequency.linearRampToValueAtTime(1320, now + 0.42);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18 * this.settings.sfxVolume, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.46);
  }

  playStandSummon(isHeaven = false) {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const freqs = isHeaven ? [440, 659.25, 880, 1318.5] : [220, 329.63, 440];
    freqs.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = isHeaven ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(f * 0.5, now);
      osc.frequency.exponentialRampToValueAtTime(f * 1.25, now + 0.35 + idx * 0.05);

      gain.gain.setValueAtTime(0.09 * this.settings.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.5);
    });
  }

  playTimeStop(isHeaven = false) {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Iconic deep sub-bass warp + ticking resonance
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(isHeaven ? 260 : 180, now);
    sub.frequency.exponentialRampToValueAtTime(24, now + 1.15);

    subGain.gain.setValueAtTime(0.42 * this.settings.sfxVolume, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.25);

    sub.connect(subGain);
    subGain.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + 1.3);

    // 4 rapid clock ticks
    for (let i = 0; i < 4; i++) {
      const t = now + 0.25 + i * 0.16;
      const tick = this.ctx.createOscillator();
      const tGain = this.ctx.createGain();
      tick.type = 'square';
      tick.frequency.setValueAtTime(980 - i * 140, t);
      tGain.gain.setValueAtTime(0.14 * this.settings.sfxVolume, t);
      tGain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
      tick.connect(tGain);
      tGain.connect(this.masterGain);
      tick.start(t);
      tick.stop(t + 0.05);
    }
  }

  playTimeResume() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(40, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.45);
    gain.gain.setValueAtTime(0.32 * this.settings.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.52);
  }

  playAttackImpact(type = 'light') {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (type === 'overwrite') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.38);
      gain.gain.setValueAtTime(0.35 * this.settings.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    } else if (type === 'heavy') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.24);
      gain.gain.setValueAtTime(0.3 * this.settings.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(260 + Math.random() * 90, now);
      osc.frequency.exponentialRampToValueAtTime(65, now + 0.09);
      gain.gain.setValueAtTime(0.18 * this.settings.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    }

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.42);
  }
}

export const soundEngine = new SoundEngine();