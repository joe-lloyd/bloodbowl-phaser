import { describe, it, expect, beforeEach, vi } from "vitest";
import { CatchController } from "../../../src/game/controllers/CatchController";
import { Player, PlayerStatus } from "../../../src/types/Player";
import { GameEventNames } from "../../../src/types/events";

describe("CatchController", () => {
  let controller: CatchController;
  let mockEventBus;
  let player: Player;

  beforeEach(() => {
    mockEventBus = {
      emit: vi.fn(),
    };

    controller = new CatchController(mockEventBus);

    player = {
      id: "player1",
      teamId: "team1",
      playerName: "Test Player",
      gridPosition: { x: 5, y: 5 },
      stats: { MA: 6, ST: 3, AG: 3, PA: 3, AV: 8 },
      status: PlayerStatus.ACTIVE,
      hasActed: false,
    } as Player;
  });

  describe("Catch Modifiers", () => {
    it("should apply -1 modifier for bounce", () => {
      const modifiers = controller.calculateCatchModifiers(true, false, 0);
      expect(modifiers).toBe(-1);
    });

    it("should apply -1 modifier for throw-in", () => {
      const modifiers = controller.calculateCatchModifiers(false, true, 0);
      expect(modifiers).toBe(-1);
    });

    it("should apply -1 per marking opponent", () => {
      const modifiers = controller.calculateCatchModifiers(false, false, 2);
      expect(modifiers).toBe(-2);
    });

    it("should stack modifiers correctly", () => {
      const modifiers = controller.calculateCatchModifiers(true, false, 2);
      expect(modifiers).toBe(-3); // -1 bounce, -2 marking
    });
  });

  describe("Can Attempt Catch", () => {
    it("should allow active player to catch", () => {
      expect(controller.canAttemptCatch(player)).toBe(true);
    });

    it("should not allow prone player to catch", () => {
      player.status = PlayerStatus.PRONE;
      expect(controller.canAttemptCatch(player)).toBe(false);
    });

    it("should not allow stunned player to catch", () => {
      player.status = PlayerStatus.STUNNED;
      expect(controller.canAttemptCatch(player)).toBe(false);
    });

    it("should not allow player who has acted", () => {
      player.hasActed = true;
      expect(controller.canAttemptCatch(player)).toBe(false);
    });
  });

  describe("Attempt Catch", () => {
    it("should auto-fail for prone player", () => {
      player.status = PlayerStatus.PRONE;
      const result = controller.attemptCatch(
        player,
        { x: 5, y: 5 },
        false,
        false,
        0
      );

      expect(result.success).toBe(false);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.CatchFailed,
        expect.objectContaining({
          playerId: player.id,
          reason: PlayerStatus.PRONE,
        })
      );
    });

    it("should succeed on natural 6", () => {
      vi.spyOn(Math, "random").mockReturnValue(5 / 6); // Roll 6

      const result = controller.attemptCatch(
        player,
        { x: 5, y: 5 },
        false,
        false,
        0
      );

      expect(result.success).toBe(true);
      expect(result.roll).toBe(6);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.CatchSucceeded,
        expect.any(Object)
      );
    });

    it("should fail on natural 1", () => {
      vi.spyOn(Math, "random").mockReturnValue(0); // Roll 1

      const result = controller.attemptCatch(
        player,
        { x: 5, y: 5 },
        false,
        false,
        0
      );

      expect(result.success).toBe(false);
      expect(result.roll).toBe(1);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.CatchFailed,
        expect.objectContaining({
          reason: "Natural 1",
        })
      );
    });

    it("should succeed when roll meets target (AG 3+)", () => {
      vi.spyOn(Math, "random").mockReturnValue(2 / 6); // Roll 3
      player.stats.AG = 3;

      const result = controller.attemptCatch(
        player,
        { x: 5, y: 5 },
        false,
        false,
        0
      );

      expect(result.success).toBe(true);
      expect(result.roll).toBe(3);
      expect(result.target).toBe(3);
    });

    it("should fail when roll is below target", () => {
      vi.spyOn(Math, "random").mockReturnValue(1 / 6); // Roll 2
      player.stats.AG = 3;

      const result = controller.attemptCatch(
        player,
        { x: 5, y: 5 },
        false,
        false,
        0
      );

      expect(result.success).toBe(false);
      expect(result.roll).toBe(2);
    });

    it("should apply modifiers correctly", () => {
      vi.spyOn(Math, "random").mockReturnValue(2 / 6); // Roll 3
      player.stats.AG = 3;

      // With -1 modifier, need roll 4+ instead of 3+
      const result = controller.attemptCatch(
        player,
        { x: 5, y: 5 },
        true,
        false,
        0
      );

      expect(result.success).toBe(false); // Roll 3 + (-1) = 2, need 3+
      expect(result.modifiers).toBe(-1);
    });

    it("should emit dice roll events", () => {
      vi.spyOn(Math, "random").mockReturnValue(2 / 6); // Roll 3

      controller.attemptCatch(player, { x: 5, y: 5 }, false, false, 0);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          rollType: "Catch",
          diceType: "d6",
          value: 3,
        })
      );
    });
  });

  describe("Failed Catch Handling", () => {
    it("should scatter ball in random direction", () => {
      vi.spyOn(Math, "random").mockReturnValue(0); // Direction 1

      const result = controller.handleFailedCatch({ x: 10, y: 5 });

      expect(result).toBeDefined();
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.y).toBeGreaterThanOrEqual(0);
    });

    it("should emit bounce and scatter events", () => {
      controller.handleFailedCatch({ x: 10, y: 5 });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          rollType: "Bounce",
          diceType: "d8",
        })
      );

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.BallScattered,
        expect.objectContaining({
          reason: "Failed catch",
        })
      );
    });

    it("should keep ball within pitch bounds", () => {
      const result = controller.handleFailedCatch({ x: 0, y: 0 });

      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.x).toBeLessThanOrEqual(25);
      expect(result.y).toBeGreaterThanOrEqual(0);
      expect(result.y).toBeLessThanOrEqual(14);
    });
  });

  describe("Count Marking Opponents", () => {
    it("should count adjacent active opponents", () => {
      const opponents: Player[] = [
        {
          id: "opp1",
          gridPosition: { x: 5, y: 6 }, // Adjacent
          status: PlayerStatus.ACTIVE,
        } as Player,
        {
          id: "opp2",
          gridPosition: { x: 6, y: 6 }, // Adjacent diagonal
          status: PlayerStatus.ACTIVE,
        } as Player,
      ];

      const count = controller.countMarkingOpponents({ x: 5, y: 5 }, opponents);
      expect(count).toBe(2);
    });

    it("should not count prone opponents", () => {
      const opponents: Player[] = [
        {
          id: "opp1",
          gridPosition: { x: 5, y: 6 },
          status: PlayerStatus.PRONE,
        } as Player,
      ];

      const count = controller.countMarkingOpponents({ x: 5, y: 5 }, opponents);
      expect(count).toBe(0);
    });

    it("should not count distant opponents", () => {
      const opponents: Player[] = [
        {
          id: "opp1",
          gridPosition: { x: 8, y: 8 }, // Too far
          status: PlayerStatus.ACTIVE,
        } as Player,
      ];

      const count = controller.countMarkingOpponents({ x: 5, y: 5 }, opponents);
      expect(count).toBe(0);
    });

    it("should not count opponent on same square", () => {
      const opponents: Player[] = [
        {
          id: "opp1",
          gridPosition: { x: 5, y: 5 }, // Same square
          status: PlayerStatus.ACTIVE,
        } as Player,
      ];

      const count = controller.countMarkingOpponents({ x: 5, y: 5 }, opponents);
      expect(count).toBe(0);
    });
  });
});
