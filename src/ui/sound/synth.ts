export interface PlaybackUnit {
  stop(): void;
}

interface EnvelopeOpts {
  delay?: number;

  attack?: number;

  decay?: number;

  gain?: number;
  onEnded?: () => void;
}

interface ToneOpts extends EnvelopeOpts {
  type?: OscillatorType;

  freq: number;

  endFreq?: number;

  vibratoRate?: number;
  vibratoDepth?: number;
}

interface NoiseBurstOpts extends EnvelopeOpts {
  filterType?: BiquadFilterType;

  freq?: number;
  Q?: number;
}

interface NoiseSweepOpts extends EnvelopeOpts {
  filterType?: BiquadFilterType;
  fromFreq: number;
  toFreq: number;

  duration: number;
  Q?: number;
}

const noiseBufferCache = new WeakMap<AudioContext, AudioBuffer>();

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

export function combine(units: PlaybackUnit[]): PlaybackUnit {
  return {
    stop: () => {
      units.forEach((unit) => {
        unit.stop();
      });
    },
  };
}

function toneOscillator(
  ctx: AudioContext,
  opts: ToneOpts,
  start: number
): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, start);
  if (opts.endFreq !== undefined && opts.endFreq !== opts.freq) {
    osc.frequency.setValueAtTime(opts.freq, start);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(opts.endFreq, 1),
      start + Math.max(opts.decay ?? 0.2, 0.01)
    );
  }
  return osc;
}

function decayingGain(
  ctx: AudioContext,
  opts: { start: number; attack: number; decay: number; gain: number }
): GainNode {
  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0, opts.start);
  gainNode.gain.linearRampToValueAtTime(opts.gain, opts.start + opts.attack);
  gainNode.gain.exponentialRampToValueAtTime(
    0.0001,
    opts.start + opts.attack + Math.max(opts.decay, 0.01)
  );
  return gainNode;
}

function vibrato(
  ctx: AudioContext,
  opts: {
    osc: OscillatorNode;
    start: number;
    rate: number | undefined;
    depth: number | undefined;
  }
) {
  if (!opts.rate || !opts.depth) return null;
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(opts.rate, opts.start);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(opts.depth, opts.start);
  osc.connect(gain);
  gain.connect(opts.osc.frequency);
  osc.start(opts.start);
  return { osc, gain };
}

function cleanup(
  nodes: AudioNode[],
  onEnded: (() => void) | undefined
): () => void {
  return () => {
    try {
      nodes.forEach((node) => {
        node.disconnect();
      });
    } catch {
      onEnded?.();
      return;
    }
    onEnded?.();
  };
}

function playback(input: {
  ctx: AudioContext;
  source: AudioScheduledSourceNode;
  secondary: OscillatorNode | null;
  onEnded: () => void;
}): PlaybackUnit {
  let stopped = false;
  input.source.onended = () => {
    if (stopped) return;
    stopped = true;
    input.onEnded();
  };
  return {
    stop: () => {
      if (stopped) return;
      try {
        const now = input.ctx.currentTime;
        input.source.stop(now);
        input.secondary?.stop(now);
      } catch {
        return;
      }
    },
  };
}

export function tone(
  ctx: AudioContext,
  dest: AudioNode,
  opts: ToneOpts
): PlaybackUnit {
  const { attack = 0.005, decay = 0.2, gain = 1, delay = 0, onEnded } = opts;
  const start = ctx.currentTime + Math.max(0, delay);
  const osc = toneOscillator(ctx, opts, start);
  const gainNode = decayingGain(ctx, { start, attack, decay, gain });
  osc.connect(gainNode);
  gainNode.connect(dest);
  const modulation = vibrato(ctx, {
    osc,
    start,
    rate: opts.vibratoRate,
    depth: opts.vibratoDepth,
  });
  const stopAt = start + attack + Math.max(decay, 0.01) + 0.03;
  osc.start(start);
  osc.stop(stopAt);
  modulation?.osc.stop(stopAt);
  const nodes = [
    osc,
    gainNode,
    ...(modulation ? [modulation.osc, modulation.gain] : []),
  ];
  return playback({
    ctx,
    source: osc,
    secondary: modulation?.osc ?? null,
    onEnded: cleanup(nodes, onEnded),
  });
}

function noiseNodes(ctx: AudioContext, filterType: BiquadFilterType) {
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx);
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  return { source, filter };
}

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
  const { source, filter } = noiseNodes(ctx, filterType);
  filter.frequency.setValueAtTime(freq, start);
  filter.Q.setValueAtTime(Q, start);

  const gainNode = decayingGain(ctx, { start, attack, decay, gain });

  const stopAt = start + attack + Math.max(decay, 0.01) + 0.03;
  return playFiltered(ctx, {
    source,
    filter,
    gainNode,
    dest,
    start,
    stopAt,
    onEnded,
  });
}

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
  const { source, filter } = noiseNodes(ctx, filterType);
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

  const stopAt = start + Math.max(duration, 0.02) + 0.03;
  return playFiltered(ctx, {
    source,
    filter,
    gainNode,
    dest,
    start,
    stopAt,
    onEnded,
  });
}

function playFiltered(
  ctx: AudioContext,
  input: {
    source: AudioBufferSourceNode;
    filter: BiquadFilterNode;
    gainNode: GainNode;
    dest: AudioNode;
    start: number;
    stopAt: number;
    onEnded: (() => void) | undefined;
  }
): PlaybackUnit {
  const { source, filter, gainNode, dest, start, stopAt, onEnded } = input;
  source.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(dest);
  source.start(start);
  source.stop(stopAt);
  return playback({
    ctx,
    source,
    secondary: null,
    onEnded: cleanup([source, filter, gainNode], onEnded),
  });
}

export function sample(
  ctx: AudioContext,
  dest: AudioNode,
  buffer: AudioBuffer
): PlaybackUnit {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(dest);
  source.start(ctx.currentTime);
  return playback({
    ctx,
    source,
    secondary: null,
    onEnded: () => {
      source.disconnect();
    },
  });
}
