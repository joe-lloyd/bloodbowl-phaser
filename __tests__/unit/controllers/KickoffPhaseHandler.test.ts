import { sceneWith, ballWith, visualWith, phaseServiceWith } from "./rendererFixtures";
import { teamWith } from "./controllerFixtures";
import { KickoffEvent } from "../../../src/game/kickoff/kickoffEvents";
import { playerWith } from "./controllerFixtures";
import { fixtureValue } from "../../../src/testing/fixtureValue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KickoffPhaseHandler } from "../../../src/game/controllers/handlers/KickoffPhaseHandler";
import { EventBus } from "../../../src/services/EventBus";
import { GameEventNames } from "../../../src/types/events";

describe("KickoffPhaseHandler single-ball lifecycle", () => {
  const eventBus = new EventBus();
  let handler: KickoffPhaseHandler;
  let scene: ReturnType<typeof sceneWith>;

  beforeEach(() => {
    const ballSprite = ballWith();
    scene = sceneWith({team1:{id:"team1"},team2:{id:"team2"}});
    scene.placeBallVisual.mockImplementation(() => { scene.ballSprite = ballSprite; });
    const gameService = phaseServiceWith();
    gameService.getTeam.mockImplementation((id: string) => teamWith({id, name: id === "team1" ? "Reikland Reavers" : "Gouged Eye"}));
    handler = new KickoffPhaseHandler(scene, gameService, eventBus);
    handler.enter();
  });

  afterEach(() => {
    handler.exit();
    eventBus.removeAllListeners();
  });

  it("flies one ball up to hang over its landing square, then drops it there", async () => {
    const tracked: unknown[] = [];
    eventBus.on(GameEventNames.Camera_TrackBall, (data) => {
      tracked.push(data.playerId ?? "ball");
    });

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

    expect(scene.placeBallVisual).toHaveBeenCalledTimes(1);
    expect(scene.placeBallVisual).toHaveBeenCalledWith(10, 5, 0.3);
    expect(tracked).toEqual(["ball"]);
    expect(fixtureValue(scene.ballSprite).flyTo).toHaveBeenLastCalledWith(
      { x: 780, y: 420 },
      expect.objectContaining({ endHeight: 9 })
    );

    eventBus.emit(GameEventNames.KickoffAirbornePositionChanged, {
      x: 14,
      y: 8,
    });
    expect(scene.placeBallVisual).toHaveBeenCalledTimes(1);
    expect(fixtureValue(scene.ballSprite).flyTo).toHaveBeenLastCalledWith(
      { x: 840, y: 480 },
      expect.objectContaining({ endHeight: 9 })
    );

    eventBus.emit(GameEventNames.KickoffBallLanding, {
      landingSquare: { x: 14, y: 8 },
      isTouchback: false,
    });
    expect(fixtureValue(scene.ballSprite).flyTo).toHaveBeenLastCalledWith(
      { x: 840, y: 480 },
      expect.objectContaining({ apex: 0 })
    );
    expect(fixtureValue(fixtureValue(scene.ballSprite).flyTo.mock.lastCall)[1].endHeight ?? 0).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fixtureValue(scene.ballSprite).bounce).toHaveBeenCalledTimes(1);

    eventBus.emit(GameEventNames.KickoffSequenceCompleted, {
      isTouchback: false,
    });
    expect(scene.pendingKickoffData).toBeNull();
  });

  it("updates stunned player rendering during the kickoff phase", () => {
    const sprite = visualWith();
    scene.playerSprites.set("invaded", sprite);
    const player = playerWith({
      id: "invaded",
      status: "Stunned",
      gridPosition: { x: 5, y: 5 },
    });

    eventBus.emit(GameEventNames.PlayerStatusChanged, player);

    expect(sprite.updateStatus).toHaveBeenCalledTimes(1);
    expect(scene.refreshDugouts).not.toHaveBeenCalled();
  });

  it("records the kickoff table roll, event and effect as a match-log entry with team names rather than ids", () => {
    const entries: {
      category: string;
      headline: string;
      detail?: string;
      roll?: number | number[];
    }[] = [];
    eventBus.on(GameEventNames.UI_LogEntry, (data) => {
      entries.push(data);
    });

    eventBus.emit(GameEventNames.KickoffResult, {
      roll: 6,
      event: KickoffEvent.CHEERING_FANS,
      meaning: "Both coaches roll.",
      outcome: {
        event: KickoffEvent.CHEERING_FANS,
        meaning: "Both coaches roll.",
        perTeam: {
          team1: ["wins the Offensive Assist"],
          team2: ["loses the roll-off"],
        },
      },
    });

    expect(entries).toHaveLength(1);
    expect(fixtureValue(entries[0]).category).toBe("kickoff");
    expect(fixtureValue(entries[0]).headline).toBe("Cheering Fans");
    expect(fixtureValue(entries[0]).roll).toBe(6);
    expect(fixtureValue(entries[0]).detail).toContain("Both coaches roll.");
    expect(fixtureValue(entries[0]).detail).toContain(
      "Reikland Reavers: wins the Offensive Assist"
    );
    expect(fixtureValue(entries[0]).detail).toContain("Gouged Eye: loses the roll-off");
    expect(fixtureValue(entries[0]).detail).not.toContain("team1:");
  });
});

describe("KickoffPhaseHandler during a Charge! Blitz", () => {
  const eventBus = new EventBus();
  const gameService = phaseServiceWith();
  let handler: KickoffPhaseHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new KickoffPhaseHandler(
      sceneWith(),
      gameService,
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
      result: { type: "pow", icon: "", label: "Pow" },
    });
    eventBus.emit(GameEventNames.UI_RerollResponse, {
      accept: true,
      source: "team",
    });
    eventBus.emit(GameEventNames.UI_ApothecaryResponse, { accept: false });

    expect(gameService.spies.rollBlockDice).toHaveBeenCalledWith(
      { attackerId: "charger", defenderId: "receiver", numDice: 2, isAttackerChoice: true }
    );
    expect(gameService.spies.teamRerollBlock).toHaveBeenCalledWith("charger");
    expect(gameService.spies.resolveBlock).toHaveBeenCalledWith(
      "charger",
      "receiver",
      { type: "pow", icon: "", label: "Pow" }
    );
    expect(gameService.spies.answerReroll).toHaveBeenCalledWith(true, "team");
    expect(gameService.spies.answerApothecary).toHaveBeenCalledWith(false);
  });

  it("stops passing commands on once the kick-off is over", () => {
    handler.exit();
    eventBus.emit(GameEventNames.UI_RollBlockDice, {
      attackerId: "charger",
      defenderId: "receiver",
      numDice: 1,
      isAttackerChoice: true,
    });
    expect(gameService.spies.rollBlockDice).not.toHaveBeenCalled();
  });
});
