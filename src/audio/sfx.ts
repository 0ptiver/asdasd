/** Procedural sound effects (WebAudio synthesis, no asset files). */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  volume = 0.7;
  private lastPlay = new Map<string, number>();
  listener = { x: 0, y: 0, z: 0, yaw: 0 };

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    try {
      this.ctx = new AC() as AudioContext;
    } catch {
      return null;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return this.ctx;
  }

  /** Call from a user gesture to unlock audio. */
  unlock(): void {
    const c = this.ensure();
    if (c && c.state === 'suspended') void c.resume();
  }

  get context(): AudioContext | null {
    return this.ctx;
  }
  get out(): GainNode | null {
    return this.master;
  }

  private noise(
    c: AudioContext,
    t0: number,
    dur: number,
    freq: number,
    q: number,
    type: BiquadFilterType,
    gain: number,
    out: AudioNode,
  ): void {
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }
  private tone(
    c: AudioContext,
    t0: number,
    dur: number,
    f0: number,
    f1: number,
    type: OscillatorType,
    gain: number,
    out: AudioNode,
  ): void {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  play(name: string, x?: number, y?: number, z?: number, vol = 1): void {
    const c = this.ensure();
    if (!c || !this.master || c.state !== 'running') return;
    const now = c.currentTime;
    const last = this.lastPlay.get(name) ?? 0;
    if (now - last < 0.04) return;
    this.lastPlay.set(name, now);
    // distance attenuation + pan
    let gain = this.volume * vol;
    let pan = 0;
    if (x !== undefined && z !== undefined) {
      const dx = x - this.listener.x,
        dz = z - this.listener.z;
      const d = Math.hypot(dx, dz, (y ?? 0) - this.listener.y);
      gain *= 1 / (1 + (d / 18) * (d / 18));
      if (gain < 0.01) return;
      // listener faces (-sin yaw, -cos yaw); right vector (cos yaw, -sin yaw)
      const rx = Math.cos(this.listener.yaw),
        rz = -Math.sin(this.listener.yaw);
      pan = Math.max(-1, Math.min(1, (dx * rx + dz * rz) / (d + 1)));
    }
    const g = c.createGain();
    g.gain.value = gain;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    g.connect(p).connect(this.master);
    const r = Math.random();
    switch (name) {
      case 'chop':
        this.noise(c, now, 0.12, 900 + r * 500, 1.2, 'bandpass', 0.9, g);
        this.tone(c, now, 0.14, 160 + r * 40, 60, 'triangle', 0.8, g);
        break;
      case 'whiff':
        this.noise(c, now, 0.18, 1800, 0.6, 'highpass', 0.25, g);
        break;
      case 'thud':
        this.tone(c, now, 0.6, 90, 28, 'sine', 1.2, g);
        this.noise(c, now, 0.5, 260, 0.7, 'lowpass', 1.0, g);
        break;
      case 'creak':
        this.tone(c, now, 0.9, 190 + r * 30, 120, 'sawtooth', 0.12, g);
        this.noise(c, now, 0.8, 700, 3, 'bandpass', 0.1, g);
        break;
      case 'coin':
        this.tone(c, now, 0.12, 1300, 1320, 'square', 0.18, g);
        this.tone(c, now + 0.07, 0.3, 1950, 1960, 'square', 0.18, g);
        break;
      case 'saw':
        this.tone(c, now, 0.6, 320, 180, 'sawtooth', 0.25, g);
        this.noise(c, now, 0.6, 3500, 0.5, 'highpass', 0.3, g);
        break;
      case 'land':
        this.tone(c, now, 0.15, 120, 50, 'sine', 0.6, g);
        break;
      case 'click':
        this.tone(c, now, 0.05, 900, 600, 'square', 0.08, g);
        break;
      case 'error':
        this.tone(c, now, 0.18, 220, 150, 'sawtooth', 0.14, g);
        break;
      case 'good':
        this.tone(c, now, 0.1, 660, 660, 'triangle', 0.2, g);
        this.tone(c, now + 0.09, 0.2, 990, 990, 'triangle', 0.2, g);
        break;
      case 'level':
        for (let i = 0; i < 4; i++)
          this.tone(
            c,
            now + i * 0.08,
            0.25,
            520 * Math.pow(1.26, i),
            520 * Math.pow(1.26, i),
            'triangle',
            0.18,
            g,
          );
        break;
      case 'engine':
        this.tone(c, now, 0.1, 60, 55, 'sawtooth', 0.1, g);
        break;
      case 'horn':
        this.tone(c, now, 0.5, 349, 349, 'sawtooth', 0.2, g);
        this.tone(c, now, 0.5, 440, 440, 'sawtooth', 0.2, g);
        break;
      case 'splash':
        this.noise(c, now, 0.4, 1200, 0.5, 'lowpass', 0.5, g);
        break;
      case 'explosion':
        this.noise(c, now, 1.0, 400, 0.5, 'lowpass', 1.2, g);
        this.tone(c, now, 0.9, 80, 25, 'sine', 1.2, g);
        break;
      case 'zap':
        this.noise(c, now, 0.25, 2500, 2, 'bandpass', 0.5, g);
        this.tone(c, now, 0.25, 900, 100, 'sawtooth', 0.15, g);
        break;
      case 'roar':
        this.tone(c, now, 1.1, 110, 55, 'sawtooth', 0.35, g);
        this.noise(c, now, 1.0, 500, 1, 'lowpass', 0.5, g);
        break;
      default:
        this.tone(c, now, 0.1, 440, 440, 'sine', 0.1, g);
    }
  }
}
