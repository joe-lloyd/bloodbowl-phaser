/**
 * The engine behind GameService: the managers and controllers it wires
 * together, the state and teams they share, and what one activation has
 * used up. GameService builds one in its constructor; the modules split out
 * of it take it as their first argument.
 */

import type { GameService } from "../GameService";
import { IEventBus } from "../EventBus.js";
import { IRNGService } from "../rng/RNGService.js";
import { BlockResolutionService } from "../BlockResolutionService";
import { GameState, GamePhase } from "@/types/GameState";
import { GameEventNames } from "@/types/events";
import { Team } from "@/types/Team";
import { Player, PlayerStatus } from "@/types/Player";
import { SetupManager } from "@/game/managers/SetupManager";
import { TurnManager } from "@/game/managers/TurnManager";
import { penaltyShootout } from "@/game/rules/extraTime";
import { BallManager } from "@/game/managers/BallManager";
import { MovementManager } from "@/game/managers/MovementManager";
import { BlockManager } from "@/game/managers/BlockManager";
import { WeatherManager } from "@/game/managers/WeatherManager";
import { PlayerActionManager } from "@/game/managers/PlayerActionManager";
import { PassController } from "@/game/controllers/PassController";
import { CatchController } from "@/game/controllers/CatchController";
import { DiceController } from "@/game/controllers/DiceController";
import { ArmourController } from "@/game/controllers/ArmourController";
import { InjuryController } from "@/game/controllers/InjuryController";
import { FoulController } from "@/game/controllers/FoulController";
import { GameFlowManager, DelayProvider } from "@/game/core/GameFlowManager";
import { BallAndChainSquare } from "@/game/operations/BallAndChainOperation";
import { RerollArbiter, DecisionService } from "@/game/skills";
import { revokeMatchGrants } from "@/game/inducements/matchInducements";
import { KickoffEventManager } from "@/game/kickoff/KickoffEventManager";
import { InducementSession } from "@/game/inducements/InducementSession";
import { createInitialState } from "./matchStart";
import {
  announceFullTime,
  rollFanFactors,
  updateDedicatedFans,
} from "./driveLifecycle";
import {
  castSportsWizards,
  handleTurnEnding,
  onPlayerDowned,
  sweepChomped,
} from "./turnHooks";

/** What the activation in progress, or the turn, has used up. */
export interface ActivationMarks {
  /**
   * The single block a Blitz allows was spent this activation. A Blitz may
   * block once, at any point during the move; afterwards the player may keep
   * moving, so a second block must be refused.
   */
  blitzBlockUsed: Set<string>;
  puntUsedThisTurn: boolean;
  /** The lurch square whose collision the block engine is resolving. */
  ballAndChainSquare: BallAndChainSquare | null;
  /** The player whose Crowd Takes Action roll this activation has made. */
  crowdRolledFor: string | null;
}

export interface GameParts {
  game: GameService;
  state: GameState;
  team1: Team;
  team2: Team;
  eventBus: IEventBus;
  diceController: DiceController;
  decisionService: DecisionService;
  rerollArbiter: RerollArbiter;
  flowManager: GameFlowManager;
  weatherService: WeatherManager;
  setupManager: SetupManager;
  turnManager: TurnManager;
  ballManager: BallManager;
  playerActionManager: PlayerActionManager;
  kickoffEventManager: KickoffEventManager;
  passController: PassController;
  catchController: CatchController;
  armourController: ArmourController;
  injuryController: InjuryController;
  foulController: FoulController;
  movementManager: MovementManager;
  blockManager: BlockManager;
  marks: ActivationMarks;
  /** The pregame inducement negotiation, made when first asked for. */
  inducementSession: InducementSession | null;
}

/** Build the managers in the order they depend on each other. */
export function createGameParts({
  game,
  eventBus,
  team1,
  team2,
  initialState,
  rngService,
  blockResolutionService,
  delay,
}: {
  game: GameService;
  eventBus: IEventBus;
  team1: Team;
  team2: Team;
  initialState: GameState | undefined;
  rngService: IRNGService;
  blockResolutionService: BlockResolutionService;
  delay: DelayProvider;
}): GameParts {
  const state = initialState || createInitialState(team1, team2);

  // If starting a fresh game (no initial state), ensure teams are clean
  if (!initialState) {
    SetupManager.sanitizeTeam(team1);
    SetupManager.sanitizeTeam(team2);
  }

  const marks: ActivationMarks = {
    blitzBlockUsed: new Set<string>(),
    puntUsedThisTurn: false,
    ballAndChainSquare: null,
    crowdRolledFor: null,
  };

  // Initialize Dice Controller first
  const diceController = new DiceController(eventBus, rngService);

  // Mid-action decision channel + reroll constraints (skill rules)
  const decisionService = new DecisionService(eventBus);
  const rerollArbiter = new RerollArbiter(
    state,
    (id) => game.getTeam(id),
    eventBus
  );

  // Initialize Flow Manager (Pass the game service as context)
  const flowManager = new GameFlowManager({
    gameService: game,
    eventBus: eventBus,
    delay: delay,
  });

  // Initialize Managers
  const weatherService = new WeatherManager(eventBus, state, diceController);

  const setupManager = new SetupManager(
    eventBus,
    state,
    team1,
    team2,
    weatherService,
    {
      onKickoffRequested: () => game.startKickoff(),
      rollSwarming: (teamId) => diceController.rollD3("Swarming", teamId),
    },
    delay
  );

  const turnManager = new TurnManager(
    eventBus,
    state,
    team1,
    team2,
    {
      onPhaseChanged: (phase, subPhase) =>
        eventBus.emit(GameEventNames.PhaseChanged, { phase, subPhase }),
      onHalfEnded: (next) => game.endDrive("halftime", next),
      shootout: () => penaltyShootout(diceController, team1, team2),
      onTurnEnding: (endingTeamId) => handleTurnEnding(parts, endingTeamId),
      betweenTurns: (endingTeamId) => castSportsWizards(parts, endingTeamId),
    },
    delay
  );

  const ballManager = new BallManager(
    eventBus,
    state,
    team1,
    team2,
    weatherService,
    diceController,
    {
      onTurnover: (reason) => game.triggerTurnover(reason),
      onPhaseChange: (phase, subPhase) =>
        eventBus.emit(GameEventNames.PhaseChanged, { phase, subPhase }),
      onBallPlaced: (x, y) =>
        eventBus.emit(GameEventNames.BallPlaced, { x, y }),
      getFlowManager: () => flowManager,
      resolveKickoffEvent: (isTeam1Kicking) =>
        kickoffEventManager.rollAndResolve(isTeam1Kicking),
      resolveHighKickStep: (isTeam1Kicking, landingSquare) =>
        kickoffEventManager.resolveHighKickStep(isTeam1Kicking, landingSquare),
      consumeWeatherScatterPending: () =>
        kickoffEventManager.consumeWeatherScatterPending(),
    },
    delay
  );

  const playerActionManager = new PlayerActionManager(eventBus, state, (id) =>
    game.getPlayerById(id)
  );

  const kickoffEventManager = new KickoffEventManager(
    eventBus,
    state,
    team1,
    team2,
    diceController,
    weatherService,
    {
      getTurnNumber: (teamId) => turnManager.getTurnNumber(teamId),
      moveTurnMarkers: (delta) => turnManager.moveTurnMarkers(delta),
    }
  );

  // Conditions expire on engine events, not in rules: Rooted ends when
  // its player is Knocked Down or Placed Prone; Chomped ends the moment
  // the chomper is no longer Marking the victim (moved, downed, pushed).
  eventBus.on(
    GameEventNames.PlayerKnockedDown,
    ({ playerId }: { playerId: string }) => {
      // A Charge! player going down aborts the whole sequence at once
      kickoffEventManager.noteChargePlayerDown(playerId);
      onPlayerDowned(parts, playerId);
    }
  );
  eventBus.on(GameEventNames.PlayerStatusChanged, (p: Player) => {
    if (p.status !== PlayerStatus.ACTIVE) onPlayerDowned(parts, p.id);
    sweepChomped(parts);
  });
  eventBus.on(GameEventNames.PlayerMoved, () => sweepChomped(parts));
  eventBus.on(GameEventNames.PhaseChanged, ({ phase }) => {
    if (phase === GamePhase.GAME_OVER) {
      // Get the Ref bribes are match-scoped and never leave this match.
      state.bribes = {};
      // Prayer and Desperate Measure grants last for this game only.
      revokeMatchGrants(state, [...team1.players, ...team2.players]);
      announceFullTime(parts);
      // Fan Factor reads the Dedicated Fans the teams kicked off with
      rollFanFactors(parts);
      updateDedicatedFans(parts);
    }
  });
  // A Blitz's single block is tracked per activation; a fresh turn clears it.
  eventBus.on(GameEventNames.TurnStarted, () => {
    marks.blitzBlockUsed.clear();
    marks.puntUsedThisTurn = false;
    marks.ballAndChainSquare = null;
    marks.crowdRolledFor = null;
  });

  const passController = new PassController(
    eventBus,
    ballManager.movementController,
    diceController
  );
  const catchController = new CatchController();
  const armourController = new ArmourController();
  const injuryController = new InjuryController();
  const foulController = new FoulController();

  const movementManager = new MovementManager(
    eventBus,
    state,
    team1,
    team2,
    diceController,
    {
      onTurnover: (reason: string) => game.triggerTurnover(reason),
      onActivationFinished: (playerId: string) =>
        game.finishActivation(playerId),
      onTouchdown: (teamId: string, scorerId: string) =>
        game.addTouchdown(teamId, scorerId),
    }
  );

  const blockManager = new BlockManager(
    eventBus,
    state,
    team1,
    team2,
    blockResolutionService,
    diceController,
    {
      onTurnover: (reason) => game.triggerTurnover(reason),
      getFlowManager: () => flowManager,
    }
  );

  const parts: GameParts = {
    game,
    state,
    team1,
    team2,
    eventBus,
    diceController,
    decisionService,
    rerollArbiter,
    flowManager,
    weatherService,
    setupManager,
    turnManager,
    ballManager,
    playerActionManager,
    kickoffEventManager,
    passController,
    catchController,
    armourController,
    injuryController,
    foulController,
    movementManager,
    blockManager,
    marks,
    inducementSession: null,
  };
  return parts;
}
