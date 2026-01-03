import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DodgeController,
  DodgeResult,
} from "../../../src/game/controllers/DodgeController";
import { Player, PlayerStatus } from "../../../src/types/Player";

describe("DodgeController", () => {
  let controller: DodgeController;
  let mockDiceController: any;
  let player: Player;
  let opponents: Player[];

  beforeEach(() => {
    mockDiceController = {
      rollSkillCheck: vi.fn(),
    };

    controller = new DodgeController(mockDiceController);

    player = {
      id: "player1",
      teamId: "team1",
      playerName: "Test Player",
      gridPosition: { x: 5, y: 5 },
      stats: { MA: 6, ST: 3, AG: 3, PA: 3, AV: 8 },
      status: PlayerStatus.ACTIVE,
    } as Player;

    opponents = [
      {
        id: "opp1",
        gridPosition: { x: 6, y: 5 },
        status: PlayerStatus.ACTIVE,
      } as Player,
      {
        id: "opp2",
        gridPosition: { x: 4, y: 4 },
        status: PlayerStatus.ACTIVE,
      } as Player,
    ];
  });

  describe("Dodge Required Detection", () => {
    it("should require dodge when leaving tackle zone", () => {
      const from = { x: 5, y: 5 };
      const opponentsNearby: Player[] = [
        {
          id: "opp1",
          gridPosition: { x: 6, y: 5 }, // Adjacent
          status: PlayerStatus.ACTIVE,
        } as Player,
      ];

      const required = controller.isDodgeRequired(from, opponentsNearby);
      expect(required).toBe(true);
    });

    it("should not require dodge when no opponents nearby", () => {
      const from = { x: 5, y: 5 };
      const opponentsFar: Player[] = [
        {
          id: "opp1",
          gridPosition: { x: 10, y: 10 }, // Far away
          status: PlayerStatus.ACTIVE,
        } as Player,
      ];

      const required = controller.isDodgeRequired(from, opponentsFar);
      expect(required).toBe(false);
    });

    it("should not require dodge from prone opponent", () => {
      const from = { x: 5, y: 5 };
      const opponentsProne: Player[] = [
        {
          id: "opp1",
          gridPosition: { x: 6, y: 5 },
          status: PlayerStatus.PRONE,
        } as Player,
      ];

      const required = controller.isDodgeRequired(from, opponentsProne);
      expect(required).toBe(false);
    });
  });

  describe("Dodge Modifiers", () => {
    it("should apply -1 per opponent in destination tackle zone", () => {
      const to = { x: 6, y: 5 };
      const opponentsAtDest: Player[] = [
        {
          id: "opp1",
          gridPosition: { x: 7, y: 5 }, // Adjacent to destination
          status: PlayerStatus.ACTIVE,
        } as Player,
        {
          id: "opp2",
          gridPosition: { x: 6, y: 6 }, // Adjacent to destination
          status: PlayerStatus.ACTIVE,
        } as Player,
      ];

      const modifier = controller.calculateDodgeModifiers(to, opponentsAtDest);
      expect(modifier).toBe(-2);
    });
  });

  describe("Attempt Dodge", () => {
    it("should succeed when roll meets target", () => {
      mockDiceController.rollSkillCheck.mockReturnValue({
        success: true,
        roll: 3,
        effectiveTotal: 3,
      });

      const result = controller.attemptDodge(player, { x: 6, y: 5 }, []);

      expect(result.success).toBe(true);
      expect(result.roll).toBe(3);
    });

    it("should fail when roll is below target", () => {
      mockDiceController.rollSkillCheck.mockReturnValue({
        success: false,
        roll: 2,
        effectiveTotal: 2,
      });

      const result = controller.attemptDodge(player, { x: 6, y: 5 }, []);

      expect(result.success).toBe(false);
      expect(result.roll).toBe(2);
    });

    it("should apply modifiers via DiceController", () => {
      mockDiceController.rollSkillCheck.mockReturnValue({
        success: false,
        roll: 3,
        effectiveTotal: 2,
      });

      const opponentsAtDest: Player[] = [
        {
          id: "opp1",
          gridPosition: { x: 7, y: 5 },
          status: PlayerStatus.ACTIVE,
        } as Player,
      ];

      const result = controller.attemptDodge(
        player,
        { x: 6, y: 5 },
        opponentsAtDest
      );

      expect(mockDiceController.rollSkillCheck).toHaveBeenCalledWith(
        "Dodge",
        player.stats.AG,
        -1,
        player.playerName
      );
      expect(result.modifiers).toBe(-1);
    });
  });

  describe("Edge Cases", () => {
    it("should handle AG 2+ with no modifiers", () => {
      mockDiceController.rollSkillCheck.mockReturnValue({
        success: true,
        roll: 2,
      });
      player.stats.AG = 2;

      const result = controller.attemptDodge(player, { x: 6, y: 5 }, []);

      expect(result.success).toBe(true);
      expect(result.target).toBe(2);
    });
  });
});
