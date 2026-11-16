/**
 * Setup shared by the GameplayInteractionController tests: mock scene,
 * pitch, event bus and game service, two players, and a fresh controller.
 */
import { vi } from "vitest";
import { GameplayInteractionController } from "../../../src/game/controllers/GameplayInteractionController";
import { GamePhase } from "../../../src/types/GameState";
import { GameEventNames } from "../../../src/types/events";

// Mock dependencies
export const mockScene = {
  events: { on: vi.fn(), off: vi.fn() },
  highlightPlayer: vi.fn(),
  unhighlightPlayer: vi.fn(),
  add: {
    rectangle: vi.fn(),
    container: vi.fn(),
  },
};

export const mockPitch = {
  getContainer: vi.fn(() => ({ x: 0, y: 0 })),
  highlightHoverSquare: vi.fn(),
  highlightSquare: vi.fn(() => ({ destroy: vi.fn() })),
  drawRangeOverlay: vi.fn(),
  drawTackleZones: vi.fn(),
  drawMovementPath: vi.fn(),
  drawSprintRisks: vi.fn(),
  clearPath: vi.fn(),
  clearHighlights: vi.fn(),
  clearHover: vi.fn(),
  clearPassVisualization: vi.fn(),
  drawPassZones: vi.fn(),
  drawPassLine: vi.fn(),
  drawInterceptZone: vi.fn(),
  drawHandoffTargets: vi.fn(),
  clearLayer: vi.fn(),
};

export const mockMovementValidator = {
  findPath: vi.fn(),
  analyzePath: vi.fn().mockReturnValue({ requiresDodge: false }),
  findReachableSquares: vi.fn().mockReturnValue([]),
};

export const mockEventBus = {
  on: vi.fn(),
  emit: vi.fn(),
  off: vi.fn(),
  once: vi.fn(),
  removeAllListeners: vi.fn(),
  listenerCount: vi.fn(),
};

export const mockGameService = {
  runsCommandsLater: false,
  getState: vi.fn(),
  getPlayerById: vi.fn(),
  // These tests were one file, where the first set this to [] for the rest
  getAvailableMovements: vi.fn().mockReturnValue([]),
  getMovementUsed: vi.fn().mockReturnValue(0),
  movePlayer: vi.fn().mockResolvedValue(true),
  getPhase: vi.fn().mockReturnValue(GamePhase.PLAY),
  canActivate: vi.fn().mockReturnValue(true),
  standUp: vi.fn(),
  finishActivation: vi.fn(),
  declareAction: vi.fn(),
  cancelAction: vi.fn(),
  previewBlock: vi.fn(),
  hasPlayerActed: vi.fn(),
  hasUsedBlitzBlock: vi.fn().mockReturnValue(false),
  getSubPhase: vi.fn(),
  selectKicker: vi.fn(),
  kickBall: vi.fn(),
  executePush: vi.fn(),
  throwBall: vi.fn(),
  handOffBall: vi.fn(),
  getTeammates: vi.fn().mockReturnValue([]),
  isTouchbackPending: vi.fn().mockReturnValue(false),
  awardTouchback: vi.fn(),
  getKickoffEventStep: vi.fn().mockReturnValue(null),
  selectKickoffEventPlayer: vi.fn().mockReturnValue(true),
  moveKickoffEventPlayer: vi.fn().mockReturnValue(true),
  placeKickoffEventPlayer: vi.fn().mockReturnValue(true),
  getTeam: vi.fn(),
  getOpponents: vi.fn().mockReturnValue([]),
  getPassController: vi.fn().mockReturnValue({
    getAllRanges: vi.fn().mockReturnValue(new Map()),
    measureRange: vi.fn().mockReturnValue({ type: "Quick Pass", modifier: 0 }),
    getInterceptionSquares: vi.fn().mockReturnValue([]),
    checkInterceptions: vi.fn().mockReturnValue([]),
  }),
  foulPlayer: vi.fn().mockResolvedValue(undefined),
  // Default: the flow queue is already idle, so unrelated tests that never
  // touch the foul path see no delay. The foul-highlight tests below replace
  // this with a controllable promise.
  getFlowContext: vi.fn().mockReturnValue({
    flowManager: { whenIdle: vi.fn().mockResolvedValue(undefined) },
  }),
  getRerollArbiter: vi.fn().mockReturnValue({
    skillRerollAvailable: vi.fn().mockReturnValue(false),
    teamRerollAvailable: vi.fn().mockReturnValue(false),
    nextTeamReroll: vi.fn().mockReturnValue(null),
    veteranRerollAvailable: vi.fn().mockReturnValue(false),
    onceAvailable: vi.fn().mockReturnValue(false),
  }),
};

/** The Dodge/Rush prompt the board raised last, answered as the coach. */
export async function answerStepPrompt(confirmed: boolean) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  const ask = mockEventBus.emit.mock.calls
    .filter(([name]) => name === GameEventNames.UI_RequestConfirmation)
    .at(-1);
  if (!ask) throw new Error("no Dodge/Rush prompt was raised");
  mockEventBus.on.mock.calls
    .filter(([name]) => name === GameEventNames.UI_ConfirmationResult)
    .forEach(([, handler]) =>
      handler({ confirmed, actionId: ask[1].actionId })
    );
  await new Promise((resolve) => setTimeout(resolve, 0));
  return ask[1];
}

export const team1Id = "team1";
export const team2Id = "team2";

export const player1 = {
  id: "p1",
  teamId: team1Id,
  gridPosition: { x: 5, y: 5 },
  stats: { MA: 6, AG: 3 },
  playerName: "Blitzer",
  status: "Active",
  skills: [],
};
export const player2 = {
  id: "p2",
  teamId: team2Id,
  gridPosition: { x: 6, y: 6 },
  stats: { MA: 6 },
  status: "Active",
};

/** Clear the mocks, reset both teams, and build a fresh controller. */
export function createController(): GameplayInteractionController {
  vi.clearAllMocks();
  mockGameService.runsCommandsLater = false;
  mockGameService.getKickoffEventStep.mockReturnValue(null);
  mockGameService.selectKickoffEventPlayer.mockReturnValue(true);
  mockGameService.moveKickoffEventPlayer.mockReturnValue(true);
  mockGameService.placeKickoffEventPlayer.mockReturnValue(true);

  // Setup default scene mock for teams (as the controller accesses them directly in a temporary hack)
  mockScene.team1 = {
    id: team1Id,
    players: [player1],
    colors: { primary: 0xff0000 },
  };
  mockScene.team2 = {
    id: team2Id,
    players: [player2],
    colors: { primary: 0x0000ff },
  };

  return new GameplayInteractionController(
    mockScene,
    mockGameService,
    mockEventBus,
    mockPitch,
    mockMovementValidator
  );
}
