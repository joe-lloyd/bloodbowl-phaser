import { GameConfig } from "../../../config/GameConfig";
import { emptyDriveEffects } from "../../../game/kickoff/driveEffects";
import { Weather, weatherDescription } from "../../../game/rules/weather";
import { GameState, TurnData } from "../../../types/GameState";
import { Team } from "../../../types/Team";

export function turnProgress(turn: number): string {
  const total = GameConfig.TURNS_PER_HALF;
  return `Turn ${Math.min(total, Math.max(0, turn))} of ${total}`;
}

/** Icon, short word and a few words of effect that fit beside the turn tab. */
const WEATHER_LABELS: Record<
  Weather,
  { icon: string; word: string; short?: string }
> = {
  Nice: { icon: "☀", word: "Nice" },
  "Very Sunny": { icon: "☼", word: "Sunny", short: "-1 pass" },
  "Pouring Rain": { icon: "☂", word: "Rain", short: "-1 catch, pick-up" },
  Blizzard: { icon: "❄", word: "Blizzard", short: "-1 rush, short passes" },
  "Sweltering Heat": { icon: "♨", word: "Heat", short: "players may faint" },
};

/**
 * Icon and short word, plus a short effect when the weather changes play.
 * The full effect is the tooltip.
 */
export function weatherSummary(weather: Weather): {
  icon: string;
  word: string;
  /** The short effect, or null when the weather does not change play. */
  effect: string | null;
  text: string;
  title: string;
} {
  const { icon, word, short } = WEATHER_LABELS[weather];
  return {
    icon,
    word,
    effect: short ?? null,
    text: short ? `${word}: ${short}` : word,
    title: `${weather}: ${weatherDescription(weather)}`,
  };
}

/** The once-per-turn actions already used, as one chip's text. */
export function spentSummary(spent: string[]): string | null {
  return spent.length ? `Spent: ${spent.join(", ")}` : null;
}

export function spentActions(
  turn: Pick<
    TurnData,
    "hasBlitzed" | "hasPassed" | "hasHandedOff" | "hasFouled"
  >
): string[] {
  return [
    { spent: turn.hasBlitzed, label: "Blitz" },
    { spent: turn.hasPassed, label: "Pass" },
    { spent: turn.hasHandedOff, label: "Hand-off" },
    { spent: turn.hasFouled, label: "Foul" },
  ]
    .filter((action) => action.spent)
    .map((action) => action.label);
}

export function driveEffectText(state: GameState, team: Team): string[] {
  const effects = state.driveEffects ?? emptyDriveEffects();
  const text: string[] = [];
  const free = effects.freeRerolls[team.id] ?? 0;
  if (free > 0)
    text.push(
      `Brilliant Coaching: ${free} free re-roll${free === 1 ? "" : "s"}`
    );
  const assist = effects.owedAssists[team.id];
  if (assist && !assist.used)
    text.push(`Cheering Fans: +1 assist on turn ${assist.turn}`);
  const modifiers = team.players.flatMap((player) => {
    const mod = effects.playerModifiers[player.id];
    if (!mod) return [];
    const detail = mod.confinedToReserves
      ? "reserves this drive"
      : [
          mod.maModifier ? `${mod.maModifier} MA` : "",
          mod.avModifier ? `${mod.avModifier} AV` : "",
        ]
          .filter(Boolean)
          .join(", ") + " this drive";
    return [`#${player.number}: ${detail}`];
  });
  if (modifiers.length) text.push(`Dodgy Snack ${modifiers.join("; ")}`);
  return text;
}
