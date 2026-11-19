import { skillCheckWith } from "./controllerFixtures";
import { busWith, movementWith, diceWith } from "./controllerFixtures";
import { playerWith } from "./controllerFixtures";
import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, it, expect, beforeEach } from "vitest";
import {
  PassController,
  type PassRange,
} from "../../../src/game/controllers/PassController";
import { type Player, PlayerStatus } from "../../../src/types/Player";
import { GameEventNames } from "../../../src/types/events";

describe("PassController", () => {
  let controller: PassController;
  let mockEventBus = busWith();
  let mockMovementController = movementWith();
  let mockDiceController = diceWith();
  let player: Player;

  beforeEach(() => {
    mockEventBus = busWith();

    mockMovementController = movementWith();

    mockDiceController = diceWith();

    controller = new PassController(
      mockEventBus,
      mockMovementController,
      mockDiceController
    );

    player = playerWith({
      id: "player1",
      teamId: "team1",
      playerName: "Test Thrower",
      gridPosition: { x: 10, y: 5 },
      stats: { MA: 6, ST: 3, AG: 3, PA: 3, AV: 8 },
      status: PlayerStatus.ACTIVE,
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

    it("should identify Long Bomb (11+ squares)", () => {
      const from = { x: 5, y: 5 };
      const to = { x: 18, y: 5 };
      const range = controller.measureRange(from, to);
      expect(range.type).toBe("Long Bomb");
      expect(range.modifier).toBe(-3);
    });

    it("uses the radial range ruler, not Chebyshev bands, for diagonals", () => {
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
      ).toBe(0);
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
      mockDiceController.rollSkillCheck.mockReturnValue(skillCheckWith({
        success: true,
        roll: 6,
      }));

      const result = controller.testAccuracy({ player,passRange: quickPass,markingOpponents: 0 });

      expect(result.accurate).toBe(true);
      expect(result.fumbled).toBe(false);
      expect(result.roll).toBe(6);
    });

    it("should fumble on natural 1", () => {
      mockDiceController.rollSkillCheck.mockReturnValue(skillCheckWith({
        success: false,
        roll: 1,
      }));

      const result = controller.testAccuracy({ player,passRange: quickPass,markingOpponents: 0 });

      expect(result.accurate).toBe(false);
      expect(result.fumbled).toBe(true);
    });

    it("should be accurate when roll meets target", () => {
      mockDiceController.rollSkillCheck.mockReturnValue(skillCheckWith({
        success: true,
        roll: 3,
      }));

      const result = controller.testAccuracy({ player,passRange: quickPass,markingOpponents: 0 });

      expect(result.accurate).toBe(true);
    });
  });

  describe("Attempt Pass", () => {
    it("reports an accurate pass", async () => {
      mockDiceController.rollSkillCheck.mockReturnValue(skillCheckWith({
        success: true,
        roll: 6,
      }));

      const result = await controller.attemptPass(
        { player,from: { x: 5,y: 5 },to: { x: 7,y: 5 },markingOpponents: 0 }      );

      expect(result.accurate).toBe(true);
      expect(result.fumbled).toBe(false);
    });

    it("does not scatter an inaccurate pass before interception", async () => {
      mockDiceController.rollSkillCheck.mockReturnValue(skillCheckWith({
        success: false,
        roll: 2,
      }));

      const result = await controller.attemptPass(
        { player,from: { x: 5,y: 5 },to: { x: 7,y: 5 },markingOpponents: 0 }      );

      expect(result.accurate).toBe(false);
      expect(result.fumbled).toBe(false);
      expect(mockMovementController.spies.scatter).not.toHaveBeenCalled();
      expect(mockEventBus.spies.emit).not.toHaveBeenCalledWith(
        GameEventNames.PassAttempted,
        expect.anything()
      );
    });

    it("scatters a pass from its target square", () => {
      mockMovementController.scatter.mockReturnValue([
        { x: 8, y: 5 },
        { x: 8, y: 6 },
        { x: 9, y: 7 },
      ]);

      expect(controller.scatterPass({ x: 7, y: 5 })).toEqual([
        { x: 7, y: 5 },
        { x: 8, y: 5 },
        { x: 8, y: 6 },
        { x: 9, y: 7 },
      ]);
    });
  });

  describe("Range Ruler interceptions", () => {
    const opponent = (
      id: string,
      x: number,
      y: number,
      status: PlayerStatus = PlayerStatus.ACTIVE
    ): Player =>
      playerWith(({
        id,
        teamId: "team2",
        playerName: id,
        gridPosition: { x, y },
        stats: { MA: 6, ST: 3, AG: 3, PA: 3, AV: 8 },
        status,
        skills: [],
      }));

    it("overlaps a square lying on the straight ruler", () => {
      expect(
        PassController.rulerOverlaps(
          { x: 5, y: 5 },
          { x: 5, y: 10 },
          { x: 5, y: 7 }
        )
      ).toBe(true);
    });

    it("does not overlap a square off the ruler line", () => {
      expect(
        PassController.rulerOverlaps(
          { x: 5, y: 5 },
          { x: 5, y: 10 },
          { x: 7, y: 7 }
        )
      ).toBe(false);
    });

    it("does not overlap a square beyond the landing endpoint", () => {
      expect(
        PassController.rulerOverlaps(
          { x: 5, y: 5 },
          { x: 5, y: 10 },
          { x: 5, y: 12 }
        )
      ).toBe(false);
    });

    it("overlaps squares on a diagonal ruler", () => {
      expect(
        PassController.rulerOverlaps(
          { x: 5, y: 5 },
          { x: 10, y: 10 },
          { x: 7, y: 7 }
        )
      ).toBe(true);
    });

    it("returns only standing under-ruler opponents, with the accurate modifier", () => {
      const opps = [opponent("o1", 5, 7), opponent("o2", 8, 7)];
      const result = controller.checkInterceptions(
      { from: { x: 5,y: 5 },target: { x: 5,y: 10 },opponents: opps,isAccurate: true }      );
      expect(result.map((r) => r.playerId)).toEqual(["o1"]);
      expect(fixtureValue(result[0]).modifier).toBe(-3);
    });

    it("uses the -2 modifier for an inaccurate pass", () => {
      const opps = [opponent("o1", 5, 7)];
      const result = controller.checkInterceptions(
      { from: { x: 5,y: 5 },target: { x: 5,y: 10 },opponents: opps,isAccurate: false }      );
      expect(fixtureValue(result[0]).modifier).toBe(-2);
    });

    it("excludes an opponent that has lost its tackle zone", () => {
      const opps = [opponent("o1", 5, 7, PlayerStatus.PRONE)];
      const result = controller.checkInterceptions(
      { from: { x: 5,y: 5 },target: { x: 5,y: 10 },opponents: opps,isAccurate: true }      );
      expect(result).toHaveLength(0);
    });

    it("getInterceptionSquares returns every square the ruler touches", () => {
      const zone = controller.getInterceptionSquares(
        { x: 5, y: 5 },
        { x: 10, y: 5 }
      );
      const keys = new Set(zone.map((s) => `${String(s.x)},${String(s.y)}`));
      expect(keys.has("7,5")).toBe(true);
      expect(keys.has("7,4")).toBe(true);
      expect(keys.has("7,6")).toBe(true);
      expect(keys.has("7,3")).toBe(false);
      expect(keys.has("7,7")).toBe(false);
      expect(keys.has("5,5")).toBe(false);
      expect(keys.has("10,5")).toBe(false);
    });

    it("getInterceptionSquares widens to flank a diagonal pass line", () => {
      const zone = controller.getInterceptionSquares(
        { x: 5, y: 5 },
        { x: 9, y: 9 }
      );
      const keys = new Set(zone.map((s) => `${String(s.x)},${String(s.y)}`));
      expect(keys.has("6,6")).toBe(true);
      expect(keys.has("7,6")).toBe(true);
      expect(keys.has("6,7")).toBe(true);
    });
  });

  describe("Attempt Interception", () => {
    it("subtracts marking from the base modifier and returns success + roll", () => {
      mockDiceController.rollSkillCheck.mockReturnValue(skillCheckWith({
        success: false,
        roll: 3,
      }));

      const result = controller.attemptInterception(player, -3, 2);

      expect(result).toEqual({ success: false, roll: 3 });
      expect(mockDiceController.spies.rollSkillCheck).toHaveBeenCalledWith({
        reason: "Interception",
        target: player.stats.AG,
        modifier: -5,
        playerName: player.playerName,
        teamId: "team1",
      });
    });

    it("intercepts when the dice check succeeds (natural 6 always succeeds)", () => {
      mockDiceController.rollSkillCheck.mockReturnValue(skillCheckWith({
        success: true,
        roll: 6,
      }));

      const result = controller.attemptInterception(player, -3, 1);

      expect(result.success).toBe(true);
      expect(result.roll).toBe(6);
    });
  });
});
