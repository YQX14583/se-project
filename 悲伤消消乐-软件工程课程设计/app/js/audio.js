/** 零素材音效：WebAudio 合成，不加载任何音频文件。失败时静默降级。 */
const PENTATONIC = [392, 440, 523.25, 587.33, 659.25, 783.99, 880];

export class AudioEngine {
  constructor(settings = { sfx: true, music: true }) {
    this.settings = { ...settings };
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.musicNodes = [];
    this.noiseBuffer = null;
    this.ready = false;
  }

  ensure() {
    if (this.ctx) return true;
    const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Ctx) return false;
    try {
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.settings.sfx ? 0.9 : 0;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.settings.music ? 0.05 : 0;
      this.musicGain.connect(this.master);
      this.noiseBuffer = this.makeNoise();
      this.ready = true;
      return true;
    } catch {
      this.ready = false;
      return false;
    }
  }

  makeNoise() {
    const length = Math.floor(this.ctx.sampleRate * 0.5);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  async unlock() {
    if (!this.ensure()) return;
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch { /* 忽略 */ }
    }
    this.startMusic();
  }

  setSettings(settings) {
    this.settings = { ...this.settings, ...settings };
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.sfxGain.gain.setTargetAtTime(this.settings.sfx ? 0.9 : 0, now, 0.05);
    this.musicGain.gain.setTargetAtTime(this.settings.music ? 0.05 : 0, now, 0.25);
    if (this.settings.music) this.startMusic();
  }

  tone({ freq = 440, duration = 0.16, type = 'sine', gain = 0.08, slide = null, delay = 0 }) {
    if (!this.settings.sfx || !this.ensure()) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const start = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), start + duration);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  noise({ duration = 0.25, gain = 0.05, delay = 0, filter = 800 } = {}) {
    if (!this.settings.sfx || !this.ensure()) return;
    const start = this.ctx.currentTime + delay;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = filter;
    band.Q.value = 0.8;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(band);
    band.connect(env);
    env.connect(this.sfxGain);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  play(name, options = {}) {
    if (!this.settings.sfx) return;
    if (name === 'select') {
      this.tone({ freq: 620, duration: 0.06, type: 'sine', gain: 0.045 });
    } else if (name === 'swap') {
      this.tone({ freq: 420, duration: 0.08, type: 'triangle', gain: 0.045 });
      this.tone({ freq: 560, duration: 0.1, type: 'triangle', gain: 0.035, delay: 0.04 });
    } else if (name === 'invalid') {
      this.tone({ freq: 180, duration: 0.18, type: 'sine', gain: 0.05, slide: 120 });
    } else if (name === 'match') {
      const chain = Math.max(1, Math.min(PENTATONIC.length, options.chain ?? 1));
      const freq = PENTATONIC[chain - 1];
      this.tone({ freq, duration: 0.18, type: 'triangle', gain: 0.07 });
      this.tone({ freq: freq * 1.5, duration: 0.14, type: 'sine', gain: 0.03, delay: 0.02 });
    } else if (name === 'cloud') {
      this.noise({ duration: 0.3, gain: 0.06, filter: 420 });
      this.tone({ freq: 220, duration: 0.3, type: 'sine', gain: 0.04, slide: 160 });
    } else if (name === 'heal') {
      this.tone({ freq: 523.25, duration: 0.3, type: 'sine', gain: 0.06 });
      this.tone({ freq: 659.25, duration: 0.35, type: 'sine', gain: 0.05, delay: 0.08 });
    } else if (name === 'item') {
      this.noise({ duration: 0.35, gain: 0.04, filter: 1400 });
      this.tone({ freq: 700, duration: 0.28, type: 'sine', gain: 0.04, slide: 1100 });
    } else if (name === 'layer') {
      this.tone({ freq: 392, duration: 0.4, type: 'sine', gain: 0.05 });
      this.tone({ freq: 523.25, duration: 0.5, type: 'sine', gain: 0.04, delay: 0.12 });
      this.tone({ freq: 659.25, duration: 0.7, type: 'sine', gain: 0.03, delay: 0.24 });
    } else if (name === 'win') {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
        this.tone({ freq, duration: 0.65, type: 'sine', gain: 0.06, delay: index * 0.12 });
      });
    } else if (name === 'lose') {
      [440, 392, 329.63, 261.63].forEach((freq, index) => {
        this.tone({ freq, duration: 0.5, type: 'sine', gain: 0.04, delay: index * 0.14 });
      });
    } else if (name === 'star') {
      this.tone({ freq: 880, duration: 0.18, type: 'sine', gain: 0.04 });
    } else if (name === 'click') {
      this.tone({ freq: 330, duration: 0.05, type: 'sine', gain: 0.035 });
    }
    if (name === 'match' && navigator.vibrate) navigator.vibrate(8);
  }

  startMusic() {
    if (!this.ensure() || !this.settings.music || this.musicNodes.length) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    const now = this.ctx.currentTime;
    const chord = [130.81, 164.81, 196.0, 246.94];
    chord.forEach((freq, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = index % 2 === 0 ? -4 : 4;
      gain.gain.value = 0.0001;
      gain.gain.exponentialRampToValueAtTime(0.012, now + 2.4 + index * 0.3);
      lfo.type = 'sine';
      lfo.frequency.value = 0.06 + index * 0.017;
      lfoGain.gain.value = 0.006;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(now);
      lfo.start(now);
      this.musicNodes.push(osc, lfo);
    });
  }

  stopMusic() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.musicGain.gain.setTargetAtTime(0.0001, now, 0.4);
    setTimeout(() => {
      for (const node of this.musicNodes) {
        try { node.stop(); } catch { /* 已停止 */ }
      }
      this.musicNodes = [];
      if (this.ctx) this.musicGain.gain.value = this.settings.music ? 0.05 : 0;
    }, 1200);
  }
}
