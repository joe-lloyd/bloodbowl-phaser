import { describe, it, expect, beforeEach, vi } from "vitest";
import { PickupController } from "../../../src/game/controllers/PickupController";
import { Player, PlayerStatus } from "../../../src/types/Player";
import { GameEventNames } from "../../../src/types/events";

describe("PickupController", () => {
  let controller: PickupController;
  let mockDiceController;
  let mockEventBus;
  let player: Player;

  beforeEach(() => {
    mockEventBus = { emit: vi.fn() };
    mockDiceController = {
      rollD6: vi.fn(),
    };

    controller = new PickupController(mockEventBus, mockDiceController);

    player = {
      id: "p1",
      stats: { AG: 3 },
      gridPosition: { x: 5, y: 5 },
      teamId: "team1",
      status: PlayerStatus.ACTIVE,
    } as Player;
  });

  it("should succeed if roll meets target AG", () => {
    // AG 3+
    mockDiceController.rollD6.mockReturnValue(3);

    // No modifiers
    const result = controller.attemptPickup(player, 0);

    expect(result.success).toBe(true);
  });

  it("should fail if roll is below target AG", () => {
    // AG 3+
    mockDiceController.rollD6.mockReturnValue(2);

    const result = controller.attemptPickup(player, 0);

    expect(result.success).toBe(false);
  });

  it("should apply modifiers for tackle zones", () => {
    // ...
  });

  it("should always fail on natural 1", () => {
    mockDiceController.rollD6.mockReturnValue(1);
    player.stats.AG = 1; // Even 1+ fails on 1

    const result = controller.attemptPickup(player, 0);

    expect(result.success).toBe(false);
  });

  it("should always succeed on natural 6", () => {
    mockDiceController.rollD6.mockReturnValue(6);
    player.stats.AG = 7; // Even 7+ succeeds on 6

    const result = controller.attemptPickup(player, 0);

    expect(result.success).toBe(true);
  });
});
