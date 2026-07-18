/**
 * Predicate helpers for rule outcomes: small composable checks over a
 * ScriptResult so catalog entries read declaratively.
 */

import { GameEventNames } from "../../types/events";
import { PlayerStatus } from "../../types/Player";
import { ScriptResult } from "./types";
import { resolveRef } from "./runner";

/** A reroll decision was offered (optionally narrowed). */
export function rerollOffered(
  result: ScriptResult,
  opts?: { rollKind?: string; source?: "skill" | "team"; skill?: string }
): boolean {
  return result.decisions.some(
    (d) =>
      d.type === "reroll" &&
      (!opts?.rollKind || d.rollKind === opts.rollKind) &&
      (!opts?.source || d.sources.includes(opts.source)) &&
      (!opts?.skill || d.skill === opts.skill)
  );
}

/** A reaction decision was offered (optionally for a specific skill). */
export function reactionOffered(
  result: ScriptResult,
  opts?: { skill?: string; chooser?: "team1" | "team2" }
): boolean {
  return result.decisions.some(
    (d) =>
      d.type === "reaction" &&
      (!opts?.skill || d.skill === opts.skill) &&
      (!opts?.chooser ||
        d.chooserTeamId === resolveRef(result.game, opts.chooser))
  );
}

/** An event with this name was emitted (optionally matching its data). */
export function sawEvent(
  result: ScriptResult,
  name: string,
  matches?: (data: unknown) => boolean
): boolean {
  return result.events.some(
    (e) => e.name === name && (!matches || matches(e.data))
  );
}

export function skillTriggered(result: ScriptResult, skill?: string): boolean {
  return sawEvent(
    result,
    GameEventNames.SkillTriggered,
    (d) => !skill || (d as { skill: string }).skill === skill
  );
}

export function rerollUsed(
  result: ScriptResult,
  source?: "skill" | "team"
): boolean {
  return sawEvent(
    result,
    GameEventNames.RerollUsed,
    (d) => !source || (d as { source: string }).source === source
  );
}

export function turnoverHappened(result: ScriptResult): boolean {
  return sawEvent(result, GameEventNames.Turnover);
}

/** Resolve a placement ref to the live Player of this run. */
export function playerOf(result: ScriptResult, ref: string) {
  const id = resolveRef(result.game, ref);
  const player = result.game.ctx.gameService.getPlayerById(id);
  if (!player) throw new Error(`unknown player ref '${ref}'`);
  return player;
}

export function playerStanding(result: ScriptResult, ref: string): boolean {
  return playerOf(result, ref).status === PlayerStatus.ACTIVE;
}

export function playerDown(result: ScriptResult, ref: string): boolean {
  return !playerStanding(result, ref);
}

export function playerAt(
  result: ScriptResult,
  ref: string,
  square: { x: number; y: number }
): boolean {
  const pos = playerOf(result, ref).gridPosition;
  return !!pos && pos.x === square.x && pos.y === square.y;
}

/**
 * total − value of the FIRST skill-check dice event whose rollType starts
 * with the prefix — i.e. the net modifier that was applied to the roll.
 */
export function skillCheckDiff(
  result: ScriptResult,
  rollTypePrefix: string
): number | undefined {
  const event = result.events.find(
    (e) =>
      e.name === GameEventNames.DiceRoll &&
      (e.data as { rollType?: string })?.rollType?.startsWith(rollTypePrefix)
  );
  if (!event) return undefined;
  const data = event.data as { value: number; total: number };
  return data.total - data.value;
}

/** Count armour rolls seen in the run (for no-armour outcomes). */
export function armourRolls(result: ScriptResult): number {
  return result.events.filter(
    (e) =>
      e.name === GameEventNames.DiceRoll &&
      (e.data as { rollType?: string })?.rollType?.includes("Armour")
  ).length;
}
