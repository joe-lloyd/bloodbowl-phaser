import { serviceSpies } from "./GameplayInteractionController.setup";
import { eventHandler } from "./GameplayInteractionController.setup";
import { playerWith } from "./controllerFixtures";
import { stateWith } from "./GameplayInteractionController.setup";
import { eventBusSpies } from "./GameplayInteractionController.setup";
import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { GameplayInteractionController } from "../../../src/game/controllers/GameplayInteractionController";
import { GamePhase } from "../../../src/types/GameState";
import { GameEventNames } from "../../../src/types/events";
import { getSkill, SkillType } from "../../../src/types/Skills";
import { mockScene, mockPitch, mockGameService, mockMovementValidator, answerStepPrompt, team1Id, player1, createController } from "./GameplayInteractionController.setup";

interface Entry {
  order: number;
  call: string;
}

function sent(commands: (keyof typeof serviceSpies)[], events: string[]): string[] {
  const entries: Entry[] = [];
  for (const name of commands) {
    const mock = serviceSpies[name];
    for (const [i, args] of mock.mock.calls.entries()) {
      entries.push({
        order: fixtureValue(mock.mock.invocationCallOrder[i]),
        call: `${name}(${args.map((a) => JSON.stringify(a)).join(", ")})`,
      });
    }
  }
  for (const [i, args] of eventBusSpies.emit.mock.calls.entries()) {
    const [event, payload] = args;
    if (typeof event === "string" && events.includes(event))
      entries.push({
        order: fixtureValue(eventBusSpies.emit.mock.invocationCallOrder[i]),
        call: `${event} ${JSON.stringify(payload ?? null)}`,
      });
  }
  return entries.toSorted((a, b) => a.order - b.order).map((e) => e.call);
}

function clickAt(
  controller: GameplayInteractionController,
  x: number,
  y: number
) {
  mockPitch.worldToGrid.mockImplementation(() => ({
    x,
    y,
  }));
  controller.handlePointerDown({ worldX: 0, worldY: 0 }, false);
}

describe("GameplayInteractionController", () => {
  let controller: GameplayInteractionController;

  beforeEach(() => {
    controller = createController();
    mockGameService.getState.mockReturnValue(stateWith({
      activeTeamId: team1Id,
      phase: GamePhase.PLAY,
      weather: "Nice",
      activePlayer: null,
    }));
    mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
    mockGameService.getPlayerById.mockImplementation(
      (id: string) =>
        [...mockScene.team1.players, ...mockScene.team2.players].find(
          (p: { id: string }) => p.id === id
        ) ?? undefined
    );
    mockGameService.declareAction.mockReturnValue(true);
  });

  describe("command order", () => {
    it("declares an implicit Block, clears the board and previews it in the click's own tick", () => {
      controller.selectPlayer("p1");
      vi.clearAllMocks();

      clickAt(controller, 6, 6);

      expect(
        sent(["declareAction", "previewBlock"], [GameEventNames.PlayerSelected])
      ).toEqual([
        "declareAction({\"playerId\":\"p1\",\"action\":\"block\"})",
        "playerSelected " + JSON.stringify({ player: null }),
        'previewBlock("p1", "p2")',
      ]);
    });

    it("asks the negatrait first, then declares the Block, clears the board and previews it", async () => {
      const boneHead = { ...player1, skills: [getSkill(SkillType.BONE_HEAD)] };
      mockScene.team1.players = [boneHead];
      controller.selectPlayer("p1");
      vi.clearAllMocks();

      clickAt(controller, 6, 6);
      expect(serviceSpies.declareAction).not.toHaveBeenCalled();
      await answerStepPrompt(true);

      expect(
        sent(
          ["declareAction", "previewBlock"],
          [GameEventNames.UI_RequestConfirmation, GameEventNames.PlayerSelected]
        ).map((call) => call.split(" {", 1)[0])
      ).toEqual([
        "ui:requestConfirmation",
        "declareAction({\"playerId\":\"p1\",\"action\":\"block\"})",
        "playerSelected",
        'previewBlock("p1", "p2")',
      ]);
    });

    it("declares a Move and plots the square in the click's own tick", () => {
      mockMovementValidator.findPath.mockReturnValue({ rolls: [],  cost: 0,
        valid: true,
        path: [{ x: 6, y: 5 }],
      });
      controller.selectPlayer("p1");
      vi.clearAllMocks();

      clickAt(controller, 6, 5);

      expect(
        sent(["declareAction"], [GameEventNames.UI_ActionPlan]).map(
          (call) => call.split(" {", 1)[0]
        )
      ).toEqual(["declareAction({\"playerId\":\"p1\",\"action\":\"move\"})", "ui:actionPlan"]);
      expect(mockMovementValidator.findPath).toHaveBeenCalledTimes(1);
    });

    it("aims Hypnotic Gaze at an adjacent opponent, and lets the gazer go once it resolves", async () => {
      let resolveGaze: (ok: boolean) => void = () => {};
      mockGameService.performSpecialAction.mockImplementation(
        () => new Promise<boolean>((resolve) => (resolveGaze = resolve))
      );
      controller.selectPlayer("p1");
      controller.currentActionMode = "gaze";
      controller.currentStepId = "target";
      vi.clearAllMocks();

      clickAt(controller, 6, 6);

      expect(serviceSpies.performSpecialAction).toHaveBeenCalledWith(
        "gaze",
        "p1",
        "p2"
      );
      expect(controller.isBusy).toBe(true);
      expect(controller.hasSelection()).toBe(true);

      resolveGaze(true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(controller.isBusy).toBe(false);
      expect(controller.hasSelection()).toBe(false);
    });

    it("keeps the board busy through a Hand-off and lets the player go once it resolves", async () => {
      mockGameService.getState.mockReturnValue(stateWith({ activeTeamId: team1Id, ballPosition: { x: 5, y: 5 } }));
      const mate = playerWith({
        ...player1,
        id: "p3",
        gridPosition: { x: 6, y: 5 },
        playerName: "Catcher",
      });
      mockScene.team1.players = [player1, mate];
      mockGameService.getTeammates.mockReturnValue([mate]);
      let resolveHandoff: () => void = () => {};
      mockGameService.handOffBall.mockImplementation(
        () => new Promise<{ success: boolean }>((resolve) => { resolveHandoff = () => { resolve({ success: true }); }; })
      );
      controller.selectPlayer("p1");
      controller.currentActionMode = "handoff";
      controller.currentStepId = "handoff";
      vi.clearAllMocks();

      controller.handlePlayerClick("p3");
      expect(serviceSpies.handOffBall).not.toHaveBeenCalled();
      controller.handlePlayerClick("p3");

      expect(serviceSpies.handOffBall).toHaveBeenCalledWith("p1", "p3");
      expect(controller.isBusy).toBe(true);
      expect(sent([], [GameEventNames.PlayerSelected])).toEqual([]);

      resolveHandoff();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(controller.isBusy).toBe(false);
      expect(sent(["handOffBall"], [GameEventNames.PlayerSelected])).toEqual([
        'handOffBall("p1", "p3")',
        "playerSelected " + JSON.stringify({ player: null }),
      ]);
    });

    it("takes a chain push's next decision while the first push is still being sent", () => {
      const handler = eventHandler(GameEventNames.UI_SelectPushDirection);
      handler({
        canFollowUp: false, validDirections: [{ x: 7, y: 7 }],
        defenderId: "p2",
        attackerId: "p1",
        resultType: "push",
        pushTier: "chain",
      });

      mockGameService.executePush.mockImplementationOnce(() => {
        handler({
          canFollowUp: false, validDirections: [{ x: 8, y: 8 }],
          defenderId: "p4",
          attackerId: "p2",
          resultType: "push",
        });
        return Promise.resolve();
      });

      clickAt(controller, 7, 7);
      clickAt(controller, 8, 8);

      expect(sent(["executePush"], [])).toEqual([
        "executePush({\"attackerId\":\"p1\",\"defenderId\":\"p2\",\"direction\":{\"x\":7,\"y\":7},\"resultType\":\"push\",\"followUp\":false})",
        "executePush({\"attackerId\":\"p2\",\"defenderId\":\"p4\",\"direction\":{\"x\":8,\"y\":8},\"resultType\":\"push\",\"followUp\":false})",
      ]);
    });
  });
});
