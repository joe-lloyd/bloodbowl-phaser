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
    it("should emit pass events for accurate pass", () => {
      mockDiceController.rollSkillCheck.mockReturnValue({
        success: true,
        roll: 6,
      });

      const result = controller.attemptPass(
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

    it("should scatter ball for inaccurate pass", () => {
      mockDiceController.rollSkillCheck.mockReturnValue({
        success: false,
        roll: 2,
      });

      const scatterPath = [{ x: 8, y: 8 }];
      mockMovementController.scatter.mockReturnValue(scatterPath);

      const result = controller.attemptPass(
        player,
        { x: 5, y: 5 },
        { x: 7, y: 5 },
        0
      );

      expect(result.accurate).toBe(false);
      expect(result.finalPosition).toEqual({ x: 8, y: 8 });
    });
  });

  describe("Attempt Interception", () => {
    it("should use DiceController for the roll", () => {
      mockDiceController.rollSkillCheck.mockReturnValue({
        success: true,
        roll: 6,
      });

      const result = controller.attemptInterception(player, -3, 0);

      expect(result).toBe(true);
      expect(mockDiceController.rollSkillCheck).toHaveBeenCalledWith(
        "Interception",
        player.stats.AG,
        -3,
        player.playerName
      );
    });
  });
});
