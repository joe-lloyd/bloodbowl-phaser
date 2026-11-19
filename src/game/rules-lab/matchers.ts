import { z } from "zod";
import { GameEventNames } from "../../types/events";
import { PlayerStatus } from "../../types/Player";
import { type ScriptResult } from "./types";
import { resolveRef } from "./runner";

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
    (d) => !skill || z.object({ skill: z.string() }).parse(d).skill === skill
  );
}

export function rerollUsed(
  result: ScriptResult,
  source?: "skill" | "team"
): boolean {
  return sawEvent(
    result,
    GameEventNames.RerollUsed,
    (d) =>
      !source || z.object({ source: z.string() }).parse(d).source === source
  );
}

export function turnoverHappened(result: ScriptResult): boolean {
  return sawEvent(result, GameEventNames.Turnover);
}

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

export function skillCheckDiff(
  result: ScriptResult,
  rollTypePrefix: string
): number | undefined {
  const event = result.events.find(
    (e) =>
      e.name === GameEventNames.DiceRoll &&
      z
        .object({ rollType: z.string().exactOptional() })
        .parse(e.data)
        .rollType?.startsWith(rollTypePrefix)
  );
  if (!event) return undefined;
  const data = z
    .object({
      value: z.number(),
      total: z.number(),
      context: z
        .object({ modifier: z.number().exactOptional() })
        .exactOptional(),
    })
    .parse(event.data);

  return data.context?.modifier ?? data.total - data.value;
}

export function blockDiceCount(result: ScriptResult): number | undefined {
  const event = result.events.find(
    (e) => e.name === GameEventNames.BlockDiceRolled
  );
  return event
    ? z.object({ numDice: z.number() }).parse(event.data).numDice
    : undefined;
}

export function armourRolls(result: ScriptResult): number {
  return result.events.filter((e) => {
    if (e.name !== GameEventNames.DiceRoll) return false;
    const rollType =
      z.object({ rollType: z.string().exactOptional() }).parse(e.data)
        .rollType ?? "";
    return rollType.includes("Armor") || rollType.includes("Armour");
  }).length;
}
