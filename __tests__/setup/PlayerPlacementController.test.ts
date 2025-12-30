import { describe, it, expect, beforeEach, vi } from "vitest";
import { PlayerPlacementController } from "../../src/game/controllers/PlayerPlacementController";
import { SetupValidator } from "../../src/game/validators/SetupValidator";
import { Pitch } from "../../src/game/elements/Pitch";
import { Team, RosterName } from "../../src/types/Team";
import { PositionKeyWord } from "../../src/types/Player";

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
      expect(sprite1?.setInteractive).toHaveBeenCalledWith({ draggable: true });
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
  });

  describe("loadFormation", () => {
    beforeEach(() => {
      controller.enablePlacement(team, true, dugoutSprites);
    });

    it("should load valid formation", () => {
      const formation = [
        { playerId: "p1", x: 0, y: 0 },
        { playerId: "p2", x: 0, y: 1 },
      ];

      controller.loadFormation(formation);
      expect(controller.getPlacedCount()).toBe(2);
    });
  });
});
