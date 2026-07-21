import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  PassController,
  PassRange,
  PassType,
} from "../../../src/game/controllers/PassController";
import { Player, PlayerStatus } from "../../../src/types/Player";
import { GameEventNames } from "../../../src/types/events";
import { BallMovementController } from "../../../src/game/controllers/BallMovementController";

describe("PassController", () => {
  let controller: PassController;
  let mockEventBus: any;
  let mockMovementController: any;
  let mockDiceController: any;
  let player: Player;

  beforeEach(() => {
    mockEventBus = {
      emit: vi.fn(),
    };

    mockMovementController = {
      scatter: vi.fn().mockReturnValue([{ x: 0, y: 0 }]),
      bounce: vi.fn(),
      deviate: vi.fn(),
    };

    mockDiceController = {
      rollSkillCheck: vi.fn(),
    };

    controller = new PassController(
      mockEventBus,
      mockMovementController,
      mockDiceController
    );

    player = {
      id: "player1",
      teamId: "team1",
      playerName: "Test Thrower",
      gridPosition: { x: 10, y: 5 },
      stats: { MA: 6, ST: 3, AG: 3, PA: 3, AV: 8 },
      status: PlayerStatus.ACTIVE,
    } as Player;
  });

  describe("Measure Range", () => {
    it("should identify Quick Pass (0-3 squares)", () => {
      const from = { x: 5, y: 5 };
      const to = { x: 7, y: 5 };
      const range = controller.measureRange(from, to);
      expect(range.type).toBe("Quick Pass");
      expect(range.modifier).toBe(0);
    });

    it("should identify Long Bomb (11+ squares)", () => {
      const from = { x: 5, y: 5 };
      const to = { x: 18, y: 5 };
      const range = controller.measureRange(from, to);
      expect(range.type).toBe("Long Bomb");
      expect(range.modifier).toBe(-3);
    });

    it("uses the radial range ruler, not Chebyshev bands, for diagonals", () => {
      // (3,3) offset is Chebyshev distance 3 (would be a Quick Pass) but the
      // range ruler reaches ~4.2 squares, so it is a Short Pass (-1).
      const range = controller.measureRange({ x: 13, y: 13 }, { x: 16, y: 16 });
      expect(range.type).toBe("Short Pass");
      expect(range.modifier).toBe(-1);
    });

    it("reports out-of-range targets via rangeValue", () => {
      expect(
        PassController.rangeValue({ x: 13, y: 13 }, { x: 0, y: 0 })
      ).toBeNull();
      expect(
        PassController.rangeValue({ x: 13, y: 13 }, { x: 15, y: 13 })
      ).toBe(0); // 2 squares dead ahead → Quick Pass
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
      mockDiceController.rollSkillCheck.mockReturnValue({
        success: true,
        roll: 6,
      });

      const result = controller.testAccuracy(player, quickPass, 0);

      expect(result.accurate).toBe(true);
      expect(result.fumbled).toBe(false);
      expect(result.roll).toBe(6);
    });

    it("should fumble on natural 1", () => {
      mockDiceController.rollSkillCheck.mockReturnValue({
        success: false,
        roll: 1,
      });

      const result = controller.testAccuracy(player, quickPass, 0);

      expect(result.accurate).toBe(false);
      expect(result.fumbled).toBe(true);
    });

    it("should be accurate when roll meets target", () => {
      mockDiceController.rollSkillCheck.mockReturnValue({
        success: true,
        roll: 3,
      });

      const result = controller.testAccuracy(player, quickPass, 0);

      expect(result.accurate).toBe(true);
    });
  });

  describe("Attempt Pass", () => {
    it("should emit pass events for accurate pass", async () => {
      mockDiceController.rollSkillCheck.mockReturnValue({
        success: true,
        roll: 6,
      });

      const result = await controller.attemptPass(
        player,
        { x: 5, y: 5 },
        { x: 7, y: 5 },
        0
      );

      expect(result.accurate).toBe(true);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.PassAttempted,
        expect.objectContaining({
          accurate: true,
        })
      );
    });

    it("should scatter ball for inaccurate pass", async () => {
      mockDiceController.rollSkillCheck.mockReturnValue({
        success: false,
        roll: 2,
      });

      const scatterPath = [{ x: 8, y: 8 }];
      mockMovementController.scatter.mockReturnValue(scatterPath);

      const result = await controller.attemptPass(
        player,
        { x: 5, y: 5 },
        { x: 7, y: 5 },
        0
      );

      expect(result.accurate).toBe(false);
      expect(result.finalPosition).toEqual({ x: 8, y: 8 });
    });
  });

  describe("Range Ruler interceptions", () => {
    const opponent = (
      id: string,
      x: number,
      y: number,
      status: PlayerStatus = PlayerStatus.ACTIVE
    ): Player =>
      ({
        id,
        teamId: "team2",
        playerName: id,
        gridPosition: { x, y },
        stats: { MA: 6, ST: 3, AG: 3, PA: 3, AV: 8 },
        status,
      }) as Player;

    it("overlaps a square lying on the straight ruler", () => {
      expect(
        PassController.rulerOverlaps({ x: 5, y: 5 }, { x: 5, y: 10 }, { x: 5, y: 7 })
      ).toBe(true);
    });

    it("does not overlap a square off the ruler line", () => {
      expect(
        PassController.rulerOverlaps({ x: 5, y: 5 }, { x: 5, y: 10 }, { x: 7, y: 7 })
      ).toBe(false);
    });

    it("does not overlap a square beyond the landing endpoint", () => {
      expect(
        PassController.rulerOverlaps({ x: 5, y: 5 }, { x: 5, y: 10 }, { x: 5, y: 12 })
      ).toBe(false);
    });

    it("overlaps squares on a diagonal ruler", () => {
      expect(
        PassController.rulerOverlaps({ x: 5, y: 5 }, { x: 10, y: 10 }, { x: 7, y: 7 })
      ).toBe(true);
    });

    it("returns only standing under-ruler opponents, with the accurate modifier", () => {
      const opps = [opponent("o1", 5, 7), opponent("o2", 8, 7)];
      const result = controller.checkInterceptions(
        { x: 5, y: 5 },
        { x: 5, y: 10 },
        opps,
        true
      );
      expect(result.map((r) => r.playerId)).toEqual(["o1"]);
      expect(result[0].modifier).toBe(-3);
    });

    it("uses the -2 modifier for an inaccurate pass", () => {
      const opps = [opponent("o1", 5, 7)];
      const result = controller.checkInterceptions(
        { x: 5, y: 5 },
        { x: 5, y: 10 },
        opps,
        false
      );
      expect(result[0].modifier).toBe(-2);
    });

    it("excludes an opponent that has lost its tackle zone", () => {
      const opps = [opponent("o1", 5, 7, PlayerStatus.PRONE)];
      const result = controller.checkInterceptions(
        { x: 5, y: 5 },
        { x: 5, y: 10 },
        opps,
        true
      );
      expect(result).toHaveLength(0);
    });

    it("getInterceptionSquares returns every square the ruler touches", () => {
      // Horizontal pass (5,5)→(10,5). The ruler is 0.875 wide either side, so
      // it reaches y = 5 ± 0.875 = [4.125, 5.875] and therefore touches the
      // flanking rows (y=4 cell starts at 3.5→4.5; y=6 cell 5.5→6.5) as well
      // as the on-line row. Two rows out (y=3/y=7) is beyond the ruler.
      const zone = controller.getInterceptionSquares(
        { x: 5, y: 5 },
        { x: 10, y: 5 }
      );
      const keys = new Set(zone.map((s) => `${s.x},${s.y}`));
      expect(keys.has("7,5")).toBe(true); // on the line
      expect(keys.has("7,4")).toBe(true); // ruler edge touches this cell
      expect(keys.has("7,6")).toBe(true); // ruler edge touches this cell
      expect(keys.has("7,3")).toBe(false); // beyond the ruler
      expect(keys.has("7,7")).toBe(false); // beyond the ruler
      expect(keys.has("5,5")).toBe(false); // passer square never intercepts
      expect(keys.has("10,5")).toBe(false); // target square never intercepts
    });

    it("getInterceptionSquares widens to flank a diagonal pass line", () => {
      // On a 45° line, squares 0.707 off the line fall inside the 0.875
      // corridor, so the diagonal is flanked (unlike a straight pass).
      const zone = controller.getInterceptionSquares(
        { x: 5, y: 5 },
        { x: 9, y: 9 }
      );
      const keys = new Set(zone.map((s) => `${s.x},${s.y}`));
      expect(keys.has("6,6")).toBe(true); // on the diagonal
      expect(keys.has("7,6")).toBe(true); // flanking the diagonal
      expect(keys.has("6,7")).toBe(true); // flanking the diagonal
    });
  });

  describe("Attempt Interception", () => {
    it("subtracts marking from the base modifier and returns success + roll", () => {
      mockDiceController.rollSkillCheck.mockReturnValue({
        success: false,
        roll: 3,
      });

      const result = controller.attemptInterception(player, -3, 2);

      expect(result).toEqual({ success: false, roll: 3 });
      expect(mockDiceController.rollSkillCheck).toHaveBeenCalledWith(
        "Interception",
        player.stats.AG,
        -5, // base -3, minus 2 marking opponents
        player.playerName
      );
    });

    it("intercepts when the dice check succeeds (natural 6 always succeeds)", () => {
      mockDiceController.rollSkillCheck.mockReturnValue({
        success: true,
        roll: 6,
      });

      const result = controller.attemptInterception(player, -3, 1);

      expect(result.success).toBe(true);
      expect(result.roll).toBe(6);
    });
  });
});
