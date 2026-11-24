import { type Player, hasTackleZone } from "../../types/Player";
import { type BlockAnalysis } from "../../types/Actions";
import { SkillType, hasSkill } from "../../types/Skills";
import { type PassRange } from "../controllers/PassController";
import { type Weather, weatherEffects } from "./weather";
import { type GameState } from "../../types/GameState";
import {
  catchModifier,
  lostBallHandling,
  passModifier,
  pickUpModifier,
} from "../kickoff/ballConditions";
import { souvenirModifier } from "../inducements/souvenirModifiers";
import { rushModifier } from "../inducements/matchInducements";
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
  { from, to }: { from: Square; to: Square },
  opponents: Player[],
  bonus = 0
): number {
  const marking = has(player, SkillType.STUNTY)
    ? 0
    : markingPlayers(to, opponents).filter((p) => !has(p, SkillType.TITCHY))
        .length;
  const tail = markingPlayers(from, opponents).some((p) =>
    has(p, SkillType.PREHENSILE_TAIL)
  );
  const modifier =
    bonus -
    marking -
    (tail ? 1 : 0) +
    (has(player, SkillType.TITCHY) ? 1 : 0) +
    (has(player, SkillType.TWO_HEADS) ? 1 : 0);
  return requiredRoll(player.stats.AG, modifier);
}

interface PlannedJump {
  player: Player;
  from: Square;
  to: Square;
  opponents: Player[];
}

function jumpPenalty({ player, from, to, opponents }: PlannedJump): number {
  if (has(player, SkillType.POGO)) return 0;
  const leaving = markingPlayers(from, opponents);
  const marking = Math.max(
    leaving.length,
    markingPlayers(to, opponents).length
  );
  const tail = leaving.some((p) => has(p, SkillType.PREHENSILE_TAIL));
  const penalty = marking + (tail ? 1 : 0);
  return has(player, SkillType.LEAP) && penalty > 1 ? penalty - 1 : penalty;
}

export function jumpTarget(jump: PlannedJump): number {
  const { player } = jump;
  const legs = has(player, SkillType.VERY_LONG_LEGS) ? 1 : 0;
  return requiredRoll(
    player.stats.AG,
    legs - jumpPenalty(jump)
  );
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
  const conditions = pickUpModifier(state);
  const handling = has(player, SkillType.BIG_HAND)
    ? Math.max(0, conditions)
    : conditions - markingPlayers(square, opponents).length;
  return requiredRoll(
    player.stats.AG,
    handling +
      souvenirModifier(state, player.id, "pick-up") +
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
  return requiredRoll(
    2,
    modifier + souvenirModifier(state, player.id, "pick-up")
  );
}

export function rushRollModifier(state: GameState, player: Player): number {
  return (
    rushModifier(state, player) - (has(player, SkillType.DRUNKARD) ? 1 : 0)
  );
}

export function throwConditions(
  state: GameState,
  thrower: Player,
  type: PassRange["type"]
): number {
  return (
    passModifier(state, type) + souvenirModifier(state, thrower.id, "pass")
  );
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
    catchModifier(state) +
    souvenirModifier(state, player.id, "catch") -
    disturbing(player, opponents) +
    (has(player, SkillType.EXTRA_ARMS) ? 1 : 0) +
    (origin === "pass" && has(player, SkillType.DIVING_CATCH) ? 1 : 0);
  return requiredRoll(player.stats.AG, modifier);
}

export function passTarget(
  player: Player,
  opponents: Player[],
  conditions: number,
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
      conditions +
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
  type: "dodge" | "jump" | "rush" | "barricade" | "pickup" | "secureBall";
  target: number;
  square: Square;
}
export const ROUTE_ROLL_NAMES: Record<RouteRoll["type"], string> = {
  dodge: "Dodge",
  jump: "Jump",
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
  state: GameState
): number {
  return requiredRoll(
    interceptor.stats.AG,
    interceptModifiers(
      interceptor,
      corridorModifier,
      passingTeam,
      state.weather
    ).total +
      lostBallHandling(state) +
      souvenirModifier(state, interceptor.id, "intercept")
  );
}

export const interceptNeed = (interceptor: Player, modifier: number): number =>
  requiredRoll(interceptor.stats.AG, modifier);

const marks = (player: Player, opponents: Player[]) =>
  player.gridPosition
    ? markingPlayers(player.gridPosition, opponents).length
    : 0;

export function bombThrowTarget(
  thrower: Player,
  opponents: Player[],
  modifier: number
): number {
  return requiredRoll(thrower.stats.PA, modifier - marks(thrower, opponents));
}

function bombInterceptTarget(
  interceptor: Player,
  corridorModifier: number,
  throwingTeam: Player[]
): number {
  return requiredRoll(
    interceptor.stats.AG,
    corridorModifier - marks(interceptor, throwingTeam)
  );
}

interface InterceptLine {
  line: string;
  accurate: number;
  inaccurate: number;
}

export function interceptPreviewLine(
  interceptor: Player,
  passingTeam: Player[],
  state: GameState
): InterceptLine {
  return interceptLine(interceptor, (corridor) =>
    interceptTarget(interceptor, corridor, passingTeam, state)
  );
}

export function bombInterceptPreviewLine(
  interceptor: Player,
  throwingTeam: Player[]
): InterceptLine {
  return interceptLine(interceptor, (corridor) =>
    bombInterceptTarget(interceptor, corridor, throwingTeam)
  );
}

function interceptLine(
  interceptor: Player,
  target: (corridorModifier: number) => number
): InterceptLine {
  const accurate = target(-3);
  const inaccurate = target(-2);
  const name = `Intercept #${String(interceptor.number)}`;
  const line =
    accurate === inaccurate
      ? rollLabel(name, accurate)
      : `${rollLabel(name, accurate)}, ${rollLabel("if inaccurate", inaccurate).replace(": ", " ")}`;
  return { line, accurate, inaccurate };
}
