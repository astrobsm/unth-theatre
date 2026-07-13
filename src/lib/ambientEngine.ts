// ============================================================
// Ambient sound engine — procedurally generated, royalty-free
// ------------------------------------------------------------
// Generates calming ambient soundscapes entirely with the Web Audio API, so
// there are NO audio files to host, NO bandwidth cost, NO licensing/copyright
// concerns, and it works fully offline. Each "soundscape" is a small graph of
// oscillators / filtered noise modulated by slow LFOs for a gentle, evolving
// texture suitable for a theatre/clinical environment.
//
// The engine owns a single AudioContext and a master gain node. Volume changes
// and radio "ducking" are applied as smooth gain ramps. Because browsers block
// audio until a user gesture, `start()` tries to resume the context and the
// caller should also call `resume()` on the first user interaction.
// ============================================================

export interface AmbientPreset {
  name: string;
  build: (ctx: AudioContext, out: AudioNode) => AudioNode[];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// Create a looping noise buffer source. `brown` gives a softer, lower "wave"
// character; white is brighter (rain).
function makeNoiseSource(ctx: AudioContext, kind: 'white' | 'brown'): AudioBufferSourceNode {
  const seconds = 4;
  const length = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  if (kind === 'white') {
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  } else {
    let last = 0;
    for (let i = 0; i < length; i++) {
      const wnoise = Math.random() * 2 - 1;
      last = (last + 0.02 * wnoise) / 1.02;
      data[i] = last * 3.5;
    }
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  return src;
}

function oscil(ctx: AudioContext, type: OscillatorType, freq: number, detune = 0): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  return o;
}

// ---- Soundscape presets ----------------------------------------------------
const PRESETS: AmbientPreset[] = [
  {
    name: 'Calm Drone',
    build: (ctx, out) => {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      lp.Q.value = 1;
      const g = ctx.createGain();
      g.gain.value = 0.22;
      const o1 = oscil(ctx, 'sine', 110);        // A2
      const o2 = oscil(ctx, 'sine', 164.81, 4);  // E3 (fifth)
      o1.connect(g); o2.connect(g); g.connect(lp); lp.connect(out);
      // Slow filter sweep for gentle movement.
      const lfo = oscil(ctx, 'sine', 0.05);
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 160;
      lfo.connect(lfoGain); lfoGain.connect(lp.frequency);
      o1.start(); o2.start(); lfo.start();
      return [o1, o2, lfo];
    },
  },
  {
    name: 'Warm Pad',
    build: (ctx, out) => {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.value = 0.14;
      // A major triad, slightly detuned for a chorus-like warmth.
      const a = oscil(ctx, 'triangle', 220, -6);
      const cs = oscil(ctx, 'triangle', 277.18, 4);
      const e = oscil(ctx, 'triangle', 329.63, -3);
      a.connect(g); cs.connect(g); e.connect(g); g.connect(lp); lp.connect(out);
      // Gentle tremolo.
      const trem = oscil(ctx, 'sine', 0.1);
      const tremGain = ctx.createGain();
      tremGain.gain.value = 0.04;
      trem.connect(tremGain); tremGain.connect(g.gain);
      a.start(); cs.start(); e.start(); trem.start();
      return [a, cs, e, trem];
    },
  },
  {
    name: 'Ocean',
    build: (ctx, out) => {
      const src = makeNoiseSource(ctx, 'brown');
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 420;
      bp.Q.value = 0.7;
      const waveGain = ctx.createGain();
      waveGain.gain.value = 0.25;
      src.connect(bp); bp.connect(waveGain); waveGain.connect(out);
      // Slow swell to simulate waves rolling in and out.
      const lfo = oscil(ctx, 'sine', 0.08);
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.22;
      lfo.connect(lfoGain); lfoGain.connect(waveGain.gain);
      src.start(); lfo.start();
      return [src, lfo];
    },
  },
  {
    name: 'Rain',
    build: (ctx, out) => {
      const src = makeNoiseSource(ctx, 'white');
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1000;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 8000;
      const g = ctx.createGain();
      g.gain.value = 0.08;
      src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(out);
      src.start();
      return [src];
    },
  },
  {
    name: 'Night Sky',
    build: (ctx, out) => {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      const g = ctx.createGain();
      g.gain.value = 0.16;
      const drone = oscil(ctx, 'sine', 65.41); // C2
      drone.connect(g); g.connect(lp); lp.connect(out);
      // Faint high shimmer, very quiet, slow tremolo.
      const shimmer = oscil(ctx, 'sine', 987.77); // B5
      const shimmerGain = ctx.createGain();
      shimmerGain.gain.value = 0.012;
      shimmer.connect(shimmerGain); shimmerGain.connect(out);
      const trem = oscil(ctx, 'sine', 0.07);
      const tremGain = ctx.createGain();
      tremGain.gain.value = 0.01;
      trem.connect(tremGain); tremGain.connect(shimmerGain.gain);
      drone.start(); shimmer.start(); trem.start();
      return [drone, shimmer, trem];
    },
  },
];

export class AmbientEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes: AudioNode[] = [];
  private started = false;
  private targetVol = 0.25;
  private ducked = false;
  presetIndex = 0;

  static presetNames(): string[] {
    return PRESETS.map((p) => p.name);
  }
  get presetName(): string {
    return PRESETS[this.presetIndex]?.name ?? '';
  }
  get count(): number {
    return PRESETS.length;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** Whether audio is actually audible (context running + graph built). */
  audible(): boolean {
    return this.started && this.ctx?.state === 'running';
  }

  /** Try to resume a suspended context (call from a user gesture). */
  async resume(): Promise<boolean> {
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch { /* ignore */ }
    }
    return this.ctx.state === 'running';
  }

  /** Start (or switch to) a soundscape. Returns true if audible immediately. */
  async start(index?: number): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return false;
    if (typeof index === 'number') {
      const n = PRESETS.length;
      this.presetIndex = ((index % n) + n) % n;
    }
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch { /* gesture required — resume() later */ }
    }
    this.teardownSources();
    this.nodes = PRESETS[this.presetIndex].build(ctx, this.master);
    this.started = true;
    this.ramp(this.ducked ? 0 : this.targetVol, 1.2);
    return ctx.state === 'running';
  }

  /** Fade out and stop generating sound (keeps the context for quick restart). */
  pause(): void {
    if (!this.started) return;
    this.ramp(0, 0.6);
    const toStop = this.nodes;
    this.nodes = [];
    this.started = false;
    setTimeout(() => {
      for (const n of toStop) {
        try { (n as OscillatorNode & AudioBufferSourceNode).stop?.(); } catch { /* ignore */ }
        try { n.disconnect(); } catch { /* ignore */ }
      }
    }, 700);
  }

  setVolume(v: number): void {
    this.targetVol = clamp01(v);
    if (this.started && !this.ducked) this.ramp(this.targetVol, 0.15);
  }

  duck(on: boolean): void {
    this.ducked = on;
    if (!this.started) return;
    this.ramp(on ? 0 : this.targetVol, on ? 1.2 : 1.5);
  }

  next(): Promise<boolean> {
    return this.start(this.presetIndex + 1);
  }
  prev(): Promise<boolean> {
    return this.start(this.presetIndex - 1);
  }

  private ramp(target: number, seconds: number): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const g = this.master.gain;
    try {
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(target, now + seconds);
    } catch {
      g.value = target;
    }
  }

  private teardownSources(): void {
    for (const n of this.nodes) {
      try { (n as OscillatorNode & AudioBufferSourceNode).stop?.(); } catch { /* ignore */ }
      try { n.disconnect(); } catch { /* ignore */ }
    }
    this.nodes = [];
  }

  dispose(): void {
    this.teardownSources();
    try { this.ctx?.close(); } catch { /* ignore */ }
    this.ctx = null;
    this.master = null;
    this.started = false;
  }
}
