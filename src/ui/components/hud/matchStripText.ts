import { GameConfig } from "../../../config/GameConfig";
import {
  DEATHBOWL_FORMAT,
  formatOf,
} from "../../../game/variants/activeMatch";
import { gameTypeRules } from "../../../game/variants/gameTypeRules";
import {
  DEFAULT_GAME_TYPE,
  GAME_TYPE_LABELS,
} from "../../../game/variants/gameTypes";
import { PITCH_LAYOUTS } from "../../../game/variants/pitchLayouts";
import { emptyDriveEffects } from "../../../game/kickoff/driveEffects";
import { type Weather, weatherDescription } from "../../../game/rules/weather";
import { type GameState, type TurnData } from "../../../types/GameState";
import { type Team } from "../../../types/Team";

export function turnProgress(turn: number): string {
  const total = GameConfig.TURNS_PER_HALF;
  return `Turn ${String(Math.min(total, Math.max(0, turn)))} of ${String(total)}`;
}

export function gameTypeLabel(
  state: Pick<GameState, "gameType" | "venue">
): string | null {
  const { gameType, venue } = formatOf(state);
  if (gameType === DEFAULT_GAME_TYPE) return null;
  if (gameType === DEATHBOWL_FORMAT.gameType) return PITCH_LAYOUTS[venue].label;
  return gameTypeRules(gameType).venues.length > 1
    ? PITCH_LAYOUTS[venue].label
    : GAME_TYPE_LABELS[gameType];
}

const SLIPPERY = "-1 catch, pick-up";
const PASS_PENALTY = "-1 pass";
const ICY = "-1 rush, short passes";

const WEATHER_LABELS: Record<
  Weather,
  { icon: string; word: string; short?: string }
> = {
  Nice: { icon: "☀", word: "Nice" },
  "Very Sunny": { icon: "☼", word: "Sunny", short: PASS_PENALTY },
  "Pouring Rain": { icon: "☂", word: "Rain", short: SLIPPERY },
  Blizzard: { icon: "❄", word: "Blizzard", short: ICY },
  "Sweltering Heat": { icon: "♨", word: "Heat", short: "players may faint" },
  Smog: { icon: "🌫", word: "Smog", short: "quick passes only" },
  Wind: { icon: "🌬", word: "Wind", short: PASS_PENALTY },
  Normal: { icon: "☀", word: "Normal" },
  Rain: { icon: "☂", word: "Rain", short: SLIPPERY },
  Snow: { icon: "❄", word: "Snow", short: ICY },
  "Tropical Storm": { icon: "⛈", word: "Storm", short: "touchbacks, short passes" },
  "Clouds of Smog": { icon: "🌫", word: "Smog", short: "short passes" },
  "Howling Winds": { icon: "🌬", word: "Winds", short: PASS_PENALTY },
  "A Normal Day": { icon: "☀", word: "Normal" },
  "Sudden Downpour": { icon: "☂", word: "Downpour", short: "-1 rush, pick-up" },
  "A Stormy Night": { icon: "⛈", word: "Storm", short: "-1 rush, pick-up, falls" },
  "Unbearable Stench": { icon: "☣", word: "Stench", short: "a player falls each turn" },
  "Spilt Sewage": { icon: "☣", word: "Sewage", short: "-2 rush" },
  "No More Disgusting Than Usual": { icon: "☁", word: "Usual" },
  "It's Getting Warm": { icon: "♨", word: "Warm", short: SLIPPERY },
  "Underground Heatwave": { icon: "♨", word: "Heatwave", short: "players may faint" },
};

export function weatherSummary(weather: Weather): {
  icon: string;
  word: string;

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

export function spentSummary(spent: string[]): string | null {
  return spent.length > 0 ? `Spent: ${spent.join(", ")}` : null;
}

export function spentActions({ spend }: Pick<TurnData, "spend">): string[] {
  return [
    { spent: spend.blitzed.length > 0, label: "Blitz" },
    { spent: spend.passes > 0, label: "Pass" },
    { spent: spend.handOffs > 0, label: "Hand-off" },
    { spent: spend.fouled.length > 0, label: "Foul" },
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
      `Brilliant Coaching: ${String(free)} free re-roll${free === 1 ? "" : "s"}`
    );
  const assist = effects.owedAssists[team.id];
  if (assist && !assist.used)
    text.push(`Cheering Fans: +1 assist on turn ${String(assist.turn)}`);
  const modifiers = team.players.flatMap((player) => {
    const mod = effects.playerModifiers[player.id];
    if (!mod) return [];
    const detail = mod.confinedToReserves
      ? "reserves this drive"
      : [
          mod.maModifier ? `${String(mod.maModifier)} MA` : "",
          mod.avModifier ? `${String(mod.avModifier)} AV` : "",
        ]
          .filter(Boolean)
          .join(", ") + " this drive";
    return `#${String(player.number)}: ${detail}`;
  });
  if (modifiers.length > 0) text.push(`Dodgy Snack ${modifiers.join("; ")}`);
  return text;
}
