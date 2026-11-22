import { serviceSpies } from "./GameplayInteractionController.setup";
import { z } from "zod";
import { playerWith } from "./controllerFixtures";
import { mockArbiter } from "./GameplayInteractionController.setup";
import { stateWith } from "./GameplayInteractionController.setup";
import { eventBusSpies } from "./GameplayInteractionController.setup";
import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, it, expect, beforeEach } from "vitest";
import type { GameplayInteractionController } from "../../../src/game/controllers/GameplayInteractionController";
import { GamePhase } from "../../../src/types/GameState";
import { GameEventNames } from "../../../src/types/events";
import { getSkill, SkillType } from "../../../src/types/Skills";
import { emptyDriveEffects } from "../../../src/game/kickoff/driveEffects";
import {
  mockScene,
  mockPitch,
  mockMovementValidator,
  mockGameService,
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

    it("should execute move and deselect if player has acted", async () => {
      mockGameService.hasPlayerActed.mockReturnValue(true);

      mockMovementValidator.findPath.mockReturnValue({ cost: 0,
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      void (controller).onSquareClicked(6, 5);
      void (controller).onSquareClicked(6, 5);
      await settle();

      expect(serviceSpies.movePlayer).toHaveBeenCalledWith("p1", [
        { x: 6, y: 5 },
      ]);
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
      await settle();

      expect(serviceSpies.movePlayer).toHaveBeenCalledWith("p1", [
        { x: 6, y: 5 },
      ]);
      expect(mockScene.unhighlightPlayer).not.toHaveBeenCalled();
      expect(mockScene.highlightPlayer).toHaveBeenCalled();
    });

    it("plans the Dodge with the number needed, then walks on the second click without asking", async () => {
      mockMovementValidator.findPath.mockReturnValue({ cost: 0,
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      void (controller).onSquareClicked(6, 5);

      expect(lastPlan()).toEqual({
        title: "Move",
        squares: 1,
        stages: [
          {
            label: "Move 1 square",
            rolls: [{ kind: "dodge", name: "Dodge", target: 4 }],
            notes: [],
          },
        ],
        rerolls: [],
        blocked: null,
      });
      expect(serviceSpies.movePlayer).not.toHaveBeenCalled();

      void (controller).onSquareClicked(6, 5);
      await settle();

      expect(confirmations()).toHaveLength(0);
      expect(serviceSpies.movePlayer).toHaveBeenCalledWith("p1", [{ x: 6, y: 5 }]);
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
        expect(fixtureValue(lastPlan()).stages[0]?.rolls).toEqual([
          { kind: "rush", name: "Rush", target: 2 },
          { kind: "dodge", name: "Dodge", target: 3 },
        ]);
      } finally {
        mockGameService.getMovementUsed.mockReturnValue(0);
      }
    });

    it("lists the team re-roll for a dodge onto the ball", () => {
      const state = mockGameService.getState();
      mockGameService.getState.mockReturnValue(stateWith({
        ...state,
        ballPosition: { x: 6, y: 5 },
      }));
      const arbiter = mockArbiter;
      arbiter.nextTeamReroll.mockReturnValue("team");
      arbiter.teamRerollsLeftFor.mockReturnValue(1);
      mockMovementValidator.findPath.mockReturnValue({ cost: 0,
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      try {
        void (controller).onSquareClicked(6, 5);

        const plan = fixtureValue(lastPlan());
        expect(plan.stages[0]?.rolls.map((roll) => roll.kind)).toEqual(["dodge", "pickup"]);
        expect(plan.rerolls).toEqual(["team 1 left"]);
      } finally {
        arbiter.nextTeamReroll.mockReturnValue(null);
        arbiter.teamRerollsLeftFor.mockReturnValue(0);
      }
    });

    it("lists Pro and Veteran among the plan's re-rolls", () => {
      const state = mockGameService.getState();
      mockGameService.getState.mockReturnValue(stateWith({
        ...state,
        ballPosition: { x: 6, y: 5 },
      }));
      const pro = { ...player1, skills: [getSkill(SkillType.PRO)] };
      mockGameService.getPlayerById.mockReturnValue(pro);
      const arbiter = mockArbiter;
      arbiter.onceAvailable.mockReturnValue(true);
      arbiter.veteranRerollAvailable.mockReturnValue(true);
      mockMovementValidator.findPath.mockReturnValue({ cost: 0,
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      try {
        void (controller).onSquareClicked(6, 5);
        expect(fixtureValue(lastPlan()).rerolls).toEqual(["Pro on 3+", "Veteran"]);
      } finally {
        arbiter.onceAvailable.mockReturnValue(false);
        arbiter.veteranRerollAvailable.mockReturnValue(false);
      }
    });

    it("counts a drive's movement modifier once when it plans the route's rolls", () => {
      mockScene.team2.players = [];
      mockGameService.getPlayerById.mockReturnValue({ ...player1, stats: { ...player1.stats, MA: 6 } });
      mockGameService.getState.mockReturnValue(stateWith({
        activeTeamId: team1Id,
        weather: "Nice",
        driveEffects: { ...emptyDriveEffects(), playerModifiers: { p1: { maModifier: -1 } } },
      }));
      const route = [1, 2, 3, 4, 5].map((i) => ({ x: 5 + i, y: 5 }));
      mockMovementValidator.findPath.mockReturnValue({ cost: 0, valid: true, path: route, rolls: [] });

      void (controller).onSquareClicked(10, 5);

      expect(fixtureValue(lastPlan()).stages[0]).toEqual({
        label: "Move 5 squares",
        rolls: [],
        notes: [],
      });
    });

    it("walks the safe part first, then the rush, without asking in between", async () => {
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
      try {
        void (controller).onSquareClicked(12, 5);
        void (controller).onSquareClicked(12, 5);
        await settle();

        expect(confirmations()).toHaveLength(0);
        expect(serviceSpies.movePlayer.mock.calls).toEqual([
          ["p1", route.slice(0, 6)],
          ["p1", [{ x: 12, y: 5 }]],
        ]);
      } finally {
        mockGameService.getMovementUsed.mockReturnValue(0);
      }
    });
  });
});

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function lastPlan() {
  return eventBusSpies.emit.mock.calls
    .filter(([name, data]) => name === GameEventNames.UI_ActionPlan && data)
    .map(([, data]) => z.object({ title: z.string(), squares: z.number(), stages: z.array(z.object({ label: z.string(), rolls: z.array(z.object({ kind: z.string(), name: z.string(), target: z.number() })), notes: z.array(z.string()) })), rerolls: z.array(z.string()), blocked: z.string().nullable() }).parse(data))
    .at(-1);
}

function confirmations() {
  return eventBusSpies.emit.mock.calls.filter(
    ([name]) => name === GameEventNames.UI_RequestConfirmation
  );
}
