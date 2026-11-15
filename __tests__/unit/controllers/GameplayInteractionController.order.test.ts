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
  mockMovementValidator,
  answerStepPrompt,
  team1Id,
  player1,
  createController,
} from "./GameplayInteractionController.setup";

/**
 * Online play runs in lockstep, so the board must send its commands and
 * events in the order it always has. These follow a click from the
 * board's public entry points and read back that order.
 */

type Entry = { order: number; call: string };

/** The engine commands and bus events named here, in the order they ran. */
function sent(commands: string[], events: string[]): string[] {
  const entries: Entry[] = [];
  for (const name of commands) {
    const mock = mockGameService[name];
    mock.mock.calls.forEach((args: unknown[], i: number) =>
      entries.push({
        order: mock.mock.invocationCallOrder[i],
        call: `${name}(${args.map((a) => JSON.stringify(a)).join(", ")})`,
      })
    );
  }
  mockEventBus.emit.mock.calls.forEach((args: unknown[], i: number) => {
    const [event, payload] = args;
    if (typeof event === "string" && events.includes(event))
      entries.push({
        order: mockEventBus.emit.mock.invocationCallOrder[i],
        call: `${event} ${JSON.stringify(payload ?? null)}`,
      });
  });
  return entries.sort((a, b) => a.order - b.order).map((e) => e.call);
}

/** Point the next board click at this square. */
function clickAt(
  controller: GameplayInteractionController,
  x: number,
  y: number
) {
  (mockPitch as Record<string, unknown>).worldToGrid = vi.fn(() => ({ x, y }));
  controller.handlePointerDown({ worldX: 0, worldY: 0 }, false);
}

describe("GameplayInteractionController", () => {
  let controller: GameplayInteractionController;

  beforeEach(() => {
    controller = createController();
    mockGameService.getState.mockReturnValue({
      activeTeamId: team1Id,
      phase: GamePhase.PLAY,
      weather: "Nice",
      activePlayer: null,
    } as unknown as GameState);
    mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
    mockGameService.getPlayerById.mockImplementation(
      (id: string) =>
        [...mockScene.team1.players, ...mockScene.team2.players].find(
          (p: { id: string }) => p.id === id
        ) ?? null
    );
    mockGameService.declareAction.mockReturnValue(true);
  });

  describe("command order", () => {
    it("declares an implicit Block, clears the board and previews it in the click's own tick", () => {
      controller.selectPlayer("p1");
      vi.clearAllMocks();

      clickAt(controller, 6, 6);

      // Nothing awaited: all three went out before the click returned
      expect(
        sent(["declareAction", "previewBlock"], [GameEventNames.PlayerSelected])
      ).toEqual([
        'declareAction("p1", "block")',
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
      expect(mockGameService.declareAction).not.toHaveBeenCalled();
      await answerStepPrompt(true);

      expect(
        sent(
          ["declareAction", "previewBlock"],
          [GameEventNames.UI_RequestConfirmation, GameEventNames.PlayerSelected]
        ).map((call) => call.split(" {")[0])
      ).toEqual([
        "ui:requestConfirmation",
        'declareAction("p1", "block")',
        "playerSelected",
        'previewBlock("p1", "p2")',
      ]);
    });

    it("declares a Move and plots the square in the click's own tick", () => {
      mockMovementValidator.findPath.mockReturnValue({
        valid: true,
        path: [{ x: 6, y: 5 }],
      });
      controller.selectPlayer("p1");
      vi.clearAllMocks();

      clickAt(controller, 6, 5);

      expect(
        sent(["declareAction"], [GameEventNames.UI_MovePlan]).map(
          (call) => call.split(" {")[0]
        )
      ).toEqual(['declareAction("p1", "move")', "ui:movePlan"]);
      expect(mockMovementValidator.findPath).toHaveBeenCalledTimes(1);
    });

    it("aims Hypnotic Gaze at an adjacent opponent, and lets the gazer go once it resolves", async () => {
      let resolveGaze: (ok: boolean) => void = () => {};
      mockGameService.performSpecialAction = vi.fn(
        () => new Promise<boolean>((resolve) => (resolveGaze = resolve))
      );
      controller.selectPlayer("p1");
      controller["currentActionMode"] = "gaze";
      controller["currentStepId"] = "target";
      vi.clearAllMocks();

      clickAt(controller, 6, 6);

      expect(mockGameService.performSpecialAction).toHaveBeenCalledWith(
        "gaze",
        "p1",
        "p2"
      );
      expect(controller["isBusy"]).toBe(true);
      expect(controller.hasSelection()).toBe(true);

      resolveGaze(true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(controller["isBusy"]).toBe(false);
      expect(controller.hasSelection()).toBe(false);
    });

    it("keeps the board busy through a Hand-off and lets the player go once it resolves", async () => {
      const mate = {
        ...player1,
        id: "p3",
        gridPosition: { x: 6, y: 5 },
        playerName: "Catcher",
      };
      mockScene.team1.players = [player1, mate];
      mockGameService.getTeammates.mockReturnValue([mate]);
      let resolveHandoff: () => void = () => {};
      mockGameService.handOffBall.mockImplementation(
        () => new Promise<void>((resolve) => (resolveHandoff = resolve))
      );
      controller.selectPlayer("p1");
      controller["currentActionMode"] = "handoff";
      controller["currentStepId"] = "handoff";
      vi.clearAllMocks();

      controller.handlePlayerClick("p3");

      expect(mockGameService.handOffBall).toHaveBeenCalledWith("p1", "p3");
      expect(controller["isBusy"]).toBe(true);
      expect(sent([], [GameEventNames.PlayerSelected])).toEqual([]);

      resolveHandoff();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(controller["isBusy"]).toBe(false);
      expect(sent(["handOffBall"], [GameEventNames.PlayerSelected])).toEqual([
        'handOffBall("p1", "p3")',
        "playerSelected " + JSON.stringify({ player: null }),
      ]);
    });

    it("takes a chain push's next decision while the first push is still being sent", () => {
      const handler = mockEventBus.on.mock.calls.find(
        ([event]: [string]) => event === GameEventNames.UI_SelectPushDirection
      )?.[1];
      handler({
        validDirections: [{ x: 7, y: 7 }],
        defenderId: "p2",
        attackerId: "p1",
        resultType: "push",
        pushTier: "chain",
      });
      // The first push shoves a second player: its squares open at once
      mockGameService.executePush.mockImplementationOnce(() => {
        handler({
          validDirections: [{ x: 8, y: 8 }],
          defenderId: "p4",
          attackerId: "p2",
          resultType: "push",
        });
        return Promise.resolve();
      });

      clickAt(controller, 7, 7);
      clickAt(controller, 8, 8);

      expect(sent(["executePush"], [])).toEqual([
        'executePush("p1", "p2", {"x":7,"y":7}, "push", false)',
        'executePush("p2", "p4", {"x":8,"y":8}, "push", false)',
      ]);
    });
  });
});
