import { describe, it, expect, beforeEach, vi } from "vitest";
import { ThrowController } from "../../../src/game/controllers/ThrowController";
import { Player, PlayerStatus } from "../../../src/types/Player";
import { GameEventNames } from "../../../src/types/events";

describe("ThrowController", () => {
  let controller: ThrowController;
  let mockEventBus;
  let player: Player;

  beforeEach(() => {
    mockEventBus = {
      emit: vi.fn(),
    };

    controller = new ThrowController(mockEventBus);

    player = {
      id: "player1",
      teamId: "team1",
      playerName: "Test Thrower",
      gridPosition: { x: 10, y: 5 },
      stats: { MA: 6, ST: 3, AG: 3, PA: 3, AV: 8 },
      status: PlayerStatus.ACTIVE,
    } as Player;
  });

  describe("Distance Calculation", () => {
    it("should calculate Chebyshev distance correctly", () => {
      const from = { x: 5, y: 5 };
      const to = { x: 8, y: 7 };

      const distance = controller.calculateDistance(from, to);
      expect(distance).toBe(3); // max(3, 2) = 3
    });

    it("should handle vertical distance", () => {
      const from = { x: 5, y: 5 };
      const to = { x: 5, y: 10 };

      const distance = controller.calculateDistance(from, to);
      expect(distance).toBe(5);
    });

    it("should handle horizontal distance", () => {
      const from = { x: 5, y: 5 };
      const to = { x: 12, y: 5 };

      const distance = controller.calculateDistance(from, to);
      expect(distance).toBe(7);
    });
  });

  describe("Measure Range", () => {
    it("should identify Quick Pass (0-3 squares)", () => {
      const from = { x: 5, y: 5 };
      const to = { x: 7, y: 5 };

      const range = controller.measureRange(from, to);
      expect(range.type).toBe("Quick Pass");
      expect(range.modifier).toBe(0);
    });

    it("should identify Short Pass (4-6 squares)", () => {
      const from = { x: 5, y: 5 };
      const to = { x: 10, y: 5 };

      const range = controller.measureRange(from, to);
      expect(range.type).toBe("Short Pass");
      expect(range.modifier).toBe(-1);
    });

    it("should identify Long Pass (7-10 squares)", () => {
      const from = { x: 5, y: 5 };
      const to = { x: 13, y: 5 };

      const range = controller.measureRange(from, to);
      expect(range.type).toBe("Long Pass");
      expect(range.modifier).toBe(-2);
    });

    it("should identify Long Bomb (11+ squares)", () => {
      const from = { x: 5, y: 5 };
      const to = { x: 18, y: 5 };

      const range = controller.measureRange(from, to);
      expect(range.type).toBe("Long Bomb");
      expect(range.modifier).toBe(-3);
    });
  });

  describe("Pass Modifiers", () => {
    it("should apply range modifier", () => {
      const passRange: PassRange = {
        type: "Short Pass",
        modifier: -1,
        minDistance: 4,
        maxDistance: 6,
      };

      const modifiers = controller.calculatePassModifiers(passRange, 0);
      expect(modifiers).toBe(-1);
    });

    it("should apply marking opponent modifiers", () => {
      const passRange: PassRange = {
        type: "Quick Pass",
        modifier: 0,
        minDistance: 0,
        maxDistance: 3,
      };

      const modifiers = controller.calculatePassModifiers(passRange, 2);
      expect(modifiers).toBe(-2);
    });

    it("should stack range and marking modifiers", () => {
      const passRange: PassRange = {
        type: "Long Pass",
        modifier: -2,
        minDistance: 7,
        maxDistance: 10,
      };

      const modifiers = controller.calculatePassModifiers(passRange, 1);
      expect(modifiers).toBe(-3); // -2 range, -1 marking
    });
  });

  describe("Test Accuracy", () => {
    const quickPass: PassRange = {
      type: "Quick Pass",
      modifier: 0,
      minDistance: 0,
      maxDistance: 3,
    };

    it("should succeed on natural 6", () => {
      vi.spyOn(Math, "random").mockReturnValue(5 / 6); // Roll 6

      const result = controller.testAccuracy(player, quickPass, 0);

      expect(result.accurate).toBe(true);
      expect(result.fumbled).toBe(false);
      expect(result.roll).toBe(6);
    });

    it("should fumble on natural 1", () => {
      vi.spyOn(Math, "random").mockReturnValue(0); // Roll 1

      const result = controller.testAccuracy(player, quickPass, 0);

      expect(result.accurate).toBe(false);
      expect(result.fumbled).toBe(true);
      expect(result.roll).toBe(1);
    });

    it("should be accurate when roll meets target", () => {
      vi.spyOn(Math, "random").mockReturnValue(2 / 6); // Roll 3
      player.stats.PA = 3;

      const result = controller.testAccuracy(player, quickPass, 0);

      expect(result.accurate).toBe(true);
      expect(result.fumbled).toBe(false);
    });

    it("should be inaccurate when roll is below target", () => {
      vi.spyOn(Math, "random").mockReturnValue(1 / 6); // Roll 2
      player.stats.PA = 3;

      const result = controller.testAccuracy(player, quickPass, 0);

      expect(result.accurate).toBe(false);
      expect(result.fumbled).toBe(false);
    });

    it("should fumble when effective roll is 1 or less", () => {
      vi.spyOn(Math, "random").mockReturnValue(1 / 6); // Roll 2
      player.stats.PA = 3;

      const longBomb: PassRange = {
        type: "Long Bomb",
        modifier: -3,
        minDistance: 11,
        maxDistance: 999,
      };

      const result = controller.testAccuracy(player, longBomb, 1);
      // Roll 2 + (-3 range) + (-1 marking) = -2, which is <= 1

      expect(result.fumbled).toBe(true);
    });
  });

  describe("Attempt Pass", () => {
    it("should emit pass events for accurate pass", () => {
      vi.spyOn(Math, "random").mockReturnValue(5 / 6); // Roll 6 (always accurate)

      const result = controller.attemptPass(
        player,
        { x: 5, y: 5 },
        { x: 7, y: 5 },
        0
      );

      expect(result.accurate).toBe(true);
      expect(result.fumbled).toBe(false);
      expect(result.passType).toBe("Quick Pass");
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.PassAttempted,
        expect.objectContaining({
          accurate: true,
        })
      );
    });

    it("should scatter ball for inaccurate pass", () => {
      // Mock for pass roll (2) and scatter direction/distance
      const randomMock = vi.spyOn(Math, "random");
      randomMock.mockReturnValueOnce(1 / 6); // Roll 2, inaccurate for PA 3+
      randomMock.mockReturnValueOnce(0.5); // Scatter direction
      randomMock.mockReturnValueOnce(0.5); // Scatter distance

      const result = controller.attemptPass(
        player,
        { x: 5, y: 5 },
        { x: 7, y: 5 },
        0
      );

      expect(result.accurate).toBe(false);
      expect(result.fumbled).toBe(false);
      // Ball should scatter, so final position is defined
      expect(result.finalPosition).toBeDefined();
    });

    it("should scatter from thrower for fumbled pass", () => {
      vi.spyOn(Math, "random").mockReturnValue(0); // Roll 1 (fumble)

      const result = controller.attemptPass(
        player,
        { x: 5, y: 5 },
        { x: 7, y: 5 },
        0
      );

      expect(result.fumbled).toBe(true);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.PassFumbled,
        expect.any(Object)
      );
    });

    it("should emit dice roll event", () => {
      vi.spyOn(Math, "random").mockReturnValue(2 / 6); // Roll 3

      controller.attemptPass(player, { x: 5, y: 5 }, { x: 7, y: 5 }, 0);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          rollType: "Pass",
          diceType: "d6",
        })
      );
    });
  });

  describe("Scatter Ball", () => {
    it("should scatter in random direction", () => {
      vi.spyOn(Math, "random").mockReturnValue(0); // Direction 1

      const result = controller.scatterBall({ x: 10, y: 5 });

      expect(result).toBeDefined();
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.y).toBeGreaterThanOrEqual(0);
    });

    it("should keep ball within pitch bounds", () => {
      const result = controller.scatterBall({ x: 0, y: 0 });

      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.x).toBeLessThanOrEqual(25);
      expect(result.y).toBeGreaterThanOrEqual(0);
      expect(result.y).toBeLessThanOrEqual(14);
    });

    it("should emit scatter event", () => {
      controller.scatterBall({ x: 10, y: 5 });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          rollType: "Pass Scatter",
          diceType: "d8",
        })
      );
    });
  });

  describe("Interception Checks", () => {
    it("should identify interceptors along pass path", () => {
      const from = { x: 5, y: 5 };
      const to = { x: 15, y: 5 };

      const opponents: Player[] = [
        {
          id: "opp1",
          gridPosition: { x: 10, y: 5 }, // On the path
          status: PlayerStatus.ACTIVE,
        } as Player,
      ];

      const interceptors = controller.checkInterceptions(
        from,
        to,
        opponents,
        true
      );

      expect(interceptors.length).toBeGreaterThan(0);
      expect(interceptors[0].playerId).toBe("opp1");
    });

    it("should apply -3 modifier for accurate passes", () => {
      const from = { x: 5, y: 5 };
      const to = { x: 15, y: 5 };

      const opponents: Player[] = [
        {
          id: "opp1",
          gridPosition: { x: 10, y: 5 },
          status: PlayerStatus.ACTIVE,
        } as Player,
      ];

      const interceptors = controller.checkInterceptions(
        from,
        to,
        opponents,
        true
      );

      expect(interceptors[0].modifier).toBe(-3);
    });

    it("should apply -2 modifier for inaccurate passes", () => {
      const from = { x: 5, y: 5 };
      const to = { x: 15, y: 5 };

      const opponents: Player[] = [
        {
          id: "opp1",
          gridPosition: { x: 10, y: 5 },
          status: PlayerStatus.ACTIVE,
        } as Player,
      ];

      const interceptors = controller.checkInterceptions(
        from,
        to,
        opponents,
        false
      );

      expect(interceptors[0].modifier).toBe(-2);
    });

    it("should ignore prone opponents", () => {
      const from = { x: 5, y: 5 };
      const to = { x: 15, y: 5 };

      const opponents: Player[] = [
        {
          id: "opp1",
          gridPosition: { x: 10, y: 5 },
          status: PlayerStatus.PRONE,
        } as Player,
      ];

      const interceptors = controller.checkInterceptions(
        from,
        to,
        opponents,
        true
      );

      expect(interceptors.length).toBe(0);
    });
  });

  describe("Attempt Interception", () => {
    it("should succeed on natural 6", () => {
      vi.spyOn(Math, "random").mockReturnValue(5 / 6); // Roll 6

      const result = controller.attemptInterception(player, -3, 0);

      expect(result).toBe(true);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          rollType: "Interception",
          passed: true,
        })
      );
    });

    it("should fail when roll is below target", () => {
      vi.spyOn(Math, "random").mockReturnValue(0); // Roll 1
      player.stats.AG = 3;

      const result = controller.attemptInterception(player, -3, 0);

      expect(result).toBe(false);
    });

    it("should apply modifiers correctly", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.16); // Roll 2
      player.stats.AG = 3;

      const result = controller.attemptInterception(player, -3, 1);
      // Roll 2 + (-3 accurate) + (-1 marking) = -2, need 3+

      expect(result).toBe(false);
    });
  });

  describe("Get Squares in Range", () => {
    it("should return all squares in Quick Pass range", () => {
      const from = { x: 10, y: 5 };
      const squares = controller.getSquaresInRange(from, "Quick Pass");

      expect(squares.length).toBeGreaterThan(0);
      squares.forEach((square) => {
        const distance = Math.max(
          Math.abs(square.x - from.x),
          Math.abs(square.y - from.y)
        );
        expect(distance).toBeLessThanOrEqual(3);
      });
    });

    it("should return empty array for invalid pass type", () => {
      const from = { x: 10, y: 5 };
      const squares = controller.getSquaresInRange(from, "Invalid" as PassType);

      expect(squares.length).toBe(0);
    });
  });

  describe("Get All Ranges", () => {
    it("should return map of all pass ranges", () => {
      const from = { x: 10, y: 5 };
      const ranges = controller.getAllRanges(from);

      expect(ranges.size).toBe(4);
      expect(ranges.has("Quick Pass")).toBe(true);
      expect(ranges.has("Short Pass")).toBe(true);
      expect(ranges.has("Long Pass")).toBe(true);
      expect(ranges.has("Long Bomb")).toBe(true);
    });
  });
});
