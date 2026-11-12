import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameScene } from "../../../src/scenes/GameScene";
import { EventBus } from "../../../src/services/EventBus";
import { GameEventNames } from "../../../src/types/events";
import { PlayerStatus } from "../../../src/types/Player";

/**
 * The carrier marker (gold ring and ball badge) is shown only on the player
 * who holds the ball. A touchdown ends the drive: the engine takes the ball
 * off the pitch and emits RefreshBoard, and from then until the next kick
 * nobody holds the ball, so nobody may be marked. The scorer used to keep
 * their marker until the kick-off.
 *
 * Drives GameScene's real event wiring with stand-in sprites, so it runs
 * without a browser or a Phaser canvas.
 */

type FakeSprite = {
  carrying: boolean;
  setCarryingBall: ReturnType<typeof vi.fn>;
  setActivated: ReturnType<typeof vi.fn>;
  setTeamTurnBorder: ReturnType<typeof vi.fn>;
  resetOrientation: ReturnType<typeof vi.fn>;
  setRemoteSelected: ReturnType<typeof vi.fn>;
};

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // Dugout/pitch placement is not what this test is about.
      refreshDugouts: vi.fn(),
      placeBallVisual: vi.fn(),
    });
    scene["initializeControllers"]();
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

    // GameService.resetDriveState: ball off the pitch, then RefreshBoard.
    state.ballPosition = null;
    eventBus.emit(GameEventNames.RefreshBoard);

    expect(marked()).toEqual([]);
    expect(ballSprite.destroy).toHaveBeenCalledTimes(1);
    expect(scene.ballSprite).toBeNull();
  });

  it("marks the new carrier again once the ball is back in someone's hands", () => {
    scene.reconcileBallVisual();
    state.ballPosition = null;
    eventBus.emit(GameEventNames.RefreshBoard);
    expect(marked()).toEqual([]);

    // Next drive: the defender's team catches the kick.
    state.ballPosition = { x: 15, y: 6 };
    scene.reconcileBallVisual();
    expect(marked()).toEqual(["defender"]);
  });
});
