// All sound in Solara City is synthesised with WebAudio: engine hum, sirens,
// gunshots, explosions, mission jingles and three radio stations of sequenced
// music. No audio files are loaded, so the game plays fully offline.

import { CFG } from './config.js';

// A short burst of filtered noise, the base of shots and booms.
function noiseBurst(ctx, seconds, filterFreq, gainValue) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainValue, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
  src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
  src.start();
}

// One sine or square blip of a given pitch and length.
function blip(ctx, freq, seconds, type, gainValue, when) {
  const t0 = ctx.currentTime + (when || 0);
  const osc = ctx.createOscillator();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainValue, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(t0); osc.stop(t0 + seconds + 0.02);
}

export function createAudio() {
  const audio = {
    ctx: null,
    muted: false,
    engineOsc: null,
    engineGain: null,
    sirenOn: false,
    sirenTimer: 0,
    sirenHigh: false,
    musicStep: 0,
    musicTimer: 0,
    station: 0,
    started: false,
  };

  // Must be called from a user gesture (key or click) at least once.
  audio.start = function start() {
    if (audio.started) {
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
      return;
    }
    try {
      audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      return;
    }
    audio.started = true;
    audio.engineOsc = audio.ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 55;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    audio.engineGain = audio.ctx.createGain();
    audio.engineGain.gain.value = 0.0;
    audio.engineOsc.connect(filter); filter.connect(audio.engineGain); audio.engineGain.connect(audio.ctx.destination);
    audio.engineOsc.start();
  };

  audio.setMuted = function setMuted(m) {
    audio.muted = m;
    if (audio.engineGain) audio.engineGain.gain.value = m ? 0 : audio.engineGain.gain.value;
  };

  audio.engine = function engine(speedRatio, inCar) {
    if (!audio.started || !audio.engineOsc) return;
    const target = audio.muted ? 0 : (inCar ? 0.045 + speedRatio * 0.05 : 0.0);
    audio.engineGain.gain.value += (target - audio.engineGain.gain.value) * 0.2;
    audio.engineOsc.frequency.value = 52 + speedRatio * 130;
  };

  audio.siren = function siren(dt) {
    if (!audio.started || audio.muted) return;
    audio.sirenTimer -= dt;
    if (audio.sirenTimer <= 0) {
      audio.sirenTimer = 0.42;
      audio.sirenHigh = !audio.sirenHigh;
      blip(audio.ctx, audio.sirenHigh ? 920 : 680, 0.38, 'square', 0.035);
    }
  };

  audio.shot = function shot(kind) {
    if (!audio.started || audio.muted) return;
    if (kind === 'shotgun') noiseBurst(audio.ctx, 0.28, 900, 0.5);
    else if (kind === 'smg') noiseBurst(audio.ctx, 0.08, 2400, 0.25);
    else if (kind === 'pistol') noiseBurst(audio.ctx, 0.12, 1800, 0.32);
    else noiseBurst(audio.ctx, 0.06, 1200, 0.2);
  };

  audio.boom = function boom() {
    if (!audio.started || audio.muted) return;
    noiseBurst(audio.ctx, 0.7, 320, 0.7);
    blip(audio.ctx, 55, 0.6, 'sine', 0.4);
  };

  audio.pickup = function pickup() {
    if (!audio.started || audio.muted) return;
    blip(audio.ctx, 880, 0.09, 'sine', 0.18);
    blip(audio.ctx, 1320, 0.12, 'sine', 0.18, 0.08);
  };

  audio.jingle = function jingle() {
    if (!audio.started || audio.muted) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => blip(audio.ctx, n, 0.16, 'triangle', 0.22, i * 0.11));
  };

  audio.busted = function busted() {
    if (!audio.started || audio.muted) return;
    [392, 330, 262].forEach((n, i) => blip(audio.ctx, n, 0.22, 'triangle', 0.2, i * 0.16));
  };

  // The radio sequencer: 16 steps per bar, one bar per station pattern.
  const bassLines = [
    [0, 0, 7, 0, 5, 0, 7, 10, 0, 0, 7, 0, 5, 3, 2, 0],
    [0, 0, 0, 3, 0, 0, 5, 0, 0, 3, 0, 0, 7, 5, 3, 0],
    [0, 0, 10, 0, 0, 8, 0, 7, 0, 0, 10, 0, 12, 10, 8, 7],
  ];
  const leadLines = [
    [12, 0, 0, 16, 0, 0, 19, 0, 17, 0, 0, 16, 0, 14, 0, 12],
    [0, 0, 12, 0, 0, 0, 15, 0, 0, 12, 0, 0, 10, 0, 12, 0],
    [12, 0, 0, 0, 15, 0, 0, 0, 17, 0, 0, 15, 0, 0, 12, 0],
  ];

  audio.music = function music(dt) {
    if (!audio.started || audio.muted) return;
    const station = CFG.radio[audio.station];
    const stepDur = 60 / station.tempo / 4;
    audio.musicTimer -= dt;
    if (audio.musicTimer > 0) return;
    audio.musicTimer += stepDur;
    const step = audio.musicStep % 16;
    audio.musicStep++;
    const root = 110 * Math.pow(2, (station.root - 45) / 12);
    const bass = bassLines[audio.station][step];
    if (bass) blip(audio.ctx, root * Math.pow(2, bass / 12) / 2, stepDur * 0.9, 'triangle', 0.16);
    const lead = leadLines[audio.station][step];
    if (lead && step % 2 === 0) blip(audio.ctx, root * Math.pow(2, lead / 12), stepDur * 0.8, 'square', 0.045);
    if (step % 4 === 2) noiseBurst(audio.ctx, 0.03, 6000, 0.06);
  };

  audio.setStation = function setStation(i) {
    audio.station = ((i % CFG.radio.length) + CFG.radio.length) % CFG.radio.length;
    audio.musicStep = 0;
  };

  return audio;
}
