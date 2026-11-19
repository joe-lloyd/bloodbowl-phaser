import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";

const scenario: Scenario = {
  id: "touchdown-in-opponents-turn",
  name: "Touchdown in the opponent's turn",
  description:
    "team1 pushes team2's ball carrier into team2's scoring end zone",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 2, y: 5, stats: { ST: 3 } },
      { playerIndex: 1, x: 10, y: 9 },
    ],
    team2Placements: [
      { playerIndex: 0, x: 1, y: 5, stats: { ST: 3 } },
      { playerIndex: 1, x: 12, y: 2 },
    ],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 5 },
  },
};

const PUSH_SEED = 1;

type TurnLog = { teamId: string; turnNumber: number }[];

function logTurns(game: HeadlessGame): TurnLog {
  const turns: TurnLog = [];
  game.ctx.eventBus.on(GameEventNames.TurnStarted, (turn) => {
    turns.push({ teamId: turn.teamId, turnNumber: turn.turnNumber });
  });
  return turns;
}

describe("touchdown in the opponent's turn", () => {
  it("skips the scorer's next turn and never hands out a seventh", async () => {
    const game = new HeadlessGame({ scenario, seed: PUSH_SEED });
    const gs = game.ctx.gameService;
    const turns = logTurns(game);

    gs.startGame("team2");
    for (let i = 0; i < 4; i++) await game.execute({ type: "end-turn" });
    expect(turns.at(-1)).toEqual({ teamId: "team1", turnNumber: 3 });

    const attacker = fixtureValue(game.snapshot().teams[0]).players[0];
    const carrier = fixtureValue(game.snapshot().teams[1]).players[0];
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "block",
    });
    const rolled = await game.execute({
      type: "block",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(carrier).id,
    });

    expect(
      rolled.pendingDecision?.type === "block-dice" &&
        rolled.pendingDecision.options.map((o) => o.type)
    ).toEqual(["push"]);
    await game.execute({ type: "choose-block-result", index: 0 });
    let response = await game.execute({
      type: "choose-push-direction",
      x: 0,
      y: 5,
    });
    if (response.pendingDecision?.type === "follow-up") {
      response = await game.execute({
        type: "choose-follow-up",
        followUp: false,
      });
    }
    expect(response.snapshot.score).toEqual({ team1: 0, team2: 1 });

    expect(gs.getTurnNumber("team2")).toBe(3);

    turns.length = 0;
    gs.startGame("team2");
    while (!game.snapshot().turn.isHalf2) {
      await game.execute({ type: "end-turn" });
    }

    expect(turns).toEqual([
      { teamId: "team1", turnNumber: 4 },
      { teamId: "team2", turnNumber: 4 },
      { teamId: "team1", turnNumber: 5 },
      { teamId: "team2", turnNumber: 5 },
      { teamId: "team1", turnNumber: 6 },
      { teamId: "team2", turnNumber: 6 },
    ]);
  });
});
