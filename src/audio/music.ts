import type { Sfx } from './sfx';

const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  pent: [0, 2, 4, 7, 9],
};
const MODE: Record<string, string> = {
  meadow: 'major',
  birchwood: 'dorian',
  cherry: 'lydian',
  redwood: 'dorian',
  swamp: 'phrygian',
  goldbasin: 'major',
  volcano: 'phrygian',
  taiga: 'minor',
  tropics: 'pent',
  crystal: 'lydian',
  deepcave: 'phrygian',
  desert: 'phrygian',
  haunted: 'minor',
  sky: 'lydian',
};
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface Voice {
  osc: OscillatorNode[];
  gain: GainNode;
}

/** Procedural music (generative pads + plucks that crossfade by biome and time of day) and ambience beds. */
export class MusicManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private pad: Voice | null = null;
  private padFilter!: BiquadFilterNode;
  private musicGain!: GainNode;
  private ambGain!: GainNode;
  private noiseSrc: AudioBufferSourceNode | null = null;
  private windFilter!: BiquadFilterNode;
  private windGain!: GainNode;
  private rainGain!: GainNode;
  private rainFilter!: BiquadFilterNode;
  private rumbleGain!: GainNode;
  private chord = 0;
  private nextChord = 0;
  private nextPluck = 0;
  private nextAmbient = 0;
  private biome = 'meadow';
  private ready = false;
  musicVol = 0.5;
  ambVol = 0.5;

  constructor(private sfx: Sfx) {}

  private init(): boolean {
    const ctx = this.sfx.context;
    const out = this.sfx.out;
    if (!ctx || !out || ctx.state !== 'running') return false;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(out);
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 900;
    this.padFilter.connect(this.musicGain);
    // cheap reverb: feedback delay
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    delay.connect(fb).connect(delay);
    this.musicGain.connect(this.master);
    this.musicGain.connect(delay);
    delay.connect(this.master);
    // ambience beds (shared looping noise)
    this.ambGain = ctx.createGain();
    this.ambGain.gain.value = 0;
    this.ambGain.connect(this.master);
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; // brown-ish
      d[i] = last * 3.2;
    }
    this.noiseSrc = ctx.createBufferSource();
    this.noiseSrc.buffer = buf;
    this.noiseSrc.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.rainFilter = ctx.createBiquadFilter();
    this.rainFilter.type = 'highpass';
    this.rainFilter.frequency.value = 2400;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    const rumble = ctx.createBiquadFilter();
    rumble.type = 'lowpass';
    rumble.frequency.value = 90;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    this.noiseSrc.connect(this.windFilter).connect(this.windGain).connect(this.ambGain);
    this.noiseSrc.connect(this.rainFilter).connect(this.rainGain).connect(this.ambGain);
    this.noiseSrc.connect(rumble).connect(this.rumbleGain).connect(this.ambGain);
    this.noiseSrc.start();
    this.ready = true;
    return true;
  }

  private startPad(rootMidi: number, scale: number[], degree: number, dur: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    if (this.pad) {
      // crossfade out the previous chord
      this.pad.gain.gain.cancelScheduledValues(now);
      this.pad.gain.gain.setTargetAtTime(0.0001, now, 1.2);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.16, now + 3);
    g.gain.linearRampToValueAtTime(0.0001, now + dur + 2);
    g.connect(this.padFilter);
    const osc: OscillatorNode[] = [];
    for (const k of [0, 2, 4]) {
      const deg = degree + k;
      const note = rootMidi + scale[deg % scale.length]! + 12 * Math.floor(deg / scale.length);
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(note);
        o.detune.value = det;
        o.connect(g);
        o.start(now);
        o.stop(now + dur + 2.2);
        osc.push(o);
      }
    }
    this.pad = { osc, gain: g };
  }

  private pluck(rootMidi: number, scale: number[], bright: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const deg = Math.floor(Math.random() * scale.length * 2);
    const note = rootMidi + 12 + scale[deg % scale.length]! + 12 * Math.floor(deg / scale.length);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = midi(note);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.1 * bright, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
    o.connect(g).connect(this.musicGain);
    o.start(now);
    o.stop(now + 2);
  }

  private chirp(): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f = 2200 + Math.random() * 1800;
    o.frequency.setValueAtTime(f, now);
    o.frequency.exponentialRampToValueAtTime(f * (0.7 + Math.random() * 0.6), now + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    o.connect(g).connect(this.ambGain);
    o.start(now);
    o.stop(now + 0.2);
  }

  update(
    dt: number,
    p: {
      biome: string;
      daylight: number;
      weather: string;
      indoor: number;
      combat: boolean;
      speed: number;
      musicVol: number;
      ambVol: number;
      underwater?: boolean;
    },
  ): void {
    if (!this.ready && !this.init()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    this.musicVol = p.musicVol;
    this.ambVol = p.ambVol;
    // biome change → retune
    const biomeChanged = p.biome !== this.biome;
    if (biomeChanged) {
      this.biome = p.biome;
      this.nextChord = 0; // force new chord soon
    }
    const day = p.daylight;
    const target = p.musicVol * 0.55 * (p.combat ? 1.2 : 1) * (0.6 + 0.4 * day);
    this.musicGain.gain.setTargetAtTime(target, now, biomeChanged ? 0.4 : 1.2);
    this.padFilter.frequency.setTargetAtTime(500 + day * 900 + (p.combat ? 700 : 0), now, 1);
    this.ambGain.gain.setTargetAtTime(p.ambVol, now, 0.5);
    // ambience mix
    const windy = ['taiga', 'sky', 'desert', 'goldbasin', 'cherry'].includes(p.biome)
      ? 0.35
      : p.indoor > 0.5
        ? 0.05
        : 0.14;
    const storm = p.weather === 'blizzard' || p.weather === 'sandstorm' ? 0.6 : 0;
    this.windGain.gain.setTargetAtTime(Math.min(0.8, windy + storm + p.speed * 0.01), now, 0.8);
    this.windFilter.frequency.setTargetAtTime(storm ? 900 : 400 + p.speed * 20, now, 0.8);
    const rain = p.weather === 'rain' || p.weather === 'storm' ? 0.32 : p.weather === 'ash' ? 0.12 : 0;
    this.rainGain.gain.setTargetAtTime(rain * (1 - p.indoor), now, 1);
    this.rumbleGain.gain.setTargetAtTime(
      p.biome === 'volcano' ? 0.9 : p.biome === 'deepcave' ? 0.5 : 0,
      now,
      1.5,
    );
    this.nextAmbient -= dt;
    if (this.nextAmbient <= 0) {
      this.nextAmbient = 0.4 + Math.random() * 2.4;
      const birdy =
        ['meadow', 'birchwood', 'cherry', 'redwood', 'tropics'].includes(p.biome) &&
        day > 0.5 &&
        p.weather === 'clear' &&
        p.indoor < 0.3;
      if (birdy && Math.random() < 0.8) this.chirp();
      if (p.indoor > 0.5 && Math.random() < 0.3) this.drip();
    }
    // chords
    this.nextChord -= dt;
    const mode = SCALES[MODE[p.biome] ?? 'major']!;
    const root = 48 + (this.biomeKey(p.biome) % 12);
    if (this.nextChord <= 0) {
      this.nextChord = (p.combat ? 4 : 8) + Math.random() * 3;
      this.chord = [0, 3, 4, 5, 2, 6][Math.floor(Math.random() * 6)]!;
      this.startPad(root - (day < 0.3 ? 5 : 0), mode, this.chord, this.nextChord);
    }
    this.nextPluck -= dt;
    if (this.nextPluck <= 0) {
      this.nextPluck =
        (p.combat ? 0.4 : 1.6) + Math.random() * (p.combat ? 0.5 : 3.2) * (day < 0.3 ? 1.6 : 1);
      this.pluck(root, mode, 0.5 + day * 0.7);
    }
  }

  private drip(): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1500 + Math.random() * 600, now);
    o.frequency.exponentialRampToValueAtTime(400, now + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    o.connect(g).connect(this.ambGain);
    o.start(now);
    o.stop(now + 0.3);
  }

  private biomeKey(id: string): number {
    const keys: Record<string, number> = {
      meadow: 0,
      birchwood: 2,
      cherry: 4,
      redwood: 7,
      swamp: 9,
      goldbasin: 5,
      volcano: 1,
      taiga: 3,
      tropics: 0,
      crystal: 8,
      deepcave: 6,
      desert: 10,
      haunted: 11,
      sky: 7,
    };
    return keys[id] ?? 0;
  }
}
