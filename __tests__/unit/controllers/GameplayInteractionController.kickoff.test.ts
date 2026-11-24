import { newKick } from "../../../src/game/kickoff/kickRecord";
import { serviceSpies } from "./GameplayInteractionController.setup";
import { markerWith } from "./controllerFixtures";
import { stateWith } from "./GameplayInteractionController.setup";
import { dispatchAction } from "./GameplayInteractionController.setup";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { GameplayInteractionController } from "../../../src/game/controllers/GameplayInteractionController";
import { GamePhase } from "../../../src/types/GameState";
import type { KickoffTurn } from "../../../src/game/kickoff/kickoffTurn";
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
    const playing = (
      event: KickoffEvent,
      play: KickoffTurn["play"],
      playerIds: string[]
    ) => {
      mockGameService.getPhase.mockReturnValue(GamePhase.KICKOFF);
      mockGameService.getState.mockReturnValue(
        stateWith({
          activeTeamId: team1Id,
          phase: GamePhase.KICKOFF,
          turn: { teamId: team1Id },
          kick: {
            ...newKick(team1Id, "coach"),
            step: {
              stage: "play",
              event,
              play,
              playerIds,
              selectionLimit: 2,
              resume: { activeTeamId: team2Id, teamId: team2Id, turnNumber: 1 },
            },
          },
        })
      );
      mockGameService.getKickoffEventStep.mockReturnValue({
        event,
        teamId: team1Id,
        selectionLimit: 2,
        selectedPlayerIds: playerIds,
        movedPlayerIds: [],
        awaitingPlacement: [],
        stage: "play",
        canReselect: true,
      });
      mockGameService.getTeam.mockReturnValue(mockScene.team1);
      mockGameService.getPlayerById.mockReturnValue(player1);
    };

    it.each([KickoffEvent.ALERT_DEFENCE, KickoffEvent.QUICK_SNAP])(
      "steps a picked %s player to an adjacent square",
      (event) => {
        playing(event, { kind: "one-square" }, [player1.id]);
        controller.handlePlayerClick(player1.id);
        void controller.onSquareClicked(6, 5);
        expect(serviceSpies.selectKickoffEventPlayer).not.toHaveBeenCalled();
        expect(serviceSpies.moveKickoffEventPlayer).toHaveBeenCalledWith(
          player1.id,
          6,
          5
        );
      }
    );

    it("shows the empty squares around the player the coach selected", () => {
      mockPitch.highlightSquare.mockReturnValue(markerWith({ destroy: vi.fn() }));
      playing(KickoffEvent.ALERT_DEFENCE, { kind: "one-square" }, [player1.id]);
      controller.syncKickoffStepInteraction();
      expect(mockPitch.highlightSquare).not.toHaveBeenCalled();
      expect(mockScene.highlightPlayer).toHaveBeenCalledWith(player1.id, 0xffd700);

      controller.handlePlayerClick(player1.id);
      const green = new Set(
        mockPitch.highlightSquare.mock.calls.map(
          ([square]) => `${String(square.x)},${String(square.y)}`
        )
      );
      expect([...green].sort()).toEqual(
        ["4,4", "4,5", "4,6", "5,4", "5,6", "6,4", "6,5"].sort()
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
        stage: "choose",
        canReselect: false,
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

    it("lets a picked Charge! player use normal board actions", async () => {
      playing(KickoffEvent.CHARGE, { kind: "actions", actions: ["move"] }, [
        player1.id,
      ]);
      mockGameService.isTouchbackPending.mockReturnValue(false);
      mockGameService.declareAction.mockReturnValue(true);
      controller.selectedPlayerId = player1.id;

      await dispatchAction({ playerId: player1.id, action: "move" });

      expect(serviceSpies.declareAction).toHaveBeenCalledWith({
        playerId: player1.id,
        action: "move",
      });
      expect(controller.currentActionMode).toBe("move");
    });
  });
});
