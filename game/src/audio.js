// Audio: everything synthesised with WebAudio — engine hum, sirens, gunshots,
// explosions, mission jingles, and three generative radio stations.
// No audio files, no network. Starts on the first user gesture.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.radioTimer = null;
    this.station = 0;
    this.muted = false;
    this.radioStep = 0;
    this.STATIONS = [
      { name: 'SOLARA FM', track: 'Golden Hour Mix', bpm: 96, scale: [0, 3, 5, 7, 10], wave: 'triangle', bass: 55 },
      { name: 'BAY BEATS', track: 'Palm Row Nights', bpm: 122, scale: [0, 2, 3, 7, 9], wave: 'square', bass: 49 },
      { name: 'NIGHT DRIVE', track: 'Neon Coastline', bpm: 80, scale: [0, 5, 7, 10, 12], wave: 'sawtooth', bass: 41 },
    ];
  }
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
    // engine: low sawtooth whose pitch follows speed
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 420;
    this.engineOsc.connect(filt); filt.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start();
    // siren: alternating two-tone
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'sine';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.startRadio();
  }
  setEngine(speedKmh, inCar) {
    if (!this.ctx) return;
    this.engineGain.gain.value = inCar ? 0.05 + Math.min(0.12, speedKmh / 900) : 0;
    this.engineOsc.frequency.value = 50 + speedKmh * 1.1;
  }
  setSiren(on) {
    if (!this.ctx) return;
    this.sirenGain.gain.value = on ? 0.045 : 0;
    if (on) {
      const t = this.ctx.currentTime;
      this.sirenOsc.frequency.cancelScheduledValues(t);
      this.sirenOsc.frequency.setValueAtTime(660, t);
      this.sirenOsc.frequency.linearRampToValueAtTime(880, t + 0.35);
      this.sirenOsc.frequency.linearRampToValueAtTime(660, t + 0.7);
    }
  }
  blip(freq, dur, type = 'square', vol = 0.2) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(this.ctx.currentTime + dur);
  }
  noise(dur, vol = 0.3, freq = 1200) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
  }
  gunshot() { this.noise(0.12, 0.4, 3200); this.blip(180, 0.08, 'square', 0.18); }
  explosion() { this.noise(0.7, 0.6, 500); this.blip(55, 0.6, 'sine', 0.5); }
  jingle() {
    if (!this.ctx) return;
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this.blip(f, 0.22, 'triangle', 0.25), i * 110);
    });
  }
  fail() { this.blip(220, 0.3, 'sawtooth', 0.2); setTimeout(() => this.blip(160, 0.4, 'sawtooth', 0.2), 140); }
  startRadio() {
    if (this.radioTimer || !this.ctx) return;
    const st = this.STATIONS[this.station];
    const stepDur = 60 / st.bpm / 2;
    this.radioTimer = setInterval(() => {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      this.radioStep++;
      const deg = st.scale[this.radioStep % st.scale.length];
      const note = 220 * Math.pow(2, deg / 12) * (this.radioStep % 16 < 8 ? 1 : 0.5);
      if (this.radioStep % 2 === 0) this.blip(note, stepDur * 0.9, st.wave, 0.05);
      if (this.radioStep % 4 === 0) this.blip(st.bass * 2, stepDur * 1.6, 'sine', 0.09);
      if (this.radioStep % 8 === 4) this.noise(0.03, 0.05, 6000);
    }, stepDur * 1000);
  }
  cycleStation() {
    this.station = (this.station + 1) % this.STATIONS.length;
    this.radioStep = 0;
    return this.STATIONS[this.station];
  }
  get stationInfo() { return this.STATIONS[this.station]; }
}
