// All sound is synthesised with WebAudio: no audio files, no network.
// Engine hum is a sawtooth whose pitch follows speed; sirens are two alternating
// tones; shots are noise bursts. The radio is a small step sequencer whose
// pattern, tempo and scale come from the selected station in config.js.
import { RADIO_STATIONS } from './config.js';

const LEAD_LINES = [
  [0, 3, 5, 7, 10, 7, 5, 3, 0, 5, 7, 10, 12, 10, 7, 5],
  [0, 0, 3, 5, 7, 5, 3, 0, 10, 7, 5, 3, 5, 7, 10, 12],
  [0, 2, 4, 7, 9, 7, 4, 2, 0, 4, 7, 9, 12, 9, 7, 4],
];
const BASS_LINES = [[0, 0, 5, 3], [0, 3, 5, 7], [0, 0, 7, 5]];

export function createAudio() {
  let ctx = null, master = null, engineOsc = null, engineGain = null;
  let sirenOsc = null, sirenGain = null, sirenTimer = 0, sirenHigh = false;
  let musicTimer = 0, musicStep = 0, stationIndex = 0;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
      engineGain = ctx.createGain(); engineGain.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      engineOsc.connect(lp); lp.connect(engineGain); engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch { ctx = null; return false; }
  }
  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(Math.max(20, freq), t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, lowpass) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass || 1800;
    const g = ctx.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }
  function station() { return RADIO_STATIONS[stationIndex % RADIO_STATIONS.length]; }
  function noteFreq(semitones) { return station().root * Math.pow(2, semitones / 12); }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    get muted() { return muted; },
    get stationIndex() { return stationIndex; },
    setStation(i) { stationIndex = ((i % RADIO_STATIONS.length) + RADIO_STATIONS.length) % RADIO_STATIONS.length; musicStep = 0; musicTimer = 0; },
    stationName() { return station().name; },
    stationTag() { return station().tag; },
    shot() { noise(0.12, 0.5, 2400); tone(160, 0.08, 'square', 0.12, 60); },
    punch() { noise(0.07, 0.25, 900); },
    pickup() { tone(660, 0.09, 'sine', 0.2); setTimeout(() => tone(990, 0.12, 'sine', 0.2), 70); },
    crash() { noise(0.3, 0.5, 700); tone(90, 0.25, 'sine', 0.3, 40); },
    explosion() { noise(0.7, 0.7, 500); tone(60, 0.6, 'sine', 0.4, 28); },
    missionDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.25), i * 110)); },
    busted() { tone(220, 0.5, 'sawtooth', 0.2, 110); },
    click() { tone(880, 0.05, 'square', 0.12); },
    buy() { tone(784, 0.1, 'triangle', 0.2); setTimeout(() => tone(1046, 0.16, 'triangle', 0.2), 90); },
    engine(speed01, inCar) {
      if (!ensure()) return;
      const target = inCar ? 0.05 + speed01 * 0.10 : 0;
      engineGain.gain.setTargetAtTime(muted ? 0 : target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, ctx.currentTime, 0.08);
    },
    siren(on, dt) {
      if (!ensure()) return;
      sirenTimer += dt;
      if (sirenTimer > 0.42) { sirenTimer = 0; sirenHigh = !sirenHigh; sirenOsc.frequency.value = sirenHigh ? 920 : 660; }
      sirenGain.gain.setTargetAtTime(on && !muted ? 0.045 : 0, ctx.currentTime, 0.1);
    },
    music(dt) {
      if (!ensure() || muted) return;
      const st = station();
      musicTimer += dt;
      const stepDur = 60 / st.tempo / 2;
      if (musicTimer < stepDur) return;
      musicTimer = 0;
      const step = musicStep % 16;
      const line = LEAD_LINES[stationIndex % LEAD_LINES.length];
      const bass = BASS_LINES[stationIndex % BASS_LINES.length];
      if (step % 2 === 0) tone(noteFreq(line[step]) / 2, 0.18, st.leadWave, st.drive);
      if (step % 4 === 0) tone(noteFreq(bass[(step / 4) | 0]) / 2, 0.3, 'sine', 0.12);
      if (step % 8 === 4) noise(0.05, 0.04, 6000);
      if (step % 8 === 0) tone(noteFreq(line[step]) * 2, 0.12, st.leadWave, 0.03);
      musicStep++;
    },
  };
}
