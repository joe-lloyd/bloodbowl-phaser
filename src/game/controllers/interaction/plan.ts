import type { ActionType } from "@/types/events";
import { GameEventNames } from "@/types/events";
import type { GameState } from "@/types/GameState";
import { type Player, PlayerStatus } from "@/types/Player";
import type { BlockReplacement } from "@/types/BlockReplacement";
import { GameConfig } from "../../../config/GameConfig";
import type { GameplayInteractionController } from "../GameplayInteractionController";
import { activeActionFor, isStandingOpponent } from "./players";
import { adjacentSquares, adjacentTo } from "./squares";
import { drawCurrentPath, findLeg } from "./routes";

interface Square {
  x: number;
  y: number;
}

export type FinishKind = "pass" | "handoff" | "bomb" | "block" | "foul";

export interface PlanFinish extends Square {
  kind: FinishKind;
  key: string;
}

export interface PlannedDeclaration {
  action: ActionType;
  blockReplacement: BlockReplacement | null;
  razzleDazzle: boolean;
}

export const PLANNED_MOVE: PlannedDeclaration = {
  action: "move",
  blockReplacement: null,
  razzleDazzle: false,
};

const PLANNED_ACTIONS = new Set<ActionType>(["move", "blitz", "pass", "handoff", "foul"]);

export function plansBeforeDeclaring(action: ActionType, blockReplacement: BlockReplacement | null): boolean {
  return PLANNED_ACTIONS.has(action) && blockReplacement === null;
}

export function plannedActionFor(
  c: GameplayInteractionController,
  state: GameState,
  playerId: string
): ActionType | null | undefined {
  if (c.undeclared && c.selectedPlayerId === playerId) return c.undeclared.action;
  return activeActionFor(state, playerId);
}

export const finishKey = (c: GameplayInteractionController): string =>
  `${String(c.selectedPlayerId)}:${String(c.currentActionMode)}`;

export function currentFinish(c: GameplayInteractionController): PlanFinish | null {
  return c.finish?.key === finishKey(c) ? c.finish : null;
}

function planEnd(c: GameplayInteractionController, player: Player): Square | undefined {
  return c.waypoints.at(-1) ?? player.gridPosition;
}

export function plannedActor(c: GameplayInteractionController, player: Player): Player {
  const end = planEnd(c, player);
  return end ? { ...player, gridPosition: { ...end } } : player;
}

export function boardWith(c: GameplayInteractionController, actor: Player): Player[] {
  return [...c.getSceneTeam1().players, ...c.getSceneTeam2().players].map(
    (p) => (p.id === actor.id ? actor : p)
  );
}

const isDowned = (p: Player) =>
  p.status === PlayerStatus.PRONE || p.status === PlayerStatus.STUNNED;

function blitzTarget(c: GameplayInteractionController, actor: Player, target: Player | null): boolean {
  return (
    c.currentBlockReplacement === null &&
    isStandingOpponent(actor, target) &&
    !c.gameService.hasUsedBlitzBlock(actor.id)
  );
}

interface ClickContext {
  c: GameplayInteractionController;
  actor: Player;
  target: Player | null;
  teammate: boolean;
}

const FINISH_RULES: Partial<Record<ActionType, (click: ClickContext) => FinishKind | null>> = {
  pass: ({ c, teammate }) => (c.currentStepId === "pass" || teammate ? "pass" : null),
  throwBomb: ({ c }) => (c.currentStepId === "bomb" ? "bomb" : null),
  handoff: ({ teammate }) => (teammate ? "handoff" : null),
  blitz: ({ c, actor, target }) => (blitzTarget(c, actor, target) ? "block" : null),
  foul: ({ target, teammate }) => (target && !teammate && isDowned(target) ? "foul" : null),
};

export function finishKindAt(
  c: GameplayInteractionController,
  click: { player: Player | null }
): FinishKind | null {
  const id = c.selectedPlayerId;
  const actor = id ? c.gameService.getPlayerById(id) : undefined;
  const rule = c.currentActionMode ? FINISH_RULES[c.currentActionMode] : undefined;
  if (!actor || !rule || click.player?.id === actor.id) return null;
  return rule({ c, actor, target: click.player, teammate: click.player?.teamId === actor.teamId });
}

const NEEDS_CONTACT = new Set<FinishKind>(["handoff", "block", "foul"]);

function routeScore(result: ReturnType<typeof findLeg>): number {
  return result.rolls.length * 100 + result.path.length;
}

function bestRouteNextTo(c: GameplayInteractionController, player: Player, target: Square) {
  const bounds = { width: GameConfig.PITCH_WIDTH, height: GameConfig.PITCH_HEIGHT };
  const routes = adjacentSquares(target, bounds)
    .filter(({ x, y }) => {
      const occupant = c.getPlayerAt(x, y);
      return !occupant || occupant.id === player.id;
    })
    .map(({ x, y }) => findLeg({ c, player, x, y }))
    .filter((result) => result.valid && result.path.length > 0);
  return routes.reduce<(typeof routes)[number] | null>(
    (best, next) => (best && routeScore(best) <= routeScore(next) ? best : next),
    null
  );
}

export function reachNextTo(c: GameplayInteractionController, target: Square): boolean {
  const player = c.selectedPlayerId ? c.gameService.getPlayerById(c.selectedPlayerId) : undefined;
  if (!player) return false;
  if (adjacentTo(planEnd(c, player), target)) return true;
  const route = bestRouteNextTo(c, player, target);
  if (!route) {
    c.eventBus.emit(GameEventNames.UI_Notification, "No route reaches them this turn.");
    return false;
  }
  c.waypoints.push(...route.path.map(({ x, y }) => ({ x, y })));
  drawCurrentPath(c);
  return true;
}

export function needsContact(kind: FinishKind): boolean {
  return NEEDS_CONTACT.has(kind);
}
