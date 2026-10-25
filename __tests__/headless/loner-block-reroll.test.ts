import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";

/**
 * Loner (X+): "Whenever this player wishes to use a Team Re-roll, they must
 * roll a D6 ... If they roll lower, they may not re-roll the dice and the
 * Team Re-roll is lost just as if it had been used." Block dice go through
 * their own re-roll path, which skipped the Loner roll. Seeds are committed,
 * never searched (see docs/E2E_TESTING.md); each test asserts the Loner die
 * its seed rolls, so a dice-order change fails loudly.
 */
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

/** Block rolls Push; the Loner die rolls 1 (fails 4+). */
const LONER_FAILS_SEED = 1;
/** Block rolls POW; the Loner die rolls 5 (passes 4+); re-roll gives Both Down. */
const LONER_PASSES_SEED = 5;

async function blockThenTeamReroll(seed: number) {
  const game = new HeadlessGame({ scenario, seed });
  game.ctx.team1.rerolls = 3;
  const attackerId = game.ctx.team1.players[0].id;
  const defenderId = game.ctx.team2.players[0].id;
  await game.execute({ type: "declare-action", playerId: attackerId, action: "block" });
  const rolled = await game.execute({ type: "block", attackerId, defenderId });
  const rerolled = await game.execute({ type: "team-reroll-block", attackerId });
  const lonerDie = rerolled.events.find(
    (e) =>
      e.name === "diceRoll" &&
      String((e.data as { rollType?: string }).rollType).startsWith("Loner")
  )?.data as { value: number } | undefined;
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
    expect(result.game.snapshot().teams[0].rerolls).toBe(2);
    expect(result.rerollStillOffered).toBe(false);
  });

  it("a passed Loner roll re-rolls the dice", async () => {
    const result = await blockThenTeamReroll(LONER_PASSES_SEED);

    expect(result.before).toEqual(["pow"]);
    expect(result.lonerRoll).toBe(5);
    expect(result.after).toEqual(["both-down"]);
    expect(result.game.snapshot().teams[0].rerolls).toBe(2);
  });
});
