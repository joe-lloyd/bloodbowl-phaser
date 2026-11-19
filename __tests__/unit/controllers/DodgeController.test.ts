import { skillCheckWith } from "./controllerFixtures";
import { diceWith } from "./controllerFixtures";
import { playerWith } from "./controllerFixtures";
import { describe, it, expect, beforeEach } from "vitest";
import { DodgeController } from "../../../src/game/controllers/DodgeController";
import {
  type Player,
  PlayerCondition,
  PlayerStatus,
} from "../../../src/types/Player";

describe("DodgeController", () => {
  let controller: DodgeController;
  let mockDiceController = diceWith();
  let player: Player;

  beforeEach(() => {
    mockDiceController = diceWith();

    controller = new DodgeController(mockDiceController);

    player = playerWith({
      id: "player1",
      teamId: "team1",
      playerName: "Test Player",
      gridPosition: { x: 5, y: 5 },
      stats: { MA: 6, ST: 3, AG: 3, PA: 3, AV: 8 },
      status: PlayerStatus.ACTIVE,
    });
  });

  describe("Dodge Required Detection", () => {
    it("should require dodge when leaving tackle zone", () => {
      const from = { x: 5, y: 5 };
      const opponentsNearby: Player[] = [
        playerWith({
          id: "opp1",
          gridPosition: { x: 6, y: 5 },
          status: PlayerStatus.ACTIVE,
        }),
      ];

      const required = controller.isDodgeRequired(from, opponentsNearby);
      expect(required).toBe(true);
    });

    it("should not require dodge when no opponents nearby", () => {
      const from = { x: 5, y: 5 };
      const opponentsFar: Player[] = [
        playerWith({
          id: "opp1",
          gridPosition: { x: 10, y: 10 },
          status: PlayerStatus.ACTIVE,
        }),
      ];

      const required = controller.isDodgeRequired(from, opponentsFar);
      expect(required).toBe(false);
    });

    it("should not require dodge from prone opponent", () => {
      const from = { x: 5, y: 5 };
      const opponentsProne: Player[] = [
        playerWith({
          id: "opp1",
          gridPosition: { x: 6, y: 5 },
          status: PlayerStatus.PRONE,
        }),
      ];

      const required = controller.isDodgeRequired(from, opponentsProne);
      expect(required).toBe(false);
    });
  });

  describe("Dodge Modifiers", () => {
    it("should apply -1 per opponent in destination tackle zone", () => {
      const to = { x: 6, y: 5 };
      const opponentsAtDest: Player[] = [
        playerWith({
          id: "opp1",
          gridPosition: { x: 7, y: 5 },
          status: PlayerStatus.ACTIVE,
        }),
        playerWith({
          id: "opp2",
          gridPosition: { x: 6, y: 6 },
          status: PlayerStatus.ACTIVE,
        }),
      ];

      const modifier = controller.calculateDodgeModifiers(to, opponentsAtDest);
      expect(modifier).toBe(-2);
    });

    it("a Distracted opponent (still Standing) contributes no modifier", () => {
      const to = { x: 6, y: 5 };
      const opponentsAtDest: Player[] = [
        playerWith({
          id: "opp1",
          gridPosition: { x: 7, y: 5 },
          status: PlayerStatus.ACTIVE,
          conditions: [{ type: PlayerCondition.DISTRACTED }],
        }),
        playerWith({
          id: "opp2",
          gridPosition: { x: 6, y: 6 },
          status: PlayerStatus.ACTIVE,
        }),
      ];

      const modifier = controller.calculateDodgeModifiers(to, opponentsAtDest);

      expect(modifier).toBe(-1);
    });
  });

  describe("Attempt Dodge", () => {
    it("should succeed when roll meets target", () => {
      mockDiceController.rollSkillCheck.mockReturnValue(skillCheckWith({
        success: true,
        roll: 3,
        effectiveTotal: 3,
      }));

      const result = controller.attemptDodge({ player,to: { x: 6,y: 5 },opponents: [] });

      expect(result.success).toBe(true);
      expect(result.roll).toBe(3);
    });

    it("should fail when roll is below target", () => {
      mockDiceController.rollSkillCheck.mockReturnValue(skillCheckWith({
        success: false,
        roll: 2,
        effectiveTotal: 2,
      }));

      const result = controller.attemptDodge({ player,to: { x: 6,y: 5 },opponents: [] });

      expect(result.success).toBe(false);
      expect(result.roll).toBe(2);
    });

    it("should apply modifiers via DiceController", () => {
      mockDiceController.rollSkillCheck.mockReturnValue(skillCheckWith({
        success: false,
        roll: 3,
        effectiveTotal: 2,
      }));

      const opponentsAtDest: Player[] = [
        playerWith({
          id: "opp1",
          gridPosition: { x: 7, y: 5 },
          status: PlayerStatus.ACTIVE,
        }),
      ];

      const result = controller.attemptDodge(
        { player,to: { x: 6,y: 5 },opponents: opponentsAtDest }      );

      expect(mockDiceController.spies.rollSkillCheck).toHaveBeenCalledWith({
        reason: "Dodge",
        target: player.stats.AG,
        modifier: -1,
        playerName: player.playerName,
      });
      expect(result.modifiers).toBe(-1);
    });
  });

  describe("Edge Cases", () => {
    it("should handle AG 2+ with no modifiers", () => {
      mockDiceController.rollSkillCheck.mockReturnValue(skillCheckWith({
        success: true,
        roll: 2,
      }));
      player.stats.AG = 2;

      const result = controller.attemptDodge({ player,to: { x: 6,y: 5 },opponents: [] });

      expect(result.success).toBe(true);
      expect(result.target).toBe(2);
    });
  });
});
