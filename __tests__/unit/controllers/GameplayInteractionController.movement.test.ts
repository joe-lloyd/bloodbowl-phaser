import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameplayInteractionController } from "../../../src/game/controllers/GameplayInteractionController";
import { GamePhase, GameState } from "../../../src/types/GameState";
import { GameEventNames } from "../../../src/types/events";
import { getSkill, SkillType } from "../../../src/types/Skills";
import {
  mockScene,
  mockPitch,
  mockMovementValidator,
  mockEventBus,
  mockGameService,
  answerStepPrompt,
  team1Id,
  player1,
  createController,
} from "./GameplayInteractionController.setup";

describe("GameplayInteractionController", () => {
  let controller: GameplayInteractionController;

  beforeEach(() => {
    controller = createController();
  });

  describe("Movement Planning (Waypoints)", () => {
    beforeEach(() => {
      // Setup active turn and select player
      mockGameService.getState.mockReturnValue({
        activeTeamId: team1Id,
        phase: GamePhase.PLAY,
        weather: "Nice",
      } as GameState);
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);

      controller.selectPlayer("p1");
    });

    it("should add a waypoint when clicking an empty square", () => {
      const targetX = 6;
      const targetY = 5;

      // Mock Pathfinder Result
      mockMovementValidator.findPath.mockReturnValue({
        valid: true,
        path: [{ x: targetX, y: targetY }],
        rolls: [],
      });

      // Simulate Click
      (controller as any).onSquareClicked(targetX, targetY);

      // Expect findPath called
      expect(mockMovementValidator.findPath).toHaveBeenCalled();

      // Expect waypoint added -> drawCurrentPath called -> drawMovementPath called
      expect(mockPitch.drawMovementPath).toHaveBeenCalled();
    });

    it("says so when a clicked square is out of reach", () => {
      // clearAllMocks keeps return values: put this one back after
      mockGameService.getMovementUsed.mockReturnValue(4);
      try {
        mockMovementValidator.findPath.mockReturnValue({
          valid: false,
          path: [],
          rolls: [],
        });

        (controller as any).onSquareClicked(12, 5);

        // The search is given the squares already spent
        expect(mockMovementValidator.findPath.mock.calls[0][5]).toBe(4);
        expect(mockEventBus.emit).toHaveBeenCalledWith(
          GameEventNames.UI_Notification,
          "Out of reach"
        );
        expect(mockPitch.drawMovementPath).not.toHaveBeenCalled();
      } finally {
        mockGameService.getMovementUsed.mockReturnValue(0);
      }
    });

    it("walks nowhere when the board is torn down with a Dodge prompt open", async () => {
      mockMovementValidator.findPath.mockReturnValue({
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      (controller as any).onSquareClicked(6, 5); // Add
      (controller as any).onSquareClicked(6, 5); // Confirm: asks for the Dodge
      await new Promise((resolve) => setTimeout(resolve, 0));
      const ask = mockEventBus.emit.mock.calls
        .filter(([name]) => name === GameEventNames.UI_RequestConfirmation)
        .at(-1);
      expect(ask).toBeDefined();

      controller.destroy();
      // Nothing may touch the pitch once the board is gone
      const pitchCalls = () =>
        Object.values(mockPitch).reduce(
          (count: number, member) =>
            count +
            (typeof member === "function" && "mock" in member
              ? (member as { mock: { calls: unknown[] } }).mock.calls.length
              : 0),
          0
        );
      const drawnAtTeardown = pitchCalls();
      // A late answer reaches only listeners still attached: none
      const removed = new Set(
        mockEventBus.off.mock.calls
          .filter(([name]) => name === GameEventNames.UI_ConfirmationResult)
          .map(([, handler]) => handler)
      );
      mockEventBus.on.mock.calls
        .filter(
          ([name, handler]) =>
            name === GameEventNames.UI_ConfirmationResult &&
            !removed.has(handler)
        )
        .forEach(([, handler]) =>
          handler({ confirmed: true, actionId: ask![1].actionId })
        );
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockGameService.movePlayer).not.toHaveBeenCalled();
      expect(pitchCalls()).toBe(drawnAtTeardown);
    });

    it("should execute move and deselect if player has acted", async () => {
      // Mock hasPlayerActed to true (turn ended for player)
      mockGameService.hasPlayerActed.mockReturnValue(true);

      // 1. Add Waypoint
      mockMovementValidator.findPath.mockReturnValue({
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      (controller as any).onSquareClicked(6, 5); // Add

      // 2. Click Same Spot (Confirm)
      (controller as any).onSquareClicked(6, 5); // Confirm
      // Player 2 at (6,6) marks (5,5): leaving it is a Dodge
      await answerStepPrompt(true);

      expect(mockGameService.movePlayer).toHaveBeenCalledWith("p1", [
        { x: 6, y: 5 },
      ]);

      // Wait for promise chain resolution
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockScene.unhighlightPlayer).toHaveBeenCalled(); // Deselects after move
    });

    it("should execute move and KEEP player selected if player has NOT acted (partial move)", async () => {
      // Mock hasPlayerActed to false (partial move)
      mockGameService.hasPlayerActed.mockReturnValue(false);

      // 1. Add Waypoint
      mockMovementValidator.findPath.mockReturnValue({
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      (controller as any).onSquareClicked(6, 5); // Add

      // 2. Click Same Spot (Confirm)
      (controller as any).onSquareClicked(6, 5); // Confirm
      // Player 2 at (6,6) marks (5,5): leaving it is a Dodge
      await answerStepPrompt(true);

      expect(mockGameService.movePlayer).toHaveBeenCalledWith("p1", [
        { x: 6, y: 5 },
      ]);

      // Wait for promise chain resolution
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockScene.unhighlightPlayer).not.toHaveBeenCalled(); // Should NOT deselect
      expect(mockScene.highlightPlayer).toHaveBeenCalled(); // Should refresh highlight
    });

    it("asks before the Dodge with the number needed, and stops there when declined", async () => {
      mockMovementValidator.findPath.mockReturnValue({
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      (controller as any).onSquareClicked(6, 5);
      (controller as any).onSquareClicked(6, 5);
      expect(mockGameService.movePlayer).not.toHaveBeenCalled();

      const prompt = await answerStepPrompt(false);

      expect(prompt.title).toBe("Blitzer: Dodge");
      // (6,5) is next to player 2 as well: AG 3+ with -1 is 4+
      expect(prompt.message).toContain("Dodge: 4+");
      expect(prompt.message).toContain("No re-roll available.");
      // The target and nothing more: the rules give a coach no odds
      expect(prompt.message).toBe(
        "Dodge: 4+. A fall is a turnover.\nNo re-roll available."
      );
      expect(prompt.cancelLabel).toBe("Stop here");
      // What the other coach sees read-only online
      expect(prompt.step).toEqual({
        playerId: "p1",
        rolls: [{ type: "dodge", target: 4 }],
      });
      expect(mockGameService.movePlayer).not.toHaveBeenCalled();
      expect(mockScene.unhighlightPlayer).not.toHaveBeenCalled();
    });

    it("lists the team re-roll once for a dodge onto the ball", async () => {
      // Round 3, 1:20:17: "team re-roll (1 left): 5+, 33%, team re-roll
      // (1 left): 5+, 33%", though one team re-roll covers one roll
      const state = mockGameService.getState();
      mockGameService.getState.mockReturnValue({
        ...state,
        ballPosition: { x: 6, y: 5 },
      });
      const arbiter = mockGameService.getRerollArbiter();
      arbiter.teamRerollAvailable.mockReturnValue(true);
      arbiter.nextTeamReroll.mockReturnValue("team");
      arbiter.teamRerollsLeftFor = vi.fn().mockReturnValue(1);
      mockMovementValidator.findPath.mockReturnValue({
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      (controller as any).onSquareClicked(6, 5);
      (controller as any).onSquareClicked(6, 5);

      const prompt = await answerStepPrompt(false);
      arbiter.teamRerollAvailable.mockReturnValue(false);
      arbiter.nextTeamReroll.mockReturnValue(null);

      expect(
        prompt.step.rolls.map((roll: { type: string }) => roll.type)
      ).toEqual(["dodge", "pickup"]);
      expect(prompt.message.match(/team re-roll/g)).toHaveLength(1);
      // The route summary counts the two rolls as two risky steps, as it
      // does when they fall on different squares
      const route = mockEventBus.emit.mock.calls
        .filter(
          ([name, data]) => name === GameEventNames.UI_RoutePreview && data
        )
        .at(-1);
      expect(route?.[1].riskySteps).toBe(2);
      expect(prompt.message).toContain(
        "Re-rolls: team re-roll (1 left), for one of the two rolls."
      );
    });

    it("lists Pro once for a dodge onto the ball", async () => {
      // Round 4, 19:09: "Pro needs 3+, then 4+: 33%, Pro needs 3+, then
      // 4+: 33%", though Pro works once a turn
      const state = mockGameService.getState();
      mockGameService.getState.mockReturnValue({
        ...state,
        ballPosition: { x: 6, y: 5 },
        activePlayer: { id: "p1", action: "move", committed: true },
      });
      const pro = { ...player1, skills: [getSkill(SkillType.PRO)] };
      mockGameService.getPlayerById.mockReturnValue(pro);
      const arbiter = mockGameService.getRerollArbiter();
      arbiter.onceAvailable.mockReturnValue(true);
      mockMovementValidator.findPath.mockReturnValue({
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      (controller as any).onSquareClicked(6, 5);
      (controller as any).onSquareClicked(6, 5);

      const prompt = await answerStepPrompt(false);
      arbiter.onceAvailable.mockReturnValue(false);

      expect(prompt.message).toBe(
        "Dodge: 4+, then Pick up: 4+. A fail is a turnover.\n" +
          "Re-rolls: Pro needs 3+, for one of the two rolls."
      );
    });

    it("names the one roll Veteran covers on a dodge onto the ball", async () => {
      // Veteran re-rolls a Pick up but not a Dodge
      const state = mockGameService.getState();
      mockGameService.getState.mockReturnValue({
        ...state,
        ballPosition: { x: 6, y: 5 },
      });
      const arbiter = mockGameService.getRerollArbiter();
      arbiter.veteranRerollAvailable.mockReturnValue(true);
      mockMovementValidator.findPath.mockReturnValue({
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      (controller as any).onSquareClicked(6, 5);
      (controller as any).onSquareClicked(6, 5);

      const prompt = await answerStepPrompt(false);
      arbiter.veteranRerollAvailable.mockReturnValue(false);

      expect(prompt.message).toBe(
        "Dodge: 4+, then Pick up: 4+. A fail is a turnover.\n" +
          "Re-rolls: Veteran re-roll: Pick up 4+."
      );
    });

    it("walks the safe part first and asks again before the risky step", async () => {
      mockGameService.hasPlayerActed.mockReturnValue(false);
      // Player 2 out of the way; a Rush is needed after 6 squares
      mockScene.team2.players = [];
      const route = [1, 2, 3, 4, 5, 6, 7].map((i) => ({ x: 5 + i, y: 5 }));
      let at = { x: 5, y: 5 };
      mockGameService.getPlayerById.mockImplementation(() => ({
        ...player1,
        gridPosition: at,
      }));
      mockGameService.movePlayer.mockImplementation(async (_id, path) => {
        at = path[path.length - 1];
        mockGameService.getMovementUsed.mockReturnValue(at.x - 5);
      });
      mockMovementValidator.findPath.mockReturnValue({
        valid: true,
        path: route,
        rolls: [],
      });
      (controller as any).onSquareClicked(12, 5);
      (controller as any).onSquareClicked(12, 5);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockGameService.movePlayer).toHaveBeenCalledTimes(1);
      expect(mockGameService.movePlayer).toHaveBeenLastCalledWith(
        "p1",
        route.slice(0, 6)
      );
      const prompt = await answerStepPrompt(true);
      expect(prompt.title).toBe("Blitzer: Rush");
      expect(mockGameService.movePlayer).toHaveBeenCalledTimes(2);
      expect(mockGameService.movePlayer).toHaveBeenLastCalledWith("p1", [
        { x: 12, y: 5 },
      ]);
    });
  });
});
