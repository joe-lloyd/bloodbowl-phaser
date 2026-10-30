import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario, PlayerPlacement } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import type { CommandResponse, EmittedEvent } from "../../src/headless/protocol";

/**
 * Frenzy's second Block (2025 rulebook p.128): what may stop it and what it
 * costs. Seeds are committed, never searched (docs/E2E_TESTING.md); each test
 * asserts the dice its seed rolls first, so a dice-order change fails loudly.
 */

function scenario(
  attacker: Partial<PlayerPlacement>,
  defender: Partial<PlayerPlacement>
): Scenario {
  return {
    id: "frenzy-second-block",
    name: "Frenzy second block",
    description: "",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 10, y: 5, skills: [SkillType.FRENZY], ...attacker },
        // A spare player keeps team1's turn open after the activation.
        { playerIndex: 1, x: 2, y: 12 },
      ],
      team2Placements: [{ playerIndex: 0, x: 11, y: 5, ...defender }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 1 },
    },
  };
}

function session(scenario: Scenario, seed: number) {
  const game = new HeadlessGame({ scenario, seed });
  const events: EmittedEvent[] = [];
  const run = async (command: unknown): Promise<CommandResponse> => {
    const response = await game.execute(command);
    events.push(...response.events);
    return response;
  };
  const dice = () =>
    events
      .filter((e) => e.name === "diceRoll")
      .map((e) => (e.data as { description: string }).description);
  return {
    game,
    run,
    dice,
    attacker: game.ctx.team1.players[0],
    defender: game.ctx.team2.players[0],
  };
}

/** One block die, a Push; the second Block rolls a Skull. */
const PUSH_SEED = 1;

describe("Frenzy against Stand Firm", () => {
  it("still throws the second Block when the target stands firm", async () => {
    const { run, dice, attacker, defender } = session(
      scenario({}, { skills: [SkillType.STAND_FIRM] }),
      PUSH_SEED
    );

    await run({ type: "declare-action", playerId: attacker.id, action: "block" });
    await run({ type: "block", attackerId: attacker.id, defenderId: defender.id });
    const reaction = await run({ type: "choose-block-result", index: 0 });
    expect(reaction.pendingDecision).toMatchObject({
      type: "reaction",
      skill: SkillType.STAND_FIRM,
    });

    const second = await run({ type: "use-reaction", accept: true });

    expect(dice()).toEqual([
      "Rolled 1 block dice: push",
      "Rolled 1 block dice: skull",
    ]);
    expect(second.pendingDecision).toMatchObject({
      type: "block-dice",
      attackerId: attacker.id,
      defenderId: defender.id,
    });
    expect(attacker.gridPosition).toEqual({ x: 10, y: 5 });
    expect(defender.gridPosition).toEqual({ x: 11, y: 5 });
  });
});

/**
 * MA 1 blitzers. Blocking from the start square spends the one square of
 * MA. Starting two squares back, the blitzer moves one square and Rushes
 * one, so the Blitz block itself is the second and last Rush.
 */
const ADJACENT_BLITZ_SEED = 11;
const EXHAUSTED_BLITZ_SEED = 11;

describe("Frenzy's second Block during a Blitz", () => {
  it("costs a square, so a blitzer out of movement must Rush", async () => {
    const { game, run, dice, attacker, defender } = session(
      scenario({ stats: { MA: 1 } }, {}),
      ADJACENT_BLITZ_SEED
    );

    await run({ type: "declare-action", playerId: attacker.id, action: "blitz" });
    await run({ type: "block", attackerId: attacker.id, defenderId: defender.id });
    await run({ type: "choose-block-result", index: 0 });
    const second = await run({ type: "choose-push-direction", x: 12, y: 5 });

    expect(dice()).toEqual([
      "Rolled 1 block dice: push",
      "Rush (Human Lineman #1): 4, needs 2+",
      "Rolled 1 block dice: push",
    ]);
    expect(second.pendingDecision).toMatchObject({ type: "block-dice" });
    expect(game.ctx.gameService.getMovementUsed(attacker.id)).toBe(2);
  });

  it("cannot happen when the blitzer has no Rush left", async () => {
    const { game, run, dice, attacker, defender } = session(
      scenario({ x: 8, stats: { MA: 1 } }, {}),
      EXHAUSTED_BLITZ_SEED
    );

    await run({ type: "declare-action", playerId: attacker.id, action: "blitz" });
    await run({
      type: "move",
      playerId: attacker.id,
      path: [
        { x: 9, y: 5 },
        { x: 10, y: 5 },
      ],
    });
    await run({ type: "block", attackerId: attacker.id, defenderId: defender.id });
    await run({ type: "choose-block-result", index: 0 });
    const after = await run({ type: "choose-push-direction", x: 12, y: 5 });

    expect(dice()).toEqual([
      "Rush (Human Lineman #1): 4, needs 2+",
      "Rush (Human Lineman #1): 4, needs 2+",
      "Rolled 1 block dice: push",
    ]);
    expect(after.pendingDecision).toBeNull();
    expect(attacker.gridPosition).toEqual({ x: 11, y: 5 });
    expect(game.ctx.gameService.getMovementUsed(attacker.id)).toBe(3);
  });
});
