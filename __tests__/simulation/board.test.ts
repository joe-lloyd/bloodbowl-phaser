import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { readBoard } from "../../src/simulation/ai/board";
import { spendTeamReroll } from "../../src/game/teamRerolls";

describe("the coach's view of the board", () => {
  it("counts the team re-rolls left this half, not the ones bought", () => {
    const game = new HeadlessGame({
      scenario: {
        id: "rerolls",
        name: "Re-rolls",
        description: "",
        setup: {
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Placements: [{ playerIndex: 0, x: 14, y: 5 }],
          activeTeam: "team1",
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
          ballPosition: { x: 12, y: 5 },
        },
      },
      seed: 1,
    });
    const team = game.ctx.team1;
    team.rerolls = 2;
    const left = () => readBoard(game, team.id).rerolls;
    expect(left()).toBe(2);

    spendTeamReroll(game.ctx.gameService.getState(), team);
    expect(left()).toBe(1);
    spendTeamReroll(game.ctx.gameService.getState(), team);
    expect(left()).toBe(0);
  });
});
