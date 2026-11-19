import { type LogEntryCategory } from "../../../types/events";

export type LogColor = "good" | "bad" | "neutral" | "warning" | "unknown";

const NEUTRAL_ROLL_TYPES = new Set<string>([
  "Coin Toss",
  "Weather",
  "Kickoff Event",
]);

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

export function classifyEntryNature(category: LogEntryCategory): LogColor {
  if (category === "weather" || category === "kickoff") return "neutral";

  if (category === "info") return "warning";
  if (category === "score") return "good";

  return "unknown";
}

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

export const LOG_COLOR_CLASSES: Record<Exclude<LogColor, "unknown">, string> = {
  good: "!border-hud-good !bg-hud-good/10",
  bad: "!border-hud-bad !bg-hud-bad/10",
  neutral: "!border-hud-info !bg-hud-info/10",
  warning: "!border-hud-warn !bg-hud-warn/10",
};
