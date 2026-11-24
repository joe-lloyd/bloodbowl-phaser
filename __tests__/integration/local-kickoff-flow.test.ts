import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameService } from "../../src/services/GameService.js";
import { EventBus } from "../../src/services/EventBus.js";
import { SceneOrchestrator } from "../../src/game/controllers/SceneOrchestrator.js";
import { TeamBuilder } from "../utils/test-builders.js";
import { GamePhase, SubPhase } from "../../src/types/GameState.js";
import { GameEventNames } from "../../src/types/events.js";
import { RNGService } from "../../src/services/rng/RNGService.js";
import { BlockResolutionService } from "../../src/services/BlockResolutionService.js";
import { noDelay } from "../../src/game/core/GameFlowManager.js";

function makeMockScene(team1: any, team2: any) {
  const scene: any = {
    team1,
    team2,
    kickingTeam: team1,
    receivingTeam: team2,
    isSetupActive: false,
    playerSprites: new Map(),
    pendingKickoffData: null,
    dugouts: new Map(),
    pitch: {
      getPixelPosition: (x: number, y: number) => ({ x: x * 60, y: y * 60 }),
      clearHighlights: () => {},
      clearHover: () => {},
      clearPath: () => {},
      clearKickTarget: vi.fn(),
      markKickTarget: vi.fn(),
    },
    time: {
      delayedCall: (_ms: number, cb: () => void) => {
        cb();
      },
    },
    tweens: { add: (_cfg: unknown) => {} },
    startKickoffPhase: () => {},
    startSetupPhase: () => {},
    startPlayPhase: () => {},
    placeBallVisual: () => {},
    placePlayersOnPitch: () => {},
    highlightSetupZone: () => {},
    enablePlacement: () => {},
    disableSetupInteraction: () => {},
    applyPitchRepositioning: () => {},
    refreshDugouts: () => {},
    unhighlightPlayer: () => {},
    highlightPlayer: () => {},
  };
  return scene;
}

async function driveToKickoff(
  eventBus: EventBus,
  gameService: GameService,
  team1: any,
  team2: any
) {
  eventBus.emit(GameEventNames.UI_CoinFlipComplete, {
    kickingTeam: team1,
    receivingTeam: team2,
  });
  const team1Setup = [
    [6, 3],
    [6, 5],
    [6, 7],
    [4, 2],
    [4, 4],
    [4, 6],
    [4, 8],
  ];
  for (let i = 0; i < 7; i++)
    gameService.placePlayer(
      team1.players[i].id,
      fixtureValue(fixtureValue(team1Setup[i])[0]),
      fixtureValue(fixtureValue(team1Setup[i])[1])
    );
  gameService.confirmSetup("t1");
  await new Promise((r) => setTimeout(r, 20));
  const team2Setup = team1Setup.map(([x, y]) => [19 - fixtureValue(x), y]);
  for (let i = 0; i < 7; i++)
    gameService.placePlayer(
      team2.players[i].id,
      fixtureValue(fixtureValue(team2Setup[i])[0]),
      fixtureValue(fixtureValue(team2Setup[i])[1])
    );
  gameService.confirmSetup("t2");
  await new Promise((r) => setTimeout(r, 20));
}

describe("local play: kickoff hands the turn to the receiving team", () => {
  let eventBus: EventBus;
  let gameService: GameService;
  let team1: any;
  let team2: any;
  let scene: any;
  let orchestrator: SceneOrchestrator;

  beforeEach(() => {
    eventBus = new EventBus();
    team1 = new TeamBuilder()
      .withId("t1")
      .withName("T1")
      .withPlayers(7)
      .build();
    team2 = new TeamBuilder()
      .withId("t2")
      .withName("T2")
      .withPlayers(7)
      .build();
    const rng = new RNGService(42);
    gameService = new GameService({
      eventBus: eventBus,
      team1: team1,
      team2: team2,
      rngService: rng,
      blockResolutionService: new BlockResolutionService(rng),
      initialState: GameService.createInitialState({
        team1: team1,
        team2: team2,
        startingPhase: GamePhase.SETUP,
        startingSubPhase: SubPhase.COIN_FLIP,
      }),
      delay: noDelay,
    });
    scene = makeMockScene(team1, team2);
    orchestrator = new SceneOrchestrator({ scene, gameService, eventBus });
    orchestrator.initialize();
  });

  it("starts the receiving team's turn after the kick", async () => {
    const turnsStarted: string[] = [];
    eventBus.on(GameEventNames.TurnStarted, (turn: any) =>
      turnsStarted.push(turn.teamId)
    );

    eventBus.emit(GameEventNames.UI_CoinFlipComplete, {
      kickingTeam: team1,
      receivingTeam: team2,
    });

    console.log(
      "after coin flip:",
      gameService.getPhase(),
      gameService.getSubPhase(),
      gameService.getActiveTeamId()
    );

    const team1Setup: [number, number][] = [
      [6, 3],
      [6, 5],
      [6, 7],
      [4, 2],
      [4, 4],
      [4, 6],
      [4, 8],
    ];
    for (let i = 0; i < 7; i++) {
      const [x, y] = fixtureValue(team1Setup[i]);
      const ok = gameService.placePlayer(
        fixtureValue(team1.players[i]).id,
        x,
        y
      );
      if (!ok)
        console.log(
          `t1 place ${String(i)} at (${String(x)},${String(y)}) FAILED`
        );
    }
    gameService.confirmSetup("t1");

    await new Promise((r) => setTimeout(r, 20));
    console.log(
      "after t1 confirm:",
      gameService.getPhase(),
      gameService.getSubPhase(),
      gameService.getActiveTeamId()
    );
    for (let i = 0; i < 7; i++) {
      const [px, y] = fixtureValue(team1Setup[i]);
      const x = 19 - px;
      const ok = gameService.placePlayer(
        fixtureValue(team2.players[i]).id,
        x,
        y
      );
      if (!ok)
        console.log(
          `t2 place ${String(i)} at (${String(x)},${String(y)}) FAILED`
        );
    }
    gameService.confirmSetup("t2");
    console.log(
      "after t2 confirm:",
      gameService.getPhase(),
      gameService.getSubPhase(),
      gameService.getActiveTeamId()
    );

    await new Promise((r) => setTimeout(r, 20));

    expect(gameService.getPhase()).toBe(GamePhase.KICKOFF);
    expect(scene.kickingTeam.id).toBe("t1");

    gameService.selectKicker(team1.players[0].id);
    gameService.kickBall({
      isTeam1Kicking: true,
      playerId: team1.players[0].id,
      targetX: 15,
      targetY: 7,
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(gameService.getPhase()).toBe(GamePhase.PLAY);
    expect(gameService.getActiveTeamId()).toBe("t2");
    expect(turnsStarted).toContain("t2");
  });

  it("touchback kick still hands the turn over, then awards the ball", async () => {
    let found = false;
    for (let seed = 1; seed < 60 && !found; seed++) {
      const bus = new EventBus();
      const t1 = new TeamBuilder()
        .withId("t1")
        .withName("T1")
        .withPlayers(7)
        .build();
      const t2 = new TeamBuilder()
        .withId("t2")
        .withName("T2")
        .withPlayers(7)
        .build();
      const rng = new RNGService(seed);
      const svc = new GameService({
        eventBus: bus,
        team1: t1,
        team2: t2,
        rngService: rng,
        blockResolutionService: new BlockResolutionService(rng),
        initialState: GameService.createInitialState({
          team1: t1,
          team2: t2,
          startingPhase: GamePhase.SETUP,
          startingSubPhase: SubPhase.COIN_FLIP,
        }),
        delay: noDelay,
      });
      const mockScene = makeMockScene(t1, t2);
      const orch = new SceneOrchestrator({
        scene: mockScene,
        gameService: svc,
        eventBus: bus,
      });
      orch.initialize();

      bus.on(GameEventNames.KickoffEventStepStarted, () =>
        svc.skipKickoffEventStep()
      );

      let touchback = false;
      bus.on(GameEventNames.TouchbackAwarded, () => (touchback = true));
      await driveToKickoff(bus, svc, t1, t2);
      expect(svc.getPhase()).toBe(GamePhase.KICKOFF);

      svc.kickBall({
        isTeam1Kicking: true,
        playerId: fixtureValue(t1.players[0]).id,
        targetX: 7,
        targetY: 7,
      });
      await new Promise((r) => setTimeout(r, 50));

      expect(svc.getPhase()).toBe(GamePhase.PLAY);
      expect(svc.getActiveTeamId()).toBe("t2");

      if (touchback) {
        found = true;
        expect(svc.isTouchbackPending()).toBe(true);

        expect(svc.awardTouchback(fixtureValue(t2.players[0]).id)).toBe(true);
        expect(svc.isTouchbackPending()).toBe(false);
      }
      orch.destroy();
    }
    expect(found).toBe(true);
  });
});
