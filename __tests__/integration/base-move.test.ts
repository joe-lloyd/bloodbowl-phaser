import { describe, expect, it, vi } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { GameEventNames, type ActionType } from "../../src/types/events";
import { PlayerStatus } from "../../src/types/Player";
import { forceDice } from "../utils/test-helpers";
import { board } from "../utils/interaction-board";

type Board = ReturnType<typeof board>;

const DOWNED = { playerIndex: 0, x: 11, y: 5, status: PlayerStatus.PRONE };
const CARRIER = { playerIndex: 0, x: 10, y: 5, hasBall: true, stats: { AG: 2 } };

async function planJump({ game, controller }: Board): Promise<void> {
  game.ctx.eventBus.emit(GameEventNames.UI_StepSelected, { stepId: "jump" });
  await controller.onSquareClicked(12, 5);
}

const CASES: { action: ActionType; team1: Parameters<typeof board>[0] }[] = [
  { action: "blitz", team1: [CARRIER] },
  { action: "pass", team1: [CARRIER, { playerIndex: 1, x: 15, y: 5 }] },
  { action: "handoff", team1: [CARRIER, { playerIndex: 1, x: 13, y: 5 }] },
  { action: "foul", team1: [CARRIER] },
];

describe("the base move is part of every action", () => {
  it.each(CASES)("a $action can jump over a downed player", async ({ action, team1 }) => {
    const set = board(team1, [DOWNED, { playerIndex: 1, x: 17, y: 9 }]);
    forceDice(set.game.ctx.rng, [6, 6, 6]);
    const jumper = set.act(0, action);
    await planJump(set);
    expect(jumper.gridPosition).toEqual({ x: 10, y: 5 });
    expect(fixtureValue(set.seen.plan).stages).toContainEqual(
      expect.objectContaining({
        rolls: [{ kind: "jump", name: "Jump", target: 2 }],
      })
    );

    await set.controller.onSquareClicked(12, 5);
    await vi.waitFor(() => {
      expect(jumper.gridPosition).toEqual({ x: 12, y: 5 });
    });
    expect(set.seen.dice[0]).toContain("Jump");
    expect(set.game.ctx.gameService.getState().activePlayer?.action).toBe(action);
    expect(set.game.ctx.gameService.getMovementUsed(jumper.id)).toBe(2);
  });
});
