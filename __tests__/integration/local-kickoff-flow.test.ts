/**
 * Regression: local (hotseat) play — after the kicking coach selects a kicker
 * and kicks, the receiving team's turn must start. Reproduces the real scene
 * wiring: SceneOrchestrator + phase handlers on a mock GameScene, driven by
 * the same events the browser flow emits (UI_CoinFlipComplete → setup →
 * confirm → kick), with NO active online match.
 */
import { describe, it, expect, beforeEach } from "vitest";
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
  // The minimal surface the orchestrator + handlers touch in this flow
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
    },
    time: { delayedCall: (_ms: number, cb: () => void) => cb() },
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
  for (let i = 0; i < 7; i++)
    gameService.placePlayer(team1.players[i].id, 5, 4 + i);
  gameService.confirmSetup("t1");
  await new Promise((r) => setTimeout(r, 20));
  for (let i = 0; i < 7; i++)
    gameService.placePlayer(team2.players[i].id, 15, 4 + i);
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
    team1 = new TeamBuilder().withId("t1").withName("T1").withPlayers(7).build();
    team2 = new TeamBuilder().withId("t2").withName("T2").withPlayers(7).build();
    const rng = new RNGService(42);
    gameService = new GameService(
      eventBus,
      team1,
      team2,
      rng,
      new BlockResolutionService(rng),
      GameService.createInitialState(team1, team2, GamePhase.SETUP, SubPhase.COIN_FLIP),
      noDelay
    );
    scene = makeMockScene(team1, team2);
    orchestrator = new SceneOrchestrator(scene, gameService, eventBus);
    orchestrator.initialize();
  });

  it("starts the receiving team's turn after the kick", async () => {
    const turnsStarted: string[] = [];
    eventBus.on(GameEventNames.TurnStarted, (turn: any) =>
      turnsStarted.push(turn.teamId)
    );

    // Local coin flip result: t1 kicks, t2 receives (what CoinFlipOverlay emits)
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

    // Kicking team sets up, then receiving team
    for (let i = 0; i < 7; i++) {
      const ok = gameService.placePlayer(team1.players[i].id, 5, 4 + i);
      if (!ok) console.log(`t1 place ${i} at (5,${4 + i}) FAILED`);
    }
    gameService.confirmSetup("t1");
    // subphase advance rides a delayed promise (100ms in the browser)
    await new Promise((r) => setTimeout(r, 20));
    console.log(
      "after t1 confirm:",
      gameService.getPhase(),
      gameService.getSubPhase(),
      gameService.getActiveTeamId()
    );
    for (let i = 0; i < 7; i++) {
      const ok = gameService.placePlayer(team2.players[i].id, 15, 4 + i);
      if (!ok) console.log(`t2 place ${i} at (15,${4 + i}) FAILED`);
    }
    gameService.confirmSetup("t2");
    console.log(
      "after t2 confirm:",
      gameService.getPhase(),
      gameService.getSubPhase(),
      gameService.getActiveTeamId()
    );

    // give any async setup->kickoff chain a tick
    await new Promise((r) => setTimeout(r, 20));

    expect(gameService.getPhase()).toBe(GamePhase.KICKOFF);
    expect(scene.kickingTeam.id).toBe("t1");

    // The kicking coach picks a kicker and kicks into the opponent half
    // (mirrors GameplayInteractionController.handleKickoffClick)
    gameService.selectKicker(team1.players[0].id);
    gameService.kickBall(true, team1.players[0].id, 15, 7);

    // kick chain: 500 + 1000 + 200ms of delays (noDelay -> immediate),
    // but they hop the microtask queue, so wait a tick
    await new Promise((r) => setTimeout(r, 50));

    expect(gameService.getPhase()).toBe(GamePhase.PLAY);
    expect(gameService.getActiveTeamId()).toBe("t2");
    expect(turnsStarted).toContain("t2");
  });

  it("touchback kick still hands the turn over, then awards the ball", async () => {
    // Sweep seeds for a kick whose deviation produces a touchback
    let found = false;
    for (let seed = 1; seed < 60 && !found; seed++) {
      const bus = new EventBus();
      const t1 = new TeamBuilder().withId("t1").withName("T1").withPlayers(7).build();
      const t2 = new TeamBuilder().withId("t2").withName("T2").withPlayers(7).build();
      const rng = new RNGService(seed);
      const svc = new GameService(
        bus,
        t1,
        t2,
        rng,
        new BlockResolutionService(rng),
        GameService.createInitialState(t1, t2, GamePhase.SETUP, SubPhase.COIN_FLIP),
        noDelay
      );
      const mockScene = makeMockScene(t1, t2);
      const orch = new SceneOrchestrator(mockScene, svc, bus);
      orch.initialize();

      let touchback = false;
      bus.on(GameEventNames.TouchbackAwarded, () => (touchback = true));
      await driveToKickoff(bus, svc, t1, t2);
      expect(svc.getPhase()).toBe(GamePhase.KICKOFF);

      // Kick just over the halfway line — deviation often leaves it in the
      // kicking half (touchback) with some seeds
      svc.kickBall(true, t1.players[0].id, 7, 7);
      await new Promise((r) => setTimeout(r, 50));

      // Whatever the deviation did, the receiving team's turn must start
      expect(svc.getPhase()).toBe(GamePhase.PLAY);
      expect(svc.getActiveTeamId()).toBe("t2");

      if (touchback) {
        found = true;
        expect(svc.isTouchbackPending()).toBe(true);
        // Receiving coach hands the ball to a standing player (local click path)
        expect(svc.awardTouchback(t2.players[0].id)).toBe(true);
        expect(svc.isTouchbackPending()).toBe(false);
      }
      orch.destroy();
    }
    expect(found).toBe(true);
  });
});
