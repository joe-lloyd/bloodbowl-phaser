/**
 * The Move action: walk a player along a validated route one square at a
 * time. Each step rolls what it needs in rulebook order (Rush, then Dodge),
 * then resolves what entering the square does (Trapdoor, Banana Skin,
 * Pick-up, Touchdown). The first step that ends the route stops the walk.
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
  | "slipped"
  | "touchdown";

/** The state of one Move action while its route resolves. */
interface MoveRun {
  deps: MovementDeps;
  player: Player;
  /** The drive-modified MA view (Dodgy Snack -1 MA). */
  maView: Player;
  context: FlowContext | undefined;
  gameService: IGameService | undefined;
  /** Standing opponents on the pitch: they mark squares and react to dodges. */
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
  const { state, eventBus } = deps;
  const player = findPlayer(deps, playerId);
  if (!player) return Promise.reject("Player not found!");
  // Validate against the drive-modified MA view (Dodgy Snack -1 MA);
  // state mutations below still land on the real player.
  const maView = withDriveModifiers(player, state);

  if (heldInSquare(eventBus, player)) return Promise.reject("Cannot move");

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
    return Promise.reject("Invalid Move");
  }

  const currentPos = player.gridPosition!;
  const preUsed = movementUsed(state, playerId);
  const standingCost = await standToMove(deps, player, maView, preUsed);
  if (standingCost === null) return;

  const holdingBall = isBallAt(state, currentPos);
  const run: MoveRun = {
    deps,
    player,
    maView,
    context,
    gameService: context?.gameService,
    opponents,
    preUsed,
    stepsTaken: standingCost,
    currentPos,
    completedPath: [],
    holdingBall,
    ballFrom: holdingBall ? { ...currentPos } : null,
    ballJoinStep: 0,
    shownSteps: 0,
    shownFrom: { ...currentPos },
  };

  let end: MoveEnd = "walked";
  for (const step of path) {
    const stepEnd = await takeStep(run, step);
    if (stepEnd) {
      end = stepEnd;
      break;
    }
  }
  if (end !== "touchdown") finishMove(run, end);
}

/**
 * A Prone mover stands up first. Returns the movement standing spent, or
 * null when the stand-up roll failed: still Prone, movement spent,
 * activation over.
 */
async function standToMove(
  deps: MovementDeps,
  player: Player,
  maView: Player,
  preUsed: number
): Promise<number | null> {
  if (player.status !== PlayerStatus.PRONE) return 0;
  const cost = standUpCost(maView);
  if (!(await rollToStand(deps, maView))) {
    deps.state.turn.movementUsed.set(player.id, preUsed + cost);
    deps.callbacks.onActivationFinished(player.id);
    return null;
  }
  player.status = PlayerStatus.ACTIVE;
  deps.eventBus.emit(GameEventNames.PlayerStoodUp, {
    playerId: player.id,
    cost,
  });
  deps.eventBus.emit(GameEventNames.PlayerStatusChanged, player);
  return cost;
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

/** Resolves one square of the route; returns how the route ends, if it does. */
async function takeStep(
  run: MoveRun,
  step: Square
): Promise<MoveEnd | undefined> {
  const { deps, player } = run;
  // A step that needs both a Rush and a Dodge rolls the Rush first
  // (rulebook p.62), so a fall on the Rush never reaches the Dodge.
  const totalUsed = run.preUsed + run.stepsTaken + 1;
  if (totalUsed > run.maView.stats.MA && !(await rushInto(run, step))) {
    return "failed";
  }

  if (deps.dodgeController.isDodgeRequired(run.currentPos, run.opponents)) {
    const dodgeEnd = await dodgeInto(run, step);
    if (dodgeEnd) return dodgeEnd;
  }

  run.stepsTaken++;
  run.currentPos = step;
  player.gridPosition = run.currentPos;
  run.completedPath.push(step);

  // Treacherous Trapdoor (L12): entering the square may drop the player
  // through it, before any pick-up on that square.
  if (trapdoorOpens(deps.state, deps.diceController, player, step)) {
    return "fellThrough";
  }
  if (await slipsOnBananaSkin(run, step)) return "slipped";

  const picked = await pickUpLooseBall(run);
  if (picked === "failed") return "failed";
  if (run.holdingBall && (await carryBall(run))) return "touchdown";
  return picked === "secured" ? "securedBall" : undefined;
}

/** Rolls a step's Rush; false when the mover Falls Over in the square. */
async function rushInto(run: MoveRun, step: Square): Promise<boolean> {
  const { deps, player, gameService } = run;
  showWalk(run);
  const check = await rollRush(deps, player, gameService);
  // A failed Rush that Steady Footing saved keeps the player Standing:
  // they move into the square and may keep going, no fall and no Turnover.
  if (
    check.success ||
    (await steadyFootingSaves(
      player,
      deps.diceController,
      deps.eventBus,
      gameService
    ))
  ) {
    return true;
  }
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
  return false;
}

/**
 * Trigger point: dodge declared. Rules from the dodger AND the opponents
 * marking the vacated or destination square may adjust the roll
 * (Prehensile Tail, Titchy) or deny the skill reroll (Tackle).
 */
async function declareDodge(
  run: MoveRun,
  step: Square
): Promise<DodgeDeclaredContext> {
  const { deps, player, gameService, opponents, currentPos } = run;
  const markingPenalty = deps.dodgeController.calculateDodgeModifiers(
    step,
    opponents
  );
  const dodgeCtx: DodgeDeclaredContext = {
    player,
    from: { ...currentPos },
    to: { ...step },
    modifiers: markingPenalty,
    markingPenalty,
    skillRerollAllowed: true,
    decisions: gameService?.getDecisionService(),
    flow: run.context?.flowManager,
    arbiter: gameService?.getRerollArbiter(),
    dice: deps.diceController,
    triggers: [],
  };
  await foldTrigger(
    "onDodgeDeclared",
    gatherParticipants(player, undefined, [
      ...adjacentStanding(currentPos, opponents),
      ...adjacentStanding(step, opponents),
    ]),
    dodgeCtx
  );
  dodgeCtx.triggers.forEach((t) =>
    deps.eventBus.emit(GameEventNames.SkillTriggered, t)
  );
  return dodgeCtx;
}

/**
 * Rolls the Dodge after any re-rolls, then lets markers of the vacated
 * square react to the result.
 */
async function rollDodge(
  run: MoveRun,
  step: Square,
  dodgeCtx: DodgeDeclaredContext
): Promise<DodgeResolvedContext> {
  const { deps, player, gameService, opponents, currentPos } = run;
  const roll = () =>
    deps.dodgeController.attemptDodge(
      player,
      step,
      opponents,
      dodgeCtx.modifiers
    );
  // A failed dodge may be rerolled (Dodge skill / team reroll); the
  // move pauses on the coach's decision
  const dodgeResult = gameService
    ? await withRerollOffer(
        { gameService, eventBus: deps.eventBus },
        player,
        "dodge",
        roll,
        { skillAllowed: dodgeCtx.skillRerollAllowed }
      )
    : roll();

  // Trigger point: dodge resolved — markers of the vacated square
  // react after any re-rolls (Diving Tackle)
  const resolvedCtx: DodgeResolvedContext = {
    player,
    from: { ...currentPos },
    to: { ...step },
    naturalRoll: dodgeResult.roll,
    target: dodgeResult.target,
    modifiers: dodgeResult.modifiers,
    success: dodgeResult.success,
    decisions: gameService?.getDecisionService(),
    flow: run.context?.flowManager,
    arbiter: gameService?.getRerollArbiter(),
    dice: deps.diceController,
    triggers: [],
  };
  await foldTrigger(
    "onDodgeResolved",
    gatherParticipants(
      player,
      undefined,
      adjacentStanding(currentPos, opponents)
    ),
    resolvedCtx
  );
  // Trigger point: the dodge stood, so markers of the vacated square
  // may Shadow into it — only once Diving Tackle has had its say
  // (FAQ May 2026), so a dive never shares the square with a shadower
  if (resolvedCtx.success) {
    await foldTrigger(
      "onDodgeSucceeded",
      gatherParticipants(
        player,
        undefined,
        adjacentStanding(currentPos, opponents)
      ),
      resolvedCtx
    );
  }
  resolvedCtx.triggers.forEach((t) =>
    deps.eventBus.emit(GameEventNames.SkillTriggered, t)
  );
  return resolvedCtx;
}

/** Dodges out of a marked square; returns how the route ends, if it does. */
async function dodgeInto(
  run: MoveRun,
  step: Square
): Promise<MoveEnd | undefined> {
  const { deps, player } = run;
  showWalk(run);
  const dodgeCtx = await declareDodge(run, step);
  // Tentacles held the dodger: no Agility Test, no move, and the
  // activation ends — not a turnover
  if (dodgeCtx.escapeCancelled) return "heldFast";

  const resolvedCtx = await rollDodge(run, step, dodgeCtx);

  // Diving Tackle: the dodger has left the square, whatever its fate: it
  // stands or falls in the one it dodged into, so it never shares the
  // diver's while a Steady Footing re-roll is open.
  diveIntoVacated(deps.eventBus, {
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
      deps.diceController,
      deps.eventBus,
      run.gameService
    ))
  ) {
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
  // A failed dodge that Steady Footing saved keeps the player Standing:
  // fall through as if it had succeeded — they move on and continue their
  // activation, no Armour Roll and no Turnover. It is still no
  // successful dodge, so nobody Shadowed it.
  shadowFollow(run, resolvedCtx);
  return undefined;
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

/**
 * Discarded Banana Skin (L27): an opponent entering a Tackle Zone of a
 * team holding it may be Placed Prone there.
 */
async function slipsOnBananaSkin(run: MoveRun, step: Square): Promise<boolean> {
  const { deps, player, gameService } = run;
  if (!gameService) return false;
  const bananaTeamId = bananaSkinTeam(deps.state, step, run.opponents);
  if (!bananaTeamId) return false;
  showWalk(run);
  const thrown = await offerMeasure(
    { gameService },
    bananaTeamId,
    player.id,
    DesperateMeasure.DISCARDED_BANANA_SKIN,
    `${player.playerName} steps into your Tackle Zone — throw down the Discarded Banana Skin?`
  );
  if (!thrown) return false;
  if (run.holdingBall) {
    deps.state.ballPosition = { ...step };
    deps.eventBus.emit(GameEventNames.BallPlaced, { ...step });
  }
  return true;
}

/**
 * Picks up a loose ball on the mover's new square. "failed" ends the
 * route; "secured" ends the activation once the step resolves.
 */
async function pickUpLooseBall(
  run: MoveRun
): Promise<"failed" | "secured" | undefined> {
  const { deps, context, currentPos } = run;
  if (run.holdingBall || !isBallAt(deps.state, currentPos) || !context) {
    return undefined;
  }
  showWalk(run);
  const pickupOp = new PickupOperation(run.player.id);
  await pickupOp.execute(context);

  // Read the operation's own result: on a failure the bounce runs
  // asynchronously, so the ball can still be on this square right
  // now — checking positions here used to let the mover walk on
  // with a ball they never picked up.
  run.holdingBall = pickupOp.success;

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

/** The ball moves with its carrier; true when the step scores. */
async function carryBall(run: MoveRun): Promise<boolean> {
  const { deps, player, currentPos, context } = run;
  deps.state.ballPosition = { x: currentPos.x, y: currentPos.y };
  deps.eventBus.emit(GameEventNames.BallPlaced, {
    x: currentPos.x,
    y: currentPos.y,
  });

  const side = player.teamId === deps.team1.id ? 1 : 2;
  if (!isInEndZone(currentPos, GameConfig.PITCH_WIDTH, side)) return false;
  player.gridPosition = currentPos;
  deps.state.turn.movementUsed.set(player.id, run.preUsed + run.stepsTaken);
  // The touchdown waits until the scorer is seen standing in the
  // End Zone, not when the dice for the run are rolled.
  const presentationId = nextPresentationId("score-run");
  deps.eventBus.emit(GameEventNames.PlayerMoved, walk(run, presentationId));
  if (context) {
    await awaitPresentation(
      deps.eventBus,
      context.delay,
      presentationId,
      SCORE_RUN_WAIT_MS + run.completedPath.length * 200
    );
  }
  deps.callbacks.onTouchdown?.(player.teamId, player.id);
  return true;
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
