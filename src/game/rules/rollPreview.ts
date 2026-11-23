import { type Player, hasTackleZone } from "../../types/Player";
import { type BlockAnalysis } from "../../types/Actions";
import { SkillType, hasSkill } from "../../types/Skills";
import { type PassRange } from "../controllers/PassController";
import { type Weather, weatherEffects } from "./weather";
import { type GameState } from "../../types/GameState";
import {
  catchModifier,
  passModifier,
  pickUpModifier,
} from "../kickoff/ballConditions";
import { effectiveAV } from "../kickoff/driveEffects";
import { FoulValidator } from "../validators/FoulValidator";
import { rollLabel, requiredRoll } from "./rollTargets";

interface Square {
  x: number;
  y: number;
}
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
  hasSkill(player.skills ?? [], skill);

export function dodgeTarget(
  player: Player,
  from: Square,
  to: Square,
  opponents: Player[]
): number {
  const marking = has(player, SkillType.STUNTY)
    ? 0
    : markingPlayers(to, opponents).filter((p) => !has(p, SkillType.TITCHY))
        .length;
  const tail = markingPlayers(from, opponents).some((p) =>
    has(p, SkillType.PREHENSILE_TAIL)
  );
  const modifier =
    -marking -
    (tail ? 1 : 0) +
    (has(player, SkillType.TITCHY) ? 1 : 0) +
    (has(player, SkillType.TWO_HEADS) ? 1 : 0);
  return requiredRoll(player.stats.AG, modifier);
}

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
  state: GameState
): number {
  const marking = has(player, SkillType.BIG_HAND)
    ? 0
    : markingPlayers(square, opponents).length;
  return requiredRoll(
    player.stats.AG,
    -marking +
      pickUpModifier(state) +
      (has(player, SkillType.EXTRA_ARMS) ? 1 : 0)
  );
}

export function secureBallTarget(
  player: Player,
  square: Square,
  opponents: Player[],
  state: GameState
): number {
  const marking = markingPlayers(square, opponents).length;
  const rain = pickUpModifier(state);
  const modifier = has(player, SkillType.BIG_HAND)
    ? Math.max(0, rain)
    : rain - marking;
  return requiredRoll(2, modifier);
}

export function catchTarget(
  player: Player,
  opponents: Player[],
  state: GameState,
  origin: "pass" | "handoff"
): number {
  const marking =
    player.gridPosition && !has(player, SkillType.NERVES_OF_STEEL)
      ? markingPlayers(player.gridPosition, opponents).length
      : 0;
  const modifier =
    -marking +
    catchModifier(state) -
    disturbing(player, opponents) +
    (has(player, SkillType.EXTRA_ARMS) ? 1 : 0) +
    (origin === "pass" && has(player, SkillType.DIVING_CATCH) ? 1 : 0);
  return requiredRoll(player.stats.AG, modifier);
}

export function passTarget(
  player: Player,
  opponents: Player[],
  state: GameState,
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
      passModifier(state, range.type) +
      bonus -
      disturbing(player, opponents)
  );
}

const assistLine = (side: "Our" | "Their", players: Player[]): string =>
  `${side} assists: ${players.length ? players.map((p) => `#${String(p.number)}`).join(", ") : "none"}`;

export type BlockSide = "attacker" | "defender";

function strengthPart(base: number, total: number): string {
  const help = total - base;
  return help === 0
    ? String(total)
    : `${String(total)} (${String(base)} +${String(help)})`;
}

function strengthLine(
  analysis: BlockAnalysis,
  sides: { attacker: Player; defender: Player },
  viewer: BlockSide
): string {
  const { attacker, defender } = sides;
  const attacking = strengthPart(attacker.stats.ST, analysis.attackerST);
  const defending = strengthPart(defender.stats.ST, analysis.defenderST);
  const [ours, theirs] =
    viewer === "attacker" ? [attacking, defending] : [defending, attacking];
  return `Our ST ${ours} vs their ST ${theirs}`;
}

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

  const attackerIs = viewer === "attacker" ? "We" : "They";
  const defenderIs = viewer === "defender" ? "We" : "They";
  const lines = [
    `${String(analysis.diceCount)} ${analysis.diceCount === 1 ? "die" : "dice"}, ${viewerPicks ? "you" : "they"} pick`,
    strengthLine(analysis, { attacker, defender }, viewer),
    assistLine("Our", ours),
    assistLine("Their", theirs),
  ];
  if (analysis.barricadeCover)
    lines.push(`${defenderIs} are behind a Barricade: +1 ST`);
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

export interface RouteRoll {
  type: "dodge" | "rush" | "barricade" | "pickup" | "secureBall";
  target: number;
  square: Square;
}
export const ROUTE_ROLL_NAMES: Record<RouteRoll["type"], string> = {
  dodge: "Dodge",
  rush: "Rush",
  barricade: "Reckless crossing",
  pickup: "Pick up",
  secureBall: "Secure the Ball",
};

export interface RoutePreview {
  movementLeft: number;
  riskySteps: number;
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
    rollLabel("Armour", targetNumber),
    assistLine("Our", analysis.offensiveAssists),
    assistLine("Their", analysis.defensiveAssists),
  ];
  if (
    has(fouler, SkillType.LONE_FOULER) &&
    !analysis.offensiveAssists.length &&
    !analysis.defensiveAssists.length
  ) {
    lines.push("Lone Fouler may re-roll the armour roll");
  }
  if (locked) lines.push("Iron Hard Skin cancels armour modifiers");
  if (has(fouler, SkillType.DIRTY_PLAYER) && !locked)
    lines.push("Includes Dirty Player on armour");
  lines.push("A double sends the fouler off.");
  return { analysis, lines, targetNumber };
}

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

export const interceptNeed = (interceptor: Player, modifier: number): number =>
  requiredRoll(interceptor.stats.AG, modifier);

export function interceptPreviewLine(
  interceptor: Player,
  passingTeam: Player[],
  weather: Weather
): { line: string; accurate: number; inaccurate: number } {
  const accurate = interceptTarget(interceptor, -3, passingTeam, weather);
  const inaccurate = interceptTarget(interceptor, -2, passingTeam, weather);
  const name = `Intercept #${String(interceptor.number)}`;
  const line =
    accurate === inaccurate
      ? rollLabel(name, accurate)
      : `${rollLabel(name, accurate)}, ${rollLabel("if inaccurate", inaccurate).replace(": ", " ")}`;
  return { line, accurate, inaccurate };
}
