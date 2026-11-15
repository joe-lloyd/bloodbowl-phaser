/**
 * The Move action: walk a player along a validated route one square at a
 * time. Each step rolls what it needs in rulebook order (Rush, then Dodge),
 * then resolves what entering the square does (Trapdoor, Banana Skin,
 * Pick-up, Touchdown). The first step that ends the route stops the walk.
 *
 * Every await sits in movePlayer itself, where the old MovementManager
 * method had it, and the work between awaits is in synchronous helpers.
 * A fall starts its Bounce on the flow queue at once, so an extra await
 * between a fall and finishMove would let the Bounce run before the move
 * is finished. Online play runs in lockstep, so the order must not change.
 */

import { Player, PlayerStatus } from "@/types/Player";
import { GameEventNames } from "../../types/events";
import { PickupOperation } from "../operations/PickupOperation";
import { BounceOperation } from "../operations/BounceOperation";
import { IGameService } from "@/services/interfaces/IGameService";
import { FlowContext } from "../core/GameFlowManager";
import { steadyFootingSaves } from "../rules/steadyFooting";
import { isInEndZone } from "../elements/GridUtils";
import { GameConfig } from "../../config/GameConfig";
import {
  withRerollOffer,
  foldTrigger,
  gatherParticipants,
  adjacentStanding,
  DodgeDeclaredContext,
  DodgeResolvedContext,
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
  MovementDeps,
  Square,
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

/** Longest wait on the dice and the walk before a run scores, plus 200 ms a square. */
const SCORE_RUN_WAIT_MS = 3500;

/**
 * How a route ended. "failed" is a failed Rush, Dodge or Pick-up; it and
 * "walked" end the activation only once the movement is spent.
 */
type MoveEnd =
  | "walked"
  | "failed"
  | "heldFast"
  | "securedBall"
  | "fellThrough"
  | "slipped";

/** A validated Move, before any dice. */
type PreparedMove =
  | {
      ok: true;
      player: Player;
      /** The drive-modified MA view (Dodgy Snack -1 MA). */
      maView: Player;
      /** Standing opponents on the pitch: they mark squares and react to dodges. */
      opponents: Player[];
      preUsed: number;
    }
  | { ok: false; reason: string };

/** The state of one Move action while its route resolves. */
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
  /**
   * Where the ball visual starts travelling with the mover and after how
   * many walked squares it joins (0 = carried from the start)
   */
  ballFrom: Square | null;
  ballJoinStep: number;
  /** How much of the walk the board has been shown, and where it ended. */
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
      // Failed the stand-up roll: still Prone, movement spent, activation over
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
    // A step that needs both a Rush and a Dodge rolls the Rush first
    // (rulebook p.62), so a fall on the Rush never reaches the Dodge.
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
      // A failed Rush that Steady Footing saved keeps the player Standing:
      // they move into the square and may keep going, no fall and no Turnover.
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
      dodgeCtx.triggers.forEach((t) =>
        eventBus.emit(GameEventNames.SkillTriggered, t)
      );
      // Tentacles held the dodger: no Agility Test, no move, and the
      // activation ends — not a turnover
      if (dodgeCtx.escapeCancelled) {
        end = "heldFast";
        break;
      }

      const rollDodge = () =>
        deps.dodgeController.attemptDodge(
          player,
          step,
          run.opponents,
          dodgeCtx.modifiers
        );
      // A failed dodge may be rerolled (Dodge skill / team reroll); the
      // move pauses on the coach's decision
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

      // Trigger point: dodge resolved — markers of the vacated square
      // react after any re-rolls (Diving Tackle)
      const resolvedCtx = dodgeResolvedContext(run, step, dodgeResult);
      await foldTrigger("onDodgeResolved", vacatedMarkers(run), resolvedCtx);
      // Trigger point: the dodge stood, so markers of the vacated square
      // may Shadow into it — only once Diving Tackle has had its say
      // (FAQ May 2026), so a dive never shares the square with a shadower
      if (resolvedCtx.success) {
        await foldTrigger("onDodgeSucceeded", vacatedMarkers(run), resolvedCtx);
      }
      resolvedCtx.triggers.forEach((t) =>
        eventBus.emit(GameEventNames.SkillTriggered, t)
      );

      // Diving Tackle: the dodger has left the square, whatever its fate: it
      // stands or falls in the one it dodged into, so it never shares the
      // diver's while a Steady Footing re-roll is open.
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
      // A failed dodge that Steady Footing saved keeps the player Standing:
      // fall through as if it had succeeded — they move on and continue their
      // activation, no Armour Roll and no Turnover. It is still no
      // successful dodge, so nobody Shadowed it.
      shadowFollow(run, resolvedCtx);
    }

    enterSquare(run, step);

    // Treacherous Trapdoor (L12): entering the square may drop the player
    // through it, before any pick-up on that square.
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
    // Nothing follows the touchdown, so this tail call adds no await.
    if (presentationId) return scoreRun(run, presentationId);
    if (picked === "secured") {
      end = "securedBall";
      break;
    }
  }

  finishMove(run, end);
}

/** Finds the mover and checks the route before any dice are rolled. */
function prepareMove(
  deps: MovementDeps,
  playerId: string,
  path: Square[]
): PreparedMove {
  const { state, eventBus } = deps;
  const player = findPlayer(deps, playerId);
  if (!player) return { ok: false, reason: "Player not found!" };
  // Validate against the drive-modified MA view (Dodgy Snack -1 MA);
  // state mutations below still land on the real player.
  const maView = withDriveModifiers(player, state);

  if (heldInSquare(eventBus, player))
    return { ok: false, reason: "Cannot move" };

  const { own, opp } = teamsOf(deps, player);
  const opponents = opp.players.filter(
    (p) => p.status === PlayerStatus.ACTIVE && p.gridPosition
  );

  // Occupancy needs every player on the pitch, Prone ones included;
  // tackle zones inside validatePath still count Standing opponents only.
  const result = deps.movementValidator.validatePath(
    maView,
    [{ x: player.gridPosition!.x, y: player.gridPosition!.y }, ...path],
    opp.players.filter((p) => p.gridPosition),
    own.players.filter((p) => p.gridPosition && p.id !== player.id),
    movementUsed(state, playerId)
  );
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

/** A Prone mover who passed the stand-up roll stands before moving. */
function standUpToMove(deps: MovementDeps, player: Player, cost: number): void {
  player.status = PlayerStatus.ACTIVE;
  deps.eventBus.emit(GameEventNames.PlayerStoodUp, {
    playerId: player.id,
    cost,
  });
  deps.eventBus.emit(GameEventNames.PlayerStatusChanged, player);
}

/** The route's state once the mover is Standing, before the first step. */
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

/**
 * The board is told about the walk in pieces: everything walked so far
 * goes out before any roll that may stop for a choice, so the board
 * never draws the mover short of their square while a coach decides.
 */
function walk(run: MoveRun, presentationId?: string) {
  const steps = run.completedPath.slice(run.shownSteps);
  // A pick-up follows a showWalk, so the ball joins at a piece's start
  const carried = run.ballFrom !== null && run.ballJoinStep <= run.shownSteps;
  const piece = {
    playerId: run.player.id,
    from: run.shownFrom,
    to: { ...run.currentPos },
    path: steps,
    ballFrom: carried ? run.shownFrom : undefined,
    ballPath: carried ? steps : undefined,
    ballJoinStep: 0,
    presentationId,
  };
  run.shownSteps = run.completedPath.length;
  run.shownFrom = { ...run.currentPos };
  return piece;
}

function showWalk(run: MoveRun): void {
  if (run.completedPath.length > run.shownSteps)
    run.deps.eventBus.emit(GameEventNames.PlayerMoved, walk(run));
}

/** A failed Rush: the mover Falls Over in the square they rushed into. */
function fallOnRush(run: MoveRun, step: Square): MoveEnd {
  const { deps, player } = run;
  run.currentPos = step;
  player.gridPosition = run.currentPos;
  player.status = PlayerStatus.PRONE;
  fallOver(deps, {
    player,
    square: run.currentPos,
    ballBounces: run.holdingBall || isBallAt(deps.state, run.currentPos),
    context: run.context,
    reason: "Failed Rush",
  });
  run.stepsTaken++;
  run.completedPath.push(step);
  return "failed";
}

/**
 * Trigger point: dodge declared — rules from the dodger AND the opponents
 * marking the vacated or destination square may adjust the roll
 * (Prehensile Tail, Titchy) or deny the skill reroll (Tackle)
 */
function dodgeDeclaredContext(
  run: MoveRun,
  step: Square
): DodgeDeclaredContext {
  const { deps, context, gameService } = run;
  const markingPenalty = deps.dodgeController.calculateDodgeModifiers(
    step,
    run.opponents
  );
  return {
    player: run.player,
    from: { ...run.currentPos },
    to: { ...step },
    modifiers: markingPenalty,
    markingPenalty,
    skillRerollAllowed: true,
    decisions: gameService?.getDecisionService(),
    flow: context?.flowManager,
    arbiter: gameService?.getRerollArbiter(),
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
  const { context, gameService } = run;
  return {
    player: run.player,
    from: { ...run.currentPos },
    to: { ...step },
    naturalRoll: dodgeResult.roll,
    target: dodgeResult.target,
    modifiers: dodgeResult.modifiers,
    success: dodgeResult.success,
    decisions: gameService?.getDecisionService(),
    flow: context?.flowManager,
    arbiter: gameService?.getRerollArbiter(),
    dice: run.deps.diceController,
    triggers: [],
  };
}

/** The dodger and the Standing opponents marking the square being left. */
function vacatedMarkers(run: MoveRun): Player[] {
  return gatherParticipants(
    run.player,
    undefined,
    adjacentStanding(run.currentPos, run.opponents)
  );
}

/** A failed Dodge: the mover Falls Over in the square they dodged into. */
function fallOnDodge(run: MoveRun, step: Square): MoveEnd {
  const { deps, player } = run;
  // The square the dodger was leaving — Arm Bar markers of it react.
  const vacatedSquare = { ...run.currentPos };
  run.currentPos = step;
  player.gridPosition = run.currentPos;
  player.status = PlayerStatus.PRONE;
  fallOver(deps, {
    player,
    square: run.currentPos,
    ballBounces: run.holdingBall || isBallAt(deps.state, run.currentPos),
    context: run.context,
    vacatedSquare,
    reason: "Failed Dodge",
  });
  run.completedPath.push(step);
  return "failed";
}

/**
 * Shadowing: the chaser steps into the square being vacated — free,
 * Standing, no dice for them
 */
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

/**
 * Discarded Banana Skin (L27): an opponent entering a Tackle Zone of a
 * team holding it may be Placed Prone there. Returns who may throw it down.
 */
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

/** The mover slipped: a ball they carried stays on the square. */
function slipOnBananaSkin(run: MoveRun, step: Square): MoveEnd {
  if (run.holdingBall) {
    run.deps.state.ballPosition = { ...step };
    run.deps.eventBus.emit(GameEventNames.BallPlaced, { ...step });
  }
  return "slipped";
}

/** The flow context for a Pick-up of the loose ball on the mover's square. */
function pickupDue(run: MoveRun): FlowContext | undefined {
  const { context } = run;
  if (run.holdingBall || !isBallAt(run.deps.state, run.currentPos)) {
    return undefined;
  }
  if (context) showWalk(run);
  return context;
}

/**
 * The Pick-up's result. "failed" ends the route; "secured" ends the
 * activation once the step resolves.
 */
function takeBall(
  run: MoveRun,
  success: boolean
): "failed" | "secured" | undefined {
  const { deps, currentPos } = run;
  // Read the operation's own result: on a failure the bounce runs
  // asynchronously, so the ball can still be on this square right
  // now — checking positions here used to let the mover walk on
  // with a ball they never picked up.
  run.holdingBall = success;

  if (!run.holdingBall) {
    // A failed pickup ends the route here. The mover is NOT the
    // carrier; the loose ball's square is decided by the queued
    // bounce. PickupOperation has already announced the failure, so
    // presentation reconciles from that event.
    return "failed";
  }

  // Commit carrier state AT THE PICKUP STEP, before any remaining
  // route step resolves: the ball is now on the mover's square and
  // travels with them from here. Every later step, touchdown check
  // and presentation listener observes the completed possession
  // rather than the pre-pickup one.
  deps.state.ballPosition = { x: currentPos.x, y: currentPos.y };
  run.ballFrom = { ...currentPos };
  run.ballJoinStep = run.completedPath.length;
  // Secure the Ball: the activation ends on the pick-up.
  return isSecuringBall(deps.state, run.player.id) ? "secured" : undefined;
}

/**
 * The ball moves with its carrier. When the step reaches the End Zone,
 * shows the run and returns the presentation the touchdown waits on.
 */
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
  // The touchdown waits until the scorer is seen standing in the
  // End Zone, not when the dice for the run are rolled.
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

/** Settles the mover where the route stopped and ends the activation if due. */
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
    // Placed Prone: no Armour Roll. The activation ends, and it is a
    // Turnover only when the player held the ball. A loose ball on the
    // square (not yet picked up) Bounces as well, but is no Turnover.
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
    // Tentacles ends the activation where the player stands (no turnover)
    deps.callbacks.onActivationFinished(player.id);
  }
}
