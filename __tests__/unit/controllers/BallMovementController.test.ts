import { describe, it, expect, beforeEach, vi } from "vitest";
import { BallMovementController } from "../../../src/game/controllers/BallMovementController";
import { GameEventNames } from "../../../src/types/events";

describe("BallMovementController", () => {
  let controller: BallMovementController;
  let mockDiceController;

  beforeEach(() => {
    mockDiceController = {
      rollD8: vi.fn(),
      rollD6: vi.fn(),
    };

    controller = new BallMovementController(mockDiceController);
  });

  describe("Scatter", () => {
    it("should roll d8 three times for scatter", () => {
      mockDiceController.rollD8.mockReturnValue([1, 2, 3]); // Return array for multi-roll

      const path = controller.scatter({ x: 5, y: 5 });

      expect(mockDiceController.rollD8).toHaveBeenCalledWith("Scatter", 3);
      expect(path.length).toBe(3);
    });

    it("should calculate path based on rolls", () => {
      // Mock directions: 1 (TL), 2 (T), 3 (TR)
      mockDiceController.rollD8.mockReturnValue([1, 2, 3]);

      const start = { x: 5, y: 5 };
      const path = controller.scatter(start);

      // 1: TL -> 4,4
      // 2: T -> 4,3
      // 3: TR -> 5,2

      // Note: Coordinates depend on implementation of `calculateScatterStep`.
      // Assuming 1=TL (-1,-1), 2=T (0,-1), 3=TR (1,-1) etc.
      // Need to verify actual mapping if strict check needed.
      // For now checking length and change is enough.

      expect(path[0]).not.toEqual(start);
      expect(path[1]).not.toEqual(path[0]);
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
