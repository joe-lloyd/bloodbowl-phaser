import { describe, it, expect, beforeEach, vi } from "vitest";
import { BlockManager } from "../../../src/game/managers/BlockManager";
import { GameState } from "../../../src/types/GameState";
import { Team } from "../../../src/types/Team";
import { Player, PlayerStatus } from "../../../src/types/Player";
import { GameEventNames } from "../../../src/types/events";

describe("BlockManager", () => {
  let manager: BlockManager;
  let mockEventBus: any;
  let mockState: GameState;
  let mockTeam1: Team;
  let mockTeam2: Team;
  let mockBlockResolutionService: any;
  let mockDiceController: any;
  let attacker: Player;
  let defender: Player;

  beforeEach(() => {
    mockEventBus = { emit: vi.fn() };
    mockState = {} as GameState;

    attacker = {
      id: "team1-p1",
      teamId: "team1",
      playerName: "Attacker",
      gridPosition: { x: 5, y: 5 },
      stats: { ST: 3, AG: 3, AV: 8 },
      status: PlayerStatus.ACTIVE,
    } as Player;

    defender = {
      id: "team2-p1",
      teamId: "team2",
      playerName: "Defender",
      gridPosition: { x: 6, y: 5 },
      stats: { ST: 3, AG: 3, AV: 8 },
      status: PlayerStatus.ACTIVE,
    } as Player;

    mockTeam1 = { id: "team1", players: [attacker] } as Team;
    mockTeam2 = { id: "team2", players: [defender] } as Team;

    mockBlockResolutionService = {
      rollBlockDice: vi.fn().mockReturnValue([{ type: "push" }]),
      getValidPushDirections: vi.fn().mockReturnValue([]),
      allowsFollowUp: vi.fn().mockReturnValue(true),
    };

    mockDiceController = {
      rollBlockDice: vi.fn().mockReturnValue([{ type: "push" }]),
    };

    manager = new BlockManager(
      mockEventBus,
      mockState,
      mockTeam1,
      mockTeam2,
      mockBlockResolutionService,
      mockDiceController,
      {
        onTurnover: vi.fn(),
      }
    );
  });

  describe("Preview Block", () => {
    it("should emit block dialog with analysis", () => {
      manager.previewBlock(attacker.id, defender.id);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.UI_BlockDialog,
        expect.objectContaining({
          attackerId: attacker.id,
          defenderId: defender.id,
          analysis: expect.any(Object),
        })
      );
    });
  });

  describe("Roll Block Dice", () => {
    it("should call diceController.rollBlockDice", () => {
      manager.rollBlockDice(attacker.id, defender.id, 2, true);

      expect(mockDiceController.rollBlockDice).toHaveBeenCalledWith(2, "team1");
    });

    it("should emit BlockDiceRolled event", () => {
      manager.rollBlockDice(attacker.id, defender.id, 2, true);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.BlockDiceRolled,
        expect.objectContaining({
          attackerId: attacker.id,
          defenderId: defender.id,
          numDice: 2,
        })
      );
    });
  });
});
