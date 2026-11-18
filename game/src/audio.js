// Procedural WebAudio sound: no audio files, everything is synthesized.
// The engine hum, gunshots, sirens, pickups and UI blips are all built
// from oscillators and filtered noise, so the game loads zero audio assets.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.muted = false;
  }

  // create the AudioContext on first user gesture (autoplay policy)
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this._startEngineHum();
  }

  _startEngineHum() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  // engine hum follows driving speed (0..1); silent on foot
  setEngine(speed01, on) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const target = on ? 0.02 + speed01 * 0.06 : 0.0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(50 + speed01 * 90, t, 0.1);
  }

  _noiseBurst(duration, filterFreq, gain) {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start();
  }

  _blip(freq, duration, gain, type = 'sine') {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  // short crack for a pistol shot
  gunshot() {
    this._noiseBurst(0.12, 1800, 0.5);
    this._blip(160, 0.08, 0.25, 'square');
  }

  // thud for a punch landing
  punch() {
    this._noiseBurst(0.08, 500, 0.4);
  }

  // two-note pickup chime
  pickup() {
    this._blip(660, 0.09, 0.3);
    setTimeout(() => this._blip(990, 0.12, 0.3), 70);
  }

  // cash register cha-ching
  cash() {
    this._blip(880, 0.07, 0.3);
    setTimeout(() => this._blip(1174, 0.07, 0.3), 60);
    setTimeout(() => this._blip(1568, 0.14, 0.3), 120);
  }

  // UI click
  uiClick() {
    this._blip(520, 0.05, 0.2);
  }

  // mission complete jingle
  missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this._blip(f, 0.16, 0.3), i * 110);
    });
  }

  // police siren loop, on/off
  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.035;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.6;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 260;
      lfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      lfo.start();
      this._sirenLfo = lfo;
    } else if (!on && this.sirenOsc) {
      try {
        this.sirenOsc.stop();
        this._sirenLfo.stop();
      } catch (e) {}
      this.sirenOsc = null;
      this.sirenGain = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }
}
