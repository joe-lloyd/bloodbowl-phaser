import { setupLabel } from "../../game/setup/deployment";
import { type Candidate } from "../candidates";
import { type CoachChoice, type CoachContext } from "../coach";
import { type CoachRng } from "../rng";

type SetupValues = Readonly<Record<string, number>>;

interface SetupSides {
  readonly kick: SetupValues;
  readonly receive: SetupValues;
}

const SETUP_VALUES: SetupSides = {
  kick: {
    "Kick: Blitz line": 0.025,
    "Kick: Press": 0.018,
    Spread: -0.003,
    "Kick: Screen": -0.01,
    Balanced: -0.011,
    Bunker: -0.017,
  },
  receive: {
    "Receive: Full line": 0.014,
    "Receive: Wedge": 0.004,
    Bunker: 0,
    Balanced: -0.003,
    Spread: -0.008,
    "Receive: Flank": -0.01,
  },
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
  const side = kicking ? SETUP_VALUES.kick : SETUP_VALUES.receive;
  const pick = pickByValue(formations, side, rng);
  return pick ? { index: point.candidates.indexOf(pick) } : null;
}
