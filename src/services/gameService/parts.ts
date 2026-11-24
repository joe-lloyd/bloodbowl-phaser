import { activateMatchFormat, formatOf } from "@/game/variants/activeMatch";
import type { GameService } from "../GameService";
import { type IEventBus } from "../EventBus.js";
import { type IRNGService } from "../rng/RNGService.js";
import { BlockResolutionService } from "../BlockResolutionService";
import { type GameState, GamePhase } from "@/types/GameState";
import { GameEventNames } from "@/types/events";
import { type Team } from "@/types/Team";
import { type Player, PlayerStatus } from "@/types/Player";
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
import {
  GameFlowManager,
  type DelayProvider,
} from "@/game/core/GameFlowManager";
import { type BallAndChainSquare } from "@/game/operations/BallAndChainOperation";
import { RerollArbiter, DecisionService } from "@/game/skills";
import { revokeMatchGrants } from "@/game/inducements/matchInducements";
import { breakSouvenirs } from "@/game/inducements/souvenirs";
import { bindPotionHooks } from "./potionWiring";
import { KickoffEventManager } from "@/game/kickoff/KickoffEventManager";
import { InducementSession } from "@/game/inducements/InducementSession";
import { createInitialState } from "./matchStart";
import {
  announceFullTime,
  rollFanFactors,
  resetActivationMarks,
  updateDedicatedFans,
} from "./driveLifecycle";
import {
  turnEndHazards,
  handleTurnEnding,
  onPlayerDowned,
  sweepChomped,
  endKickoffTurnOnFall,
} from "./turnHooks";

interface ActivationMarks {

  ballAndChainSquare: BallAndChainSquare | null;

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

  inducementSession: InducementSession | null;
}

interface PartOptions {
  game: GameService;
  eventBus: IEventBus;
  team1: Team;
  team2: Team;
  initialState: GameState | undefined;
  rngService: IRNGService;
  blockResolutionService: BlockResolutionService;
  delay: DelayProvider;
}

export function createGameParts(options: PartOptions): GameParts {
  const core = createCore(options);
  const setupManager = makeSetupManager(core, options.delay);
  const turnManager = makeTurnManager(core, options.delay, () => parts);
  const ballManager = makeBallManager(
    core,
    options.delay,
    () => kickoffManagers.kickoffEventManager
  );
  const kickoffManagers = makeKickoffManagers(core, options.delay, turnManager);
  bindPartEvents(core, () => parts);
  bindPotionHooks(core.eventBus, () => parts);
  const parts: GameParts = {
    ...core,
    setupManager,
    turnManager,
    ...kickoffManagers,
    ballManager,
    ...makeActionControllers(core, ballManager, options.blockResolutionService),
    inducementSession: null,
  };
  return parts;
}
function createCore({
  game,
  eventBus,
  team1,
  team2,
  initialState,
  rngService,
  delay,
}: PartOptions) {
  const state = initialState ?? createInitialState({ team1, team2 });
  activateMatchFormat(formatOf(state));

  if (!initialState) {
    SetupManager.sanitizeTeam(team1);
    SetupManager.sanitizeTeam(team2);
  }

  const marks: ActivationMarks = {
    ballAndChainSquare: null,
    crowdRolledFor: null,
  };

  const diceController = new DiceController(eventBus, rngService);

  const decisionService = new DecisionService(eventBus);
  const rerollArbiter = new RerollArbiter(
    state,
    (id) => game.getTeam(id),
    eventBus
  );

  const flowManager = new GameFlowManager({
    gameService: game,
    eventBus,
    delay,
  });

  const weatherService = new WeatherManager(eventBus, state, diceController);

  return {
    game,
    eventBus,
    team1,
    team2,
    state,
    marks,
    diceController,
    decisionService,
    rerollArbiter,
    flowManager,
    weatherService,
  };
}

type Core = ReturnType<typeof createCore>;

function makeSetupManager(core: Core, delay: DelayProvider): SetupManager {
  const {
    game,
    eventBus,
    state,
    team1,
    team2,
    diceController,
    weatherService,
  } = core;
  return new SetupManager(
    eventBus,
    state,
    team1,
    team2,
    weatherService,
    {
      onKickoffRequested: () => {
        game.startKickoff();
      },
      rollSwarming: (teamId) => diceController.rollD3("Swarming", teamId),
    },
    delay
  );
}

function makeTurnManager(
  core: Core,
  delay: DelayProvider,
  getParts: () => GameParts
): TurnManager {
  const { game, eventBus, state, team1, team2, diceController } = core;
  return new TurnManager(
    eventBus,
    state,
    team1,
    team2,
    {
      onPhaseChanged: (phase, subPhase) => {
        eventBus.emit(GameEventNames.PhaseChanged, {
          phase,
          ...(subPhase === undefined ? {} : { subPhase }),
        });
      },
      onHalfEnded: (next) => {
        game.endDrive("halftime", next);
      },
      shootout: () => penaltyShootout(diceController, team1, team2),
      onTurnEnding: (endingTeamId) => {
        handleTurnEnding(getParts(), endingTeamId);
      },
      betweenTurns: (endingTeamId) =>
        turnEndHazards(getParts(), endingTeamId),
      onKickoffTurnEnded: (event, teamId) => {
        getParts().kickoffEventManager.finishTurn(event, teamId);
      },
    },
    delay
  );
}

function makeBallManager(
  core: Core,
  delay: DelayProvider,
  getKickoff: () => KickoffEventManager
): BallManager {
  const {
    game,
    eventBus,
    state,
    team1,
    team2,
    diceController,
    weatherService,
    flowManager,
  } = core;
  return new BallManager(
    eventBus,
    state,
    team1,
    team2,
    weatherService,
    diceController,
    {
      onTurnover: (reason) => {
        game.triggerTurnover(reason);
      },
      onPhaseChange: (phase, subPhase) => {
        eventBus.emit(GameEventNames.PhaseChanged, {
          phase,
          subPhase,
        });
      },
      onBallPlaced: (x, y) => {
        eventBus.emit(GameEventNames.BallPlaced, { x, y });
      },
      getFlowManager: () => flowManager,
      rollEvent: (kick) => getKickoff().rollAndResolve(kick),
      coachStep: (kick) => getKickoff().coachStep(kick),
      abandonStep: () => {
        getKickoff().abandonStep();
      },
    },
    delay
  );
}

function makeKickoffManagers(
  core: Core,
  delay: DelayProvider,
  turnManager: TurnManager
) {
  const {
    game,
    eventBus,
    state,
    team1,
    team2,
    diceController,
    weatherService,
    flowManager,
  } = core;
  const playerActionManager = new PlayerActionManager(eventBus, state, (id) =>
    game.getPlayerById(id)
  );

  const kickoffEventManager = new KickoffEventManager({ eventBus: eventBus, state: state, team1: team1, team2: team2, diceController: diceController, weatherManager: weatherService, flowManager: flowManager, callbacks: {
      getTurnNumber: (teamId) => turnManager.getTurnNumber(teamId),
      moveTurnMarkers: (delta) => {
        turnManager.moveTurnMarkers(delta);
      },
      startTurn: (start) => turnManager.startKickoffTurn(start),
      closeTurn: () => {
        turnManager.closeKickoffTurn();
      },
      finishActivation: (playerId) => {
        turnManager.finishActivation(playerId);
      },
    }, delay: delay });

  return { playerActionManager, kickoffEventManager };
}

function bindPartEvents(core: Core, getParts: () => GameParts): void {
  const { eventBus, state, team1, team2, marks } = core;
  eventBus.on(
    GameEventNames.PlayerKnockedDown,
    ({ playerId }: { playerId: string }) => {
      endKickoffTurnOnFall(getParts(), playerId);
      onPlayerDowned(getParts(), playerId);
    }
  );
  eventBus.on(GameEventNames.PlayerStatusChanged, (p: Player) => {
    if (p.status !== PlayerStatus.ACTIVE) onPlayerDowned(getParts(), p.id);
    sweepChomped(getParts());
  });
  eventBus.on(GameEventNames.PlayerMoved, () => {
    sweepChomped(getParts());
  });
  eventBus.on(GameEventNames.PhaseChanged, ({ phase }) => {
    if (phase === GamePhase.HALFTIME)
      breakSouvenirs(state, [...team1.players, ...team2.players]);
    if (phase === GamePhase.GAME_OVER) {
      state.bribes = {};

      revokeMatchGrants(state, [...team1.players, ...team2.players]);
      announceFullTime(getParts());

      rollFanFactors(getParts());
      updateDedicatedFans(getParts());
    }
  });

  const clearMarks = () => {
    resetActivationMarks(marks);
  };
  eventBus.on(GameEventNames.TurnStarted, clearMarks);
  eventBus.on(GameEventNames.KickoffTurnStarted, clearMarks);
  eventBus.on(GameEventNames.KickoffTurnEnded, clearMarks);
}

function makeActionControllers(
  core: Core,
  ballManager: BallManager,
  blockResolutionService: BlockResolutionService
) {
  const { eventBus, state, team1, team2, diceController, game, flowManager } =
    core;
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
      onTurnover: (reason: string) => {
        game.triggerTurnover(reason);
      },
      onActivationFinished: (playerId: string) => {
        game.finishActivation(playerId);
      },
      onTouchdown: (teamId: string, scorerId: string) => {
        game.addTouchdown(teamId, scorerId);
      },
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
      onTurnover: (reason) => {
        game.triggerTurnover(reason);
      },
      getFlowManager: () => flowManager,
    }
  );

  return {
    passController,
    catchController,
    armourController,
    injuryController,
    foulController,
    movementManager,
    blockManager,
  };
}
