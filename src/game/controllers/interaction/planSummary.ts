import { GameEventNames, type ActionType } from "@/types/events";
import { type Player, PlayerStatus } from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import { withDriveModifiers } from "../../kickoff/driveEffects";
import { activationGates } from "../../skills";
import { moveAllowance, standUpCost } from "../../skills/movement";
import { activeRules } from "../../variants/activeMatch";
import { rushModifier } from "../../inducements/matchInducements";
import { requiredRoll } from "../../rules/rollTargets";
import {
  ROUTE_ROLL_NAMES,
  blockPreviewLines,
  catchTarget,
  foulPreview,
  passTarget,
} from "../../rules/rollPreview";
import type { ActionPlanSummary, PlanStage } from "../../rules/actionPlan";
import { BlockValidator } from "../../validators/BlockValidator";
import type { GameplayInteractionController } from "../GameplayInteractionController";
import { GATE_FAILURE_TEXT, gateNeed } from "./Confirmations";
import {
  type PlanFinish,
  boardWith,
  currentFinish,
  needsContact,
  plannedActor,
} from "./plan";
import { adjacentTo } from "./squares";
import { interceptions } from "./previews";
import { rerollSources, routeRolls } from "./routes";

interface Square {
  x: number;
  y: number;
}

const TITLES: Partial<Record<ActionType, string>> = {
  move: "Move",
  blitz: "Blitz",
  pass: "Pass",
  handoff: "Hand-off",
  foul: "Foul",
  throwBomb: "Bomb",
};

export function throwNeeds(
  c: GameplayInteractionController,
  throw_: { passer: Player; receiver: Player | null; square: Square; handoff: boolean }
) {
  const { passer, receiver, square, handoff } = throw_;
  const state = c.gameService.getState();
  const opponents = c.gameService.getOpponents(passer.teamId);
  const from = passer.gridPosition ?? square;
  const range = c.passController.measureRange(from, square);
  const catchNeed = receiver
    ? catchTarget(withDriveModifiers(receiver, state), opponents, state.weather, handoff ? "handoff" : "pass")
    : null;
  return {
    range,
    pass: passTarget(withDriveModifiers(passer, state), opponents, state.weather, range),
    catch: catchNeed,
  };
}

function gateStage(c: GameplayInteractionController, player: Player): PlanStage | null {
  if (!c.undeclared) return null;
  const gates = activationGates(player, c.undeclared.action, c.gameService.getTeammates(player.id));
  if (gates.length === 0) return null;
  return {
    label: "Before acting",
    rolls: gates.map((gate) => ({ kind: "gate", name: gate.skill, target: gateNeed(gate) })),
    notes: gates.map((gate) => GATE_FAILURE_TEXT[gate.onFail.kind]),
  };
}

function routeStage(c: GameplayInteractionController, player: Player): PlanStage | null {
  const squares = c.waypoints.length;
  if (squares === 0) return null;
  return {
    label: `Move ${String(squares)} ${squares === 1 ? "square" : "squares"}`,
    rolls: routeRolls(c, player, c.waypoints).map((roll) => ({
      kind: roll.type,
      name: ROUTE_ROLL_NAMES[roll.type],
      target: roll.target,
    })),
    notes: [],
  };
}

function throwStages(c: GameplayInteractionController, actor: Player, finish: PlanFinish): PlanStage[] {
  const target = c.getPlayerAt(finish.x, finish.y);
  const receiver = target?.teamId === actor.teamId ? target : null;
  const handoff = finish.kind === "handoff";
  const needs = throwNeeds(c, { passer: actor, receiver, square: finish, handoff });
  const intercepts = handoff || !actor.gridPosition
    ? []
    : interceptions({ c, actor, from: actor.gridPosition, square: finish, opponents: c.gameService.getOpponents(actor.teamId) }).lines;
  const stages: PlanStage[] = handoff
    ? []
    : [{ label: "Throw", rolls: [{ kind: "pass", name: needs.range.type, target: needs.pass }], notes: intercepts }];
  if (receiver && needs.catch !== null) {
    stages.push({
      label: `${handoff ? "Hand-off to" : "Caught by"} #${String(receiver.number)} ${receiver.playerName}`,
      rolls: [{ kind: "catch", name: "Catch", target: needs.catch }],
      notes: [],
    });
  }
  return stages;
}

function movementAfterRoute(c: GameplayInteractionController, player: Player): number {
  const prone = player.status === PlayerStatus.PRONE ? standUpCost(player) : 0;
  return c.gameService.getMovementUsed(player.id) + prone + c.waypoints.length;
}

function blockStage(c: GameplayInteractionController, actor: Player, target: Player): PlanStage {
  const state = c.gameService.getState();
  const analysis = new BlockValidator().analyzeBlock({
    attacker: actor,
    defender: target,
    allPlayers: boardWith(c, actor),
    activeTeamId: state.activeTeamId,
  });
  const needsRush = movementAfterRoute(c, actor) + 1 > actor.stats.MA;
  return {
    label: `Block #${String(target.number)} ${target.playerName}`,
    rolls: needsRush
      ? [{ kind: "rush", name: "Rush", target: requiredRoll(activeRules().rushTarget, rushModifier(state, actor)) }]
      : [],
    notes: blockPreviewLines(analysis, actor, target, "attacker"),
  };
}

function foulStage(c: GameplayInteractionController, actor: Player, target: Player): PlanStage {
  const foul = foulPreview(actor, target, boardWith(c, actor), c.gameService.getState());
  return {
    label: `Foul #${String(target.number)} ${target.playerName}`,
    rolls: [{ kind: "armour", name: "Armour", target: foul.targetNumber }],
    notes: foul.lines.slice(1),
  };
}

function finishStages(c: GameplayInteractionController, actor: Player, finish: PlanFinish): PlanStage[] {
  const target = c.getPlayerAt(finish.x, finish.y);
  switch (finish.kind) {
    case "pass":
    case "handoff":
    case "bomb":
      return throwStages(c, actor, finish);
    case "block":
      return target ? [blockStage(c, actor, target)] : [];
    case "foul":
      return target ? [foulStage(c, actor, target)] : [];
    default: {
      const exhaustive: never = finish.kind;
      return exhaustive;
    }
  }
}

function blockedReason(c: GameplayInteractionController, actor: Player, finish: PlanFinish | null): string | null {
  if (!finish) return null;
  if (needsContact(finish.kind) && !adjacentTo(actor.gridPosition, finish)) {
    return "The route has to end next to the target.";
  }
  if (finish.kind === "block" && movementAfterRoute(c, actor) + 1 > moveAllowance(actor)) {
    return "No movement left to make the block. Shorten the route.";
  }
  return null;
}

function selectedPlayer(c: GameplayInteractionController): Player | null {
  const id = c.selectedPlayerId;
  return (id ? c.gameService.getPlayerById(id) : undefined) ?? null;
}

function plannedMover(c: GameplayInteractionController): Player | null {
  const player = selectedPlayer(c);
  return player ? withDriveModifiers(player, c.gameService.getState()) : null;
}

function receiverCatchReroll(c: GameplayInteractionController, actor: Player, finish: PlanFinish | null): string[] {
  if (finish?.kind !== "pass" && finish?.kind !== "handoff") return [];
  const receiver = c.getPlayerAt(finish.x, finish.y);
  const ready =
    receiver?.teamId === actor.teamId &&
    hasSkill(receiver.skills, SkillType.CATCH) &&
    c.gameService.getRerollArbiter().skillRerollAvailable(receiver, SkillType.CATCH);
  return ready ? [`Catch (#${String(receiver.number)})`] : [];
}

export function planProblem(c: GameplayInteractionController): string | null {
  const mover = plannedMover(c);
  return mover ? blockedReason(c, plannedActor(c, mover), currentFinish(c)) : null;
}

function buildPlan(c: GameplayInteractionController): ActionPlanSummary | null {
  const player = selectedPlayer(c);
  if (!player) return null;
  const finish = currentFinish(c);
  if (!c.undeclared && c.waypoints.length === 0 && !finish) return null;
  const mover = withDriveModifiers(player, c.gameService.getState());
  const actor = plannedActor(c, mover);
  const stages = [gateStage(c, mover), routeStage(c, player), ...(finish ? finishStages(c, actor, finish) : [])]
    .filter((stage): stage is PlanStage => stage !== null);
  const action = c.undeclared?.action ?? c.currentActionMode ?? "move";
  return {
    title: TITLES[action] ?? "Plan",
    squares: c.waypoints.length,
    stages,
    rerolls: [
      ...rerollSources(c, mover, stages.flatMap((stage) => stage.rolls.map((roll) => roll.kind))),
      ...receiverCatchReroll(c, actor, finish),
    ],
    blocked: blockedReason(c, actor, finish),
  };
}

export function publishPlan(c: GameplayInteractionController): void {
  c.eventBus.emit(GameEventNames.UI_ActionPlan, buildPlan(c));
}
