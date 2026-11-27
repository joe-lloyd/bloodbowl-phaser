import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type HeadlessCommand } from "../../src/headless/protocol";
import { enumerateDecision } from "../../src/simulation/candidates";
import { plannerCoach } from "../../src/simulation/ai/planner";
import { createCoachRng } from "../../src/simulation/rng";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";

function lastTurn(
  carrier: { x: number; y: number },
  mates: { x: number; y: number }[],
  turn = 6
) {
  return new HeadlessGame({
    seed: 1,
    scenario: {
      id: "punt-plans",
      name: "Punt plans",
      description: "",
      setup: {
        team1Placements: [
          {
            playerIndex: 0,
            ...carrier,
            stats: { MA: 2, PA: 0 },
            skills: [SkillType.PUNT],
          },
          ...mates.map((at, i) => ({
            playerIndex: i + 1,
            ...at,
            stats: { AG: 2 },
          })),
        ],
        team2Placements: [{ playerIndex: 0, x: 1, y: 1 }],
        ballPosition: carrier,
        activeTeam: "team1",
        turn,
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        teamRerolls: { team1: 0, team2: 0 },
      },
    },
  });
}

async function choose(game: HeadlessGame): Promise<HeadlessCommand> {
  const point = await enumerateDecision(game, null);
  const choice = await plannerCoach.choose({
    game,
    snapshot: game.snapshot(),
    point,
    rng: createCoachRng(1),
  });
  const command = fixtureValue(point.candidates[choice.index]).commands[0];
  const { ok, reason } = await game.execute(command);
  expect(ok, reason).toBe(true);
  return command;
}

describe("the computer's Punt", () => {
  const ENDZONE = [4, 5, 6].map((y) => ({ x: 19, y }));

  it("punts to team-mates in the end zone when nothing else can score", async () => {
    const game = lastTurn({ x: 14, y: 5 }, ENDZONE);
    game.ctx.gameService.getState().turn.spend = {
      blitzed: [],
      fouled: [],
      passes: 1,
      handOffs: 1,
    };
    const actor = game.ctx.teams[0].players[0]?.id;
    expect(await choose(game)).toMatchObject({
      type: "declare-action",
      playerId: actor,
      action: "punt",
    });
    expect(await choose(game)).toEqual({
      type: "punt",
      playerId: actor,
      x: 1,
      y: 0,
    });
  });

  it("keeps the ball when there are turns left to carry it", async () => {
    const game = lastTurn({ x: 8, y: 5 }, [{ x: 7, y: 5 }], 2);
    for (let i = 0; i < 4; i++) {
      const command = await choose(game);
      if (command.type === "declare-action")
        expect(command.action).not.toBe("punt");
    }
  });

  it("offers no second Punt in a turn", async () => {
    const game = lastTurn({ x: 14, y: 5 }, ENDZONE);
    const declared = async () => {
      const decision = await enumerateDecision(game, null);
      return decision.candidates
        .map((c) => c.commands[0])
        .filter((c) => c.type === "declare-action" && c.action === "punt");
    };
    expect(await declared()).toHaveLength(1);
    game.ctx.gameService.getState().turn.hasPunted = true;
    expect(await declared()).toHaveLength(0);
  });
});
