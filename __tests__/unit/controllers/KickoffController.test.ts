import { movementWith, diceWith } from "./controllerFixtures";
import { describe, it, expect, beforeEach } from "vitest";
import { KickoffController } from "../../../src/game/controllers/KickoffController";

describe("KickoffController", () => {
  let controller: KickoffController;
  let mockMovementController = movementWith();
  
  
  let mockDiceController = diceWith();

  beforeEach(() => {
    
    mockMovementController = movementWith();
    
    mockDiceController = diceWith();

    controller = new KickoffController({ movementController: mockMovementController, diceController: mockDiceController });
  });

  describe("CalculateKickDestination", () => {
    it("should use ballMovementController to deviate", () => {
      const target = { x: 5, y: 5 };
      mockMovementController.deviate.mockReturnValue({
        x: 6,
        y: 6,
      });

      const result = controller.calculateKickDestination({ targetX: target.x,targetY: target.y, isTeam1Kicking: false });

      expect(mockMovementController.spies.deviate).toHaveBeenCalledWith(
        target,
        false,
        undefined
      );
      expect(result).toEqual({
        finalX: 6,
        finalY: 6,
        isTouchback: false,
      });
    });
  });
});
