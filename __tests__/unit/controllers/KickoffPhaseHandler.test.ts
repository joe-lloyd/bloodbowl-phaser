import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KickoffPhaseHandler } from "../../../src/game/controllers/handlers/KickoffPhaseHandler";
import { EventBus } from "../../../src/services/EventBus";
import { GameEventNames } from "../../../src/types/events";

describe("KickoffPhaseHandler single-ball lifecycle", () => {
  const eventBus = new EventBus();
  let handler: KickoffPhaseHandler;
  let scene: any;

  beforeEach(() => {
    const ballSprite = {
      x: 0,
      y: 0,
      flyTo: vi.fn(() => Promise.resolve()),
      bounce: vi.fn(() => Promise.resolve()),
    };
    scene = {
      ballSprite: null,
      pendingKickoffData: null,
      playerSprites: new Map(),
      kickingTeam: { id: "team1" },
      pitch: {
        getPixelPosition: (x: number, y: number) => ({
          x: x * 60,
          y: y * 60,
        }),
      },
      placeBallVisual: vi.fn(() => {
        scene.ballSprite = ballSprite;
      }),
      refreshDugouts: vi.fn(),
      tweens: { add: vi.fn() },
    };
    const gameService = {
      getPlayerById: vi.fn(() => null),
      getTeam: vi.fn((teamId: string) => ({
        id: teamId,
        name: teamId === "team1" ? "Reikland Reavers" : "Gouged Eye",
      })),
      startGame: vi.fn(),
    };
    handler = new KickoffPhaseHandler(scene, gameService as any, eventBus);
    handler.enter();
  });

  afterEach(() => {
    handler.exit();
    eventBus.removeAllListeners();
  });

  it("flies one ball up to hang over its landing square, then drops it there", async () => {
    const tracked: unknown[] = [];
    eventBus.on(GameEventNames.Camera_TrackBall, (data) =>
      tracked.push(data.playerId ?? "ball")
    );

    eventBus.emit(GameEventNames.BallKicked, {
      playerId: "kicker",
      targetX: 10,
      targetY: 5,
      direction: 0,
      distance: 0,
      finalX: 13,
      finalY: 7,
      isTouchback: false,
    });

    // One ball, kicked from the target square (no kicker sprite here), that
    // climbs to hang 9 m over the deviated square with the camera riding it.
    expect(scene.placeBallVisual).toHaveBeenCalledTimes(1);
    expect(scene.placeBallVisual).toHaveBeenCalledWith(10, 5, 0.3);
    expect(tracked).toEqual(["ball"]);
    expect(scene.ballSprite.flyTo).toHaveBeenLastCalledWith(
      { x: 780, y: 420 },
      expect.objectContaining({ endHeight: 9 })
    );

    // Drifting (Changing Weather) keeps it airborne over the new square.
    eventBus.emit(GameEventNames.KickoffAirbornePositionChanged, {
      x: 14,
      y: 8,
    });
    expect(scene.placeBallVisual).toHaveBeenCalledTimes(1);
    expect(scene.ballSprite.flyTo).toHaveBeenLastCalledWith(
      { x: 840, y: 480 },
      expect.objectContaining({ endHeight: 9 })
    );

    // Landing brings it down to the ground on that square, with a hop.
    eventBus.emit(GameEventNames.KickoffBallLanding, {
      landingSquare: { x: 14, y: 8 },
      isTouchback: false,
    });
    expect(scene.ballSprite.flyTo).toHaveBeenLastCalledWith(
      { x: 840, y: 480 },
      expect.objectContaining({ apex: 0 })
    );
    expect(scene.ballSprite.flyTo.mock.lastCall[1].endHeight ?? 0).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scene.ballSprite.bounce).toHaveBeenCalledTimes(1);

    eventBus.emit(GameEventNames.KickoffSequenceCompleted, {
      isTouchback: false,
    });
    expect(scene.pendingKickoffData).toBeNull();
  });

  it("updates stunned player rendering during the kickoff phase", () => {
    const sprite = { updateStatus: vi.fn() };
    scene.playerSprites.set("invaded", sprite);
    const player = {
      id: "invaded",
      status: "Stunned",
      gridPosition: { x: 5, y: 5 },
    };

    eventBus.emit(GameEventNames.PlayerStatusChanged, player as any);

    expect(sprite.updateStatus).toHaveBeenCalledTimes(1);
    expect(scene.refreshDugouts).not.toHaveBeenCalled();
  });

  it("records the kickoff table roll, event and effect as a match-log entry with team names rather than ids", () => {
    const entries: {
      category: string;
      headline: string;
      detail?: string;
      roll?: number;
    }[] = [];
    eventBus.on(GameEventNames.UI_LogEntry, (data) =>
      entries.push(
        data as {
          category: string;
          headline: string;
          detail?: string;
          roll?: number;
        }
      )
    );

    eventBus.emit(GameEventNames.KickoffResult, {
      roll: 6,
      event: "Cheering Fans" as any,
      meaning: "Both coaches roll.",
      outcome: {
        event: "Cheering Fans" as any,
        meaning: "Both coaches roll.",
        perTeam: {
          team1: ["wins the Offensive Assist"],
          team2: ["loses the roll-off"],
        },
      },
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].category).toBe("kickoff");
    expect(entries[0].headline).toBe("Cheering Fans");
    expect(entries[0].roll).toBe(6);
    expect(entries[0].detail).toContain("Both coaches roll.");
    expect(entries[0].detail).toContain(
      "Reikland Reavers: wins the Offensive Assist"
    );
    expect(entries[0].detail).toContain("Gouged Eye: loses the roll-off");
    expect(entries[0].detail).not.toContain("team1:");
  });
});

/**
 * Live game: a Charge! Blitz reached the block, the coach pressed Roll and
 * the dialog sat on "Rolling…" with no dice. Charge! runs during KICKOFF,
 * and only the play handler passed the block dialog's commands on.
 */
describe("KickoffPhaseHandler during a Charge! Blitz", () => {
  const eventBus = new EventBus();
  const gameService = {
    getState: vi.fn(() => ({ activePlayer: null })),
    getPlayerById: vi.fn(() => null),
    rollBlockDice: vi.fn(),
    resolveBlock: vi.fn(),
    teamRerollBlock: vi.fn(),
    answerReroll: vi.fn(),
    answerApothecary: vi.fn(),
  };
  let handler: KickoffPhaseHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new KickoffPhaseHandler(
      { playerSprites: new Map() } as any,
      gameService as any,
      eventBus
    );
    handler.enter();
  });

  afterEach(() => {
    handler.exit();
    eventBus.removeAllListeners();
  });

  it("rolls the block, takes the picked result and answers re-roll offers", () => {
    eventBus.emit(GameEventNames.UI_RollBlockDice, {
      attackerId: "charger",
      defenderId: "receiver",
      numDice: 2,
      isAttackerChoice: true,
    });
    eventBus.emit(GameEventNames.UI_TeamRerollBlock, { attackerId: "charger" });
    eventBus.emit(GameEventNames.UI_BlockResultSelected, {
      attackerId: "charger",
      defenderId: "receiver",
      result: { type: "pow", label: "Pow" } as any,
    });
    eventBus.emit(GameEventNames.UI_RerollResponse, {
      accept: true,
      source: "team",
    } as any);
    eventBus.emit(GameEventNames.UI_ApothecaryResponse, { accept: false });

    expect(gameService.rollBlockDice).toHaveBeenCalledWith(
      "charger",
      "receiver",
      2,
      true
    );
    expect(gameService.teamRerollBlock).toHaveBeenCalledWith("charger");
    expect(gameService.resolveBlock).toHaveBeenCalledWith(
      "charger",
      "receiver",
      { type: "pow", label: "Pow" }
    );
    expect(gameService.answerReroll).toHaveBeenCalledWith(true, "team");
    expect(gameService.answerApothecary).toHaveBeenCalledWith(false);
  });

  it("stops passing commands on once the kick-off is over", () => {
    handler.exit();
    eventBus.emit(GameEventNames.UI_RollBlockDice, {
      attackerId: "charger",
      defenderId: "receiver",
      numDice: 1,
      isAttackerChoice: true,
    });
    expect(gameService.rollBlockDice).not.toHaveBeenCalled();
  });
});
