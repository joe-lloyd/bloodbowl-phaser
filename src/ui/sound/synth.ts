/**
 * Native Web Audio synthesis primitives — replaces the old `@strudel/web`
 * pattern-based one-shot playback. Every call here allocates its own
 * independent node graph and schedules its own `stop()` time on the
 * `AudioContext`'s sample-accurate clock; nothing shares a single "current
 * pattern" slot, so concurrent/rapid triggers can never race or strand each
 * other (see design.md for the bug this replaces).
 *
 * Every primitive returns a `PlaybackUnit`: an idempotent `stop()` that can
 * be called early (e.g. on scene teardown) or after natural completion
 * (harmless no-op, guarded by an internal flag) plus an `onEnded` hook fired
 * once the node has actually finished, used by `SoundManager` purely for
 * bookkeeping (never for correctness — the node's own scheduled stop time
 * is what actually silences it).
 */

export interface PlaybackUnit {
  stop(): void;
}

/** Oscillator waveform shapes available to every primitive below. */
export type OscType = OscillatorType; // "sine" | "square" | "sawtooth" | "triangle"

interface EnvelopeOpts {
  /** Seconds from "now" before this unit starts (for staggering layered taps). */
  delay?: number;
  /** Seconds to ramp up from silence to peak gain. */
  attack?: number;
  /** Seconds to decay from peak back to silence after the attack. */
  decay?: number;
  /** Peak linear gain (pre master-volume). */
  gain?: number;
  onEnded?: () => void;
}

export interface ToneOpts extends EnvelopeOpts {
  type?: OscType;
  /** Starting frequency (Hz). */
  freq: number;
  /** If set, frequency glides from `freq` to `endFreq` over `decay` seconds — used for pitch-bends (fumble "boing", KO thump). */
  endFreq?: number;
  /** Optional vibrato: a second oscillator modulating frequency — used for whistles. */
  vibratoRate?: number;
  vibratoDepth?: number;
}

export interface NoiseBurstOpts extends EnvelopeOpts {
  filterType?: BiquadFilterType;
  /** Filter center/cutoff frequency (Hz). */
  freq?: number;
  Q?: number;
}

export interface NoiseSweepOpts extends EnvelopeOpts {
  filterType?: BiquadFilterType;
  fromFreq: number;
  toFreq: number;
  /** Total sweep duration in seconds (overrides decay as the sweep length). */
  duration: number;
  Q?: number;
}

const noiseBufferCache = new WeakMap<AudioContext, AudioBuffer>();

/** A shared 1-second white-noise buffer per AudioContext — cheap to reuse across every noise-based effect. */
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const cached = noiseBufferCache.get(ctx);
  if (cached) return cached;
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBufferCache.set(ctx, buffer);
  return buffer;
}

/** Combine several independently-scheduled units into one trackable handle. */
export function combine(units: PlaybackUnit[]): PlaybackUnit {
  return {
    stop: () => units.forEach((unit) => unit.stop()),
  };
}

/**
 * A single oscillator voice with an attack/decay gain envelope. Supports an
 * optional frequency glide (`endFreq`) for pitch-bend effects and an
 * optional vibrato LFO for whistle-style sustained tones.
 */
export function tone(
  ctx: AudioContext,
  dest: AudioNode,
  opts: ToneOpts
): PlaybackUnit {
  const {
    type = "sine",
    freq,
    endFreq,
    attack = 0.005,
    decay = 0.2,
    gain = 1,
    delay = 0,
    vibratoRate,
    vibratoDepth,
    onEnded,
  } = opts;

  const start = ctx.currentTime + Math.max(0, delay);
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq !== undefined && endFreq !== freq) {
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(endFreq, 1),
      start + Math.max(decay, 0.01)
    );
  }

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0, start);
  gainNode.gain.linearRampToValueAtTime(gain, start + attack);
  gainNode.gain.exponentialRampToValueAtTime(
    0.0001,
    start + attack + Math.max(decay, 0.01)
  );

  osc.connect(gainNode);
  gainNode.connect(dest);

  let lfo: OscillatorNode | null = null;
  let lfoGain: GainNode | null = null;
  if (vibratoRate && vibratoDepth) {
    lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(vibratoRate, start);
    lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(vibratoDepth, start);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start(start);
  }

  const stopAt = start + attack + Math.max(decay, 0.01) + 0.03;
  osc.start(start);
  osc.stop(stopAt);
  lfo?.stop(stopAt);

  let stopped = false;
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    try {
      osc.disconnect();
      gainNode.disconnect();
      lfo?.disconnect();
      lfoGain?.disconnect();
    } catch {
      // Already disconnected — harmless.
    }
    onEnded?.();
  };
  osc.onended = cleanup;

  return {
    stop: () => {
      if (stopped) return;
      try {
        const now = ctx.currentTime;
        osc.stop(now);
        lfo?.stop(now);
      } catch {
        // Already stopped/scheduled — harmless.
      }
    },
  };
}

/**
 * A short burst of filtered white noise with an attack/decay envelope —
 * used for percussive transients (dice taps, crack/snap layers).
 */
export function noiseBurst(
  ctx: AudioContext,
  dest: AudioNode,
  opts: NoiseBurstOpts
): PlaybackUnit {
  const {
    filterType = "bandpass",
    freq = 2000,
    Q = 1,
    attack = 0.002,
    decay = 0.1,
    gain = 1,
    delay = 0,
    onEnded,
  } = opts;

  const start = ctx.currentTime + Math.max(0, delay);
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx);
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(freq, start);
  filter.Q.setValueAtTime(Q, start);

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0, start);
  gainNode.gain.linearRampToValueAtTime(gain, start + attack);
  gainNode.gain.exponentialRampToValueAtTime(
    0.0001,
    start + attack + Math.max(decay, 0.01)
  );

  source.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(dest);

  const stopAt = start + attack + Math.max(decay, 0.01) + 0.03;
  source.start(start);
  source.stop(stopAt);

  let stopped = false;
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    try {
      source.disconnect();
      filter.disconnect();
      gainNode.disconnect();
    } catch {
      // Already disconnected — harmless.
    }
    onEnded?.();
  };
  source.onended = cleanup;

  return {
    stop: () => {
      if (stopped) return;
      try {
        source.stop(ctx.currentTime);
      } catch {
        // Already stopped/scheduled — harmless.
      }
    },
  };
}

/**
 * Filtered noise whose bandpass/lowpass center frequency ramps across the
 * effect's duration — a "whoosh" (pass) or a swelling "roar" (touchdown).
 */
export function noiseSweep(
  ctx: AudioContext,
  dest: AudioNode,
  opts: NoiseSweepOpts
): PlaybackUnit {
  const {
    filterType = "bandpass",
    fromFreq,
    toFreq,
    duration,
    Q = 1,
    attack = 0.02,
    gain = 1,
    delay = 0,
    onEnded,
  } = opts;

  const start = ctx.currentTime + Math.max(0, delay);
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx);
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.Q.setValueAtTime(Q, start);
  filter.frequency.setValueAtTime(fromFreq, start);
  filter.frequency.exponentialRampToValueAtTime(
    Math.max(toFreq, 1),
    start + Math.max(duration, 0.02)
  );

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0, start);
  gainNode.gain.linearRampToValueAtTime(gain, start + attack);
  gainNode.gain.setValueAtTime(gain, start + Math.max(duration, 0.02) * 0.6);
  gainNode.gain.exponentialRampToValueAtTime(
    0.0001,
    start + Math.max(duration, 0.02)
  );

  source.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(dest);

  const stopAt = start + Math.max(duration, 0.02) + 0.03;
  source.start(start);
  source.stop(stopAt);

  let stopped = false;
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    try {
      source.disconnect();
      filter.disconnect();
      gainNode.disconnect();
    } catch {
      // Already disconnected — harmless.
    }
    onEnded?.();
  };
  source.onended = cleanup;

  return {
    stop: () => {
      if (stopped) return;
      try {
        source.stop(ctx.currentTime);
      } catch {
        // Already stopped/scheduled — harmless.
      }
    },
  };
}
