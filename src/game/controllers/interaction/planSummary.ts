import { GameEventNames, type ActionType } from "@/types/events";
import { type Player, PlayerStatus, hasTackleZone } from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import { withDriveModifiers } from "../../kickoff/driveEffects";
import { activationGates } from "../../skills";
import { moveAllowance, standUpCost } from "../../skills/movement";
import { standUpTarget } from "../../skills/rules/TimmberRule";
import { routeSquares } from "../../rules/jump";
import { activeRules } from "../../variants/activeMatch";
import { requiredRoll } from "../../rules/rollTargets";
import { weatherEffects } from "../../rules/weather";
import { ballInTheAir } from "../../rules/ballInTheAir";
import { PassController } from "../PassController";
import {
  ROUTE_ROLL_NAMES,
  blockPreviewLines,
  catchTarget,
  foulPreview,
  bombThrowTarget,
  passTarget,
  rushRollModifier,
  throwConditions,
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
import { movementAfterRoute, syncMovementHalf } from "./movement";
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
  throw_: { passer: Player; receiver: Player | null; square: Square; handoff: boolean; bomb: boolean }
) {
  const { passer, receiver, square, handoff, bomb } = throw_;
  const state = c.gameService.getState();
  const opponents = c.gameService.getOpponents(passer.teamId);
  const from = passer.gridPosition ?? square;
  const range = c.passController.measureRange(from, square);
  const catcherOpponents = receiver
    ? c.gameService.getOpponents(receiver.teamId).map((p) => (p.id === passer.id ? passer : p))
    : [];
  const catchNeed = receiver
    ? catchTarget(withDriveModifiers(receiver, state), catcherOpponents, state, handoff ? "handoff" : "pass")
    : null;
  return {
    range,
    pass: bomb
      ? bombThrowTarget(withDriveModifiers(passer, state), opponents, range.modifier + weatherEffects(state.weather).passingAbility)
      : passTarget(withDriveModifiers(passer, state), opponents, throwConditions(state, passer, range.type), range),
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

function standStage(c: GameplayInteractionController, mover: Player): PlanStage | null {
  const rises = c.waypoints.length > 0 || currentFinish(c) !== null;
  if (mover.status !== PlayerStatus.PRONE || !rises) return null;
  const target = standUpTarget({
    player: mover,
    teammates: c.gameService.getTeammates(mover.id),
    opponents: c.gameService.getOpponents(mover.teamId),
  });
  return {
    label: "Stand up",
    rolls: target === null ? [] : [{ kind: "standUp", name: "Stand up", target }],
    notes: target === null ? [`Uses ${String(standUpCost(mover))} movement.`] : [],
  };
}

function routeStage(c: GameplayInteractionController, player: Player): PlanStage | null {
  const squares = routeSquares(c.waypoints);
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

function catcherAt(c: GameplayInteractionController, actor: Player, finish: PlanFinish): Player | null {
  const target = c.getPlayerAt(finish.x, finish.y);
  if (!target || target.id === actor.id) return null;
  if (finish.kind === "bomb") return hasTackleZone(target) ? target : null;
  return target.teamId === actor.teamId ? target : null;
}

function throwStages(c: GameplayInteractionController, actor: Player, finish: PlanFinish): PlanStage[] {
  const receiver = catcherAt(c, actor, finish);
  const handoff = finish.kind === "handoff";
  const needs = throwNeeds(c, { passer: actor, receiver, square: finish, handoff, bomb: finish.kind === "bomb" });
  const intercepts = handoff || !actor.gridPosition
    ? []
    : interceptions({ c, actor, from: actor.gridPosition, square: finish, opponents: c.gameService.getOpponents(actor.teamId), bomb: finish.kind === "bomb" }).lines;
  const stages: PlanStage[] = handoff
    ? []
    : [{ label: "Throw", rolls: [{ kind: "pass", name: needs.range.type, target: needs.pass }], notes: intercepts }];
  if (receiver && needs.catch !== null) {
    stages.push({
      label: `${handoff ? "Hand-off to" : "Caught by"} #${String(receiver.number)} ${receiver.playerName}`,
      rolls: [{ kind: "catch", name: "Catch", target: needs.catch }],
      notes: finish.kind === "bomb" ? ["A catch means they throw the bomb again."] : [],
    });
  }
  return stages;
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
      ? [{ kind: "rush", name: "Rush", target: requiredRoll(activeRules().rushTarget, rushRollModifier(state, actor)) }]
      : [],
    notes: blockPreviewLines(analysis, actor, target, "attacker"),
  };
}

function foulStage(c: GameplayInteractionController, actor: Player, target: Player): PlanStage {
  const foul = foulPreview(actor, target, boardWith(c, actor), c.gameService.getState());
  return {
    label: `Foul #${String(target.number)} ${target.playerName}`,
    rolls: [{
      kind: "armour",
      name: foul.analysis.offensiveAssists.length > 0 ? "Armour, all assists" : "Armour",
      target: foul.targetNumber,
    }],
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

function endsWithBall(c: GameplayInteractionController): boolean {
  const state = c.gameService.getState();
  const ball = state.ballPosition;
  const from = selectedPlayer(c)?.gridPosition;
  if (!ball || !from || ballInTheAir(state)) return false;
  if (from.x === ball.x && from.y === ball.y) return true;
  if (c.getPlayerAt(ball.x, ball.y)) return false;
  return c.waypoints.some((square) => square.x === ball.x && square.y === ball.y);
}

function passRefusal(c: GameplayInteractionController, actor: Player, finish: PlanFinish): string | null {
  const from = actor.gridPosition;
  if (finish.kind !== "pass" || !from) return null;
  const outOfRange = PassController.rangeValue(from, finish) === null;
  if (outOfRange && !hasSkill(actor.skills, SkillType.HAIL_MARY_PASS)) {
    return "The target is out of range from the end of the route.";
  }
  const { type } = c.passController.measureRange(from, finish, outOfRange);
  const weather = c.gameService.getState().weather;
  return weatherEffects(weather).passTypes.includes(type) ? null : `${weather} rules out a ${type}.`;
}

function blockedReason(c: GameplayInteractionController, actor: Player, finish: PlanFinish | null): string | null {
  if (!finish) return null;
  if (needsContact(finish.kind) && !adjacentTo(actor.gridPosition, finish)) {
    return "The route has to end next to the target.";
  }
  if (finish.kind === "block" && movementAfterRoute(c, actor) + 1 > moveAllowance(actor)) {
    return "No movement left to make the block. Shorten the route.";
  }
  if ((finish.kind === "pass" || finish.kind === "handoff") && !endsWithBall(c)) {
    return "They need the ball first. Route them over it.";
  }
  return passRefusal(c, actor, finish);
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
  const stages = [gateStage(c, mover), standStage(c, mover), routeStage(c, player), ...(finish ? finishStages(c, actor, finish) : [])]
    .filter((stage): stage is PlanStage => stage !== null);
  const action = c.undeclared?.action ?? c.currentActionMode ?? "move";
  return {
    title: TITLES[action] ?? "Plan",
    squares: routeSquares(c.waypoints),
    stages,
    rerolls: [
      ...rerollSources(c, mover, stages.flatMap((stage) => stage.rolls.map((roll) => roll.kind))),
      ...receiverCatchReroll(c, actor, finish),
    ],
    blocked: blockedReason(c, actor, finish),
  };
}

export function publishPlan(c: GameplayInteractionController): void {
  syncMovementHalf(c);
  c.eventBus.emit(GameEventNames.UI_ActionPlan, buildPlan(c));
}
