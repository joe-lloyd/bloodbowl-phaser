import { LogEntryCategory } from "../../../types/events";

/**
 * Dice Log coloring.
 *
 * Two-step, pure classification shared by both online and solo/local play
 * (see openspec/changes/add-dice-log-color-coding/design.md):
 *
 * 1. `classifyDiceRowNature`/`classifyEntryNature` derive the intrinsic
 *    nature of a roll/entry — independent of who's watching.
 * 2. `resolveDisplayColor` folds in the viewer's perspective (or the lack
 *    of one, in solo/local play) to decide the color actually shown.
 */

/** The five colors a Dice Log row can render in. "unknown" means "leave
 *  the row's existing, unclassified appearance alone." */
export type LogColor = "good" | "bad" | "neutral" | "warning" | "unknown";

/** Roll types logged as plain dice rows that are never "good/bad for a
 *  team" — the outcome doesn't favor either side in a simple sense. These
 *  are the exact strings the emitting code uses (WeatherManager,
 *  KickoffEventManager, and every Coin Toss call site). Also true in
 *  practice for Weather and Kickoff Event specifically: neither call site
 *  attaches a `teamId` to the roll at all (in either online or solo play),
 *  so even ignoring intent there's no per-team attribution to key
 *  perspective coloring off. Coin Toss does carry a `teamId` (the winner),
 *  but "who called heads" isn't a good/bad outcome for either side either
 *  — it's forced neutral by category, same as the other two. */
const NEUTRAL_ROLL_TYPES = new Set<string>([
  "Coin Toss",
  "Weather",
  "Kickoff Event",
]);

/** Intrinsic nature of a raw dice roll, independent of who's watching.
 *
 * Verified invariant (see design.md): whenever `resultState` is
 * `"success"`, that is good news for `teamId`; whenever it's
 * `"failure"`/`"fumble"`, that is bad news for `teamId` — this holds even
 * for armour checks, where `teamId` is the attacker, not the injured
 * player, so a "success" (armour breaks) is good for the attacker.
 */
export function classifyDiceRowNature(row: {
  rollType: string;
  resultState?: "none" | "success" | "failure" | "fumble";
}): LogColor {
  if (NEUTRAL_ROLL_TYPES.has(row.rollType)) return "neutral";
  if (row.resultState === "success") return "good";
  if (row.resultState === "failure" || row.resultState === "fumble")
    return "bad";
  return "unknown";
}

/** Intrinsic nature of a durable match-log entry, independent of viewer. */
export function classifyEntryNature(category: LogEntryCategory): LogColor {
  if (category === "weather" || category === "kickoff") return "neutral";
  // "info" is the deprecated UI_Notification alias — literally where
  // warning/informational strings land (e.g. "Select a Kicker first!").
  if (category === "info") return "warning";
  if (category === "score") return "good";
  // "skill" | "reroll" | "action" | "drive" have no consistent polarity.
  return "unknown";
}

/**
 * Resolve a row/entry's intrinsic nature into the color actually shown,
 * given who's watching:
 *  - `neutral` / `warning` / `unknown` are never affected by perspective.
 *  - Solo/local play (`perspectiveTeamId === null`): the intrinsic nature
 *    passes straight through — every "good" roll is green, every "bad"
 *    roll is red, regardless of which side rolled it.
 *  - Online play (`perspectiveTeamId` set): a roll/entry attributed to the
 *    viewer's own team passes straight through; one attributed to the
 *    opponent is inverted (their good news is bad for the viewer, and
 *    vice versa).
 *  - If `teamId` is missing, perspective can't be applied — the intrinsic
 *    nature is shown as-is.
 */
export function resolveDisplayColor(
  nature: LogColor,
  teamId: string | undefined,
  perspectiveTeamId: string | null
): LogColor {
  if (nature !== "good" && nature !== "bad") return nature;
  if (!perspectiveTeamId || !teamId) return nature;
  const isMine = teamId === perspectiveTeamId;
  const favorsMe = isMine ? nature === "good" : nature === "bad";
  return favorsMe ? "good" : "bad";
}

/** Tailwind classes for each resolvable color. "unknown" is intentionally
 *  absent — callers fall back to their row kind's existing look
 *  (DiceRow: gray; EntryRow: team-identity border). */
export const LOG_COLOR_CLASSES: Record<Exclude<LogColor, "unknown">, string> =
  {
    good: "!border-green-500 !bg-green-900/20",
    bad: "!border-red-500 !bg-red-900/20",
    neutral: "!border-blue-500 !bg-blue-900/20",
    warning: "!border-yellow-500 !bg-yellow-900/20",
  };
