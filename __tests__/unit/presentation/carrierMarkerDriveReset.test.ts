import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { GameScene } from "../../../src/scenes/GameScene";
import { EventBus } from "../../../src/services/EventBus";
import { GameEventNames } from "../../../src/types/events";
import { PlayerStatus } from "../../../src/types/Player";

interface FakeSprite {
  carrying: boolean;
  setCarryingBall: Mock<[carrying: boolean], void>;
  setActivated: ReturnType<typeof vi.fn>;
  setTeamTurnBorder: ReturnType<typeof vi.fn>;
  resetOrientation: ReturnType<typeof vi.fn>;
  setRemoteSelected: ReturnType<typeof vi.fn>;
}

function fakeSprite(): FakeSprite {
  const sprite = {
    carrying: false,
    setActivated: vi.fn(),
    setTeamTurnBorder: vi.fn(),
    resetOrientation: vi.fn(),
    setRemoteSelected: vi.fn(),
  } as unknown as FakeSprite;
  sprite.setCarryingBall = vi.fn((carrying: boolean) => {
    sprite.carrying = carrying;
  });
  return sprite;
}

const player = (id: string, teamId: string, x: number, y: number) => ({
  id,
  teamId,
  status: PlayerStatus.ACTIVE,
  gridPosition: { x, y },
});

describe("carrier marker across the touchdown reset", () => {
  const eventBus = new EventBus();
  let scene: any;
  let state: { ballPosition: { x: number; y: number } | null };
  let ballSprite: { destroy: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    const scorer = player("scorer", "team1", 19, 5);
    const defender = player("defender", "team2", 15, 6);
    state = { ballPosition: { x: 19, y: 5 } };
    ballSprite = { destroy: vi.fn() };

    scene = Object.create(GameScene.prototype);
    Object.assign(scene, {
      eventBus,
      busSubscriptions: [],
      sys: { settings: { status: 5, key: "GameScene" } },
      gameService: { getState: () => state },
      team1: { id: "team1", players: [scorer] },
      team2: { id: "team2", players: [defender] },
      playerSprites: new Map([
        ["scorer", fakeSprite()],
        ["defender", fakeSprite()],
      ]),
      ballSprite,
      pitch: { getContainer: () => ({ x: 0, y: 0 }) },

      refreshDugouts: vi.fn(),
      placeBallVisual: vi.fn(),
    });
    scene.initializeControllers();
  });

  afterEach(() => {
    eventBus.removeAllListeners();
  });

  const marked = () =>
    [...scene.playerSprites.entries()]
      .filter(([, sprite]) => (sprite as FakeSprite).carrying)
      .map(([id]) => id);

  it("marks only the player holding the ball during play", () => {
    scene.reconcileBallVisual();
    expect(marked()).toEqual(["scorer"]);
  });

  it("clears the scorer's marker when the drive is reset after a touchdown", () => {
    scene.reconcileBallVisual();
    expect(marked()).toEqual(["scorer"]);

    state.ballPosition = null;
    eventBus.emit(GameEventNames.RefreshBoard, undefined);

    expect(marked()).toEqual([]);
    expect(ballSprite.destroy).toHaveBeenCalledTimes(1);
    expect(scene.ballSprite).toBeNull();
  });

  it("marks the new carrier again once the ball is back in someone's hands", () => {
    scene.reconcileBallVisual();
    state.ballPosition = null;
    eventBus.emit(GameEventNames.RefreshBoard, undefined);
    expect(marked()).toEqual([]);

    state.ballPosition = { x: 15, y: 6 };
    scene.reconcileBallVisual();
    expect(marked()).toEqual(["defender"]);
  });
});
