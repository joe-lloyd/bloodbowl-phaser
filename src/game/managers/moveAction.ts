import { souvenirModifier } from "../inducements/souvenirModifiers";
import { type Player, PlayerStatus } from "@/types/Player";
import { GameEventNames } from "../../types/events";
import { PickupOperation } from "../operations/PickupOperation";
import { BounceOperation } from "../operations/BounceOperation";
import { type IGameService } from "@/services/interfaces/IGameService";
import { type FlowContext } from "../core/GameFlowManager";
import { steadyFootingSaves } from "../rules/steadyFooting";
import { isInEndZone } from "../elements/GridUtils";
import { GameConfig } from "../../config/GameConfig";
import {
  withRerollOffer,
  foldTrigger,
  gatherParticipants,
  adjacentStanding,
  type DodgeDeclaredContext,
  type DodgeResolvedContext,
} from "../skills";
import { moveAllowance, standUpCost } from "../skills/movement";
import { withDriveModifiers } from "../kickoff/driveEffects";
import {
  bananaSkinTeam,
  offerMeasure,
  trapdoorOpens,
} from "../inducements/matchInducements";
import { DesperateMeasure } from "../inducements/desperateMeasures";
import { isSecuringBall } from "../rules/secureBall";
import {
  awaitPresentation,
  nextPresentationId,
} from "../presentation/presentationGate";
import {
  type MovementDeps,
  type Square,
  diveIntoVacated,
  dropThroughTrapdoor,
  fallOver,
  findPlayer,
  heldInSquare,
  isBallAt,
  movementUsed,
  rollRush,
  rollToStand,
  teamsOf,
} from "./movementShared";

const SCORE_RUN_WAIT_MS = 3500;

type MoveEnd =
  | "walked"
  | "failed"
  | "heldFast"
  | "securedBall"
  | "fellThrough"
  | "slipped";

type PreparedMove =
  | {
      ok: true;
      player: Player;

      maView: Player;

      opponents: Player[];
      preUsed: number;
    }
  | { ok: false; reason: string };

interface MoveRun {
  deps: MovementDeps;
  player: Player;
  maView: Player;
  context: FlowContext | undefined;
  gameService: IGameService | undefined;
  opponents: Player[];
  preUsed: number;
  stepsTaken: number;
  currentPos: Square;
  completedPath: Square[];
  holdingBall: boolean;

  ballFrom: Square | null;
  ballJoinStep: number;

  shownSteps: number;
  shownFrom: Square;
}

export async function movePlayer(
  deps: MovementDeps,
  playerId: string,
  path: Square[],
  context?: FlowContext
): Promise<void> {
  const prepared = prepareMove(deps, playerId, path);
  if (!prepared.ok) return Promise.reject(prepared.reason);
  const { player, maView, preUsed } = prepared;
  const { eventBus, diceController } = deps;

  let standingCost = 0;
  if (player.status === PlayerStatus.PRONE) {
    standingCost = standUpCost(maView);
    if (!(await rollToStand(deps, maView))) {
      deps.state.turn.movementUsed.set(playerId, preUsed + standingCost);
      deps.callbacks.onActivationFinished(playerId);
      return;
    }
    standUpToMove(deps, player, standingCost);
  }

  const run = beginRoute(deps, prepared, context, standingCost);
  const { gameService } = run;
  let end: MoveEnd = "walked";
  for (const step of path) {
    if (run.preUsed + run.stepsTaken + 1 > maView.stats.MA) {
      showWalk(run);
      const check = await rollRush(deps, player, gameService);
      if (
        !check.success &&
        !(await steadyFootingSaves(
          player,
          diceController,
          eventBus,
          gameService
        ))
      ) {
        end = fallOnRush(run, step);
        break;
      }
    }

    if (deps.dodgeController.isDodgeRequired(run.currentPos, run.opponents)) {
      showWalk(run);
      const dodgeCtx = dodgeDeclaredContext(run, step);
      await foldTrigger(
        "onDodgeDeclared",
        gatherParticipants(player, undefined, [
          ...adjacentStanding(run.currentPos, run.opponents),
          ...adjacentStanding(step, run.opponents),
        ]),
        dodgeCtx
      );
      dodgeCtx.triggers.forEach((t) => {
        eventBus.emit(GameEventNames.SkillTriggered, t);
      });

      if (dodgeCtx.escapeCancelled) {
        end = "heldFast";
        break;
      }

      const rollDodge = () =>
        deps.dodgeController.attemptDodge(
          { player,to: step,opponents: run.opponents,modifiersOverride: dodgeCtx.modifiers }        );

      const dodgeResult = gameService
        ? await withRerollOffer(
            { gameService, eventBus },
            player,
            "dodge",
            rollDodge,
            {
              skillAllowed: dodgeCtx.skillRerollAllowed,
            }
          )
        : rollDodge();

      const resolvedCtx = dodgeResolvedContext(run, step, dodgeResult);
      await foldTrigger("onDodgeResolved", vacatedMarkers(run), resolvedCtx);

      if (resolvedCtx.success) {
        await foldTrigger("onDodgeSucceeded", vacatedMarkers(run), resolvedCtx);
      }
      resolvedCtx.triggers.forEach((t) => {
        eventBus.emit(GameEventNames.SkillTriggered, t);
      });

      diveIntoVacated(eventBus, {
        diverId: resolvedCtx.proneInVacated,
        opponents: run.opponents,
        mover: player,
        vacated: run.currentPos,
        landing: step,
      });

      if (
        !resolvedCtx.success &&
        !(await steadyFootingSaves(
          player,
          diceController,
          eventBus,
          gameService
        ))
      ) {
        end = fallOnDodge(run, step);
        break;
      }

      shadowFollow(run, resolvedCtx);
    }

    enterSquare(run, step);

    if (trapdoorOpens(deps.state, diceController, player, step)) {
      end = "fellThrough";
      break;
    }

    const banana = bananaSkinOffer(run, step);
    if (
      banana &&
      (await offerMeasure(
        banana,
        banana.teamId,
        player.id,
        DesperateMeasure.DISCARDED_BANANA_SKIN,
        `${player.playerName} steps into your Tackle Zone — throw down the Discarded Banana Skin?`
      ))
    ) {
      end = slipOnBananaSkin(run, step);
      break;
    }

    let picked: "failed" | "secured" | undefined;
    const pickupContext = pickupDue(run);
    if (pickupContext) {
      const pickupOp = new PickupOperation(playerId);
      await pickupOp.execute(pickupContext);
      picked = takeBall(run, pickupOp.success);
    }
    if (picked === "failed") {
      end = "failed";
      break;
    }

    const presentationId = carryBall(run);

    if (presentationId) return scoreRun(run, presentationId);
    if (picked === "secured") {
      end = "securedBall";
      break;
    }
  }

  finishMove(run, end);
}

function prepareMove(
  deps: MovementDeps,
  playerId: string,
  path: Square[]
): PreparedMove {
  const { state, eventBus } = deps;
  const player = findPlayer(deps, playerId);
  if (!player) return { ok: false, reason: "Player not found!" };

  const maView = withDriveModifiers(player, state);

  if (heldInSquare(eventBus, player))
    return { ok: false, reason: "Cannot move" };

  const { own, opp } = teamsOf(deps, player);
  const opponents = opp.players.filter(
    (p) => p.status === PlayerStatus.ACTIVE && p.gridPosition
  );

  const result = deps.movementValidator.validatePath({ player: maView, path: [{ x: player.gridPosition!.x, y: player.gridPosition!.y }, ...path], opponents: opp.players.filter((p) => p.gridPosition), teammates: own.players.filter((p) => p.gridPosition && p.id !== player.id), movementUsed: movementUsed(state, playerId) });
  if (!result.valid) {
    console.warn(`Invalid move attempted for player ${playerId}`);
    return { ok: false, reason: "Invalid Move" };
  }
  return {
    ok: true,
    player,
    maView,
    opponents,
    preUsed: movementUsed(state, playerId),
  };
}

function standUpToMove(deps: MovementDeps, player: Player, cost: number): void {
  player.status = PlayerStatus.ACTIVE;
  deps.eventBus.emit(GameEventNames.PlayerStoodUp, {
    playerId: player.id,
    cost,
  });
  deps.eventBus.emit(GameEventNames.PlayerStatusChanged, player);
}

function beginRoute(
  deps: MovementDeps,
  prepared: Extract<PreparedMove, { ok: true }>,
  context: FlowContext | undefined,
  standingCost: number
): MoveRun {
  const { player } = prepared;
  const currentPos = player.gridPosition!;
  const holdingBall = isBallAt(deps.state, currentPos);
  return {
    deps,
    player,
    maView: prepared.maView,
    context,
    gameService: context?.gameService,
    opponents: prepared.opponents,
    preUsed: prepared.preUsed,
    stepsTaken: standingCost,
    currentPos,
    completedPath: [],
    holdingBall,
    ballFrom: holdingBall ? { ...currentPos } : null,
    ballJoinStep: 0,
    shownSteps: 0,
    shownFrom: { ...currentPos },
  };
}

function walk(run: MoveRun, presentationId?: string) {
  const steps = run.completedPath.slice(run.shownSteps);

  const carried = run.ballFrom !== null && run.ballJoinStep <= run.shownSteps;
  const piece = {
    playerId: run.player.id,
    from: run.shownFrom,
    to: { ...run.currentPos },
    path: steps,
    ...(carried ? { ballFrom: run.shownFrom, ballPath: steps } : {}),
    ballJoinStep: 0,
    ...(presentationId !== undefined ? { presentationId } : {}),
  };
  run.shownSteps = run.completedPath.length;
  run.shownFrom = { ...run.currentPos };
  return piece;
}

function showWalk(run: MoveRun): void {
  if (run.completedPath.length > run.shownSteps)
    run.deps.eventBus.emit(GameEventNames.PlayerMoved, walk(run));
}

function fallInto(
  run: MoveRun,
  step: Square,
  fall: { reason: string; vacatedSquare?: Square }
): void {
  const { deps, player } = run;
  run.currentPos = step;
  player.gridPosition = run.currentPos;
  player.status = PlayerStatus.PRONE;
  fallOver(deps, {
    player,
    square: run.currentPos,
    ballBounces: run.holdingBall || isBallAt(deps.state, run.currentPos),
    context: run.context,
    ...fall,
  });
}

function fallOnRush(run: MoveRun, step: Square): MoveEnd {
  fallInto(run, step, { reason: "Failed Rush" });
  run.stepsTaken++;
  run.completedPath.push(step);
  return "failed";
}

function triggerServices(
  run: MoveRun
): Pick<DodgeDeclaredContext, "decisions" | "flow" | "arbiter"> {
  const decisions = run.gameService?.getDecisionService();
  const arbiter = run.gameService?.getRerollArbiter();
  const flow = run.context?.flowManager;
  return {
    ...(decisions ? { decisions } : {}),
    ...(flow ? { flow } : {}),
    ...(arbiter ? { arbiter } : {}),
  };
}

function dodgeDeclaredContext(
  run: MoveRun,
  step: Square
): DodgeDeclaredContext {
  const { deps } = run;
  const markingPenalty = deps.dodgeController.calculateDodgeModifiers(
    step,
    run.opponents
  );
  return {
    player: run.player,
    from: { ...run.currentPos },
    to: { ...step },
    modifiers:
      markingPenalty +
      souvenirModifier(deps.state, run.player.id, "dodge"),
    markingPenalty,
    skillRerollAllowed: true,
    ...triggerServices(run),
    dice: deps.diceController,
    triggers: [],
  };
}

function dodgeResolvedContext(
  run: MoveRun,
  step: Square,
  dodgeResult: {
    roll: number;
    target: number;
    modifiers: number;
    success: boolean;
  }
): DodgeResolvedContext {
  return {
    player: run.player,
    from: { ...run.currentPos },
    to: { ...step },
    naturalRoll: dodgeResult.roll,
    target: dodgeResult.target,
    modifiers: dodgeResult.modifiers,
    success: dodgeResult.success,
    ...triggerServices(run),
    dice: run.deps.diceController,
    triggers: [],
  };
}

function vacatedMarkers(run: MoveRun): Player[] {
  return gatherParticipants(
    run.player,
    undefined,
    adjacentStanding(run.currentPos, run.opponents)
  );
}

function fallOnDodge(run: MoveRun, step: Square): MoveEnd {
  const vacatedSquare = { ...run.currentPos };
  fallInto(run, step, { vacatedSquare, reason: "Failed Dodge" });
  run.completedPath.push(step);
  return "failed";
}

function shadowFollow(run: MoveRun, resolvedCtx: DodgeResolvedContext): void {
  if (!resolvedCtx.followInto) return;
  const shadower = run.opponents.find((p) => p.id === resolvedCtx.followInto);
  if (!shadower?.gridPosition) return;
  const into = { ...resolvedCtx.from };
  const shadowerFrom = { ...shadower.gridPosition };
  shadower.gridPosition = { ...into };
  run.deps.eventBus.emit(GameEventNames.PlayerMoved, {
    playerId: shadower.id,
    from: shadowerFrom,
    to: { ...into },
    path: [shadowerFrom, { ...into }],
    ballJoinStep: 0,
  });
}

function enterSquare(run: MoveRun, step: Square): void {
  run.stepsTaken++;
  run.currentPos = step;
  run.player.gridPosition = run.currentPos;
  run.completedPath.push(step);
}

function bananaSkinOffer(
  run: MoveRun,
  step: Square
): { gameService: IGameService; teamId: string } | undefined {
  const { gameService } = run;
  if (!gameService) return undefined;
  const teamId = bananaSkinTeam(run.deps.state, step, run.opponents);
  if (!teamId) return undefined;
  showWalk(run);
  return { gameService, teamId };
}

function slipOnBananaSkin(run: MoveRun, step: Square): MoveEnd {
  if (run.holdingBall) {
    run.deps.state.ballPosition = { ...step };
    run.deps.eventBus.emit(GameEventNames.BallPlaced, { ...step });
  }
  return "slipped";
}

function pickupDue(run: MoveRun): FlowContext | undefined {
  const { context } = run;
  if (run.holdingBall || !isBallAt(run.deps.state, run.currentPos)) {
    return undefined;
  }
  if (context) showWalk(run);
  return context;
}

function takeBall(
  run: MoveRun,
  success: boolean
): "failed" | "secured" | undefined {
  const { deps, currentPos } = run;

  run.holdingBall = success;

  if (!run.holdingBall) {
    return "failed";
  }

  deps.state.ballPosition = { x: currentPos.x, y: currentPos.y };
  run.ballFrom = { ...currentPos };
  run.ballJoinStep = run.completedPath.length;

  return isSecuringBall(deps.state, run.player.id) ? "secured" : undefined;
}

function carryBall(run: MoveRun): string | undefined {
  const { deps, player, currentPos } = run;
  if (!run.holdingBall) return undefined;
  deps.state.ballPosition = { x: currentPos.x, y: currentPos.y };
  deps.eventBus.emit(GameEventNames.BallPlaced, {
    x: currentPos.x,
    y: currentPos.y,
  });

  const side = player.teamId === deps.team1.id ? 1 : 2;
  if (!isInEndZone(currentPos, GameConfig.PITCH_WIDTH, side)) return undefined;
  player.gridPosition = currentPos;
  deps.state.turn.movementUsed.set(player.id, run.preUsed + run.stepsTaken);

  const presentationId = nextPresentationId("score-run");
  deps.eventBus.emit(GameEventNames.PlayerMoved, walk(run, presentationId));
  return presentationId;
}

async function scoreRun(run: MoveRun, presentationId: string): Promise<void> {
  const { deps, player, context } = run;
  if (context) {
    await awaitPresentation(
      deps.eventBus,
      context.delay,
      presentationId,
      SCORE_RUN_WAIT_MS + run.completedPath.length * 200
    );
  }
  deps.callbacks.onTouchdown?.(player.teamId, player.id);
}

function finishMove(run: MoveRun, end: MoveEnd): void {
  const { deps, player, currentPos } = run;
  player.gridPosition = currentPos;
  deps.state.turn.movementUsed.set(player.id, run.preUsed + run.stepsTaken);

  showWalk(run);

  if (end === "fellThrough") {
    dropThroughTrapdoor(
      deps,
      player,
      currentPos,
      run.holdingBall,
      run.context?.flowManager
    );
    return;
  }
  if (end === "slipped") {
    player.status = PlayerStatus.PRONE;
    deps.eventBus.emit(GameEventNames.PlayerStatusChanged, player);
    if (isBallAt(deps.state, currentPos)) {
      run.context?.flowManager?.add(new BounceOperation(currentPos), true);
    }
    if (run.holdingBall) {
      deps.callbacks.onTurnover("Slipped on a Banana Skin");
    } else {
      deps.callbacks.onActivationFinished(player.id);
    }
    return;
  }

  if (
    end === "heldFast" ||
    end === "securedBall" ||
    run.preUsed + run.stepsTaken >= moveAllowance(run.maView)
  ) {
    deps.callbacks.onActivationFinished(player.id);
  }
}
