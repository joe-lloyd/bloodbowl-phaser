import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";

/**
 * A touchdown scored during the opposing team's Turn ends that Turn, and
 * the scoring team skips its next Turn celebrating (2025 rulebook, "Scoring
 * during your opponent's Turn"). The engine never skipped it, so the turn
 * counts drifted apart and the conceding team was handed a seventh Turn.
 */
const scenario: Scenario = {
  id: "touchdown-in-opponents-turn",
  name: "Touchdown in the opponent's turn",
  description: "team1 pushes team2's ball carrier into team2's scoring end zone",
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

/** Seed 1 rolls a Push on the single block die; committed, never searched. */
const PUSH_SEED = 1;

type TurnLog = Array<{ teamId: string; turnNumber: number }>;

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

    // team2 kicks; team1 receives. Play up to team1's turn 3.
    gs.startGame("team2");
    for (let i = 0; i < 4; i++) await game.execute({ type: "end-turn" });
    expect(turns.at(-1)).toEqual({ teamId: "team1", turnNumber: 3 });

    const attacker = game.snapshot().teams[0].players[0];
    const carrier = game.snapshot().teams[1].players[0];
    await game.execute({
      type: "declare-action",
      playerId: attacker.id,
      action: "block",
    });
    const rolled = await game.execute({
      type: "block",
      attackerId: attacker.id,
      defenderId: carrier.id,
    });
    // The seed must still roll a Push, or this test proves nothing.
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
      response = await game.execute({ type: "choose-follow-up", followUp: false });
    }
    expect(response.snapshot.score).toEqual({ team1: 0, team2: 1 });

    // team2 skipped the turn it would have played next.
    expect(gs.getTurnNumber("team2")).toBe(3);

    // The scorer kicks the next drive; the conceding team receives.
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
