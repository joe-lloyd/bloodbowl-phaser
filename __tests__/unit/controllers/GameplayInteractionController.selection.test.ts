import { serviceSpies } from "./GameplayInteractionController.setup";
import { eventHandler } from "./GameplayInteractionController.setup";
import { playerWith } from "./controllerFixtures";
import { stateWith } from "./GameplayInteractionController.setup";
import { dispatchAction } from "./GameplayInteractionController.setup";
import { eventBusSpies } from "./GameplayInteractionController.setup";
import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { GameplayInteractionController } from "../../../src/game/controllers/GameplayInteractionController";
import { GamePhase, type GameState } from "../../../src/types/GameState";
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
      const boneHead = playerWith({
        ...player1,
        id: "bone",
        skills: [getSkill(SkillType.BONE_HEAD)],
      });
      mockScene.team1.players = [boneHead];
      mockGameService.getState.mockReturnValue(stateWith({
        activeTeamId: team1Id,
        weather: "Nice",
        activePlayer: null,
      }));
      mockGameService.getPlayerById.mockReturnValue(boneHead);
      mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
      mockGameService.getAvailableMovements.mockReturnValue([]);
      mockGameService.declareAction.mockReturnValue(true);

      controller.selectPlayer("bone");
      const declaring = dispatchAction({
        action: "move",
        playerId: "bone",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      controller.destroy();

      await declaring;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(serviceSpies.declareAction).not.toHaveBeenCalled();
      const resultListeners = eventBusSpies.on.mock.calls.filter(
        ([name]) => name === GameEventNames.UI_ConfirmationResult
      ).length;
      const removed = eventBusSpies.off.mock.calls.filter(
        ([name]) => name === GameEventNames.UI_ConfirmationResult
      ).length;
      expect(removed).toBe(resultListeners);
    });

    it("declares nothing when the coach picked someone else while it was open", async () => {
      const boneHead = playerWith({
        ...player1,
        id: "bone",
        skills: [getSkill(SkillType.BONE_HEAD)],
      });
      const mate = playerWith({ ...player1, id: "mate", gridPosition: { x: 2, y: 2 } });
      mockScene.team1.players = [boneHead, mate];
      mockGameService.getState.mockReturnValue(stateWith({
        activeTeamId: team1Id,
        weather: "Nice",
        activePlayer: null,
      }));
      mockGameService.getPlayerById.mockImplementation(
        (id: string) => ({ bone: boneHead, mate })[id]
      );
      mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
      mockGameService.declareAction.mockReturnValue(true);
      mockGameService.getAvailableMovements.mockReturnValue([]);

      controller.selectPlayer("bone");
      const declaring = dispatchAction({
        action: "blitz",
        playerId: "bone",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      controller.selectPlayer("mate");
      await answerStepPrompt(true);
      await declaring;

      expect(serviceSpies.declareAction).not.toHaveBeenCalledWith(
        "bone",
        "blitz",
        undefined
      );
    });
  });

  describe("Player Selection", () => {
    it("draws no tackle-zone squares for a Distracted opponent", () => {
      mockGameService.getState.mockReturnValue(stateWith({
        activeTeamId: team1Id,
      }));
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.getAvailableMovements.mockReturnValue([]);

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
      mockGameService.getState.mockReturnValue(stateWith({
        activeTeamId: team1Id,
      }));
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.getAvailableMovements.mockReturnValue([]);

      controller.selectPlayer("p1");

      expect(mockScene.highlightPlayer).toHaveBeenCalledWith("p1");
      expect(mockPitch.drawRangeOverlay).toHaveBeenCalled();
      expect(mockPitch.drawTackleZones).toHaveBeenCalled();
    });

    it("should select player but NOT show movement visuals if NOT their turn", () => {
      mockGameService.getState.mockReturnValue(stateWith({
        activeTeamId: team2Id,
      }));
      mockGameService.getPlayerById.mockReturnValue(player1);

      controller.selectPlayer("p1");

      expect(mockScene.highlightPlayer).toHaveBeenCalledWith("p1");
      expect(mockPitch.drawRangeOverlay).not.toHaveBeenCalled();
    });
  });

  describe("a push into the crowd", () => {
    const handler = eventHandler;

    it("highlights the off-pitch square and resolves the push when it is clicked", () => {
      handler(GameEventNames.UI_SelectPushDirection)({
        canFollowUp: false, validDirections: [{ x: 11, y: -1 }],
        defenderId: "p2",
        attackerId: "p1",
        resultType: "push",
        pushTier: "crowd",
      });

      expect(mockPitch.highlightSquare).toHaveBeenCalledWith({ x: 11, y: -1 }, 0xff0000, {
        crowd: true,
      });

      mockPitch.worldToGrid.mockImplementation(() => ({
        x: 11,
        y: -1,
      }));
      controller.handlePointerDown({ worldX: 0, worldY: 0 }, false);

      expect(serviceSpies.executePush).toHaveBeenCalledWith(
        { attackerId: "p1", defenderId: "p2", direction: { x: 11, y: -1 }, resultType: "push", followUp: false }
      );
    });

    it("ignores a click two squares off the pitch", () => {
      handler(GameEventNames.UI_SelectPushDirection)({
        canFollowUp: false, validDirections: [{ x: 11, y: -1 }],
        defenderId: "p2",
        attackerId: "p1",
        resultType: "push",
        pushTier: "crowd",
      });
      mockPitch.worldToGrid.mockImplementation(() => ({
        x: 11,
        y: -2,
      }));
      controller.handlePointerDown({ worldX: 0, worldY: 0 }, false);

      expect(serviceSpies.executePush).not.toHaveBeenCalled();
    });
  });

  describe("a push the other coach picks", () => {
    const handler = eventHandler;

    it("frees the board once the push is settled", () => {
      mockGameService.getState.mockReturnValue(stateWith({
        activeTeamId: team1Id,
      }));
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.getAvailableMovements.mockReturnValue([]);

      handler(GameEventNames.UI_SelectPushDirection)({
        canFollowUp: false, validDirections: [{ x: 7, y: 7 }],
        defenderId: "p2",
        attackerId: "p9",
      });
      handler(GameEventNames.DecisionResolved)?.({ type: "push-direction" });
      controller.handlePlayerClick("p1");

      expect(serviceSpies.executePush).not.toHaveBeenCalled();
      expect(mockScene.highlightPlayer).toHaveBeenCalledWith("p1");
    });
  });

  describe("Razzle-Dazzle pitch shortcuts", () => {
    beforeEach(() => {
      mockGameService.getState.mockReturnValue(stateWith({
        activeTeamId: team1Id,
        phase: GamePhase.PLAY,
        activePlayer: {
          id: player1.id,
          action: "block",
          committed: true,
          razzleDazzle: { actions: ["block"], awaitingSecond: true },
        },
      }));
      mockGameService.getPlayerById.mockReturnValue(player1);
      controller.selectedPlayerId = player1.id;
    });

    it("validates a second Block declaration before previewing the adjacent defender", async () => {
      (controller).getPlayerAt = vi.fn().mockReturnValue(player2);
      mockGameService.declareAction.mockReturnValueOnce(false);
      await (controller).onSquareClicked(6, 6);
      expect(serviceSpies.declareAction).toHaveBeenCalledWith(
        { playerId: player1.id, action: "block" }
      );
      expect(serviceSpies.previewBlock).not.toHaveBeenCalled();
    });

    it.each([true, false])(
      "uses the second Move declaration's verdict (%s)",
      (accepted) => {
        mockGameService.declareAction.mockReturnValueOnce(accepted);
        expect((controller).declareMoveIfNone(player1.id, "block")).toBe(
          accepted
        );
        expect(serviceSpies.declareAction).toHaveBeenCalledWith(
          { playerId: player1.id, action: "move" }
        );
      }
    );
  });
});

describe("explicit End activation camera intent", () => {
  let controller: GameplayInteractionController;
  let state: GameState;
  const endFromUi = () => { fixtureValue(eventBusSpies.on.mock.calls.find(
      ([event]) => event === GameEventNames.UI_EndActivation
    ))[1](); };

  beforeEach(() => {
    controller = createController();
    state = stateWith({
      phase: GamePhase.PLAY,
      activeTeamId: team1Id,
      activePlayer: { id: player1.id, action: "move", committed: true },
      turn: { activatedPlayerIds: new Set() },
    });
    mockGameService.getState.mockImplementation(() => state);
    mockGameService.getPlayerById.mockImplementation((id: string) => ({
      ...player1,
      id,
    }));
    mockGameService.finishActivation.mockImplementation((id: string) => {
      state.activePlayer = null;
      state.turn.activatedPlayerIds.add(id);
    });
    controller.selectedPlayerId = player1.id;
  });

  it("asks for teammate framing after explicit UI completion", () => {
    endFromUi();
    expect(eventBusSpies.emit).toHaveBeenCalledWith(
      GameEventNames.Camera_ChooseNextPlayer,
      { teamId: team1Id, playerId: player1.id }
    );
    expect(controller.selectedPlayerId).toBeNull();
  });

  it("keeps the explicit intent while a computer or online command is queued", () => {
    mockGameService.runsCommandsLater = true;
    mockGameService.finishActivation.mockImplementation(() => {});
    endFromUi();
    expect(eventBusSpies.emit).toHaveBeenCalledWith(
      GameEventNames.Camera_ChooseNextPlayer,
      { teamId: team1Id, playerId: player1.id }
    );
    expect(controller.selectedPlayerId).toBeNull();
  });

  it("finishes the previous player during direct selection without requesting a team fit", () => {
    controller.selectPlayer("mate");
    expect(state.turn.activatedPlayerIds.has(player1.id)).toBe(true);
    expect(controller.selectedPlayerId).toBe("mate");
    expect(
      eventBusSpies.emit.mock.calls.filter(
        ([event]) => event === GameEventNames.Camera_ChooseNextPlayer
      )
    ).toEqual([]);
  });

  it.each(["charge", "razzle", "forced"])(
    "keeps %s continuation without a team fit",
    (kind) => {
      mockGameService.finishActivation.mockImplementation(() => {
        if (kind === "charge") controller.selectedPlayerId = "next-charger";
        else
          state.activePlayer = {
            id: player1.id,
            action: "move",
            committed: true,
            ...(kind === "razzle"
              ? { razzleDazzle: { actions: ["move"], awaitingSecond: true } }
              : {}),
          };
      });
      endFromUi();
      expect(
        eventBusSpies.emit.mock.calls.filter(
          ([event]) => event === GameEventNames.Camera_ChooseNextPlayer
        )
      ).toEqual([]);
      if (kind === "charge")
        expect(controller.selectedPlayerId).toBe("next-charger");
    }
  );
});
