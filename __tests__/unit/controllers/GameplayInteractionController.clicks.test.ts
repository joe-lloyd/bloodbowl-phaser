import { eventBusSpies } from "./GameplayInteractionController.setup";
import { serviceSpies } from "./GameplayInteractionController.setup";
import { whenFlowIdle } from "./GameplayInteractionController.setup";
import { playerWith } from "./controllerFixtures";
import { stateWith } from "./GameplayInteractionController.setup";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { GameplayInteractionController } from "../../../src/game/controllers/GameplayInteractionController";
import { GamePhase } from "../../../src/types/GameState";
import { PlayerStatus } from "../../../src/types/Player";
import {
  mockScene,
  mockGameService,
  mockMovementValidator,
  player1,
  createController,
} from "./GameplayInteractionController.setup";

describe("GameplayInteractionController", () => {
  let controller: GameplayInteractionController;

  beforeEach(() => {
    controller = createController();
  });

  describe("Player Click Handling", () => {
    it("should redirect to onSquareClicked if in Pass Mode and clicking a player", () => {
      controller.currentActionMode = "pass";
      controller.currentStepId = "pass";

      const mockPlayer = playerWith({
        id: "p2",
        gridPosition: { x: 5, y: 5 },
        teamId: "t2",
      });
      (controller).scene.team1.players = [];
      (controller).scene.team2.players = [mockPlayer];

      const spy = vi.spyOn(controller, "onSquareClicked");

      controller.handlePlayerClick("p2");

      expect(spy).toHaveBeenCalledWith(5, 5);
    });

    it("should complete a hand-off (not reselect) when clicking the target team-mate", () => {
      controller.currentActionMode = "handoff";
      controller.currentStepId = "handoff";
      controller.selectedPlayerId = "p1";
      mockGameService.getState.mockReturnValue(stateWith({ ballPosition: { x: 5, y: 5 } }));

      const teammate = playerWith({
        id: "p3",
        gridPosition: { x: 6, y: 5 },
        teamId: "team1",
        status: "Active",
      });
      (controller).scene.team1.players = [teammate];
      (controller).scene.team2.players = [];
      mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
      mockGameService.isTouchbackPending.mockReturnValue(false);
      mockGameService.getPlayerById.mockImplementation((id: string) =>
        { if (id === "p1") { return playerWith({
              id: "p1",
              teamId: "team1",
              gridPosition: { x: 5, y: 5 },
              status: "Active",
              skills: [],
            }); } if (id === "p3") { return teammate; } return undefined; }
      );
      (controller).getPlayerAt = vi.fn().mockReturnValue(teammate);

      const selectSpy = vi.spyOn(controller, "selectPlayer");

      controller.handlePlayerClick("p3");
      expect(serviceSpies.handOffBall).not.toHaveBeenCalled();
      controller.handlePlayerClick("p3");

      expect(serviceSpies.handOffBall).toHaveBeenCalledWith("p1", "p3");
      expect(serviceSpies.throwBall).not.toHaveBeenCalled();
      expect(selectSpy).not.toHaveBeenCalled();
    });

    it("plans the hand-off on the first click and makes it on the second", () => {
      controller.currentActionMode = "handoff";
      controller.currentStepId = "handoff";
      controller.selectedPlayerId = "p1";
      mockGameService.getState.mockReturnValue(stateWith({ ballPosition: { x: 5, y: 5 } }));
      mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
      mockGameService.isTouchbackPending.mockReturnValue(false);
      mockGameService.getPlayerById.mockImplementation((id: string) =>
        id === "p1"
          ? playerWith({
              id: "p1",
              teamId: "team1",
              gridPosition: { x: 5, y: 5 },
              status: "Active",
              skills: [],
            })
          : undefined
      );
      const receiver = playerWith({
        id: "p3",
        teamId: "team1",
        gridPosition: { x: 6, y: 5 },
        status: "Active",
      });
      (controller).scene.team1.players = [player1, receiver];
      (controller).getPlayerAt = vi.fn().mockReturnValue(receiver);

      void (controller).onSquareClicked(6, 5);
      expect(serviceSpies.handOffBall).not.toHaveBeenCalled();
      void (controller).onSquareClicked(6, 5);

      expect(serviceSpies.handOffBall).toHaveBeenCalledWith("p1", "p3");
      expect(serviceSpies.throwBall).not.toHaveBeenCalled();
    });

    it("should refuse a hand-off click on an illegal (Distracted) target without throwing", () => {
      controller.currentActionMode = "handoff";
      controller.currentStepId = "handoff";
      controller.selectedPlayerId = "p1";
      mockGameService.getState.mockReturnValue(stateWith({ ballPosition: { x: 5, y: 5 } }));
      mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
      mockGameService.isTouchbackPending.mockReturnValue(false);
      mockGameService.getPlayerById.mockImplementation((id: string) =>
        id === "p1"
          ? playerWith({
              id: "p1",
              teamId: "team1",
              gridPosition: { x: 5, y: 5 },
              status: "Active",
              skills: [],
            })
          : undefined
      );
      (controller).getPlayerAt = vi.fn().mockReturnValue(playerWith({
        id: "p3",
        teamId: "team1",
        gridPosition: { x: 6, y: 5 },
        status: "Active",
        conditions: [{ type: "Distracted" }],
      }));

      void (controller).onSquareClicked(6, 5);

      expect(serviceSpies.handOffBall).not.toHaveBeenCalled();
      expect(eventBusSpies.emit).toHaveBeenCalledWith(
        "ui:notification",
        expect.stringContaining("Tackle Zone")
      );
    });

    it("should select player normally if not in Pass Mode", () => {
      controller.currentActionMode = null;

      mockGameService.getPlayerById.mockReturnValue(playerWith({
        id: "p1",
        teamId: "team1",
        stats: { MA: 6, ST: 3, AG: 3, AV: 8 },
        status: "Active",
      }));
      mockGameService.canActivate.mockReturnValue(true);
      mockGameService.getState.mockReturnValue(stateWith({ activeTeamId: "team1" }));

      const spy = vi.spyOn(controller, "selectPlayer");

      controller.handlePlayerClick("p1");

      expect(spy).toHaveBeenCalledWith("p1");
    });
  });

  describe("Foul target highlight timing", () => {
    const target = playerWith({
      stats: { AV: 9 },
      skills: [],
      id: "p2",
      teamId: "team2",
      gridPosition: { x: 6, y: 5 },
      status: PlayerStatus.PRONE,
    });

    function armFoulClick() {
      controller.currentActionMode = "foul";
      controller.currentStepId = "foul";
      controller.selectedPlayerId = "p1";
      mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.getState.mockReturnValue(stateWith({ weather: "Nice" }));
      (controller).scene.team2.players = [target];
      (controller).getPlayerAt = vi.fn().mockReturnValue(target);
    }

    it("keeps the highlight while the flow queue is still draining", async () => {
      armFoulClick();
      let resolveIdle!: () => void;
      const idle = new Promise<void>((resolve) => {
        resolveIdle = resolve;
      });
      whenFlowIdle.mockImplementation(() => idle);

      void (controller).onSquareClicked(6, 5);
      expect(serviceSpies.foulPlayer).not.toHaveBeenCalled();
      const click = (controller).onSquareClicked(6, 5);

      await Promise.resolve();
      await Promise.resolve();
      expect(serviceSpies.foulPlayer).toHaveBeenCalledWith("p1", 6, 5);
      expect(mockScene.unhighlightPlayer).not.toHaveBeenCalled();

      resolveIdle();
      await click;

      expect(mockScene.unhighlightPlayer).toHaveBeenCalledWith("p1");
    });

    it("clears the highlight once the queue is already idle", async () => {
      armFoulClick();
      whenFlowIdle.mockResolvedValue(undefined);

      void (controller).onSquareClicked(6, 5);
      await (controller).onSquareClicked(6, 5);

      expect(serviceSpies.foulPlayer).toHaveBeenCalledWith("p1", 6, 5);
      expect(mockScene.unhighlightPlayer).toHaveBeenCalledWith("p1");
    });
  });

  it.each([
    { step: "throw", mateX: 5, throws: 1 },
    { step: "move", mateX: 5, throws: 0 },
    { step: "throw", mateX: 9, throws: 0 },
  ])("throws a team-mate at x $mateX $throws times from the $step step", async ({ step, mateX, throws }) => {
    mockGameService.getAvailableMovements.mockReturnValue([]);
    mockMovementValidator.findPath.mockReturnValue({ cost: 0, valid: false, path: [], rolls: [] });
    const throwTeammate = vi.fn().mockResolvedValue(undefined);
    Object.assign(mockGameService, { throwTeammate });
    mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
    mockGameService.isTouchbackPending.mockReturnValue(false);
    mockGameService.getState.mockReturnValue(stateWith({ ballPosition: null }));
    mockGameService.getPlayerById.mockImplementation((id: string) => playerWith({ id, teamId: "team1", gridPosition: { x: id === "p1" ? 5 : mateX, y: id === "p1" ? 5 : 6 }, status: "Active", skills: [] }));
    controller.getPlayerAt = vi.fn().mockReturnValue(null);
    controller.currentActionMode = "throwTeamMate";
    controller.selectedPlayerId = "p1";
    controller.ttmTeammateId = "p2";
    controller.currentStepId = step;
    await controller.onSquareClicked(7, 5);
    expect(throwTeammate).toHaveBeenCalledTimes(throws);
  });
});
