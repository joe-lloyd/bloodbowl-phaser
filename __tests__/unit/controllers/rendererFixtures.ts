import { vi } from "vitest";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import type { GameState } from "../../../src/types/GameState";
import type { Team } from "../../../src/types/Team";
import type { OrchestratorScene, PlayScene } from "../../../src/game/controllers/handlers/scenePorts";
import { teamWith } from "./controllerFixtures";

type BallVisual = NonNullable<PlayScene["ballSprite"]>;
type PlayerVisual = PlayScene["playerSprites"] extends ReadonlyMap<string, infer Visual> ? Visual : never;

export function ballWith() {
  return {
    x: 0,
    y: 0,
    flyTo: vi.fn<Parameters<BallVisual["flyTo"]>, Promise<void>>().mockResolvedValue(undefined),
    bounce: vi.fn<Parameters<BallVisual["bounce"]>, Promise<void>>().mockResolvedValue(undefined),
  };
}

export function visualWith() {
  return {
    x: 0,
    y: 0,
    motion: Promise.resolve(),
    updateStatus: vi.fn<[], void>(),
    animateMovement: vi.fn<PlayerVisual["animateMovement"] extends (...args: infer Arguments) => unknown ? Arguments : never, Promise<void>>().mockResolvedValue(undefined),
    animateThrow: vi.fn<Parameters<PlayerVisual["animateThrow"]>, Promise<void>>().mockResolvedValue(undefined),
    animateKickGesture: vi.fn<Parameters<PlayerVisual["animateKickGesture"]>, void>(),
    animateThrowGesture: vi.fn<Parameters<PlayerVisual["animateThrowGesture"]>, void>(),
    playAction: vi.fn<Parameters<PlayerVisual["playAction"]>, void>(),
    setAlpha: vi.fn(),
    setVisible: vi.fn(),
  } satisfies PlayerVisual;
}

export function sceneWith(teams: { team1?: Partial<Team>; team2?: Partial<Team> } = {}) {
  const team1 = teamWith(teams.team1 ?? { id: "t1", name: "Reikland Reavers" });
  const team2 = teamWith(teams.team2 ?? { id: "t2", name: "Gouged Eye" });
  let ball: ReturnType<typeof ballWith> | null = null;
  const scene = {
    teams: [team1, team2] as const,
    kickingTeam: team1,
    receivingTeam: team2,
    isSetupActive: false,
    pendingKickoffData: null,
    get ballSprite(): ReturnType<typeof ballWith> | null { return ball; },
    set ballSprite(value: ReturnType<typeof ballWith> | null) { ball = value; },
    playerSprites: new Map<string, ReturnType<typeof visualWith>>(),
    pitch: {
      getPixelPosition: vi.fn((x: number, y: number) => ({ x: x * 60, y: y * 60 })),
      getPointPosition: vi.fn((x: number, y: number) => ({ x: x * 60, y: y * 60 })),
      markKickTarget: vi.fn<[{ x: number; y: number }, number], undefined>(),
      clearKickTarget: vi.fn<[], undefined>(),
    },
    tweens: { add: vi.fn(), addCounter: vi.fn() },
    input: {
      on: vi.fn<Parameters<OrchestratorScene["input"]["on"]>, unknown>(),
      off: vi.fn<Parameters<OrchestratorScene["input"]["off"]>, unknown>(),
    },
    cameras: { main: { shake: vi.fn() } },
    add: { graphics: () => ({ destroy: vi.fn(), setDepth: vi.fn(), fillStyle: vi.fn(), fillPoints: vi.fn(), fillCircle: vi.fn(), setPosition: vi.fn(), setScale: vi.fn() }) },
    createBombSprite: (x: number, y: number) => ({ x, y, rotation: 0, destroy: vi.fn() }),
    placeBallVisual: vi.fn((_x: number, _y: number): void => { scene.ballSprite = ballWith(); }),
    refreshDugouts: vi.fn<[], void>(),
    reconcileBallVisual: vi.fn<[], void>(),
    reconcilePlayerLocation: vi.fn<Parameters<OrchestratorScene["reconcilePlayerLocation"]>, void>(),
    animateBallAlong: vi.fn<Parameters<OrchestratorScene["animateBallAlong"]>, void>(),
    startPlayPhase: vi.fn<[], void>(),
    startSetupPhase: vi.fn<[], void>(),
    startKickoffPhase: vi.fn<[], void>(),
    celebrateDugout: vi.fn<Parameters<OrchestratorScene["celebrateDugout"]>, Promise<void>>().mockResolvedValue(undefined),
    disableSetupInteraction: vi.fn<[], void>(),
    enablePlacement: vi.fn<Parameters<OrchestratorScene["enablePlacement"]>, void>(),
    highlightSetupZone: vi.fn<Parameters<OrchestratorScene["highlightSetupZone"]>, void>(),
    formationManager: {
      isBuiltIn: vi.fn(() => false), deleteFormation: vi.fn(() => false),
      saveFormation: vi.fn(), getFormation: vi.fn(() => null), listAllFormations: vi.fn(() => []),
    },
    placementController: { clearPlacements: vi.fn(), syncFromTeam: vi.fn() },
  } satisfies OrchestratorScene & {pendingKickoffData:null};
  return scene;
}

export function phaseServiceWith(input: Partial<GameState> = {}) {
  const game = new HeadlessGame({ seed: 1 });
  const service = game.ctx.gameService;
  const initial = service.getState();
  const spies = {
    getState: vi.spyOn(service, "getState").mockReturnValue({ ...initial, ...input }),
    getActiveTeamId: vi.spyOn(service, "getActiveTeamId"),
    getSubPhase: vi.spyOn(service, "getSubPhase"),
    getPlayerById: vi.spyOn(service, "getPlayerById").mockReturnValue(undefined),
    getTeam: vi.spyOn(service, "getTeam"),
    rollBlockDice: vi.spyOn(service, "rollBlockDice").mockResolvedValue(undefined),
    resolveBlock: vi.spyOn(service, "resolveBlock").mockResolvedValue(undefined),
    teamRerollBlock: vi.spyOn(service, "teamRerollBlock").mockImplementation(() => undefined),
    answerReroll: vi.spyOn(service, "answerReroll").mockReturnValue(false),
    answerApothecary: vi.spyOn(service, "answerApothecary").mockReturnValue(false),
    startGame: vi.spyOn(service, "startGame").mockImplementation(() => undefined),
  };
  return Object.assign(service, { ...spies, spies });
}
