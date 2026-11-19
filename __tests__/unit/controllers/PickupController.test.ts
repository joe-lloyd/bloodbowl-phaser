import { diceWith, busWith } from "./controllerFixtures";
import { playerWith } from "./controllerFixtures";
import { describe, it, expect, beforeEach } from "vitest";
import { PickupController } from "../../../src/game/controllers/PickupController";
import { type Player, PlayerStatus } from "../../../src/types/Player";

describe("PickupController", () => {
  let controller: PickupController;
  let mockDiceController = diceWith();
  let mockEventBus = busWith();
  let player: Player;

  beforeEach(() => {
    mockEventBus = busWith();
    mockDiceController = diceWith();

    controller = new PickupController(mockEventBus, mockDiceController);

    player = playerWith({
      id: "p1",
      stats: { AG: 3 },
      gridPosition: { x: 5, y: 5 },
      teamId: "team1",
      status: PlayerStatus.ACTIVE,
    });
  });

  it("should succeed if roll meets target AG", () => {
    mockDiceController.rollD6.mockReturnValue(3);

    const result = controller.attemptPickup(player, 0);

    expect(result.success).toBe(true);
  });

  it("should fail if roll is below target AG", () => {
    mockDiceController.rollD6.mockReturnValue(2);

    const result = controller.attemptPickup(player, 0);

    expect(result.success).toBe(false);
  });

  it("should apply modifiers for tackle zones", () => {});

  it("should always fail on natural 1", () => {
    mockDiceController.rollD6.mockReturnValue(1);
    player.stats.AG = 1;

    const result = controller.attemptPickup(player, 0);

    expect(result.success).toBe(false);
  });

  it("should always succeed on natural 6", () => {
    mockDiceController.rollD6.mockReturnValue(6);
    player.stats.AG = 7;

    const result = controller.attemptPickup(player, 0);

    expect(result.success).toBe(true);
  });
});
