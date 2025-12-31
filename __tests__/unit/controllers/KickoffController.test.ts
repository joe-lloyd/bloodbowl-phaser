import { describe, it, expect, beforeEach, vi } from "vitest";
import { KickoffController } from "../../../src/game/controllers/KickoffController";
import { GameEventNames } from "../../../src/types/events";

describe("KickoffController", () => {
  let controller: KickoffController;
  let mockMovementController;
  let mockEventBus;
  let mockWeatherManager;
  let mockDiceController;

  beforeEach(() => {
    mockEventBus = { emit: vi.fn() };
    mockMovementController = {
      deviate: vi
        .fn()
        .mockReturnValue({ x: 10, y: 10, direction: 1, distance: 1 }),
    };
    mockWeatherManager = {};
    mockDiceController = { roll2D6: vi.fn() };

    controller = new KickoffController(
      mockEventBus,
      mockMovementController,
      mockWeatherManager,
      mockDiceController
    );
  });

  describe("CalculateKickDestination", () => {
    it("should use ballMovementController to deviate", () => {
      const target = { x: 5, y: 5 };
      mockMovementController.deviate.mockReturnValue({
        x: 6,
        y: 6,
        direction: 0,
        distance: 1,
      });

      const result = controller.calculateKickDestination(target.x, target.y);

      expect(mockMovementController.deviate).toHaveBeenCalledWith(target);
      expect(result).toEqual({
        finalX: 6,
        finalY: 6,
        isTouchback: false,
      });
    });
  });
});
