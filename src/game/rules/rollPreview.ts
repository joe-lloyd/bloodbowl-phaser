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

/** Whose side of a block the coach reading the card is on. */
export type BlockSide = "attacker" | "defender";

/**
 * The same details are used on hover and in the block dialog, worded for
 * the coach reading them: "you pick", "Our assists" and "We have Block"
 * mean that coach's side, attacker or defender.
 */
export function blockPreviewLines(
  analysis: BlockAnalysis,
  attacker: Player,
  defender: Player,
  viewer: BlockSide
): string[] {
  const viewerPicks = analysis.isUphill === (viewer === "defender");
  const [ours, theirs] =
    viewer === "attacker"
      ? [analysis.attackerAssists, analysis.defenderAssists]
      : [analysis.defenderAssists, analysis.attackerAssists];
  // "We" for the viewer's player, "They" for the other one
  const attackerIs = viewer === "attacker" ? "We" : "They";
  const defenderIs = viewer === "defender" ? "We" : "They";
  const lines = [
    `${analysis.diceCount} ${analysis.diceCount === 1 ? "die" : "dice"}, ${viewerPicks ? "you" : "they"} pick`,
    assistLine("Our", ours),
    assistLine("Their", theirs),
  ];
  if (has(defender, SkillType.DODGE))
    lines.push(
      has(attacker, SkillType.TACKLE)
        ? `${defenderIs} have Dodge. ${attackerIs === "We" ? "Our" : "Their"} Tackle cancels it.`
        : `${defenderIs} have Dodge: Stumble becomes Push`
    );
  if (has(defender, SkillType.BLOCK))
    lines.push(`${defenderIs} have Block: safe on Both Down`);
  if (has(attacker, SkillType.BLOCK))
    lines.push(`${attackerIs} have Block: safe on Both Down`);
  if (has(attacker, SkillType.WRESTLE) || has(defender, SkillType.WRESTLE))
    lines.push("Wrestle can put both players Prone on Both Down");
  if (has(defender, SkillType.STAND_FIRM))
    lines.push(`${defenderIs} have Stand Firm: may refuse a Push`);
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
  return { analysis, lines, targetNumber };
}

/**
 * The roll one interceptor needs. Mirrors PassOperation: the corridor
 * modifier, Very Long Legs, Extra Arms, weather, and marking by the passing
 * team.
 */
/**
 * The interception Agility Test's modifiers, the one source for the rules
 * engine, the throw preview and the interception dialog. The corridor
 * modifier is -3 for an accurate pass and -2 for an inaccurate one.
 */
export function interceptModifiers(
  interceptor: Player,
  corridorModifier: number,
  passingTeam: Player[],
  weather: Weather
): { base: number; marking: number; total: number } {
  const marking = interceptor.gridPosition
    ? markingPlayers(interceptor.gridPosition, passingTeam).length
    : 0;
  const base =
    corridorModifier +
    (has(interceptor, SkillType.VERY_LONG_LEGS) ? 2 : 0) +
    (has(interceptor, SkillType.EXTRA_ARMS) ? 1 : 0) +
    weatherEffects(weather).ballHandling;
  return { base, marking, total: base - marking };
}

export function interceptTarget(
  interceptor: Player,
  corridorModifier: number,
  passingTeam: Player[],
  weather: Weather
): number {
  return requiredRoll(
    interceptor.stats.AG,
    interceptModifiers(interceptor, corridorModifier, passingTeam, weather)
      .total
  );
}

/** The roll an interceptor needs given the modifier the engine offers. */
export const interceptNeed = (interceptor: Player, modifier: number): number =>
  requiredRoll(interceptor.stats.AG, modifier);

/**
 * The throw preview's line for one interceptor. The pass is not thrown
 * yet, so it gives the roll against an accurate pass and, when it differs,
 * against an inaccurate one: the interception dialog then shows the one
 * that applies.
 */
export function interceptPreviewLine(
  interceptor: Player,
  passingTeam: Player[],
  weather: Weather
): { line: string; accurate: number; inaccurate: number } {
  const accurate = interceptTarget(interceptor, -3, passingTeam, weather);
  const inaccurate = interceptTarget(interceptor, -2, passingTeam, weather);
  const name = `Intercept #${interceptor.number}`;
  const line =
    accurate === inaccurate
      ? rollLabel(name, accurate)
      : `${rollLabel(name, accurate)}, ${rollLabel("if inaccurate", inaccurate).replace(": ", " ")}`;
  return { line, accurate, inaccurate };
}
