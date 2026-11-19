import { serviceSpies } from "./GameplayInteractionController.setup";
import { z } from "zod";
import { playerWith } from "./controllerFixtures";
import { mockArbiter } from "./GameplayInteractionController.setup";
import { stateWith } from "./GameplayInteractionController.setup";
import { eventBusSpies } from "./GameplayInteractionController.setup";
import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { GameplayInteractionController } from "../../../src/game/controllers/GameplayInteractionController";
import { GamePhase } from "../../../src/types/GameState";
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
  player2,
  createController,
} from "./GameplayInteractionController.setup";

describe("GameplayInteractionController", () => {
  let controller: GameplayInteractionController;

  beforeEach(() => {
    controller = createController();
  });

  describe("Movement Planning (Waypoints)", () => {
    beforeEach(() => {
      mockGameService.getState.mockReturnValue(stateWith({
        activeTeamId: team1Id,
        phase: GamePhase.PLAY,
        weather: "Nice",
      }));
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);

      controller.selectPlayer("p1");
    });

    it("should add a waypoint when clicking an empty square", () => {
      const targetX = 6;
      const targetY = 5;

      mockMovementValidator.findPath.mockReturnValue({ cost: 0,
        valid: true,
        path: [{ x: targetX, y: targetY }],
        rolls: [],
      });

      void (controller).onSquareClicked(targetX, targetY);

      expect(mockMovementValidator.findPath).toHaveBeenCalled();

      expect(mockPitch.drawMovementPath).toHaveBeenCalled();
    });

    it("says so when a clicked square is out of reach", () => {
      mockGameService.getMovementUsed.mockReturnValue(4);
      try {
        mockMovementValidator.findPath.mockReturnValue({ cost: 0,
          valid: false,
          path: [],
          rolls: [],
        });

        void (controller).onSquareClicked(12, 5);

        expect(fixtureValue(fixtureValue(mockMovementValidator.findPath.mock.calls[0])[0]).movementUsed).toBe(4);
        expect(eventBusSpies.emit).toHaveBeenCalledWith(
          GameEventNames.UI_Notification,
          "Out of reach"
        );
        expect(mockPitch.drawMovementPath).not.toHaveBeenCalled();
      } finally {
        mockGameService.getMovementUsed.mockReturnValue(0);
      }
    });

    it("walks nowhere when the board is torn down with a Dodge prompt open", async () => {
      mockMovementValidator.findPath.mockReturnValue({ cost: 0,
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      void (controller).onSquareClicked(6, 5);
      void (controller).onSquareClicked(6, 5);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const ask = eventBusSpies.emit.mock.calls
        .filter(([name]) => name === GameEventNames.UI_RequestConfirmation)
        .at(-1);
      expect(ask).toBeDefined();

      controller.destroy();

      const pitchCalls = () =>
        Object.values(mockPitch).reduce(
          (count: number, member) =>
            count +
            (typeof member === "function" && "mock" in member
              ? (member).mock.calls.length
              : 0),
          0
        );
      const drawnAtTeardown = pitchCalls();

      mockEventBus.emit(GameEventNames.UI_ConfirmationResult, {
        confirmed: true,
        actionId: z.object({ actionId: z.string() }).parse(fixtureValue(ask)[1]).actionId,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(serviceSpies.movePlayer).not.toHaveBeenCalled();
      expect(pitchCalls()).toBe(drawnAtTeardown);
    });

    it("should execute move and deselect if player has acted", async () => {
      mockGameService.hasPlayerActed.mockReturnValue(true);

      mockMovementValidator.findPath.mockReturnValue({ cost: 0,
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      void (controller).onSquareClicked(6, 5);

      void (controller).onSquareClicked(6, 5);

      await answerStepPrompt(true);

      expect(serviceSpies.movePlayer).toHaveBeenCalledWith("p1", [
        { x: 6, y: 5 },
      ]);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockScene.unhighlightPlayer).toHaveBeenCalled();
    });

    it("should execute move and KEEP player selected if player has NOT acted (partial move)", async () => {
      mockGameService.hasPlayerActed.mockReturnValue(false);

      mockMovementValidator.findPath.mockReturnValue({ cost: 0,
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      void (controller).onSquareClicked(6, 5);

      void (controller).onSquareClicked(6, 5);

      await answerStepPrompt(true);

      expect(serviceSpies.movePlayer).toHaveBeenCalledWith("p1", [
        { x: 6, y: 5 },
      ]);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockScene.unhighlightPlayer).not.toHaveBeenCalled();
      expect(mockScene.highlightPlayer).toHaveBeenCalled();
    });

    it("asks before the Dodge with the number needed, and stops there when declined", async () => {
      mockMovementValidator.findPath.mockReturnValue({ cost: 0,
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      void (controller).onSquareClicked(6, 5);
      void (controller).onSquareClicked(6, 5);
      expect(serviceSpies.movePlayer).not.toHaveBeenCalled();

      const prompt = await answerStepPrompt(false);

      expect(prompt.title).toBe("Blitzer: Dodge");

      expect(prompt.message).toContain("Dodge: 4+");
      expect(prompt.message).toContain("No re-roll available.");

      expect(prompt.message).toBe(
        "Dodge: 4+. A fall is a turnover.\nNo re-roll available."
      );
      expect(prompt.cancelLabel).toBe("Stop here");

      expect(prompt.step).toEqual({
        playerId: "p1",
        rolls: [{ type: "dodge", target: 4 }],
      });
      expect(serviceSpies.movePlayer).not.toHaveBeenCalled();
      expect(mockScene.unhighlightPlayer).not.toHaveBeenCalled();
    });

    it("shows Rush 2+ and Dodge 3+ for a Stunty player in three tackle zones", async () => {
      const goblin = {
        ...player1,
        playerName: "Goblin",
        skills: [getSkill(SkillType.STUNTY), getSkill(SkillType.DODGE)],
      };
      mockGameService.getPlayerById.mockReturnValue(goblin);
      mockGameService.getMovementUsed.mockReturnValue(6);
      mockScene.team2.players = [
        playerWith({ ...player2, id: "gnome1", gridPosition: { x: 5, y: 6 } }),
        playerWith({ ...player2, id: "gnome2", gridPosition: { x: 6, y: 6 } }),
        playerWith({ ...player2, id: "gnome3", gridPosition: { x: 7, y: 6 } }),
      ];
      mockMovementValidator.findPath.mockReturnValue({ cost: 0,
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      try {
        await controller.onSquareClicked(6, 5);
        const rolls = [
          { type: "rush", target: 2, square: { x: 6, y: 5 } },
          { type: "dodge", target: 3, square: { x: 6, y: 5 } },
        ];
        expect(mockPitch.drawMovementPath).toHaveBeenLastCalledWith(
          [
            { x: 5, y: 5 },
            { x: 6, y: 5 },
          ],
          rolls,
          0
        );
        expect(eventBusSpies.emit).toHaveBeenCalledWith(
          GameEventNames.UI_RoutePreview,
          expect.objectContaining({ rolls })
        );

        void controller.onSquareClicked(6, 5);
        const prompt = await answerStepPrompt(false);
        expect(prompt.message).toContain("Rush: 2+");
        expect(prompt.message).toContain("Dodge: 3+");
        expect(fixtureValue(prompt.step).rolls).toEqual([
          { type: "rush", target: 2 },
          { type: "dodge", target: 3 },
        ]);
        expect(serviceSpies.movePlayer).not.toHaveBeenCalled();
      } finally {
        mockGameService.getMovementUsed.mockReturnValue(0);
      }
    });

    it("lists the team re-roll once for a dodge onto the ball", async () => {
      const state = mockGameService.getState();
      mockGameService.getState.mockReturnValue(stateWith({
        ...state,
        ballPosition: { x: 6, y: 5 },
      }));
      const arbiter = mockArbiter;
      arbiter.teamRerollAvailable.mockReturnValue(true);
      arbiter.nextTeamReroll.mockReturnValue("team");
      arbiter.teamRerollsLeftFor = vi.fn().mockReturnValue(1);
      mockMovementValidator.findPath.mockReturnValue({ cost: 0,
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      void (controller).onSquareClicked(6, 5);
      void (controller).onSquareClicked(6, 5);

      const prompt = await answerStepPrompt(false);
      arbiter.teamRerollAvailable.mockReturnValue(false);
      arbiter.nextTeamReroll.mockReturnValue(null);

      expect(
        fixtureValue(prompt.step).rolls.map((roll: { type: string }) => roll.type)
      ).toEqual(["dodge", "pickup"]);
      expect(prompt.message.match(/team re-roll/g)).toHaveLength(1);

      const route = eventBusSpies.emit.mock.calls
        .filter(
          ([name, data]) => name === GameEventNames.UI_RoutePreview && data
        )
        .at(-1);
      expect(route?.[1]).toMatchObject({ riskySteps: 2 });
      expect(prompt.message).toContain(
        "Re-rolls: team re-roll (1 left), for one of the two rolls."
      );
    });

    it("lists Pro once for a dodge onto the ball", async () => {
      const state = mockGameService.getState();
      mockGameService.getState.mockReturnValue(stateWith({
        ...state,
        ballPosition: { x: 6, y: 5 },
        activePlayer: { id: "p1", action: "move", committed: true },
      }));
      const pro = { ...player1, skills: [getSkill(SkillType.PRO)] };
      mockGameService.getPlayerById.mockReturnValue(pro);
      const arbiter = mockArbiter;
      arbiter.onceAvailable.mockReturnValue(true);
      mockMovementValidator.findPath.mockReturnValue({ cost: 0,
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      void (controller).onSquareClicked(6, 5);
      void (controller).onSquareClicked(6, 5);

      const prompt = await answerStepPrompt(false);
      arbiter.onceAvailable.mockReturnValue(false);

      expect(prompt.message).toBe(
        "Dodge: 4+, then Pick up: 4+. A fail is a turnover.\n" +
          "Re-rolls: Pro needs 3+, for one of the two rolls."
      );
    });

    it("names the one roll Veteran covers on a dodge onto the ball", async () => {
      const state = mockGameService.getState();
      mockGameService.getState.mockReturnValue(stateWith({
        ...state,
        ballPosition: { x: 6, y: 5 },
      }));
      const arbiter = mockArbiter;
      arbiter.veteranRerollAvailable.mockReturnValue(true);
      mockMovementValidator.findPath.mockReturnValue({ cost: 0,
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      void (controller).onSquareClicked(6, 5);
      void (controller).onSquareClicked(6, 5);

      const prompt = await answerStepPrompt(false);
      arbiter.veteranRerollAvailable.mockReturnValue(false);

      expect(prompt.message).toBe(
        "Dodge: 4+, then Pick up: 4+. A fail is a turnover.\n" +
          "Re-rolls: Veteran re-roll: Pick up 4+."
      );
    });

    it("walks the safe part first and asks again before the risky step", async () => {
      mockGameService.hasPlayerActed.mockReturnValue(false);

      mockScene.team2.players = [];
      const route = [1, 2, 3, 4, 5, 6, 7].map((i) => ({ x: 5 + i, y: 5 }));
      let at = { x: 5, y: 5 };
      mockGameService.getPlayerById.mockImplementation(() => ({
        ...player1,
        gridPosition: at,
      }));
      mockGameService.movePlayer.mockImplementation(async (_id, path) => {
        at = fixtureValue(path[path.length - 1]);
        mockGameService.getMovementUsed.mockReturnValue(at.x - 5);
      });
      mockMovementValidator.findPath.mockReturnValue({ cost: 0,
        valid: true,
        path: route,
        rolls: [],
      });
      void (controller).onSquareClicked(12, 5);
      void (controller).onSquareClicked(12, 5);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(serviceSpies.movePlayer).toHaveBeenCalledTimes(1);
      expect(serviceSpies.movePlayer).toHaveBeenLastCalledWith(
        "p1",
        route.slice(0, 6)
      );
      const prompt = await answerStepPrompt(true);
      expect(prompt.title).toBe("Blitzer: Rush");
      expect(serviceSpies.movePlayer).toHaveBeenCalledTimes(2);
      expect(serviceSpies.movePlayer).toHaveBeenLastCalledWith("p1", [
        { x: 12, y: 5 },
      ]);
    });
  });
});
