import { describe, it, expect, beforeEach, vi } from "vitest";
import { BallMovementController } from "../../../src/game/controllers/BallMovementController";
import { GameEventNames } from "../../../src/types/events";

describe("BallMovementController", () => {
  let controller: BallMovementController;
  let mockDiceController;

  beforeEach(() => {
    mockDiceController = {
      rollD8: vi.fn(),
      rollMultipleD8: vi.fn(),
      rollD6: vi.fn(),
    };

    controller = new BallMovementController(mockDiceController);
  });

  describe("Scatter", () => {
    it("should roll d8 three times for scatter", () => {
      mockDiceController.rollMultipleD8.mockReturnValue([1, 2, 3]); // Return array for multi-roll

      const path = controller.scatter({ x: 5, y: 5 });

      expect(mockDiceController.rollMultipleD8).toHaveBeenCalledWith(
        "Scatter",
        3
      );
      expect(path.length).toBe(3);
    });

    it("should calculate path based on rolls", () => {
      const controller = new BallMovementController(mockDiceController);
      // Mock returns: TL, T, TR
      mockDiceController.rollMultipleD8.mockReturnValue([1, 2, 3]);

      const path = controller.scatter({ x: 5, y: 5 });

      // TL: (5-1, 5-1) = (4,4), T: (4+0, 4-1) = (4,3), TR: (4+1, 3-1) = (5,2)
      expect(path).toEqual([
        { x: 4, y: 4 },
        { x: 4, y: 3 },
        { x: 5, y: 2 },
      ]);
    });
  });

  describe("Bounce", () => {
    it("should roll d8 once", () => {
      mockDiceController.rollD8.mockReturnValue(1);

      const result = controller.bounce({ x: 5, y: 5 });

      expect(mockDiceController.rollD8).toHaveBeenCalledWith("Bounce");
      expect(result).toBeDefined();
    });
  });

  describe("Deviate", () => {
    it("should roll direction and distance", () => {
      mockDiceController.rollD8.mockReturnValue(1);
      mockDiceController.rollD6.mockReturnValue(3);

      const result = controller.deviate({ x: 5, y: 5 });

      expect(mockDiceController.rollD8).toHaveBeenCalledWith(
        expect.stringContaining("Direction")
      );
      expect(mockDiceController.rollD6).toHaveBeenCalledWith(
        expect.stringContaining("Distance")
      );
      expect(result).toBeDefined();
    });
  });
});
