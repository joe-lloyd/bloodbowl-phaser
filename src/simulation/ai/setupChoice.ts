import { setupLabel } from "../../game/setup/deployment";
import {
  DEFAULT_GAME_TYPE,
  type GameType,
} from "../../game/variants/gameTypes";
import { type Candidate } from "../candidates";
import { type CoachChoice, type CoachContext } from "../coach";
import { type CoachRng } from "../rng";

type SetupValues = Readonly<Record<string, number>>;

interface SetupSides {
  readonly kick: SetupValues;
  readonly receive: SetupValues;
}

const SEVENS: SetupSides = {
  kick: {
    Balanced: -0.014,
    Spread: -0.008,
    Bunker: -0.012,
    "Kick: Blitz line": 0.025,
    "Kick: Press": 0.015,
    "Kick: Screen": -0.006,
  },
  receive: {
    Balanced: -0.004,
    Spread: -0.007,
    Bunker: -0.001,
    "Receive: Wedge": 0.005,
    "Receive: Full line": 0.018,
    "Receive: Flank": -0.011,
  },
};

export const SETUP_VALUES: Readonly<Record<GameType, SetupSides>> = {
  sevens: SEVENS,
  "street-bowl": SEVENS,
  "beach-bowl": SEVENS,
  "gutter-bowl": SEVENS,
};

const TOUCHDOWNS_PER_E_FOLD = 0.02;

function pickByValue(
  formations: readonly Candidate[],
  values: SetupValues,
  rng: CoachRng
): Candidate | undefined {
  const weighted = formations.map((formation) => {
    const named = Object.entries(values).find(
      ([name]) => formation.label === setupLabel(name)
    );
    const value = named?.[1] ?? 0;
    return { formation, weight: Math.exp(value / TOUCHDOWNS_PER_E_FOLD) };
  });
  const total = weighted.reduce((sum, { weight }) => sum + weight, 0);
  let left = rng.next() * total;
  return (
    weighted.find(({ weight }) => (left -= weight) < 0)?.formation ??
    weighted[0]?.formation
  );
}

export function setupChoice({
  game,
  point,
  rng,
}: CoachContext): CoachChoice | null {
  const formations = point.candidates.filter((c) => c.kind === "setup");
  if (formations.length < 2) return null;
  const state = game.ctx.gameService.getState();
  const kicking = state.setup?.kickingTeamId === point.teamId;
  const values = SETUP_VALUES[state.gameType ?? DEFAULT_GAME_TYPE];
  const side = kicking ? values.kick : values.receive;
  const pick = pickByValue(formations, side, rng);
  return pick ? { index: point.candidates.indexOf(pick) } : null;
}
