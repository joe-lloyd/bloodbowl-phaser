import { serviceSpies } from "./GameplayInteractionController.setup";
import { markerWith } from "./controllerFixtures";
import { playerWith } from "./controllerFixtures";
import { stateWith } from "./GameplayInteractionController.setup";
import { dispatchAction } from "./GameplayInteractionController.setup";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { GameplayInteractionController } from "../../../src/game/controllers/GameplayInteractionController";
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

      const step = {
        event: KickoffEvent.ALERT_DEFENCE,
        teamId: team1Id,
        selectionLimit: 2,
        selectedPlayerIds: new Array<string>(),
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
      void (controller).onSquareClicked(6, 5);

      expect(serviceSpies.selectKickoffEventPlayer).toHaveBeenCalledWith(
        player1.id
      );
      expect(serviceSpies.moveKickoffEventPlayer).toHaveBeenCalledWith(
        player1.id,
        6,
        5
      );
      expect(serviceSpies.placeKickoffEventPlayer).not.toHaveBeenCalled();
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

      (controller).syncKickoffStepInteraction();

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
      mockPitch.highlightSquare.mockReturnValue(markerWith({ destroy: vi.fn() }));
      mockGameService.getKickoffEventStep.mockReturnValue({
        event: KickoffEvent.ALERT_DEFENCE,
        teamId: team1Id,
        selectionLimit: 2,
        selectedPlayerIds: [player1.id],
        movedPlayerIds: [],
        awaitingPlacement: [],
      });
      mockGameService.getTeam.mockReturnValue(mockScene.team1);

      (controller).syncKickoffStepInteraction();

      const green = mockPitch.highlightSquare.mock.calls
        .filter(([, colour]) => colour === 0x22c55e)
        .map(([square]) => `${String(square.x)},${String(square.y)}`)
        .sort();
      expect(green).toEqual(
        ["4,4", "4,5", "4,6", "5,4", "5,6", "6,4", "6,5"].sort()
      );
    });

    it("marks squares only around the latest pick, the one a click moves", () => {
      mockGameService.getPhase.mockReturnValue(GamePhase.KICKOFF);
      mockPitch.highlightSquare.mockReturnValue(markerWith({ destroy: vi.fn() }));
      const second = playerWith({ ...player1, id: "p3", gridPosition: { x: 10, y: 2 } });
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

      (controller).syncKickoffStepInteraction();
      const green = new Set(
        mockPitch.highlightSquare.mock.calls
          .filter(([, colour]) => colour === 0x22c55e)
          .map(([square]) => `${String(square.x)},${String(square.y)}`)
      );
      expect([...green].sort()).toEqual(
        ["9,1", "9,2", "9,3", "10,1", "10,3", "11,1", "11,2", "11,3"].sort()
      );

      void (controller).onSquareClicked(11, 2);
      expect(serviceSpies.moveKickoffEventPlayer).toHaveBeenCalledWith(
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

      expect(serviceSpies.selectKickoffEventPlayer).toHaveBeenCalledWith(
        player2.id
      );
      expect(serviceSpies.placeKickoffEventPlayer).toHaveBeenCalledWith(
        player2.id,
        12,
        6
      );
    });

    it("moves a selected Quick Snap player to an adjacent pitch square", () => {
      mockGameService.getPhase.mockReturnValue(GamePhase.KICKOFF);

      const step = {
        event: KickoffEvent.QUICK_SNAP,
        teamId: team1Id,
        selectionLimit: 2,
        selectedPlayerIds: new Array<string>(),
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
      void (controller).onSquareClicked(6, 5);

      expect(serviceSpies.selectKickoffEventPlayer).toHaveBeenCalledWith(
        player1.id
      );
      expect(serviceSpies.moveKickoffEventPlayer).toHaveBeenCalledWith(
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
      mockGameService.getState.mockReturnValue(stateWith({ activeTeamId: team1Id }));
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.declareAction.mockReturnValue(true);
      mockGameService.getTeam.mockReturnValue(mockScene.team1);
      (controller).selectedPlayerId = player1.id;

      await dispatchAction({
        playerId: player1.id,
        action: "move",
      });

      expect(serviceSpies.declareAction).toHaveBeenCalledWith(
        { playerId: player1.id, action: "move" }
      );
      expect((controller).currentActionMode).toBe("move");
    });
  });
});
