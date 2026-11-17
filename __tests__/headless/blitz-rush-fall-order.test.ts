import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { Scenario } from "../../src/types/Scenario";
import { forceDice } from "../utils/test-helpers";

const scenario: Scenario = {
  id: "blitz-rush-fall-order",
  name: "Blitz Rush fall",
  description: "A ball carrier out of movement Rushes for the Blitz's attack",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 5, y: 5, skills: [SkillType.STAB], hasBall: true },
      { playerIndex: 1, x: 3, y: 3 },
    ],
    team2Placements: [{ playerIndex: 0, x: 6, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
  },
};

/** Declare the Blitz with no movement left, so its attack needs a Rush. */
async function blitzOutOfMovement(stab: boolean) {
  const game = new HeadlessGame({ scenario, seed: 4 });
  game.ctx.team1.rerolls = 0;
  const attacker = game.ctx.team1.players[0];
  await game.execute({
    type: "declare-action",
    playerId: attacker.id,
    action: "blitz",
    ...(stab ? { blockReplacement: "stab" } : {}),
  });
  game.ctx.gameService
    .getState()
    .turn.movementUsed.set(attacker.id, attacker.stats.MA);
  // The Rush fails on a 1; every later die is a 3.
  forceDice(game.ctx.rng, [1, 3, 3, 3, 3, 3, 3, 3]);
  return {
    game,
    attackerId: attacker.id,
    targetId: game.ctx.team2.players[0].id,
  };
}

async function eventNamesUntilSettled(
  game: HeadlessGame,
  run: () => Promise<unknown>
) {
  const before = game.events().length;
  await run();
  await game.ctx.gameService.flowManager.whenIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return game
    .events()
    .slice(before)
    .map((event) => event.name);
}

/** The fall, the dropped ball, and the Turnover that ends the turn. */
const FALL_AND_TURNOVER = [
  "ui:logEntry",
  "turnover",
  "ballPlaced",
  "ui:notification",
  "ballPlaced",
  "ui:notification",
  "diceRoll",
  "armorRolled",
  "ui:notification",
  "ui:turnover",
  "turnEnded",
  "phaseChanged",
  "turnStarted",
  "ui:announce",
];

describe("a failed Rush for a Blitz's attack", () => {
  it("knocks a Stabber down before the bounce and the Turnover", async () => {
    const { game, attackerId, targetId } = await blitzOutOfMovement(true);
    const names = await eventNamesUntilSettled(game, () =>
      game.ctx.gameService.stabPlayer(attackerId, targetId)
    );
    expect(names).toEqual([
      "turnDataUpdated",
      "diceRoll",
      "playerKnockedDown",
      "playerStatusChanged",
      "diceRoll",
      "passFumbled",
      "playerActivated",
      "actionResolved",
      ...FALL_AND_TURNOVER,
    ]);
  });

  it("knocks a blocker down and cancels the block dice", async () => {
    const { game, attackerId, targetId } = await blitzOutOfMovement(false);
    const names = await eventNamesUntilSettled(game, () =>
      game.ctx.gameService.rollBlockDice(attackerId, targetId, 1, true)
    );
    expect(names).toEqual([
      "turnDataUpdated",
      "diceRoll",
      "playerKnockedDown",
      "playerStatusChanged",
      "diceRoll",
      "passFumbled",
      "ui:blockRollCancelled",
      ...FALL_AND_TURNOVER,
    ]);
  });
});
