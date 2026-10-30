import { Player, hasTackleZone } from "../../types/Player";
import { BlockAnalysis } from "../../types/Actions";
import { SkillType, hasSkill } from "../../types/Skills";
import { PassRange } from "../controllers/PassController";
import { Weather, weatherEffects } from "./weather";
import { GameState } from "../../types/GameState";
import { effectiveAV } from "../kickoff/driveEffects";
import { FoulValidator } from "../validators/FoulValidator";
import { rollLabel, rollProbability, requiredRoll } from "./rollProbability";

type Square = { x: number; y: number };
export const markingPlayers = (square: Square, opponents: Player[]) =>
  opponents.filter(
    (p) =>
      p.gridPosition &&
      hasTackleZone(p) &&
      Math.max(
        Math.abs(p.gridPosition.x - square.x),
        Math.abs(p.gridPosition.y - square.y)
      ) === 1
  );

const has = (player: Player, skill: SkillType) =>
  hasSkill(player.skills, skill);
const disturbing = (player: Player, opponents: Player[]) =>
  opponents.filter(
    (p) =>
      p.gridPosition &&
      player.gridPosition &&
      has(p, SkillType.DISTURBING_PRESENCE) &&
      Math.max(
        Math.abs(p.gridPosition.x - player.gridPosition.x),
        Math.abs(p.gridPosition.y - player.gridPosition.y)
      ) <= 3
  ).length;

export function pickupTarget(
  player: Player,
  square: Square,
  opponents: Player[],
  weather: Weather
): number {
  const marking = has(player, SkillType.BIG_HAND)
    ? 0
    : markingPlayers(square, opponents).length;
  return requiredRoll(
    player.stats.AG,
    -marking +
      weatherEffects(weather).ballHandling +
      (has(player, SkillType.EXTRA_ARMS) ? 1 : 0)
  );
}

export function catchTarget(
  player: Player,
  opponents: Player[],
  weather: Weather,
  origin: "pass" | "handoff"
): number {
  const marking =
    player.gridPosition && !has(player, SkillType.NERVES_OF_STEEL)
      ? markingPlayers(player.gridPosition, opponents).length
      : 0;
  const modifier =
    -marking +
    weatherEffects(weather).ballHandling -
    disturbing(player, opponents) +
    (has(player, SkillType.EXTRA_ARMS) ? 1 : 0) +
    (origin === "pass" && has(player, SkillType.DIVING_CATCH) ? 1 : 0);
  return requiredRoll(player.stats.AG, modifier);
}

export function passTarget(
  player: Player,
  opponents: Player[],
  weather: Weather,
  range: PassRange
): number {
  const marking =
    player.gridPosition && !has(player, SkillType.NERVES_OF_STEEL)
      ? markingPlayers(player.gridPosition, opponents).length
      : 0;
  const short = range.type === "Quick Pass" || range.type === "Short Pass";
  const bonus = has(player, short ? SkillType.ACCURATE : SkillType.CANNONEER)
    ? 1
    : 0;
  return requiredRoll(
    player.stats.PA,
    range.modifier -
      marking +
      weatherEffects(weather).passingAbility +
      bonus -
      disturbing(player, opponents)
  );
}

export const assistLine = (side: "Our" | "Their", players: Player[]): string =>
  `${side} assists: ${players.length ? players.map((p) => `#${p.number}`).join(", ") : "none"}`;

/** The same details are used on hover and in the block dialog. */
export function blockPreviewLines(
  analysis: BlockAnalysis,
  attacker: Player,
  defender: Player
): string[] {
  const lines = [
    `${analysis.diceCount} ${analysis.diceCount === 1 ? "die" : "dice"}, ${analysis.isUphill ? "they" : "you"} pick`,
    assistLine("Our", analysis.attackerAssists),
    assistLine("Their", analysis.defenderAssists),
  ];
  if (has(defender, SkillType.DODGE))
    lines.push(
      has(attacker, SkillType.TACKLE)
        ? "They have Dodge. Our Tackle cancels it."
        : "They have Dodge: Stumble becomes Push"
    );
  if (has(defender, SkillType.BLOCK))
    lines.push("They have Block: safe on Both Down");
  if (has(attacker, SkillType.BLOCK))
    lines.push("We have Block: safe on Both Down");
  if (has(attacker, SkillType.WRESTLE) || has(defender, SkillType.WRESTLE))
    lines.push("Wrestle can put both players Prone on Both Down");
  if (has(defender, SkillType.STAND_FIRM))
    lines.push("They have Stand Firm: may refuse a Push");
  return lines;
}

export type RouteRoll = {
  type: "dodge" | "rush" | "pickup";
  target: number;
  square: Square;
};
export interface RoutePreview {
  movementLeft: number;
  riskySteps: number;
  chance: number;
  rolls: RouteRoll[];
  rerolls: string[];
}
export interface TargetRollPreview {
  square: Square;
  lines: string[];
  danger: boolean;
}

export function foulPreview(
  fouler: Player,
  target: Player,
  players: Player[],
  state: GameState
) {
  const analysis = new FoulValidator().analyzeFoul(fouler, target, players);
  const locked = has(target, SkillType.IRON_HARD_SKIN);
  const modifier = locked
    ? 0
    : analysis.modifier + (has(fouler, SkillType.DIRTY_PLAYER) ? 1 : 0);
  const targetNumber = effectiveAV(target, state) - modifier;
  const lines = [
    rollLabel("Armour", targetNumber, "2d6"),
    assistLine("Our", analysis.offensiveAssists),
    assistLine("Their", analysis.defensiveAssists),
  ];
  if (
    has(fouler, SkillType.LONE_FOULER) &&
    !analysis.offensiveAssists.length &&
    !analysis.defensiveAssists.length
  ) {
    const chance = rollProbability([
      { dice: "2d6", target: targetNumber, reroll: true },
    ]);
    lines.push(`${Math.round(chance * 100)}% to break armour with Lone Fouler`);
  }
  if (locked) lines.push("Iron Hard Skin cancels armour modifiers");
  if (has(fouler, SkillType.DIRTY_PLAYER) && !locked)
    lines.push("Includes Dirty Player on armour");
  lines.push("A double sends the fouler off.");
  return { analysis, lines };
}

/**
 * The roll one interceptor needs. Mirrors PassOperation: the corridor
 * modifier, Very Long Legs, Extra Arms, weather, and marking by the passing
 * team.
 */
export function interceptTarget(
  interceptor: Player,
  corridorModifier: number,
  passingTeam: Player[],
  weather: Weather
): number {
  const marking = interceptor.gridPosition
    ? markingPlayers(interceptor.gridPosition, passingTeam).length
    : 0;
  return requiredRoll(
    interceptor.stats.AG,
    corridorModifier +
      (has(interceptor, SkillType.VERY_LONG_LEGS) ? 2 : 0) +
      (has(interceptor, SkillType.EXTRA_ARMS) ? 1 : 0) +
      weatherEffects(weather).ballHandling -
      marking
  );
}
