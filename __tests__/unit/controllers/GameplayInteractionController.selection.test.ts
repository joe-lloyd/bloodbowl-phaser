import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameplayInteractionController } from "../../../src/game/controllers/GameplayInteractionController";
import { GamePhase, GameState } from "../../../src/types/GameState";
import { GameEventNames } from "../../../src/types/events";
import { getSkill, SkillType } from "../../../src/types/Skills";
import {
  mockScene,
  mockPitch,
  mockEventBus,
  mockGameService,
  answerStepPrompt,
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

  describe("Negatrait confirm", () => {
    it("is let go, unanswered, when the board is torn down", async () => {
      const boneHead = {
        ...player1,
        id: "bone",
        skills: [getSkill(SkillType.BONE_HEAD)],
      };
      mockScene.team1.players = [boneHead];
      mockGameService.getState.mockReturnValue({
        activeTeamId: team1Id,
        weather: "Nice",
        activePlayer: null,
      } as unknown as GameState);
      mockGameService.getPlayerById.mockReturnValue(boneHead);
      mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
      mockGameService.getAvailableMovements.mockReturnValue([]);
      mockGameService.declareAction.mockReturnValue(true);

      controller.selectPlayer("bone");
      const declaring = (controller as any).onActionSelected({
        action: "move",
        playerId: "bone",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      controller.destroy();
      // Never answered, so the declaration never goes on
      void declaring;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockGameService.declareAction).not.toHaveBeenCalled();
      const resultListeners = mockEventBus.on.mock.calls.filter(
        ([name]) => name === GameEventNames.UI_ConfirmationResult
      ).length;
      const removed = mockEventBus.off.mock.calls.filter(
        ([name]) => name === GameEventNames.UI_ConfirmationResult
      ).length;
      expect(removed).toBe(resultListeners);
    });

    it("declares nothing when the coach picked someone else while it was open", async () => {
      const boneHead = {
        ...player1,
        id: "bone",
        skills: [getSkill(SkillType.BONE_HEAD)],
      };
      const mate = { ...player1, id: "mate", gridPosition: { x: 2, y: 2 } };
      mockScene.team1.players = [boneHead, mate];
      mockGameService.getState.mockReturnValue({
        activeTeamId: team1Id,
        weather: "Nice",
        activePlayer: null,
      } as unknown as GameState);
      mockGameService.getPlayerById.mockImplementation(
        (id: string) => ({ bone: boneHead, mate })[id]
      );
      mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
      mockGameService.declareAction.mockReturnValue(true);
      mockGameService.getAvailableMovements.mockReturnValue([]);

      controller.selectPlayer("bone");
      const declaring = (controller as any).onActionSelected({
        action: "blitz",
        playerId: "bone",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      // The confirm is up; the coach selects the team-mate, then confirms
      controller.selectPlayer("mate");
      await answerStepPrompt(true);
      await declaring;

      expect(mockGameService.declareAction).not.toHaveBeenCalledWith(
        "bone",
        "blitz",
        undefined
      );
    });
  });

  describe("Player Selection", () => {
    it("draws no tackle-zone squares for a Distracted opponent", () => {
      mockGameService.getState.mockReturnValue({
        activeTeamId: team1Id,
      } as GameState);
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.getAvailableMovements.mockReturnValue([]);
      // player2 (the only opponent) is Distracted — still Standing, but
      // hasTackleZone must exclude them from the drawn overlay.
      mockScene.team2.players = [
        {
          ...player2,
          conditions: [{ type: "Distracted" }],
        },
      ];

      controller.selectPlayer("p1");

      expect(mockPitch.drawTackleZones).toHaveBeenCalledWith([]);
    });

    it("should select player and show visuals if it is their turn", () => {
      mockGameService.getState.mockReturnValue({
        activeTeamId: team1Id,
      } as GameState);
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.getAvailableMovements.mockReturnValue([]);

      controller.selectPlayer("p1");

      expect(mockScene.highlightPlayer).toHaveBeenCalledWith("p1");
      expect(mockPitch.drawRangeOverlay).toHaveBeenCalled();
      expect(mockPitch.drawTackleZones).toHaveBeenCalled();
      // Expect overlays since it IS own turn
    });

    it("should select player but NOT show movement visuals if NOT their turn", () => {
      mockGameService.getState.mockReturnValue({
        activeTeamId: team2Id,
      } as GameState); // Team 2 is active
      mockGameService.getPlayerById.mockReturnValue(player1); // Selecting Team 1 player

      controller.selectPlayer("p1");

      expect(mockScene.highlightPlayer).toHaveBeenCalledWith("p1");
      expect(mockPitch.drawRangeOverlay).not.toHaveBeenCalled(); // Should NOT show ranges
    });
  });

  describe("a push into the crowd", () => {
    const handler = (name: string) =>
      mockEventBus.on.mock.calls.find(([event]) => event === name)?.[1];

    it("highlights the off-pitch square and resolves the push when it is clicked", () => {
      handler(GameEventNames.UI_SelectPushDirection)({
        validDirections: [{ x: 11, y: -1 }],
        defenderId: "p2",
        attackerId: "p1",
        resultType: "push",
        pushTier: "crowd",
      });

      expect(mockPitch.highlightSquare).toHaveBeenCalledWith(11, -1, 0xff0000, {
        crowd: true,
      });

      // The click lands one square off the pitch, on the highlighted square
      (mockPitch as Record<string, unknown>).worldToGrid = vi.fn(() => ({
        x: 11,
        y: -1,
      }));
      controller.handlePointerDown({ worldX: 0, worldY: 0 }, false);

      expect(mockGameService.executePush).toHaveBeenCalledWith(
        "p1",
        "p2",
        { x: 11, y: -1 },
        "push",
        false
      );
    });

    it("ignores a click two squares off the pitch", () => {
      handler(GameEventNames.UI_SelectPushDirection)({
        validDirections: [{ x: 11, y: -1 }],
        defenderId: "p2",
        attackerId: "p1",
        resultType: "push",
        pushTier: "crowd",
      });
      (mockPitch as Record<string, unknown>).worldToGrid = vi.fn(() => ({
        x: 11,
        y: -2,
      }));
      controller.handlePointerDown({ worldX: 0, worldY: 0 }, false);

      expect(mockGameService.executePush).not.toHaveBeenCalled();
    });
  });

  describe("a push the other coach picks", () => {
    // Online, the push arrows reach both boards; only the attacker picks
    const handler = (name: string) =>
      mockEventBus.on.mock.calls.find(([event]) => event === name)?.[1];

    it("frees the board once the push is settled", () => {
      mockGameService.getState.mockReturnValue({
        activeTeamId: team1Id,
      } as GameState);
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.getAvailableMovements.mockReturnValue([]);

      handler(GameEventNames.UI_SelectPushDirection)({
        validDirections: [{ x: 7, y: 7 }],
        defenderId: "p2",
        attackerId: "p9",
      });
      handler(GameEventNames.DecisionResolved)?.({ type: "push-direction" });
      controller.handlePlayerClick("p1");

      expect(mockGameService.executePush).not.toHaveBeenCalled();
      expect(mockScene.highlightPlayer).toHaveBeenCalledWith("p1");
    });
  });

  describe("Razzle-Dazzle pitch shortcuts", () => {
    beforeEach(() => {
      mockGameService.getState.mockReturnValue({
        activeTeamId: team1Id,
        phase: GamePhase.PLAY,
        activePlayer: {
          id: player1.id,
          action: "block",
          committed: true,
          razzleDazzle: { actions: ["block"], awaitingSecond: true },
        },
      } as GameState);
      mockGameService.getPlayerById.mockReturnValue(player1);
      controller["selectedPlayerId"] = player1.id;
    });

    it("validates a second Block declaration before previewing the adjacent defender", async () => {
      (controller as any).getPlayerAt = vi.fn().mockReturnValue(player2);
      mockGameService.declareAction.mockReturnValueOnce(false);
      await (controller as any).onSquareClicked(6, 6);
      expect(mockGameService.declareAction).toHaveBeenCalledWith(
        player1.id,
        "block"
      );
      expect(mockGameService.previewBlock).not.toHaveBeenCalled();
    });

    it.each([true, false])(
      "uses the second Move declaration's verdict (%s)",
      (accepted) => {
        mockGameService.declareAction.mockReturnValueOnce(accepted);
        expect((controller as any).declareMoveIfNone(player1.id, "block")).toBe(
          accepted
        );
        expect(mockGameService.declareAction).toHaveBeenCalledWith(
          player1.id,
          "move"
        );
      }
    );
  });
});
