import { diceWith } from "./controllerFixtures";
import { describe, it, expect, beforeEach } from "vitest";
import { BallMovementController } from "../../../src/game/controllers/BallMovementController";

describe("BallMovementController", () => {
  let controller: BallMovementController;
  let mockDiceController = diceWith();

  beforeEach(() => {
    mockDiceController = diceWith();

    controller = new BallMovementController(mockDiceController);
  });

  describe("Scatter", () => {
    it("should roll d8 three times for scatter", () => {
      mockDiceController.rollMultipleD8.mockReturnValue([1, 2, 3]);

      const path = controller.scatter({ x: 5, y: 5 });

      expect(mockDiceController.spies.rollMultipleD8).toHaveBeenCalledWith(
        "Scatter",
        3
      );
      expect(path.length).toBe(3);
    });

    it("should calculate path based on rolls", () => {
      const controller = new BallMovementController(mockDiceController);

      mockDiceController.rollMultipleD8.mockReturnValue([1, 2, 3]);

      const path = controller.scatter({ x: 5, y: 5 });

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

      expect(mockDiceController.spies.rollD8).toHaveBeenCalledWith("Bounce");
      expect(result).toBeDefined();
    });
  });

  describe("Deviate", () => {
    it("should roll direction and the lower of 2D6 for distance", () => {
      mockDiceController.rollD8.mockReturnValue(1);
      mockDiceController.rollLowerOf2D6.mockReturnValue(3);

      const result = controller.deviate({ x: 5, y: 5 }, false, "kickers");

      expect(mockDiceController.spies.rollD8).toHaveBeenCalledWith(
        expect.stringContaining("Direction"),
        "kickers"
      );
      expect(mockDiceController.spies.rollLowerOf2D6).toHaveBeenCalledWith(
        expect.stringContaining("Distance"),
        "kickers"
      );
      expect(result).toEqual({ x: 2, y: 2 });
    });
  });
});
