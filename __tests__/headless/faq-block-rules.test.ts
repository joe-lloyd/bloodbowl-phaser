import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario, PlayerPlacement } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import {
  PlayerCondition,
  PlayerStatus,
  hasCondition,
} from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import type {
  CommandResponse,
  EmittedEvent,
} from "../../src/headless/protocol";
import { forceDice } from "../utils/test-helpers";

/**
 * Block rulings from the Blood Bowl Designer's Commentary, May 2026. Block
 * dice are forced (1 Skull, 2 Both Down, 3-4 Push, 5 POW), and each test
 * asserts the dice it rolled so a dice-order change fails loudly.
 */

function scenario(
  team1: PlayerPlacement[],
  team2: PlayerPlacement[]
): Scenario {
  return {
    id: "faq-block-rules",
    name: "FAQ block rules",
    description: "",
    setup: {
      // A spare player keeps team1's turn open after the activation.
      team1Placements: [...team1, { playerIndex: 6, x: 2, y: 12 }],
      team2Placements: team2,
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 1 },
    },
  };
}

function session(setup: Scenario, dice: number[]) {
  const game = new HeadlessGame({ scenario: setup, seed: 1 });
  forceDice(game.ctx.rng, dice);
  const events: EmittedEvent[] = [];
  const run = async (command: unknown): Promise<CommandResponse> => {
    const response = await game.execute(command);
    events.push(...response.events);
    return response;
  };
  const rolled = () =>
    events
      .filter((e) => e.name === "diceRoll")
      .map((e) => (e.data as { description: string }).description);
  const triggered = (skill: SkillType) =>
    events
      .filter(
        (e) =>
          e.name === GameEventNames.SkillTriggered &&
          (e.data as { skill?: string }).skill === skill
      )
      .map((e) => (e.data as { effect: string }).effect);
  return { game, run, rolled, triggered };
}

describe("Brawler", () => {
  it("is not offered on the Block of a Blitz", async () => {
    // FAQ p3: "Can I use Brawler or Grab during a Blitz? No."
    const { game, run, rolled, triggered } = session(
      scenario(
        [{ playerIndex: 0, x: 10, y: 5, skills: [SkillType.BRAWLER] }],
        [{ playerIndex: 0, x: 11, y: 5 }]
      ),
      [2, 3]
    );
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];

    await run({
      type: "declare-action",
      playerId: attacker.id,
      action: "blitz",
    });
    const roll = await run({
      type: "block",
      attackerId: attacker.id,
      defenderId: defender.id,
    });
    await run({ type: "brawler-reroll-block", attackerId: attacker.id });

    expect(roll.pendingDecision).toMatchObject({
      type: "block-dice",
      brawlerAvailable: false,
    });
    expect(rolled()).toEqual(["Rolled 1 block dice: both-down"]);
    expect(triggered(SkillType.BRAWLER)).toEqual([]);
  });

  it("re-rolls only once per activation, across Frenzy's two Blocks", async () => {
    // FAQ p3: "The Brawler re-roll can only be used once per activation.
    // In the case of Frenzy, this could be the first or second Block."
    const { game, run, rolled, triggered } = session(
      scenario(
        [
          {
            playerIndex: 0,
            x: 10,
            y: 5,
            skills: [SkillType.BRAWLER, SkillType.FRENZY],
          },
        ],
        [{ playerIndex: 0, x: 11, y: 5 }]
      ),
      [2, 3, 2, 3]
    );
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];

    await run({
      type: "declare-action",
      playerId: attacker.id,
      action: "block",
    });
    await run({
      type: "block",
      attackerId: attacker.id,
      defenderId: defender.id,
    });
    await run({ type: "brawler-reroll-block", attackerId: attacker.id });
    await run({ type: "choose-block-result", index: 0 });
    const second = await run({ type: "choose-push-direction", x: 12, y: 5 });
    await run({ type: "brawler-reroll-block", attackerId: attacker.id });

    expect(second.pendingDecision).toMatchObject({
      type: "block-dice",
      brawlerAvailable: false,
    });
    expect(rolled()).toEqual([
      "Rolled 1 block dice: both-down",
      "Rolled 1 block dice: push",
      "Rolled 1 block dice: both-down",
    ]);
    expect(triggered(SkillType.BRAWLER)).toEqual([
      "Brawler: re-rolled a Both Down",
    ]);
  });
});

/**
 * The Grab blocker at (9,5) pushes the target at (10,5). Every square
 * behind the target is taken; only (10,4) beside it is open.
 */
const grabScenario = (targetSkills: SkillType[] = []) =>
  scenario(
    [{ playerIndex: 0, x: 9, y: 5, skills: [SkillType.GRAB] }],
    [
      { playerIndex: 0, x: 10, y: 5, skills: targetSkills },
      { playerIndex: 1, x: 9, y: 4 },
      { playerIndex: 2, x: 11, y: 4 },
      { playerIndex: 3, x: 11, y: 5 },
      { playerIndex: 4, x: 9, y: 6 },
      { playerIndex: 5, x: 10, y: 6 },
      { playerIndex: 6, x: 11, y: 6 },
    ]
  );

async function grabPush(setup: Scenario, action: "block" | "blitz") {
  const s = session(setup, [3, 3]);
  const attacker = s.game.ctx.team1.players[0];
  const defender = s.game.ctx.team2.players[0];
  await s.run({ type: "declare-action", playerId: attacker.id, action });
  await s.run({
    type: "block",
    attackerId: attacker.id,
    defenderId: defender.id,
  });
  const pushed = await s.run({ type: "choose-block-result", index: 0 });
  return { ...s, pushed, attacker, defender };
}

describe("Grab", () => {
  it("widens the push squares on a Block", async () => {
    const { pushed } = await grabPush(grabScenario(), "block");

    expect(pushed.pendingDecision).toMatchObject({
      type: "push-direction",
      options: [{ x: 10, y: 4 }],
    });
  });

  it("does not widen the push squares on a Blitz", async () => {
    // FAQ p3: "Can I use Brawler or Grab during a Blitz? No."
    const { pushed, rolled, triggered } = await grabPush(
      grabScenario(),
      "blitz"
    );

    expect(rolled()).toEqual(["Rolled 2 block dice: push, push"]);
    expect(pushed.pendingDecision).toMatchObject({
      type: "push-direction",
      options: [
        { x: 11, y: 5 },
        { x: 11, y: 6 },
        { x: 11, y: 4 },
      ],
    });
    expect(triggered(SkillType.GRAB)).toEqual([]);
  });

  it("stops the target using Sidestep on a Block", async () => {
    const { pushed } = await grabPush(
      grabScenario([SkillType.SIDESTEP]),
      "block"
    );

    expect(pushed.pendingDecision).toMatchObject({ type: "push-direction" });
  });

  it("lets the target use Sidestep on a Blitz", async () => {
    const { pushed, defender } = await grabPush(
      grabScenario([SkillType.SIDESTEP]),
      "blitz"
    );

    expect(pushed.pendingDecision).toMatchObject({
      type: "reaction",
      playerId: defender.id,
      skill: SkillType.SIDESTEP,
    });
  });

  it("lets a chain-pushed player use Sidestep", async () => {
    // FAQ p3: Grab stops Sidestep for "only the target of the Block".
    const setup = grabScenario();
    setup.setup.team2Placements[3].skills = [SkillType.SIDESTEP];
    // A team-mate closes (10,4), so the push must chain.
    setup.setup.team1Placements.push({ playerIndex: 1, x: 10, y: 4 });
    const { run, pushed, game } = await grabPush(setup, "block");
    const chained = game.ctx.team2.players[3];

    expect(pushed.pendingDecision).toMatchObject({ type: "push-direction" });
    const reaction = await run({ type: "choose-push-direction", x: 11, y: 5 });

    expect(reaction.pendingDecision).toMatchObject({
      type: "reaction",
      playerId: chained.id,
      skill: SkillType.SIDESTEP,
    });
  });
});

describe("Eye Gouge", () => {
  it("is not applied when the target stands firm", async () => {
    // FAQ p4: with Stand Firm, not being Pushed Back prevents Eye Gouged.
    const { game, run, rolled, triggered } = session(
      scenario(
        [{ playerIndex: 0, x: 10, y: 5, skills: [SkillType.EYE_GOUGE] }],
        [{ playerIndex: 0, x: 11, y: 5, skills: [SkillType.STAND_FIRM] }]
      ),
      [3]
    );
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];

    await run({
      type: "declare-action",
      playerId: attacker.id,
      action: "block",
    });
    await run({
      type: "block",
      attackerId: attacker.id,
      defenderId: defender.id,
    });
    const reaction = await run({ type: "choose-block-result", index: 0 });
    expect(reaction.pendingDecision).toMatchObject({
      type: "reaction",
      skill: SkillType.STAND_FIRM,
    });
    await run({ type: "use-reaction", accept: true });

    expect(rolled()).toEqual(["Rolled 1 block dice: push"]);
    expect(defender.gridPosition).toEqual({ x: 11, y: 5 });
    expect(hasCondition(defender, PlayerCondition.EYE_GOUGED)).toBe(false);
    expect(triggered(SkillType.EYE_GOUGE)).toEqual([]);
  });

  it("gouges only the target of a chain push", async () => {
    // FAQ p3: "Only the target of the Block gains the Eye Gouge condition."
    const { game, run, triggered } = session(
      scenario(
        [{ playerIndex: 0, x: 9, y: 5, skills: [SkillType.EYE_GOUGE] }],
        [
          { playerIndex: 0, x: 10, y: 5 },
          { playerIndex: 1, x: 11, y: 4 },
          { playerIndex: 2, x: 11, y: 5 },
          { playerIndex: 3, x: 11, y: 6 },
        ]
      ),
      [3]
    );
    const attacker = game.ctx.team1.players[0];
    const [defender, , chained] = game.ctx.team2.players;

    await run({
      type: "declare-action",
      playerId: attacker.id,
      action: "block",
    });
    await run({
      type: "block",
      attackerId: attacker.id,
      defenderId: defender.id,
    });
    await run({ type: "choose-block-result", index: 0 });
    await run({ type: "choose-push-direction", x: 11, y: 5 });
    await run({ type: "choose-push-direction", x: 12, y: 5 });

    expect(defender.gridPosition).toEqual({ x: 11, y: 5 });
    expect(chained.gridPosition).toEqual({ x: 12, y: 5 });
    expect(hasCondition(defender, PlayerCondition.EYE_GOUGED)).toBe(true);
    expect(hasCondition(chained, PlayerCondition.EYE_GOUGED)).toBe(false);
    expect(triggered(SkillType.EYE_GOUGE)).toEqual([
      "Eye Gouge: Human Lineman #1 cannot assist until next activated",
    ]);
  });
});

/**
 * A ST 6 Multiple Blocker at (10,5) blocks at ST 4 against two ST 3
 * targets at (11,5) and (10,6), each marking the blocker, so each assists
 * the other: 4 against 4, one die each.
 */
function multipleBlock(
  dice: number[],
  skills: SkillType[] = [],
  firstSkills: SkillType[] = [],
  secondSkills: SkillType[] = []
) {
  const s = session(
    scenario(
      [
        {
          playerIndex: 0,
          x: 10,
          y: 5,
          skills: [SkillType.MULTIPLE_BLOCK, ...skills],
          stats: { ST: 6 },
        },
      ],
      [
        { playerIndex: 0, x: 11, y: 5, skills: firstSkills },
        { playerIndex: 1, x: 10, y: 6, skills: secondSkills },
      ]
    ),
    dice
  );
  const attacker = s.game.ctx.team1.players[0];
  const [first, second] = s.game.ctx.team2.players;
  const start = async () => {
    await s.run({
      type: "declare-action",
      playerId: attacker.id,
      action: "multipleBlock",
    });
    return s.run({
      type: "multiple-block",
      attackerId: attacker.id,
      defender1Id: first.id,
      defender2Id: second.id,
    });
  };
  return { ...s, start, attacker, first, second };
}

describe("Multiple Block", () => {
  it("counts the first target's assist on the second Block after the first is knocked down", async () => {
    // FAQ p4: "As both Blocks happen simultaneously, determine how many
    // Defensive Assists a target will get as normal, including the other
    // target player, then roll the Block Dice."
    const { start, run, rolled, first, second } = multipleBlock([5, 1, 1, 3]);

    await start();
    await run({ type: "choose-block-result", index: 0 });
    const next = await run({ type: "choose-push-direction", x: 12, y: 5 });

    expect(first.status).toBe(PlayerStatus.PRONE);
    expect(next.pendingDecision).toMatchObject({
      type: "block-dice",
      defenderId: second.id,
    });
    expect(rolled()).toEqual([
      "Rolled 1 block dice: pow",
      "Armour Roll (Human Lineman #1): 1 + 1 = 2",
      "Rolled 1 block dice: push",
    ]);
  });

  it("keeps the first target's assist when the second target uses Trickster", async () => {
    // The relocation is weighed against the board before either Block
    // resolved, so the knocked-down first target still assists: one die.
    const { start, run, rolled, first, second } = multipleBlock(
      [5, 1, 1, 3, 3],
      [],
      [],
      [SkillType.TRICKSTER]
    );

    await start();
    await run({ type: "choose-block-result", index: 0 });
    const trickster = await run({ type: "choose-push-direction", x: 12, y: 5 });
    expect(trickster.pendingDecision).toMatchObject({
      type: "reaction",
      playerId: second.id,
      skill: SkillType.TRICKSTER,
    });
    await run({ type: "use-reaction", accept: true });

    expect(first.status).toBe(PlayerStatus.PRONE);
    expect(second.gridPosition).toEqual({ x: 9, y: 4 });
    expect(rolled()).toEqual([
      "Rolled 1 block dice: pow",
      "Armour Roll (Human Lineman #1): 1 + 1 = 2",
      "Rolled 1 block dice: push",
    ]);
  });

  it("holds Pile Driver on a first-target Both Down until both Blocks resolve", async () => {
    const { start, run, rolled, attacker, first, second } = multipleBlock(
      [2, 1, 1, 3],
      [SkillType.PILE_DRIVER, SkillType.BLOCK]
    );

    await start();
    const next = await run({ type: "choose-block-result", index: 0 });
    expect(next.pendingDecision).toMatchObject({
      type: "block-dice",
      defenderId: second.id,
    });
    await run({ type: "choose-block-result", index: 0 });
    const offer = await run({ type: "choose-push-direction", x: 10, y: 7 });

    expect(rolled()).toEqual([
      "Rolled 1 block dice: both-down",
      "Armour Roll (Human Lineman #1): 1 + 1 = 2",
      "Rolled 1 block dice: push",
    ]);
    expect(first.status).toBe(PlayerStatus.PRONE);
    expect(attacker.status).toBe(PlayerStatus.ACTIVE);
    expect(offer.pendingDecision).toMatchObject({
      type: "reaction",
      playerId: attacker.id,
      skill: SkillType.PILE_DRIVER,
    });
  });

  // FAQ p4: free Fouls from Pile Driver work as normal. Without a
  // Follow-up, only a target knocked down in place is still Marked.
  it("offers Pile Driver on the first target once both Blocks resolve", async () => {
    const { start, run, rolled, attacker, first } = multipleBlock(
      [5, 1, 1, 3],
      [SkillType.PILE_DRIVER],
      [SkillType.STAND_FIRM]
    );

    await start();
    await run({ type: "choose-block-result", index: 0 });
    await run({ type: "use-reaction", accept: true });
    await run({ type: "choose-block-result", index: 0 });
    const offer = await run({ type: "choose-push-direction", x: 10, y: 7 });

    expect(rolled()).toEqual([
      "Rolled 1 block dice: pow",
      "Armour Roll (Human Lineman #1): 1 + 1 = 2",
      "Rolled 1 block dice: push",
    ]);
    expect(first.status).toBe(PlayerStatus.PRONE);
    expect(offer.pendingDecision).toMatchObject({
      type: "reaction",
      playerId: attacker.id,
      skill: SkillType.PILE_DRIVER,
    });
  });

  it("offers Pile Driver on the second target once both Blocks resolve", async () => {
    const { start, run, rolled, attacker, second } = multipleBlock(
      [3, 2, 1, 1],
      [SkillType.PILE_DRIVER, SkillType.BLOCK]
    );

    await start();
    await run({ type: "choose-block-result", index: 0 });
    await run({ type: "choose-push-direction", x: 12, y: 5 });
    const offer = await run({ type: "choose-block-result", index: 0 });

    expect(rolled()).toEqual([
      "Rolled 1 block dice: push",
      "Rolled 1 block dice: both-down",
      "Armour Roll (Human Lineman #2): 1 + 1 = 2",
    ]);
    expect(second.status).toBe(PlayerStatus.PRONE);
    expect(offer.pendingDecision).toMatchObject({
      type: "reaction",
      playerId: attacker.id,
      skill: SkillType.PILE_DRIVER,
    });
  });

  it("skips the second Block once the first knocks the blocker down", async () => {
    // Both Down without Block: the blocker falls, a Turnover, and its
    // activation ends with the second target unblocked.
    const { start, run, rolled, attacker, second } = multipleBlock([
      2, 1, 1, 1, 1, 1,
    ]);

    await start();
    const next = await run({ type: "choose-block-result", index: 0 });

    expect(rolled()[0]).toBe("Rolled 1 block dice: both-down");
    expect(rolled().filter((r) => r.startsWith("Rolled"))).toHaveLength(1);
    expect(attacker.status).not.toBe(PlayerStatus.ACTIVE);
    expect(second.status).toBe(PlayerStatus.ACTIVE);
    expect(next.pendingDecision?.type).not.toBe("block-dice");
  });
});
