import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect, beforeEach, vi } from "vitest";
import Phaser from "phaser";
import { PlayerPlacementController } from "../../src/game/controllers/PlayerPlacementController";
import { SetupValidator } from "../../src/game/validators/SetupValidator";
import { Pitch } from "../../src/game/elements/Pitch";
import { type Team, RosterName } from "../../src/types/Team";
import { PositionKeyWord } from "../../src/types/Player";
import { GameEventNames } from "../../src/types/events";
import { ISO } from "../../src/game/elements/GridUtils";
import { squareHitAreaContains } from "../../src/game/elements/InteractiveHitArea";

const figureSprite = () =>
  ({
    displayOriginX: 28,
    displayOriginY: 40,
    input: {
      enabled: true,
      hitArea: { width: 56, height: 82 },
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    },
    setInteractive: vi.fn(),
    disableInteractive: vi.fn(),
    setAlpha: vi.fn(),
    setDepth: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }) as unknown as Phaser.GameObjects.Container;

const dugoutSprite = (home: { x: number; y: number }) => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const data = new Map<string, unknown>();
  const sprite = {
    ...home,
    displayOriginX: 0,
    displayOriginY: 0,
    input: {},
    setInteractive: vi.fn(),
    disableInteractive: vi.fn(),
    setAlpha: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
    }),
    off: vi.fn((event: string) => handlers.delete(event)),
    setData: vi.fn((key: string, value: unknown) => data.set(key, value)),
    getData: vi.fn((key: string) => data.get(key)),
    getWorldTransformMatrix: () => ({ tx: sprite.x, ty: sprite.y }),
    fire: (event: string, ...args: unknown[]) =>
      handlers.get(event)?.(...args),
  };
  return sprite;
};


const mockPitch = {
  getContainer: () => ({ x: 0, y: 0 }),
} as unknown as Pitch;

const mockScene = {
  add: {
    container: () => ({
      setDepth: vi.fn(),
      add: vi.fn(),
    }),
  },
} as unknown as Phaser.Scene;

const mockValidator = new SetupValidator();

describe("PlayerPlacementController", () => {
  let controller: PlayerPlacementController;
  let team: Team;
  let dugoutSprites: Map<string, Phaser.GameObjects.Container>;

  beforeEach(() => {
    controller = new PlayerPlacementController({
      _scene: mockScene,
      pitch: mockPitch,
      validator: mockValidator,
    });

    team = {
      id: "team-1",
      name: "Team 1",
      rosterName: RosterName.HUMAN,
      colors: { primary: 0xff0000, secondary: 0xffffff },
      players: [
        {
          id: "p1",
          playerName: "Player 1",
          positionName: PositionKeyWord.LINEMAN,
          keywords: [],
          teamId: "team-1",
          stats: { MA: 6, ST: 3, AG: 3, PA: 4, AV: 8 },
          skills: [],
          baseStats: { MA: 6, ST: 3, AG: 3, PA: 4, AV: 8 },
          spp: 0,
          level: 1,
          status: "Reserve",
          injuries: [],
          hasActed: false,
          cost: 50_000,
          number: 1,
          teamValue: 0,
        },
        {
          id: "p2",
          playerName: "Player 2",
          positionName: PositionKeyWord.LINEMAN,
          keywords: [],
          teamId: "team-1",
          stats: { MA: 6, ST: 3, AG: 3, PA: 4, AV: 8 },
          skills: [],
          baseStats: { MA: 6, ST: 3, AG: 3, PA: 4, AV: 8 },
          spp: 0,
          level: 1,
          status: "Reserve",
          injuries: [],
          hasActed: false,
          cost: 50_000,
          number: 2,
          teamValue: 0,
        },
      ],
      maxRosterSize: 11,
      formations: [],
      treasury: 0,
      startingTreasury: 600_000,
      rerolls: 0,
      rerollCost: 50_000,
      cheerleaders: 0,
      apothecary: false,
      coaches: 0,
      dedicatedFans: 0,
      teamValue: 100_000,
      wins: 0,
      losses: 0,
      draws: 0,
      touchdowns: 0,
      casualties: 0,
    };

    dugoutSprites = new Map();
    const mockSprite1 = {
      setInteractive: vi.fn(),
      disableInteractive: vi.fn(),
      setAlpha: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as Phaser.GameObjects.Container;
    const mockSprite2 = {
      setInteractive: vi.fn(),
      disableInteractive: vi.fn(),
      setAlpha: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as Phaser.GameObjects.Container;

    dugoutSprites.set("p1", mockSprite1);
    dugoutSprites.set("p2", mockSprite2);
  });

  describe("enablePlacement", () => {
    it("should enable interactivity for team players", () => {
      controller.enablePlacement(team, true, dugoutSprites);

      const sprite1 = dugoutSprites.get("p1");

      expect(sprite1?.setInteractive).toHaveBeenCalledWith(
        expect.objectContaining({
          draggable: true,
          hitArea: expect.objectContaining({
            width: ISO.tileWidth,
            height: ISO.tileHeight,
          }),
          hitAreaCallback: squareHitAreaContains,
        })
      );
      expect(sprite1?.setAlpha).toHaveBeenCalledWith(1);
    });

    it("should clear placed players for new session", () => {
      controller.enablePlacement(team, true, dugoutSprites);
      controller.placePlayer("p1", 1, 1);
      expect(controller.getPlacedCount()).toBe(1);

      controller.enablePlacement(team, true, dugoutSprites);
      expect(controller.getPlacedCount()).toBe(0);
    });
  });

  describe("setup hit areas", () => {
    it("gives a sprite the dugout adds during setup the square hit area", () => {
      controller.enablePlacement(team, true, dugoutSprites);

      const added = figureSprite();
      dugoutSprites.set("p2", added);

      controller.applySetupHitAreas();

      expect(fixtureValue(added.input).hitArea).toMatchObject({
        width: ISO.tileWidth,
        height: ISO.tileHeight,
      });
      expect(fixtureValue(added.input).hitAreaCallback).toBe(
        squareHitAreaContains
      );
    });

    it("picks dugout sprites by their figure again once setup ends", () => {
      const reserve = figureSprite();
      dugoutSprites.set("p1", reserve);
      controller.enablePlacement(team, true, dugoutSprites);
      expect(fixtureValue(reserve.input).hitAreaCallback).toBe(
        squareHitAreaContains
      );
      const enableCalls = vi.mocked(reserve.setInteractive).mock.calls.length;

      controller.restoreFigureHitAreas();

      expect(fixtureValue(reserve.input).hitArea).toMatchObject({
        width: 56,
        height: 82,
      });
      expect(fixtureValue(reserve.input).hitAreaCallback).toBe(
        Phaser.Geom.Rectangle.Contains
      );

      expect(reserve.setInteractive).toHaveBeenCalledTimes(enableCalls);
      expect(fixtureValue(reserve.input).enabled).toBe(true);
    });

    it("restores the figure hit area when placement is disabled", () => {
      const reserve = figureSprite();
      dugoutSprites.set("p1", reserve);
      dugoutSprites.set("p2", figureSprite());
      controller.enablePlacement(team, true, dugoutSprites);

      controller.disablePlacement();

      expect(fixtureValue(reserve.input).hitArea).toMatchObject({
        width: 56,
        height: 82,
      });
    });

    it("leaves dugout sprites alone outside setup", () => {
      const reserve = figureSprite();
      dugoutSprites.set("p1", reserve);
      const before = fixtureValue(reserve.input).hitArea;

      controller.applySetupHitAreas();

      expect(fixtureValue(reserve.input).hitArea).toBe(before);
    });
  });

  describe("placePlayer", () => {
    beforeEach(() => {
      controller.enablePlacement(team, true, dugoutSprites);
    });

    it("should place player if position is valid", () => {
      const result = controller.placePlayer("p1", 1, 1);

      expect(result).toBe(true);
      expect(controller.getPlacedCount()).toBe(1);

      const placements = controller.getPlacements();
      expect(placements[0]).toEqual({ playerId: "p1", x: 1, y: 1 });
    });

    it("should fail placement if outside setup zone (Team 1)", () => {
      const result = controller.placePlayer("p1", 7, 1);

      expect(result).toBe(false);
      expect(controller.getPlacedCount()).toBe(0);
    });

    it("should fail placement if spot occupied", () => {
      controller.placePlayer("p1", 1, 1);
      const result = controller.placePlayer("p2", 1, 1);

      expect(result).toBe(false);
      expect(controller.getPlacedCount()).toBe(1);
    });

    it("should move player if already placed", () => {
      controller.placePlayer("p1", 1, 1);
      const result = controller.placePlayer("p1", 2, 2);

      expect(result).toBe(true);
      expect(controller.getPlacedCount()).toBe(1);

      const placements = controller.getPlacements();
      expect(placements[0]).toEqual({ playerId: "p1", x: 2, y: 2 });
    });

    it("should emit only PlayerPlaced (never PlayerRemoved) when repositioning an already-placed player", () => {
      const emitSpy = controller.emit as unknown as ReturnType<typeof vi.fn>;
      const eventsNamed = (name: string) =>
        emitSpy.mock.calls.filter(([eventName]) => eventName === name);

      controller.placePlayer("p1", 1, 1);
      expect(eventsNamed(GameEventNames.PlayerRemoved)).toHaveLength(0);
      expect(eventsNamed(GameEventNames.PlayerPlaced)).toHaveLength(1);

      const result = controller.placePlayer("p1", 2, 2);

      expect(result).toBe(true);
      expect(eventsNamed(GameEventNames.PlayerRemoved)).toHaveLength(0);
      const placedCalls = eventsNamed(GameEventNames.PlayerPlaced);
      expect(placedCalls).toHaveLength(2);
      expect(fixtureValue(placedCalls[1])[1]).toEqual({
        playerId: "p1",
        x: 2,
        y: 2,
      });
    });

    it("removePlayer still emits PlayerRemoved for an actual off-pitch removal", () => {
      const emitSpy = controller.emit as unknown as ReturnType<typeof vi.fn>;
      const eventsNamed = (name: string) =>
        emitSpy.mock.calls.filter(([eventName]) => eventName === name);

      controller.placePlayer("p1", 1, 1);
      controller.removePlayer("p1");

      const removedCalls = eventsNamed(GameEventNames.PlayerRemoved);
      expect(removedCalls).toHaveLength(1);
      expect(fixtureValue(removedCalls[0])[1]).toBe("p1");
      expect(controller.getPlacedCount()).toBe(0);
    });
  });

  describe("loadFormation", () => {
    beforeEach(() => {
      controller.enablePlacement(team, true, dugoutSprites);
    });

    it("should load valid formation", () => {
      const formation = [
        { playerId: "p1", x: 0, y: 0 },
        { playerId: "p2", x: 0, y: 2 },
      ];

      controller.loadFormation(formation);
      expect(controller.getPlacedCount()).toBe(2);
    });
  });
});

const dropOn = (
  square: { x: number; y: number },
  isAvailable?: (playerId: string) => boolean
) => {
  const pitch = {
    getContainer: () => ({ x: 0, y: 0 }),
    worldToGrid: () => square,
  } as unknown as Pitch;
  const controller = new PlayerPlacementController({
    _scene: {} as Phaser.Scene,
    pitch,
    validator: new SetupValidator(),
    ...(isAvailable && { isAvailable }),
  });
  const sprite = dugoutSprite({ x: 900, y: 40 });
  const team = {
    id: "team-1",
    players: [{ id: "p1", teamId: "team-1", status: "Reserve" }],
  } as unknown as Team;
  controller.enablePlacement(
    team,
    true,
    new Map([["p1", sprite as unknown as Phaser.GameObjects.Container]])
  );
  sprite.fire("dragstart");

  sprite.x = 300;
  sprite.y = 200;
  sprite.fire("dragend", { worldX: 300, worldY: 200 });
  return sprite;
};


describe("PlayerPlacementController dugout drops", () => {
  it("leaves a placed player's dugout sprite where it was dropped", () => {
    const sprite = dropOn({ x: 1, y: 1 });
    expect({ x: sprite.x, y: sprite.y }).toEqual({ x: 300, y: 200 });
  });

  it("snaps a refused drop back to the dugout slot", () => {
    const sprite = dropOn({ x: 20, y: 5 });
    expect({ x: sprite.x, y: sprite.y }).toEqual({ x: 900, y: 40 });
  });

  it("snaps a knocked-out reserve back even from an empty square", () => {
    const sprite = dropOn({ x: 1, y: 1 }, (playerId) => playerId !== "p1");
    expect({ x: sprite.x, y: sprite.y }).toEqual({ x: 900, y: 40 });
  });
});
