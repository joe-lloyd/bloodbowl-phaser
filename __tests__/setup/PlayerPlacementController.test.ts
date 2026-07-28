import { describe, it, expect, beforeEach, vi } from "vitest";
import { PlayerPlacementController } from "../../src/game/controllers/PlayerPlacementController";
import { SetupValidator } from "../../src/game/validators/SetupValidator";
import { Pitch } from "../../src/game/elements/Pitch";
import { Team, RosterName } from "../../src/types/Team";
import { PositionKeyWord } from "../../src/types/Player";
import { GameEventNames } from "../../src/types/events";

// Mock Pitch
const mockPitch = {
  getContainer: () => ({ x: 0, y: 0 }),
} as unknown as Pitch;

// Mock Scene
const mockScene = {
  add: {
    container: () => ({
      setDepth: vi.fn(),
      add: vi.fn(),
    }),
  },
} as unknown as Phaser.Scene;

// Mock Validator
const mockValidator = new SetupValidator();

describe("PlayerPlacementController", () => {
  let controller: PlayerPlacementController;
  let team: Team;
  let dugoutSprites: Map<string, Phaser.GameObjects.Container>;

  beforeEach(() => {
    controller = new PlayerPlacementController(
      mockScene,
      mockPitch,
      mockValidator
    );

    // Setup dummy team using builders or manual valid object
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
          cost: 50000,
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
          cost: 50000,
          number: 2,
          teamValue: 0,
        },
      ],
      maxRosterSize: 11,
      formations: [],
      treasury: 0,
      startingTreasury: 600000,
      rerolls: 0,
      rerollCost: 50000,
      cheerleaders: 0,
      apothecary: false,
      coaches: 0,
      dedicatedFans: 0,
      teamValue: 100000,
      wins: 0,
      losses: 0,
      draws: 0,
      touchdowns: 0,
      casualties: 0,
    };

    // Mock Dugout Sprites
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
      // Draggable, with a full-grid-square hit area supplied
      expect(sprite1?.setInteractive).toHaveBeenCalledWith(
        expect.objectContaining({
          draggable: true,
          hitArea: expect.objectContaining({ width: 60, height: 60 }),
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
      // Setup zone for Team 1 is x: 0-6
      const result = controller.placePlayer("p1", 7, 1);

      expect(result).toBe(false);
      expect(controller.getPlacedCount()).toBe(0);
    });

    it("should fail placement if spot occupied", () => {
      controller.placePlayer("p1", 1, 1);
      const result = controller.placePlayer("p2", 1, 1);

      expect(result).toBe(false);
      expect(controller.getPlacedCount()).toBe(1); // Still just p1
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
      // Regression test: dragging a placed player to a new legal square must
      // be a single atomic move. Emitting PlayerRemoved here used to be
      // forwarded by GameScene to the engine as a real "send to Reserves",
      // which online sent an extra remove-player command that could race the
      // place-player command's response and flash the player into the
      // Reserves box.
      // `phaser` is globally mocked (see __tests__/setup/vitest-setup.ts) with
      // `emit` as a bare vi.fn() that never actually invokes `.on()`
      // listeners, so assert directly against the emit spy's call log instead
      // of registering a listener.
      const emitSpy = controller.emit as unknown as ReturnType<typeof vi.fn>;
      const eventsNamed = (name: string) =>
        emitSpy.mock.calls.filter(([eventName]) => eventName === name);

      controller.placePlayer("p1", 1, 1);
      expect(eventsNamed(GameEventNames.PlayerRemoved)).toHaveLength(0);
      expect(eventsNamed(GameEventNames.PlayerPlaced)).toHaveLength(1);

      // The actual reposition under test: p1 is already on the pitch.
      const result = controller.placePlayer("p1", 2, 2);

      expect(result).toBe(true);
      expect(eventsNamed(GameEventNames.PlayerRemoved)).toHaveLength(0);
      const placedCalls = eventsNamed(GameEventNames.PlayerPlaced);
      expect(placedCalls).toHaveLength(2);
      expect(placedCalls[1][1]).toEqual({ playerId: "p1", x: 2, y: 2 });
    });

    it("removePlayer still emits PlayerRemoved for an actual off-pitch removal", () => {
      const emitSpy = controller.emit as unknown as ReturnType<typeof vi.fn>;
      const eventsNamed = (name: string) =>
        emitSpy.mock.calls.filter(([eventName]) => eventName === name);

      controller.placePlayer("p1", 1, 1);
      controller.removePlayer("p1");

      const removedCalls = eventsNamed(GameEventNames.PlayerRemoved);
      expect(removedCalls).toHaveLength(1);
      expect(removedCalls[0][1]).toBe("p1");
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
