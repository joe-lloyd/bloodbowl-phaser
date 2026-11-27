import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario, type PlayerPlacement } from "../../src/types/Scenario";
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

function scenario(
  team1: PlayerPlacement[],
  team2: PlayerPlacement[]
): Scenario {
  return {
    id: "faq-block-rules",
    name: "FAQ block rules",
    description: "",
    setup: {
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
      .map(
        (e) => z.object({ description: z.string() }).parse(e.data).description
      );
  const triggered = (skill: SkillType) =>
    events
      .filter(
        (e) =>
          e.name === GameEventNames.SkillTriggered &&
          z.object({ skill: z.string().exactOptional() }).parse(e.data)
            .skill === skill
      )
      .map((e) => z.object({ effect: z.string() }).parse(e.data).effect);
  return { game, run, rolled, triggered };
}

describe("Brawler", () => {
  it("is not offered on the Block of a Blitz", async () => {
    const { game, run, rolled, triggered } = session(
      scenario(
        [{ playerIndex: 0, x: 10, y: 5, skills: [SkillType.BRAWLER] }],
        [{ playerIndex: 0, x: 11, y: 5 }]
      ),
      [2, 3]
    );
    const attacker = game.ctx.teams[0].players[0];
    const defender = game.ctx.teams[1].players[0];

    await run({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "blitz",
    });
    const roll = await run({
      type: "block",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
    });
    await run({
      type: "brawler-reroll-block",
      attackerId: fixtureValue(attacker).id,
    });

    expect(roll.pendingDecision).toMatchObject({
      type: "block-dice",
      brawlerAvailable: false,
    });
    expect(rolled()).toEqual(["Rolled 1 block dice: both-down"]);
    expect(triggered(SkillType.BRAWLER)).toEqual([]);
  });

  it("re-rolls only once per activation, across Frenzy's two Blocks", async () => {
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
    const attacker = game.ctx.teams[0].players[0];
    const defender = game.ctx.teams[1].players[0];

    await run({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "block",
    });
    await run({
      type: "block",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
    });
    await run({
      type: "brawler-reroll-block",
      attackerId: fixtureValue(attacker).id,
    });
    await run({ type: "choose-block-result", index: 0 });
    const second = await run({ type: "choose-push-direction", x: 12, y: 5 });
    await run({
      type: "brawler-reroll-block",
      attackerId: fixtureValue(attacker).id,
    });

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
  const attacker = s.game.ctx.teams[0].players[0];
  const defender = s.game.ctx.teams[1].players[0];
  await s.run({
    type: "declare-action",
    playerId: fixtureValue(attacker).id,
    action,
  });
  await s.run({
    type: "block",
    attackerId: fixtureValue(attacker).id,
    defenderId: fixtureValue(defender).id,
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
      playerId: fixtureValue(defender).id,
      skill: SkillType.SIDESTEP,
    });
  });

  it("lets a chain-pushed player use Sidestep", async () => {
    const setup = grabScenario();
    fixtureValue(setup.setup.team2Placements[3]).skills = [SkillType.SIDESTEP];

    setup.setup.team1Placements.push({ playerIndex: 1, x: 10, y: 4 });
    const { run, pushed, game } = await grabPush(setup, "block");
    const chained = game.ctx.teams[1].players[3];

    expect(pushed.pendingDecision).toMatchObject({ type: "push-direction" });
    const reaction = await run({ type: "choose-push-direction", x: 11, y: 5 });

    expect(reaction.pendingDecision).toMatchObject({
      type: "reaction",
      playerId: fixtureValue(chained).id,
      skill: SkillType.SIDESTEP,
    });
  });
});

describe("Eye Gouge", () => {
  it("is not applied when the target stands firm", async () => {
    const { game, run, rolled, triggered } = session(
      scenario(
        [{ playerIndex: 0, x: 10, y: 5, skills: [SkillType.EYE_GOUGE] }],
        [{ playerIndex: 0, x: 11, y: 5, skills: [SkillType.STAND_FIRM] }]
      ),
      [3]
    );
    const attacker = game.ctx.teams[0].players[0];
    const defender = game.ctx.teams[1].players[0];

    await run({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "block",
    });
    await run({
      type: "block",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
    });
    const reaction = await run({ type: "choose-block-result", index: 0 });
    expect(reaction.pendingDecision).toMatchObject({
      type: "reaction",
      skill: SkillType.STAND_FIRM,
    });
    await run({ type: "use-reaction", accept: true });

    expect(rolled()).toEqual(["Rolled 1 block dice: push"]);
    expect(fixtureValue(defender).gridPosition).toEqual({ x: 11, y: 5 });
    expect(
      hasCondition(fixtureValue(defender), PlayerCondition.EYE_GOUGED)
    ).toBe(false);
    expect(triggered(SkillType.EYE_GOUGE)).toEqual([]);
  });

  it("gouges only the target of a chain push", async () => {
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
    const attacker = game.ctx.teams[0].players[0];
    const [defender, , chained] = game.ctx.teams[1].players;

    await run({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "block",
    });
    await run({
      type: "block",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
    });
    await run({ type: "choose-block-result", index: 0 });
    await run({ type: "choose-push-direction", x: 11, y: 5 });
    await run({ type: "choose-push-direction", x: 12, y: 5 });

    expect(fixtureValue(defender).gridPosition).toEqual({ x: 11, y: 5 });
    expect(fixtureValue(chained).gridPosition).toEqual({ x: 12, y: 5 });
    expect(
      hasCondition(fixtureValue(defender), PlayerCondition.EYE_GOUGED)
    ).toBe(true);
    expect(
      hasCondition(fixtureValue(chained), PlayerCondition.EYE_GOUGED)
    ).toBe(false);
    expect(triggered(SkillType.EYE_GOUGE)).toEqual([
      "Eye Gouge: Human Lineman #1 cannot assist until next activated",
    ]);
  });
});

function multipleBlock({
  dice,
  skills = [],
  firstSkills = [],
  secondSkills = [],
}: {
  dice: number[];
  skills?: SkillType[];
  firstSkills?: SkillType[];
  secondSkills?: SkillType[];
}) {
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
  const attacker = s.game.ctx.teams[0].players[0];
  const [first, second] = s.game.ctx.teams[1].players;
  const start = async () => {
    await s.run({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "multipleBlock",
    });
    return s.run({
      type: "multiple-block",
      attackerId: fixtureValue(attacker).id,
      defender1Id: fixtureValue(first).id,
      defender2Id: fixtureValue(second).id,
    });
  };
  return { ...s, start, attacker, first, second };
}

describe("Multiple Block", () => {
  it("counts the first target's assist on the second Block after the first is knocked down", async () => {
    const { start, run, rolled, first, second } = multipleBlock({
      dice: [5, 1, 1, 3],
    });

    await start();
    await run({ type: "choose-block-result", index: 0 });
    const next = await run({ type: "choose-push-direction", x: 12, y: 5 });

    expect(fixtureValue(first).status).toBe(PlayerStatus.PRONE);
    expect(next.pendingDecision).toMatchObject({
      type: "block-dice",
      defenderId: fixtureValue(second).id,
    });
    expect(rolled()).toEqual([
      "Rolled 1 block dice: pow",
      "Armour Roll (Human Lineman #1): 1 + 1 = 2",
      "Rolled 1 block dice: push",
    ]);
  });

  it("keeps the first target's assist when the second target uses Trickster", async () => {
    const { start, run, rolled, first, second } = multipleBlock({
      dice: [5, 1, 1, 3, 3],
      skills: [],
      firstSkills: [],
      secondSkills: [SkillType.TRICKSTER],
    });

    await start();
    await run({ type: "choose-block-result", index: 0 });
    const trickster = await run({ type: "choose-push-direction", x: 12, y: 5 });
    expect(trickster.pendingDecision).toMatchObject({
      type: "reaction",
      playerId: fixtureValue(second).id,
      skill: SkillType.TRICKSTER,
    });
    await run({ type: "use-reaction", accept: true });

    expect(fixtureValue(first).status).toBe(PlayerStatus.PRONE);
    expect(fixtureValue(second).gridPosition).toEqual({ x: 9, y: 4 });
    expect(rolled()).toEqual([
      "Rolled 1 block dice: pow",
      "Armour Roll (Human Lineman #1): 1 + 1 = 2",
      "Rolled 1 block dice: push",
    ]);
  });

  it("holds Pile Driver on a first-target Both Down until both Blocks resolve", async () => {
    const { start, run, rolled, attacker, first, second } = multipleBlock({
      dice: [2, 1, 1, 3],
      skills: [SkillType.PILE_DRIVER, SkillType.BLOCK],
    });

    await start();
    const next = await run({ type: "choose-block-result", index: 0 });
    expect(next.pendingDecision).toMatchObject({
      type: "block-dice",
      defenderId: fixtureValue(second).id,
    });
    await run({ type: "choose-block-result", index: 0 });
    const offer = await run({ type: "choose-push-direction", x: 10, y: 7 });

    expect(rolled()).toEqual([
      "Rolled 1 block dice: both-down",
      "Armour Roll (Human Lineman #1): 1 + 1 = 2",
      "Rolled 1 block dice: push",
    ]);
    expect(fixtureValue(first).status).toBe(PlayerStatus.PRONE);
    expect(fixtureValue(attacker).status).toBe(PlayerStatus.ACTIVE);
    expect(offer.pendingDecision).toMatchObject({
      type: "reaction",
      playerId: fixtureValue(attacker).id,
      skill: SkillType.PILE_DRIVER,
    });
  });

  it("offers Pile Driver on the first target once both Blocks resolve", async () => {
    const { start, run, rolled, attacker, first } = multipleBlock({
      dice: [5, 1, 1, 3],
      skills: [SkillType.PILE_DRIVER],
      firstSkills: [SkillType.STAND_FIRM],
    });

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
    expect(fixtureValue(first).status).toBe(PlayerStatus.PRONE);
    expect(offer.pendingDecision).toMatchObject({
      type: "reaction",
      playerId: fixtureValue(attacker).id,
      skill: SkillType.PILE_DRIVER,
    });
  });

  it("offers Pile Driver on the second target once both Blocks resolve", async () => {
    const { start, run, rolled, attacker, second } = multipleBlock({
      dice: [3, 2, 1, 1],
      skills: [SkillType.PILE_DRIVER, SkillType.BLOCK],
    });

    await start();
    await run({ type: "choose-block-result", index: 0 });
    await run({ type: "choose-push-direction", x: 12, y: 5 });
    const offer = await run({ type: "choose-block-result", index: 0 });

    expect(rolled()).toEqual([
      "Rolled 1 block dice: push",
      "Rolled 1 block dice: both-down",
      "Armour Roll (Human Lineman #2): 1 + 1 = 2",
    ]);
    expect(fixtureValue(second).status).toBe(PlayerStatus.PRONE);
    expect(offer.pendingDecision).toMatchObject({
      type: "reaction",
      playerId: fixtureValue(attacker).id,
      skill: SkillType.PILE_DRIVER,
    });
  });

  it("skips the second Block once the first knocks the blocker down", async () => {
    const { start, run, rolled, attacker, second } = multipleBlock({
      dice: [2, 1, 1, 1, 1, 1],
    });

    await start();
    const next = await run({ type: "choose-block-result", index: 0 });

    expect(rolled()[0]).toBe("Rolled 1 block dice: both-down");
    expect(rolled().filter((r) => r.startsWith("Rolled"))).toHaveLength(1);
    expect(fixtureValue(attacker).status).not.toBe(PlayerStatus.ACTIVE);
    expect(fixtureValue(second).status).toBe(PlayerStatus.ACTIVE);
    expect(next.pendingDecision?.type).not.toBe("block-dice");
  });
});
