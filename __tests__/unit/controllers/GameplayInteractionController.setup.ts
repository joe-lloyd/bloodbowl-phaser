import type { MockInstance } from "vitest";
import { markerWith } from "./controllerFixtures";
import type { InteractionPitch, InteractionMarker } from "../../../src/game/controllers/interaction/ports";
import { playerWith, teamWith } from "./controllerFixtures";
import { z } from "zod";
import type { AllEvents } from "../../../src/types/events";
import { stepPromptSchema } from "../../../src/boundary/schemas/StepPrompt";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import { EventBus } from "../../../src/services/EventBus";
import { createTestPlayer } from "../../fixtures/players";
import { createTestTeam } from "../../fixtures/teams";
import type { GameState } from "../../../src/types/GameState";
import type { Pitch } from "../../../src/game/elements/Pitch";
import type { MovementValidator } from "../../../src/game/validators/MovementValidator";
import { vi } from "vitest";
import { GameplayInteractionController } from "../../../src/game/controllers/GameplayInteractionController";
import { GamePhase } from "../../../src/types/GameState";
import { GameEventNames } from "../../../src/types/events";

export const team1Id = "team1";
export const team2Id = "team2";
export const player1 = createTestPlayer(playerWith({ id: "p1", teamId: team1Id, gridPosition: { x: 5, y: 5 }, playerName: "Blitzer" }));
export const player2 = createTestPlayer(playerWith({ id: "p2", teamId: team2Id, gridPosition: { x: 6, y: 6 } }));
const team1 = { ...createTestTeam(), id: team1Id, players: [player1] };
const team2 = { ...createTestTeam(), id: team2Id, players: [player2] };
const actualGame = new HeadlessGame({ seed: 1 });
const actualService = actualGame.ctx.gameService;
const initialState = { ...actualService.getState(), phase: GamePhase.PLAY, activeTeamId: team1Id };
export function stateWith(input: Partial<Omit<GameState, "turn">> & { turn?: Partial<GameState["turn"]> }): GameState {
  const { turn, ...rest } = input;
  const base = structuredClone(initialState);
  return { ...base, ...rest, turn: { ...base.turn, ...turn } };
}
function mockFunction<Fn extends (...args: never[]) => unknown>() {
  return vi.fn<Parameters<Fn>, ReturnType<Fn>>();
}
export const mockScene = {
  team1, team2, kickingTeam: team1,
  cameras: { main: {worldView:{x:0,y:0},zoom:1} }, scale: {width:1600,height:900},
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
  highlightSquare: vi.fn<Parameters<InteractionPitch["highlightSquare"]>, InteractionMarker>(() => markerWith()),
  worldToGrid: mockFunction<Pitch["worldToGrid"]>(),
  getPixelPosition: mockFunction<Pitch["getPixelPosition"]>().mockImplementation((x, y) => ({ x: x * 60, y: y * 60 })),
  drawJumpTargets: mockFunction<Pitch["drawJumpTargets"]>(),
  drawAssistRings: mockFunction<Pitch["drawAssistRings"]>(),
  drawInterceptionRolls: mockFunction<Pitch["drawInterceptionRolls"]>(),
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
  findPath: mockFunction<MovementValidator["findPath"]>(),
  analyzePath: vi.fn().mockReturnValue({ requiresDodge: false }),
  findReachableSquares: mockFunction<MovementValidator["findReachableSquares"]>().mockReturnValue([]),
};

export const mockEventBus = new EventBus();
export const eventBusSpies = {
  on: vi.spyOn(mockEventBus, "on"),
  off: vi.spyOn(mockEventBus, "off"),
  once: vi.spyOn(mockEventBus, "once"),
  emit: vi.spyOn(mockEventBus, "emit"),
  removeAllListeners: vi.spyOn(mockEventBus, "removeAllListeners"),
  listenerCount: vi.spyOn(mockEventBus, "listenerCount"),
};

const actualContext = actualService.getFlowContext();
const actualPassController = actualService.getPassController();
export const whenFlowIdle = vi.spyOn(actualContext.flowManager, "whenIdle").mockResolvedValue(undefined);
const actualArbiter = actualService.getRerollArbiter();
const arbiterSpies = {
  skillRerollAvailable: vi.spyOn(actualArbiter, "skillRerollAvailable").mockReturnValue(false),
  teamRerollAvailable: vi.spyOn(actualArbiter, "teamRerollAvailable").mockReturnValue(false),
  nextTeamReroll: vi.spyOn(actualArbiter, "nextTeamReroll").mockReturnValue(null),
  veteranRerollAvailable: vi.spyOn(actualArbiter, "veteranRerollAvailable").mockReturnValue(false),
  onceAvailable: vi.spyOn(actualArbiter, "onceAvailable").mockReturnValue(false),
  teamRerollsLeftFor: vi.spyOn(actualArbiter, "teamRerollsLeftFor").mockReturnValue(0),
};
export const mockArbiter = Object.assign(actualArbiter, arbiterSpies);
export const pendingDecisionSpy = vi.spyOn(actualService.getDecisionService(), "pending").mockReturnValue(null);
export const serviceSpies = {
  getActiveTeamId: vi.spyOn(actualService, "getActiveTeamId").mockReturnValue(team1Id),
  answerBiteTarget: vi.spyOn(actualService, "answerBiteTarget").mockReturnValue(false),
  getState: vi.spyOn(actualService, "getState").mockReturnValue(stateWith({})),
  getPlayerById: vi.spyOn(actualService, "getPlayerById").mockReturnValue(undefined),
  getAvailableMovements: vi.spyOn(actualService, "getAvailableMovements").mockReturnValue([]),
  getMovementUsed: vi.spyOn(actualService, "getMovementUsed").mockReturnValue(0),
  movePlayer: vi.spyOn(actualService, "movePlayer").mockResolvedValue(undefined),
  getPhase: vi.spyOn(actualService, "getPhase").mockReturnValue(GamePhase.PLAY),
  canActivate: vi.spyOn(actualService, "canActivate").mockReturnValue(true),
  standUp: vi.spyOn(actualService, "standUp").mockResolvedValue(undefined),
  finishActivation: vi.spyOn(actualService, "finishActivation").mockImplementation(() => undefined),
  declareAction: vi.spyOn(actualService, "declareAction").mockReturnValue(false),
  cancelAction: vi.spyOn(actualService, "cancelAction").mockReturnValue(false),
  previewBlock: vi.spyOn(actualService, "previewBlock").mockImplementation(() => undefined),
  hasPlayerActed: vi.spyOn(actualService, "hasPlayerActed").mockReturnValue(false),
  hasUsedBlitzBlock: vi.spyOn(actualService, "hasUsedBlitzBlock").mockReturnValue(false),
  getSubPhase: vi.spyOn(actualService, "getSubPhase").mockReturnValue(undefined),
  selectKicker: vi.spyOn(actualService, "selectKicker").mockImplementation(() => undefined),
  kickBall: vi.spyOn(actualService, "kickBall").mockResolvedValue(undefined),
  executePush: vi.spyOn(actualService, "executePush").mockResolvedValue(undefined),
  throwBall: vi.spyOn(actualService, "throwBall").mockResolvedValue({ success: true }),
  handOffBall: vi.spyOn(actualService, "handOffBall").mockResolvedValue({ success: true }),
  getTeammates: vi.spyOn(actualService, "getTeammates").mockReturnValue([]),
  isTouchbackPending: vi.spyOn(actualService, "isTouchbackPending").mockReturnValue(false),
  awardTouchback: vi.spyOn(actualService, "awardTouchback").mockReturnValue(false),
  getKickoffEventStep: vi.spyOn(actualService, "getKickoffEventStep").mockReturnValue(null),
  selectKickoffEventPlayer: vi.spyOn(actualService, "selectKickoffEventPlayer").mockReturnValue(true),
  moveKickoffEventPlayer: vi.spyOn(actualService, "moveKickoffEventPlayer").mockReturnValue(true),
  placeKickoffEventPlayer: vi.spyOn(actualService, "placeKickoffEventPlayer").mockReturnValue(true),
  getTeam: vi.spyOn(actualService, "getTeam").mockReturnValue(undefined),
  getOpponents: vi.spyOn(actualService, "getOpponents").mockReturnValue([]),
  getPassController: vi.spyOn(actualService, "getPassController").mockReturnValue(actualPassController),
  foulPlayer: vi.spyOn(actualService, "foulPlayer").mockResolvedValue(undefined),
  getFlowContext: vi.spyOn(actualService, "getFlowContext").mockReturnValue(actualContext),
  getRerollArbiter: vi.spyOn(actualService, "getRerollArbiter").mockReturnValue(mockArbiter),
  performSpecialAction: vi.spyOn(actualService, "performSpecialAction").mockResolvedValue(true),
};
export const mockGameService = Object.assign(actualService, { runsCommandsLater: false, ...serviceSpies });

const confirmationSchema = z.object({ actionId: z.string(), title: z.string(), message: z.string(), cancelLabel: z.string().optional(), step: stepPromptSchema.optional() });

export function eventHandler<Event extends keyof AllEvents>(name: Event) {
  return (data: AllEvents[Event]) => { mockEventBus.emit(name, data); };
}

export async function dispatchAction(data: AllEvents[typeof GameEventNames.UI_ActionSelected]): Promise<void> {
  mockEventBus.emit(GameEventNames.UI_ActionSelected, data);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export async function answerStepPrompt(confirmed: boolean) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  const ask = eventBusSpies.emit.mock.calls.findLast(([name]) => name === GameEventNames.UI_RequestConfirmation);
  if (!ask) throw new Error("no Dodge/Rush prompt was raised");
  const payload = confirmationSchema.parse(ask[1]);
  mockEventBus.emit(GameEventNames.UI_ConfirmationResult, { confirmed, actionId: payload.actionId });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return payload;
}

function remember<Arguments extends unknown[], Result>(spy: MockInstance<Arguments, Result>): () => void {
  const implementation = spy.getMockImplementation();
  return () => {
    spy.mockReset();
    if (implementation) spy.mockImplementation(implementation);
  };
}
const initialPitch = { ...mockPitch };
const restoreFixtures = [remember(mockPitch.getContainer),
remember(mockPitch.highlightHoverSquare),
remember(mockPitch.highlightSquare),
remember(mockPitch.worldToGrid),
remember(mockPitch.getPixelPosition),
remember(mockPitch.drawJumpTargets),
remember(mockPitch.drawAssistRings),
remember(mockPitch.drawInterceptionRolls),
remember(mockPitch.drawRangeOverlay),
remember(mockPitch.drawTackleZones),
remember(mockPitch.drawMovementPath),
remember(mockPitch.drawSprintRisks),
remember(mockPitch.clearPath),
remember(mockPitch.clearHighlights),
remember(mockPitch.clearHover),
remember(mockPitch.clearPassVisualization),
remember(mockPitch.drawPassZones),
remember(mockPitch.drawPassLine),
remember(mockPitch.drawInterceptZone),
remember(mockPitch.drawHandoffTargets),
remember(mockPitch.clearLayer),
remember(mockMovementValidator.findPath),
remember(mockMovementValidator.analyzePath),
remember(mockMovementValidator.findReachableSquares),
remember(arbiterSpies.skillRerollAvailable),
remember(arbiterSpies.teamRerollAvailable),
remember(arbiterSpies.nextTeamReroll),
remember(arbiterSpies.veteranRerollAvailable),
remember(arbiterSpies.onceAvailable),
remember(arbiterSpies.teamRerollsLeftFor),
remember(serviceSpies.getActiveTeamId),
remember(serviceSpies.answerBiteTarget),
remember(serviceSpies.getState),
remember(serviceSpies.getPlayerById),
remember(serviceSpies.getAvailableMovements),
remember(serviceSpies.getMovementUsed),
remember(serviceSpies.movePlayer),
remember(serviceSpies.getPhase),
remember(serviceSpies.canActivate),
remember(serviceSpies.standUp),
remember(serviceSpies.finishActivation),
remember(serviceSpies.declareAction),
remember(serviceSpies.cancelAction),
remember(serviceSpies.previewBlock),
remember(serviceSpies.hasPlayerActed),
remember(serviceSpies.hasUsedBlitzBlock),
remember(serviceSpies.getSubPhase),
remember(serviceSpies.selectKicker),
remember(serviceSpies.kickBall),
remember(serviceSpies.executePush),
remember(serviceSpies.throwBall),
remember(serviceSpies.handOffBall),
remember(serviceSpies.getTeammates),
remember(serviceSpies.isTouchbackPending),
remember(serviceSpies.awardTouchback),
remember(serviceSpies.getKickoffEventStep),
remember(serviceSpies.selectKickoffEventPlayer),
remember(serviceSpies.moveKickoffEventPlayer),
remember(serviceSpies.placeKickoffEventPlayer),
remember(serviceSpies.getTeam),
remember(serviceSpies.getOpponents),
remember(serviceSpies.getPassController),
remember(serviceSpies.foulPlayer),
remember(serviceSpies.getFlowContext),
remember(serviceSpies.getRerollArbiter),
remember(serviceSpies.performSpecialAction),
remember(whenFlowIdle),
remember(pendingDecisionSpy)];

export function createController(): GameplayInteractionController {
  whenFlowIdle.mockResolvedValue(undefined);
  mockEventBus.removeAllListeners();
  for (const restore of restoreFixtures) { restore(); }
  Object.assign(mockPitch, initialPitch);
  Object.assign(mockGameService, serviceSpies);
  mockGameService.getState.mockReturnValue(stateWith({}));
  vi.clearAllMocks();
  mockGameService.runsCommandsLater = false;
  mockGameService.getKickoffEventStep.mockReturnValue(null);
  mockGameService.selectKickoffEventPlayer.mockReturnValue(true);
  mockGameService.moveKickoffEventPlayer.mockReturnValue(true);
  mockGameService.placeKickoffEventPlayer.mockReturnValue(true);

  mockScene.team1 = teamWith({ ...team1, players: [player1] });
  mockScene.team2 = teamWith({ ...team2, players: [player2] });

  return new GameplayInteractionController(
    { scene: mockScene,gameService: mockGameService,eventBus: mockEventBus,pitch: mockPitch,movementValidator: mockMovementValidator }  );
}
