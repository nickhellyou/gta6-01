// audio.js — every sound is synthesized with WebAudio. No audio files, no
// network: oscillators and filtered noise, built lazily on first user gesture
// (browsers block audio before one) and silent in screenshot staging.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch { return false; }
    return true;
  }

  function noiseBuffer(seconds) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noiseHit(dur, vol, filterFreq) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq || 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  return {
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.5; return muted; },
    isMuted() { return muted; },
    shot() { noiseHit(0.14, 0.5, 2600); blip(220, 0.08, 'square', 0.18, 60); },
    punch() { noiseHit(0.09, 0.35, 900); },
    reload() { blip(700, 0.06, 'square', 0.12); setTimeout(() => blip(950, 0.06, 'square', 0.12), 110); },
    pickup() { blip(660, 0.09, 'sine', 0.25); setTimeout(() => blip(990, 0.14, 'sine', 0.25), 90); },
    sting() {
      blip(392, 0.16, 'triangle', 0.3); setTimeout(() => blip(523, 0.16, 'triangle', 0.3), 140);
      setTimeout(() => blip(659, 0.3, 'triangle', 0.3), 280);
    },
    fail() { blip(220, 0.25, 'sawtooth', 0.22, 110); },
    sirenBurst() { blip(950, 0.18, 'sine', 0.1, 1400); },
    engineStart(speed01) {
      if (!ensure() || muted) return;
      if (!engineOsc) {
        engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain(); engineGain.gain.value = 0;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
        engineOsc.connect(f); f.connect(engineGain); engineGain.connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.value = 55 + speed01 * 130;
      engineGain.gain.value = 0.05 + speed01 * 0.05;
    },
    engineStop() { if (engineGain) engineGain.gain.value = 0; },
    siren(on) {
      if (!ensure()) return;
      if (on && !sirenOsc) {
        sirenOsc = ctx.createOscillator(); sirenOsc.type = 'sine'; sirenOsc.frequency.value = 800;
        sirenLfo = ctx.createOscillator(); sirenLfo.frequency.value = 0.9;
        const lfoGain = ctx.createGain(); lfoGain.gain.value = 350;
        sirenLfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
        sirenGain = ctx.createGain(); sirenGain.gain.value = muted ? 0 : 0.045;
        sirenOsc.connect(sirenGain); sirenGain.connect(master);
        sirenOsc.start(); sirenLfo.start();
      } else if (!on && sirenOsc) {
        try { sirenOsc.stop(); sirenLfo.stop(); } catch { /* already stopped */ }
        sirenOsc = null; sirenLfo = null; sirenGain = null;
      }
      if (sirenGain) sirenGain.gain.value = muted ? 0 : 0.045;
    },
  };
}
