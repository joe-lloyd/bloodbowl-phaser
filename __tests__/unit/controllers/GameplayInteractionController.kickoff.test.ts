import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameplayInteractionController } from "../../../src/game/controllers/GameplayInteractionController";
import { GamePhase } from "../../../src/types/GameState";
import { KickoffEvent } from "../../../src/game/kickoff/kickoffEvents";
import {
  mockScene,
  mockPitch,
  mockGameService,
  team1Id,
  team2Id,
  player1,
  player2,
  createController,
} from "./GameplayInteractionController.setup";

describe("GameplayInteractionController", () => {
  let controller: GameplayInteractionController;

  beforeEach(() => {
    controller = createController();
  });

  describe("Kickoff event pitch interaction", () => {
    it("moves a selected Alert Defence player to an adjacent pitch square", () => {
      mockGameService.getPhase.mockReturnValue(GamePhase.KICKOFF);
      // The engine records the pick; the square click moves that pick
      const step = {
        event: KickoffEvent.ALERT_DEFENCE,
        teamId: team1Id,
        selectionLimit: 2,
        selectedPlayerIds: [] as string[],
        movedPlayerIds: [],
        awaitingPlacement: [],
      };
      mockGameService.getKickoffEventStep.mockImplementation(() => step);
      mockGameService.selectKickoffEventPlayer.mockImplementation(
        (id: string) => {
          step.selectedPlayerIds.push(id);
          return true;
        }
      );
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.getTeam.mockReturnValue(mockScene.team1);

      controller.handlePlayerClick(player1.id);
      (controller as any).onSquareClicked(6, 5);

      expect(mockGameService.selectKickoffEventPlayer).toHaveBeenCalledWith(
        player1.id
      );
      expect(mockGameService.moveKickoffEventPlayer).toHaveBeenCalledWith(
        player1.id,
        6,
        5
      );
      expect(mockGameService.placeKickoffEventPlayer).not.toHaveBeenCalled();
    });

    it("marks already-moved Alert Defence players as selected", () => {
      mockGameService.getKickoffEventStep.mockReturnValue({
        event: KickoffEvent.ALERT_DEFENCE,
        teamId: team1Id,
        selectionLimit: 2,
        selectedPlayerIds: [player1.id],
        movedPlayerIds: [player1.id],
        awaitingPlacement: [],
      });
      mockGameService.getTeam.mockReturnValue(mockScene.team1);

      (controller as any).syncKickoffStepInteraction();

      expect(mockScene.highlightPlayer).not.toHaveBeenCalledWith(
        player1.id,
        0x38bdf8
      );
      expect(mockScene.highlightPlayer).toHaveBeenCalledWith(
        player1.id,
        0xffd700
      );
    });

    it("shows the empty squares a picked Alert Defence player may step to", () => {
      mockPitch.highlightSquare.mockReturnValue({ destroy: vi.fn() });
      mockGameService.getKickoffEventStep.mockReturnValue({
        event: KickoffEvent.ALERT_DEFENCE,
        teamId: team1Id,
        selectionLimit: 2,
        selectedPlayerIds: [player1.id],
        movedPlayerIds: [],
        awaitingPlacement: [],
      });
      mockGameService.getTeam.mockReturnValue(mockScene.team1);

      (controller as any).syncKickoffStepInteraction();

      // Around (5, 5), all but (6, 6), where an opponent stands
      const green = mockPitch.highlightSquare.mock.calls
        .filter(([, , colour]) => colour === 0x22c55e)
        .map(([x, y]) => `${x},${y}`)
        .sort();
      expect(green).toEqual(
        ["4,4", "4,5", "4,6", "5,4", "5,6", "6,4", "6,5"].sort()
      );
    });

    it("marks squares only around the latest pick, the one a click moves", () => {
      mockGameService.getPhase.mockReturnValue(GamePhase.KICKOFF);
      mockPitch.highlightSquare.mockReturnValue({ destroy: vi.fn() });
      const second = { ...player1, id: "p3", gridPosition: { x: 10, y: 2 } };
      mockScene.team1.players = [player1, second];
      mockGameService.getKickoffEventStep.mockReturnValue({
        event: KickoffEvent.QUICK_SNAP,
        teamId: team1Id,
        selectionLimit: 3,
        selectedPlayerIds: [player1.id, second.id],
        movedPlayerIds: [],
        awaitingPlacement: [],
      });
      mockGameService.getTeam.mockReturnValue(mockScene.team1);

      (controller as any).syncKickoffStepInteraction();
      const green = new Set(
        mockPitch.highlightSquare.mock.calls
          .filter(([, , colour]) => colour === 0x22c55e)
          .map(([x, y]) => `${x},${y}`)
      );
      expect([...green].sort()).toEqual(
        ["9,1", "9,2", "9,3", "10,1", "10,3", "11,1", "11,2", "11,3"].sort()
      );

      (controller as any).onSquareClicked(11, 2);
      expect(mockGameService.moveKickoffEventPlayer).toHaveBeenCalledWith(
        "p3",
        11,
        2
      );
    });

    it("places a High Kick receiver under the ball from one pitch click", () => {
      mockGameService.getPhase.mockReturnValue(GamePhase.KICKOFF);
      mockGameService.getKickoffEventStep.mockReturnValue({
        event: KickoffEvent.HIGH_KICK,
        teamId: team2Id,
        selectionLimit: 1,
        selectedPlayerIds: [],
        movedPlayerIds: [],
        awaitingPlacement: [],
        landingSquare: { x: 12, y: 6 },
      });
      mockGameService.getPlayerById.mockReturnValue(player2);
      mockGameService.getTeam.mockReturnValue(mockScene.team2);

      controller.handlePlayerClick(player2.id);

      expect(mockGameService.selectKickoffEventPlayer).toHaveBeenCalledWith(
        player2.id
      );
      expect(mockGameService.placeKickoffEventPlayer).toHaveBeenCalledWith(
        player2.id,
        12,
        6
      );
    });

    it("moves a selected Quick Snap player to an adjacent pitch square", () => {
      mockGameService.getPhase.mockReturnValue(GamePhase.KICKOFF);
      // The engine records the pick; the square click moves that pick
      const step = {
        event: KickoffEvent.QUICK_SNAP,
        teamId: team1Id,
        selectionLimit: 2,
        selectedPlayerIds: [] as string[],
        movedPlayerIds: [],
        awaitingPlacement: [],
      };
      mockGameService.getKickoffEventStep.mockImplementation(() => step);
      mockGameService.selectKickoffEventPlayer.mockImplementation(
        (id: string) => {
          step.selectedPlayerIds.push(id);
          return true;
        }
      );
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.getTeam.mockReturnValue(mockScene.team1);

      controller.handlePlayerClick(player1.id);
      (controller as any).onSquareClicked(6, 5);

      expect(mockGameService.selectKickoffEventPlayer).toHaveBeenCalledWith(
        player1.id
      );
      expect(mockGameService.moveKickoffEventPlayer).toHaveBeenCalledWith(
        player1.id,
        6,
        5
      );
    });

    it("lets an active Charge player use normal board actions", async () => {
      mockGameService.getPhase.mockReturnValue(GamePhase.KICKOFF);
      mockGameService.getKickoffEventStep.mockReturnValue({
        event: KickoffEvent.CHARGE,
        teamId: team1Id,
        selectionLimit: 1,
        selectedPlayerIds: [player1.id],
        movedPlayerIds: [],
        awaitingPlacement: [],
        charge: {
          queue: [],
          budget: { blitz: 1, throwTeammate: 1, kickTeammate: 1 },
          activePlayerId: player1.id,
          aborted: false,
        },
      });
      mockGameService.isTouchbackPending.mockReturnValue(false);
      mockGameService.getState.mockReturnValue({ activeTeamId: team1Id });
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.declareAction.mockReturnValue(true);
      mockGameService.getTeam.mockReturnValue(mockScene.team1);
      (controller as any).selectedPlayerId = player1.id;

      await (controller as any).onActionSelected({
        playerId: player1.id,
        action: "move",
      });

      expect(mockGameService.declareAction).toHaveBeenCalledWith(
        player1.id,
        "move",
        undefined
      );
      expect((controller as any).currentActionMode).toBe("move");
    });
  });
});
