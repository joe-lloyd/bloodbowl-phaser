import { note, s, stack } from "@strudel/web";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StrudelPattern = any;

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
  | "endOfHalf"
  | "uiClick";

export interface SoundCatalogEntry {
  name: SoundName;
  /** Human label for the audition board. */
  label: string;
  /** Builds a fresh one-shot Strudel pattern (patterns are stateful once played). */
  build: () => StrudelPattern;
  /** Optional recorded sample (from public/assets/sounds/) that takes precedence over synthesis. */
  sampleUrl?: string;
  /** Base gain before the user's master volume is applied. */
  gain: number;
  /** How long to let the one-shot pattern run before stopping its cycle. */
  durationMs: number;
  /** Higher priority sounds interrupt/suppress lower-priority ones that land in the same instant. */
  priority: number;
  /** Minimum time between two triggers of this same sound. */
  minRetriggerMs: number;
}

const entry = (
  partial: Omit<SoundCatalogEntry, "gain" | "durationMs"> &
    Partial<Pick<SoundCatalogEntry, "gain" | "durationMs">>
): SoundCatalogEntry => ({
  gain: 1,
  durationMs: 500,
  ...partial,
});

export const CATALOG: Record<SoundName, SoundCatalogEntry> = {
  diceRoll: entry({
    name: "diceRoll",
    label: "Dice Roll",
    priority: 10,
    minRetriggerMs: 150,
    durationMs: 250,
    gain: 0.6,
    build: () => s("sine*4").n("<c6 d6 e6 d6>").decay(0.03).gain(0.6),
  }),
  blockImpact: entry({
    name: "blockImpact",
    label: "Block Impact",
    priority: 45,
    minRetriggerMs: 250,
    durationMs: 350,
    build: () =>
      stack(
        s("sine").n("c2").decay(0.08).gain(1.6),
        s("sine").n("c3").decay(0.04).gain(0.9)
      ),
  }),
  pushback: entry({
    name: "pushback",
    label: "Pushback",
    priority: 35,
    minRetriggerMs: 250,
    durationMs: 400,
    gain: 0.8,
    build: () => s("white").decay(0.18).gain(0.8),
  }),
  knockdown: entry({
    name: "knockdown",
    label: "Knockdown",
    priority: 50,
    minRetriggerMs: 300,
    durationMs: 400,
    gain: 1.4,
    build: () => s("sine").n("c2").decay(0.22).gain(1.4),
  }),
  kickoff: entry({
    name: "kickoff",
    label: "Kick-off",
    priority: 30,
    minRetriggerMs: 400,
    durationMs: 500,
    build: () =>
      stack(
        s("sine").n("g3").decay(0.1).gain(1.2),
        s("white").decay(0.25).gain(0.4)
      ),
  }),
  ballBounce: entry({
    name: "ballBounce",
    label: "Ball Bounce",
    priority: 20,
    minRetriggerMs: 150,
    durationMs: 250,
    gain: 0.6,
    build: () => s("sine*2").n("<e5 c5>").decay(0.05).gain(0.6),
  }),
  catch: entry({
    name: "catch",
    label: "Catch",
    priority: 25,
    minRetriggerMs: 150,
    durationMs: 250,
    gain: 0.8,
    build: () => s("sine").n("a4").decay(0.06).gain(0.8),
  }),
  fumble: entry({
    name: "fumble",
    label: "Fumble",
    priority: 40,
    minRetriggerMs: 300,
    durationMs: 400,
    gain: 0.9,
    build: () => note("f3 d3").s("sine").decay(0.15).gain(0.9),
  }),
  pass: entry({
    name: "pass",
    label: "Pass",
    priority: 20,
    minRetriggerMs: 200,
    durationMs: 300,
    gain: 0.7,
    build: () => note("c5 e5").s("sine").decay(0.1).gain(0.7),
  }),
  turnoverWhistle: entry({
    name: "turnoverWhistle",
    label: "Turnover Whistle",
    priority: 80,
    minRetriggerMs: 800,
    durationMs: 500,
    gain: 0.9,
    build: () => note("c6 e6").s("square").decay(0.3).gain(0.9),
  }),
  touchdown: entry({
    name: "touchdown",
    label: "Touchdown",
    priority: 100,
    minRetriggerMs: 1500,
    durationMs: 900,
    build: () =>
      stack(
        note("c5 e5 g5 c6").s("sine").decay(0.15).gain(1.2),
        s("white").decay(0.5).gain(0.5)
      ),
  }),
  koInjury: entry({
    name: "koInjury",
    label: "KO / Injury",
    priority: 60,
    minRetriggerMs: 500,
    durationMs: 550,
    build: () => s("sine").n("c2").decay(0.4).gain(1.0),
  }),
  foul: entry({
    name: "foul",
    label: "Foul",
    priority: 70,
    minRetriggerMs: 500,
    durationMs: 500,
    gain: 1.2,
    build: () =>
      stack(
        s("sine").n("d2").decay(0.18).gain(1.2),
        s("white").decay(0.1).gain(0.4)
      ),
  }),
  sendOff: entry({
    name: "sendOff",
    label: "Send-off",
    priority: 90,
    minRetriggerMs: 800,
    durationMs: 600,
    build: () => note("c6 g5 c5").s("square").decay(0.2).gain(1.0),
  }),
  endOfHalf: entry({
    name: "endOfHalf",
    label: "End of Half/Game",
    priority: 90,
    minRetriggerMs: 2000,
    durationMs: 900,
    build: () => note("c5 c5 c5").s("square").decay(0.25).gain(1.0),
  }),
  uiClick: entry({
    name: "uiClick",
    label: "UI Click",
    priority: 5,
    minRetriggerMs: 80,
    durationMs: 100,
    gain: 0.3,
    build: () => s("sine").n("c7").decay(0.02).gain(0.3),
  }),
};

export const CATALOG_ENTRIES: SoundCatalogEntry[] = Object.values(CATALOG);
