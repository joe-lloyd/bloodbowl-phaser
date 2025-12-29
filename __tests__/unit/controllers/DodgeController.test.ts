import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DodgeController,
  DodgeResult,
} from "../../../src/game/controllers/DodgeController";
import { Player, PlayerStatus } from "../../../src/types/Player";
import { GameEventNames } from "../../../src/types/events";

describe("DodgeController", () => {
  let controller: DodgeController;
  let mockEventBus: any;
  let player: Player;
  let opponents: Player[];

  beforeEach(() => {
    mockEventBus = {
      emit: vi.fn(),
    };

    controller = new DodgeController(mockEventBus);

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

    it("should detect tackle zones in all 8 adjacent squares", () => {
      const from = { x: 5, y: 5 };
      const positions = [
        { x: 4, y: 4 },
        { x: 5, y: 4 },
        { x: 6, y: 4 },
        { x: 4, y: 5 },
        { x: 6, y: 5 },
        { x: 4, y: 6 },
        { x: 5, y: 6 },
        { x: 6, y: 6 },
      ];

      positions.forEach((pos) => {
        const opps: Player[] = [
          {
            id: "opp1",
            gridPosition: pos,
            status: PlayerStatus.ACTIVE,
          } as Player,
        ];

        const required = controller.isDodgeRequired(from, opps);
        expect(required).toBe(true);
      });
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

    it("should return 0 when no opponents at destination", () => {
      const to = { x: 6, y: 5 };
      const opponentsFar: Player[] = [
        {
          id: "opp1",
          gridPosition: { x: 10, y: 10 },
          status: PlayerStatus.ACTIVE,
        } as Player,
      ];

      const modifier = controller.calculateDodgeModifiers(to, opponentsFar);
      expect(modifier).toBe(0);
    });

    it("should ignore prone opponents at destination", () => {
      const to = { x: 6, y: 5 };
      const opponentsProne: Player[] = [
        {
          id: "opp1",
          gridPosition: { x: 7, y: 5 },
          status: PlayerStatus.PRONE,
        } as Player,
      ];

      const modifier = controller.calculateDodgeModifiers(to, opponentsProne);
      expect(modifier).toBe(0);
    });
  });

  describe("Attempt Dodge", () => {
    it("should succeed when roll meets target", () => {
      vi.spyOn(Math, "random").mockReturnValue(2 / 6); // Roll 3
      player.stats.AG = 3;

      const result = controller.attemptDodge(
        player,
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        []
      );

      expect(result.success).toBe(true);
      expect(result.roll).toBe(3);
      expect(result.target).toBe(3);
    });

    it("should fail when roll is below target", () => {
      vi.spyOn(Math, "random").mockReturnValue(1 / 6); // Roll 2
      player.stats.AG = 3;

      const result = controller.attemptDodge(
        player,
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        []
      );

      expect(result.success).toBe(false);
      expect(result.roll).toBe(2);
    });

    it("should apply modifiers to effective target", () => {
      vi.spyOn(Math, "random").mockReturnValue(2 / 6); // Roll 3
      player.stats.AG = 3;

      const opponentsAtDest: Player[] = [
        {
          id: "opp1",
          gridPosition: { x: 7, y: 5 }, // Adjacent to destination
          status: PlayerStatus.ACTIVE,
        } as Player,
      ];

      // AG 3+ with -1 modifier = need 4+
      const result = controller.attemptDodge(
        player,
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        opponentsAtDest
      );

      expect(result.success).toBe(false); // Roll 3, need 4+
      expect(result.modifiers).toBe(-1);
    });

    it("should emit dice roll event", () => {
      vi.spyOn(Math, "random").mockReturnValue(2 / 6); // Roll 3

      controller.attemptDodge(player, { x: 5, y: 5 }, { x: 6, y: 5 }, []);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          rollType: "Dodge",
          diceType: "d6",
          value: 3,
        })
      );
    });

    it("should include success/failure in description", () => {
      vi.spyOn(Math, "random").mockReturnValue(2 / 6); // Roll 3
      player.stats.AG = 3;

      controller.attemptDodge(player, { x: 5, y: 5 }, { x: 6, y: 5 }, []);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          description: expect.stringContaining("Success"),
        })
      );
    });

    it("should handle multiple tackle zones correctly", () => {
      vi.spyOn(Math, "random").mockReturnValue(3 / 6); // Roll 4
      player.stats.AG = 3;

      const multipleOpponents: Player[] = [
        {
          id: "opp1",
          gridPosition: { x: 7, y: 5 },
          status: PlayerStatus.ACTIVE,
        } as Player,
        {
          id: "opp2",
          gridPosition: { x: 6, y: 6 },
          status: PlayerStatus.ACTIVE,
        } as Player,
      ];

      // AG 3+ with -2 modifier = need 5+
      const result = controller.attemptDodge(
        player,
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        multipleOpponents
      );

      expect(result.success).toBe(false); // Roll 4, need 5+
      expect(result.modifiers).toBe(-2);
    });
  });

  describe("Edge Cases", () => {
    it("should handle AG 2+ with no modifiers", () => {
      vi.spyOn(Math, "random").mockReturnValue(1 / 6); // Roll 2
      player.stats.AG = 2;

      const result = controller.attemptDodge(
        player,
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        []
      );

      expect(result.success).toBe(true);
      expect(result.target).toBe(2);
    });

    it("should handle AG 5+ with modifiers", () => {
      vi.spyOn(Math, "random").mockReturnValue(5 / 6); // Roll 6
      player.stats.AG = 5;

      const opponentsAtDest: Player[] = [
        {
          id: "opp1",
          gridPosition: { x: 7, y: 5 },
          status: PlayerStatus.ACTIVE,
        } as Player,
      ];

      // AG 5+ with -1 modifier = need 6+
      const result = controller.attemptDodge(
        player,
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        opponentsAtDest
      );

      expect(result.success).toBe(true);
      expect(result.target).toBe(5);
    });
  });
});
