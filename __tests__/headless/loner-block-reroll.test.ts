import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";

const scenario: Scenario = {
  id: "loner-block-reroll",
  name: "Loner attacker re-rolls block dice",
  description: "a Loner (4+) player blocks and spends a Team Re-roll",
  setup: {
    team1Placements: [
      {
        playerIndex: 0,
        x: 5,
        y: 5,
        skills: [{ type: SkillType.LONER, parameter: "4+" }],
      },
    ],
    team2Placements: [{ playerIndex: 0, x: 6, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

const LONER_FAILS_SEED = 1;

const LONER_PASSES_SEED = 5;

async function blockThenTeamReroll(seed: number) {
  const game = new HeadlessGame({ scenario, seed });
  game.ctx.team1.rerolls = 3;
  const attackerId = fixtureValue(game.ctx.team1.players[0]).id;
  const defenderId = fixtureValue(game.ctx.team2.players[0]).id;
  await game.execute({
    type: "declare-action",
    playerId: attackerId,
    action: "block",
  });
  const rolled = await game.execute({ type: "block", attackerId, defenderId });
  const rerolled = await game.execute({
    type: "team-reroll-block",
    attackerId,
  });
  const lonerDie = z
    .union([z.object({ value: z.number() }), z.undefined()])
    .parse(
      rerolled.events.find(
        (e) =>
          e.name === "diceRoll" &&
          String(
            z.object({ rollType: z.string().exactOptional() }).parse(e.data)
              .rollType
          ).startsWith("Loner")
      )?.data
    );
  const dice = (response: typeof rolled) =>
    response.pendingDecision?.type === "block-dice"
      ? response.pendingDecision.options.map((o) => o.type)
      : undefined;
  return {
    game,
    before: dice(rolled),
    after: dice(rerolled),
    lonerRoll: lonerDie?.value,
    rerollStillOffered:
      rerolled.pendingDecision?.type === "block-dice" &&
      !!rerolled.pendingDecision.teamRerollAvailable,
  };
}

describe("Loner on a block-dice Team Re-roll", () => {
  it("a failed Loner roll spends the re-roll and the original dice stand", async () => {
    const result = await blockThenTeamReroll(LONER_FAILS_SEED);

    expect(result.before).toEqual(["push"]);
    expect(result.lonerRoll).toBe(1);
    expect(result.after).toEqual(["push"]);
    expect(fixtureValue(result.game.snapshot().teams[0]).rerolls).toBe(2);
    expect(result.rerollStillOffered).toBe(false);
  });

  it("a passed Loner roll re-rolls the dice", async () => {
    const result = await blockThenTeamReroll(LONER_PASSES_SEED);

    expect(result.before).toEqual(["pow"]);
    expect(result.lonerRoll).toBe(5);
    expect(result.after).toEqual(["both-down"]);
    expect(fixtureValue(result.game.snapshot().teams[0]).rerolls).toBe(2);
  });
});
