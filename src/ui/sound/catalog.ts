import { combine, noiseBurst, noiseSweep, tone, PlaybackUnit } from "./synth";

export type SoundName =
  | "diceRoll"
  | "blockImpact"
  | "pushback"
  | "knockdown"
  | "kickoff"
  | "ballBounce"
  | "catch"
  | "fumble"
  | "pass"
  | "turnoverWhistle"
  | "touchdown"
  | "koInjury"
  | "foul"
  | "sendOff"
  | "endOfHalf";

export interface SoundCatalogEntry {
  name: SoundName;
  /** Human label for the audition board. */
  label: string;
  /** Recorded variants in public/assets/sounds/; each trigger plays one at random. See CREDITS.md there. */
  samples: SampleUrls;
  /** Synthesized stand-in, played only when the chosen sample failed to load or decode. Every call allocates its own node graph, see synth.ts. */
  build: (ctx: AudioContext, dest: AudioNode) => PlaybackUnit;
  /** How long the synthesized fallback takes to fully decay, used only for bookkeeping cleanup, never to force-stop playback (each unit stops itself on the AudioContext's own clock). */
  durationMs: number;
  /** Higher priority sounds interrupt/suppress lower-priority ones that land in the same instant. */
  priority: number;
  /** Minimum time between two triggers of this same sound. */
  minRetriggerMs: number;
}

/** At least one sample URL. */
export type SampleUrls = readonly [string, ...string[]];

const sounds = (name: string, ...more: string[]): SampleUrls => [
  `/assets/sounds/${name}.mp3`,
  ...more.map((n) => `/assets/sounds/${n}.mp3`),
];

const entry = (
  partial: Omit<SoundCatalogEntry, "durationMs"> &
    Partial<Pick<SoundCatalogEntry, "durationMs">>
): SoundCatalogEntry => ({
  durationMs: 500,
  ...partial,
});

/** Randomized 3-5 rattling taps so consecutive dice rolls never sound identical. Exported for tests. */
export const pickDiceRollTapCount = (): number =>
  3 + Math.floor(Math.random() * 3);

export const CATALOG: Record<SoundName, SoundCatalogEntry> = {
  diceRoll: entry({
    name: "diceRoll",
    samples: sounds("dice-roll-1", "dice-roll-2", "dice-roll-3"),
    label: "Dice Roll",
    priority: 10,
    minRetriggerMs: 150,
    durationMs: 280,
    build: (ctx, dest) => {
      const tapCount = pickDiceRollTapCount();
      const units: PlaybackUnit[] = [];
      let t = 0;
      for (let i = 0; i < tapCount; i++) {
        t += 0.02 + Math.random() * 0.03;
        units.push(
          noiseBurst(ctx, dest, {
            filterType: "highpass",
            freq: 2500 + Math.random() * 2500,
            Q: 0.8,
            attack: 0.001,
            decay: 0.025 + Math.random() * 0.02,
            gain: 0.5 + Math.random() * 0.2,
            delay: t,
          })
        );
      }
      units.push(
        tone(ctx, dest, {
          type: "sine",
          freq: 140,
          attack: 0.002,
          decay: 0.06,
          gain: 0.5,
          delay: t + 0.03,
        })
      );
      return combine(units);
    },
  }),
  blockImpact: entry({
    name: "blockImpact",
    samples: sounds(
      "block-impact-1",
      "block-impact-2",
      "block-impact-3",
      "block-impact-4"
    ),
    label: "Block Impact",
    priority: 45,
    minRetriggerMs: 250,
    durationMs: 380,
    build: (ctx, dest) =>
      combine([
        tone(ctx, dest, {
          type: "sine",
          freq: 80,
          attack: 0.001,
          decay: 0.16,
          gain: 1.8,
        }),
        tone(ctx, dest, {
          type: "sine",
          freq: 120,
          attack: 0.001,
          decay: 0.08,
          gain: 1.0,
        }),
        noiseBurst(ctx, dest, {
          filterType: "bandpass",
          freq: 1800,
          Q: 0.6,
          attack: 0.001,
          decay: 0.05,
          gain: 0.8,
        }),
      ]),
  }),
  pushback: entry({
    name: "pushback",
    samples: sounds("pushback-1", "pushback-2"),
    label: "Pushback",
    priority: 35,
    minRetriggerMs: 250,
    durationMs: 300,
    build: (ctx, dest) =>
      noiseBurst(ctx, dest, {
        filterType: "lowpass",
        freq: 1200,
        Q: 0.5,
        attack: 0.005,
        decay: 0.16,
        gain: 0.8,
      }),
  }),
  knockdown: entry({
    name: "knockdown",
    samples: sounds("knockdown-1", "knockdown-2"),
    label: "Knockdown",
    priority: 50,
    minRetriggerMs: 300,
    durationMs: 380,
    build: (ctx, dest) =>
      combine([
        tone(ctx, dest, {
          type: "sine",
          freq: 95,
          attack: 0.002,
          decay: 0.28,
          gain: 1.7,
        }),
        noiseBurst(ctx, dest, {
          filterType: "lowpass",
          freq: 400,
          Q: 0.7,
          attack: 0.001,
          decay: 0.12,
          gain: 0.6,
        }),
      ]),
  }),
  kickoff: entry({
    name: "kickoff",
    samples: sounds("kickoff"),
    label: "Kick-off",
    priority: 30,
    minRetriggerMs: 400,
    durationMs: 380,
    build: (ctx, dest) =>
      combine([
        tone(ctx, dest, {
          type: "sine",
          freq: 196,
          attack: 0.003,
          decay: 0.09,
          gain: 1.1,
        }),
        noiseBurst(ctx, dest, {
          filterType: "highpass",
          freq: 1500,
          Q: 0.6,
          attack: 0.002,
          decay: 0.2,
          gain: 0.4,
        }),
      ]),
  }),
  ballBounce: entry({
    name: "ballBounce",
    samples: sounds(
      "ball-bounce-1",
      "ball-bounce-2",
      "ball-bounce-3",
      "ball-bounce-4"
    ),
    label: "Ball Bounce",
    priority: 20,
    minRetriggerMs: 150,
    durationMs: 220,
    build: (ctx, dest) =>
      tone(ctx, dest, {
        type: "sine",
        freq: 900,
        endFreq: 650,
        attack: 0.002,
        decay: 0.09,
        gain: 0.9,
      }),
  }),
  catch: entry({
    name: "catch",
    samples: sounds("catch-1", "catch-2"),
    label: "Catch",
    priority: 25,
    minRetriggerMs: 150,
    durationMs: 200,
    build: (ctx, dest) =>
      combine([
        tone(ctx, dest, {
          type: "triangle",
          freq: 1000,
          attack: 0.002,
          decay: 0.09,
          gain: 0.9,
        }),
        noiseBurst(ctx, dest, {
          filterType: "highpass",
          freq: 4000,
          Q: 0.7,
          attack: 0.001,
          decay: 0.03,
          gain: 0.5,
        }),
      ]),
  }),
  fumble: entry({
    name: "fumble",
    samples: sounds("fumble"),
    label: "Fumble",
    priority: 40,
    minRetriggerMs: 300,
    durationMs: 420,
    build: (ctx, dest) =>
      tone(ctx, dest, {
        type: "square",
        freq: 500,
        endFreq: 90,
        attack: 0.005,
        decay: 0.35,
        gain: 0.8,
      }),
  }),
  pass: entry({
    name: "pass",
    samples: sounds("pass-1", "pass-2"),
    label: "Pass",
    priority: 20,
    minRetriggerMs: 200,
    durationMs: 320,
    build: (ctx, dest) =>
      noiseSweep(ctx, dest, {
        filterType: "bandpass",
        fromFreq: 400,
        toFreq: 3500,
        duration: 0.28,
        Q: 1.2,
        gain: 0.9,
      }),
  }),
  turnoverWhistle: entry({
    name: "turnoverWhistle",
    samples: sounds("whistle-short"),
    label: "Turnover",
    priority: 80,
    minRetriggerMs: 800,
    durationMs: 550,
    // Not actually a whistle — a sustained dissonant detuned pair (a "bad
    // note") signaling something went wrong, per the user's explicit ask.
    build: (ctx, dest) =>
      combine([
        tone(ctx, dest, {
          type: "sawtooth",
          freq: 185,
          attack: 0.01,
          decay: 0.4,
          gain: 0.7,
        }),
        tone(ctx, dest, {
          type: "sawtooth",
          freq: 196,
          attack: 0.01,
          decay: 0.4,
          gain: 0.7,
        }),
      ]),
  }),
  touchdown: entry({
    name: "touchdown",
    samples: sounds("touchdown"),
    label: "Touchdown",
    priority: 100,
    minRetriggerMs: 1500,
    durationMs: 1100,
    build: (ctx, dest) => {
      const roar = noiseSweep(ctx, dest, {
        filterType: "lowpass",
        fromFreq: 500,
        toFreq: 2200,
        duration: 1.0,
        Q: 0.6,
        gain: 1.1,
        attack: 0.15,
      });
      const shouts: PlaybackUnit[] = [];
      for (let i = 0; i < 6; i++) {
        shouts.push(
          tone(ctx, dest, {
            type: "sawtooth",
            freq: 300 + Math.random() * 500,
            attack: 0.02,
            decay: 0.3 + Math.random() * 0.3,
            gain: 0.25,
            delay: Math.random() * 0.6,
          })
        );
      }
      return combine([roar, ...shouts]);
    },
  }),
  koInjury: entry({
    name: "koInjury",
    samples: sounds("ko-injury"),
    label: "KO / Injury",
    priority: 60,
    minRetriggerMs: 500,
    durationMs: 500,
    build: (ctx, dest) =>
      combine([
        noiseBurst(ctx, dest, {
          filterType: "bandpass",
          freq: 3000,
          Q: 0.5,
          attack: 0.001,
          decay: 0.05,
          gain: 1.1,
        }),
        tone(ctx, dest, {
          type: "sine",
          freq: 220,
          endFreq: 60,
          attack: 0.002,
          decay: 0.35,
          gain: 1.0,
          delay: 0.02,
        }),
      ]),
  }),
  foul: entry({
    name: "foul",
    samples: sounds("whistle-double"),
    label: "Foul",
    priority: 70,
    minRetriggerMs: 500,
    durationMs: 380,
    build: (ctx, dest) =>
      combine([
        tone(ctx, dest, {
          type: "sine",
          freq: 73,
          attack: 0.002,
          decay: 0.16,
          gain: 1.2,
        }),
        noiseBurst(ctx, dest, {
          filterType: "bandpass",
          freq: 2200,
          Q: 0.6,
          attack: 0.001,
          decay: 0.08,
          gain: 0.5,
        }),
      ]),
  }),
  sendOff: entry({
    name: "sendOff",
    samples: sounds("whistle-long"),
    label: "Send-off",
    priority: 90,
    minRetriggerMs: 800,
    durationMs: 950,
    // A longer, louder single whistle blast than endOfHalf — "the ref blew
    // the whistle" hard, per the user's ask.
    build: (ctx, dest) =>
      tone(ctx, dest, {
        type: "triangle",
        freq: 3000,
        attack: 0.008,
        decay: 0.85,
        gain: 1.3,
        vibratoRate: 24,
        vibratoDepth: 70,
      }),
  }),
  endOfHalf: entry({
    name: "endOfHalf",
    samples: sounds("whistle-final"),
    label: "End of Half/Game",
    priority: 90,
    minRetriggerMs: 2000,
    durationMs: 700,
    build: (ctx, dest) =>
      tone(ctx, dest, {
        type: "triangle",
        freq: 2800,
        attack: 0.01,
        decay: 0.55,
        gain: 1.0,
        vibratoRate: 22,
        vibratoDepth: 60,
      }),
  }),
};

export const CATALOG_ENTRIES: SoundCatalogEntry[] = Object.values(CATALOG);

/** Every recorded sample the catalog can play, for preloading. */
export const SAMPLE_URLS: readonly string[] = CATALOG_ENTRIES.flatMap(
  (entry) => entry.samples
);
