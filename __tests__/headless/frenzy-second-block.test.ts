import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario, type PlayerPlacement } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { PlayerCondition, hasCondition } from "../../src/types/Player";
import type {
  CommandResponse,
  EmittedEvent,
} from "../../src/headless/protocol";
import { GameEventNames } from "../../src/types/events";
import { forceDice } from "../utils/test-helpers";

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
        {
          playerIndex: 0,
          x: 10,
          y: 5,
          skills: [SkillType.FRENZY],
          ...attacker,
        },

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
      .map(
        (e) => z.object({ description: z.string() }).parse(e.data).description
      );
  return {
    game,
    run,
    dice,
    attacker: game.ctx.team1.players[0],
    defender: game.ctx.team2.players[0],
  };
}

const PUSH_SEED = 1;

describe("Frenzy after a failed follow-up pickup", () => {
  it.each([1, 6])(
    "does not open another block decision after turnover on turn %i",
    async (turn) => {
      const base = scenario({}, {});
      base.setup.team1Placements[1] = { playerIndex: 1, x: 2, y: 9 };
      base.setup.ballPosition = { x: 12, y: 5 };
      base.setup.turn = turn;
      base.setup.teamRerolls = { team1: 0, team2: 0 };
      const { game, run, attacker, defender } = session(base, 1);

      forceDice(game.ctx.rng, [3, 4, 1, 7]);
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
      const after = await run({ type: "choose-push-direction", x: 12, y: 5 });
      expect(after.ok).toBe(true);
      expect(
        after.events.filter((e) => e.name === "ballPickup").map((e) => e.data)
      ).toEqual([
        expect.objectContaining({
          playerId: fixtureValue(attacker).id,
          success: false,
        }),
      ]);
      expect(after.events.filter((e) => e.name === "turnover")).toHaveLength(1);
      expect(
        after.events.filter((e) => e.name === "blockDiceRolled")
      ).toHaveLength(0);
      expect(game.pendingDecision()?.type).not.toBe("block-dice");
    }
  );
});

describe("Frenzy against Stand Firm", () => {
  it("settles a knocked-down carrier's armour and bounce before resuming Blitz movement", async () => {
    const setup = scenario({}, { skills: [SkillType.STAND_FIRM] });
    setup.setup.ballPosition = { x: 11, y: 5 };
    const { game, run, attacker, defender } = session(setup, 1);
    forceDice(game.ctx.rng, [6, 1, 1, 5]);
    await run({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "blitz",
    });
    await run({
      type: "block",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
    });
    await run({ type: "choose-block-result", index: 0 });
    const after = await run({ type: "use-reaction", accept: true });

    expect(after.pendingDecision).toBeNull();
    expect(
      after.events
        .filter(
          (event) =>
            event.name === GameEventNames.DiceRoll ||
            event.name === GameEventNames.UI_ResumeBlitzMove
        )
        .map((event) => event.name)
    ).toEqual([
      GameEventNames.DiceRoll,
      GameEventNames.DiceRoll,
      GameEventNames.UI_ResumeBlitzMove,
    ]);
  });

  it("still throws the second Block when the target stands firm", async () => {
    const { run, dice, attacker, defender } = session(
      scenario({}, { skills: [SkillType.STAND_FIRM] }),
      PUSH_SEED
    );

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

    const second = await run({ type: "use-reaction", accept: true });

    expect(dice()).toEqual([
      "Rolled 1 block dice: push",
      "Rolled 1 block dice: skull",
    ]);
    expect(second.pendingDecision).toMatchObject({
      type: "block-dice",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
    });
    expect(fixtureValue(attacker).gridPosition).toEqual({ x: 10, y: 5 });
    expect(fixtureValue(defender).gridPosition).toEqual({ x: 11, y: 5 });
  });
});

describe("a cancelled Frenzy second Block", () => {
  it("does not suppress Frenzy on the attacker's next activation", async () => {
    const { game, run, attacker, defender } = session(
      scenario({}, { skills: [SkillType.FOUL_APPEARANCE] }),
      1
    );

    forceDice(game.ctx.rng, [2, 4, 1]);
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
    const cancelled = await run({ type: "choose-push-direction", x: 12, y: 5 });
    expect(cancelled.pendingDecision).toBeNull();
    expect(game.ctx.gameService.hasPlayerActed(fixtureValue(attacker).id)).toBe(
      true
    );

    await run({ type: "end-turn" });
    await run({ type: "end-turn" });
    forceDice(game.ctx.rng, [2, 4, 2, 4]);
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
    const second = await run({ type: "choose-push-direction", x: 13, y: 5 });
    expect(second.pendingDecision).toMatchObject({
      type: "block-dice",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
      options: [{ type: "push" }],
    });
  });
});

const ADJACENT_BLITZ_SEED = 11;
const EXHAUSTED_BLITZ_SEED = 11;

describe("Frenzy's second Block during a Blitz", () => {
  it("resumes movement when the first block knocks the target down", async () => {
    const { game, run, attacker, defender } = session(scenario({}, {}), 2);
    await run({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "blitz",
    });
    const first = await run({
      type: "block",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
    });
    expect(first.pendingDecision).toMatchObject({
      type: "block-dice",
      options: [{ type: "pow" }],
    });
    await run({ type: "choose-block-result", index: 0 });
    const after = await run({ type: "choose-push-direction", x: 12, y: 5 });

    expect(after.pendingDecision).toBeNull();
    expect(fixtureValue(attacker).gridPosition).toEqual({ x: 11, y: 5 });
    expect(game.ctx.gameService.hasPlayerActed(fixtureValue(attacker).id)).toBe(
      false
    );
    expect(
      game.ctx.gameService.getMovementUsed(fixtureValue(attacker).id)
    ).toBe(1);
    expect(after.events.map((event) => event.name)).toContain(
      GameEventNames.UI_ResumeBlitzMove
    );
  });

  it("resumes movement after Stand Firm stops both pushes", async () => {
    const { game, run, attacker, defender } = session(
      scenario({}, { skills: [SkillType.STAND_FIRM] }),
      11
    );
    await run({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "blitz",
    });
    await run({
      type: "block",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
    });
    await run({ type: "choose-block-result", index: 0 });
    const second = await run({ type: "use-reaction", accept: true });
    expect(second.pendingDecision).toMatchObject({
      type: "block-dice",
      options: [{ type: "push" }],
    });
    await run({ type: "choose-block-result", index: 0 });
    const after = await run({ type: "use-reaction", accept: true });

    expect(after.pendingDecision).toBeNull();
    expect(fixtureValue(attacker).gridPosition).toEqual({ x: 10, y: 5 });
    expect(game.ctx.gameService.hasPlayerActed(fixtureValue(attacker).id)).toBe(
      false
    );
    expect(
      game.ctx.gameService.getMovementUsed(fixtureValue(attacker).id)
    ).toBe(2);
    expect(after.events.map((event) => event.name)).toContain(
      GameEventNames.UI_ResumeBlitzMove
    );
  });

  it("can dodge, push twice with forced follow-ups, then dodge away with its remaining movement", async () => {
    const setup = scenario({ x: 9, stats: { MA: 6, AG: 2 } }, {});
    setup.setup.team2Placements.push({ playerIndex: 1, x: 8, y: 5 });
    const { game, run, dice, attacker, defender } = session(setup, 11);
    const gs = game.ctx.gameService;

    await run({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "blitz",
    });
    const approach = await run({
      type: "move",
      playerId: fixtureValue(attacker).id,
      path: [{ x: 10, y: 5 }],
    });
    expect(approach.ok).toBe(true);
    expect(fixtureValue(attacker).gridPosition).toEqual({ x: 10, y: 5 });
    await run({
      type: "block",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
    });
    await run({ type: "choose-block-result", index: 0 });
    const second = await run({ type: "choose-push-direction", x: 12, y: 5 });
    expect(second.pendingDecision).toMatchObject({
      type: "block-dice",
      options: [{ type: "push" }],
    });
    await run({ type: "choose-block-result", index: 0 });
    const after = await run({ type: "choose-push-direction", x: 13, y: 5 });

    expect(dice()).toEqual([
      "Dodge (Human Lineman #1): 4, needs 3+",
      "Rolled 1 block dice: push",
      "Rolled 1 block dice: push",
    ]);
    expect(after.pendingDecision).toBeNull();
    expect(fixtureValue(attacker).gridPosition).toEqual({ x: 12, y: 5 });
    expect(fixtureValue(defender).gridPosition).toEqual({ x: 13, y: 5 });
    expect(gs.hasPlayerActed(fixtureValue(attacker).id)).toBe(false);
    expect(gs.hasUsedBlitzBlock(fixtureValue(attacker).id)).toBe(true);
    expect(gs.getMovementUsed(fixtureValue(attacker).id)).toBe(3);
    expect(after.events).toContainEqual({
      name: GameEventNames.UI_ResumeBlitzMove,
      data: { playerId: fixtureValue(attacker).id },
    });

    const third = await run({
      type: "block",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
    });
    expect(third.ok).toBe(false);
    expect(third.reason).toContain("blitz-block-already-used");

    const escape = await run({
      type: "move",
      playerId: fixtureValue(attacker).id,
      path: [{ x: 11, y: 4 }],
    });
    expect(escape.ok).toBe(true);
    expect(fixtureValue(attacker).gridPosition).toEqual({ x: 11, y: 4 });
    expect(gs.getMovementUsed(fixtureValue(attacker).id)).toBe(4);
    expect(dice()).toEqual([
      "Dodge (Human Lineman #1): 4, needs 3+",
      "Rolled 1 block dice: push",
      "Rolled 1 block dice: push",
      "Dodge (Human Lineman #1): 4, needs 2+",
    ]);
  });

  it("costs a square, so a blitzer out of movement must Rush", async () => {
    const { game, run, dice, attacker, defender } = session(
      scenario({ stats: { MA: 1 } }, {}),
      ADJACENT_BLITZ_SEED
    );

    await run({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "blitz",
    });
    await run({
      type: "block",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
    });
    await run({ type: "choose-block-result", index: 0 });
    const second = await run({ type: "choose-push-direction", x: 12, y: 5 });

    expect(dice()).toEqual([
      "Rolled 1 block dice: push",
      "Rush (Human Lineman #1): 4, needs 2+",
      "Rolled 1 block dice: push",
    ]);
    expect(second.pendingDecision).toMatchObject({ type: "block-dice" });
    expect(
      game.ctx.gameService.getMovementUsed(fixtureValue(attacker).id)
    ).toBe(2);
  });

  it("cannot happen when the blitzer has no Rush left", async () => {
    const { game, run, dice, attacker, defender } = session(
      scenario({ x: 8, stats: { MA: 1 } }, {}),
      EXHAUSTED_BLITZ_SEED
    );

    await run({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "blitz",
    });
    await run({
      type: "move",
      playerId: fixtureValue(attacker).id,
      path: [
        { x: 9, y: 5 },
        { x: 10, y: 5 },
      ],
    });
    await run({
      type: "block",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
    });
    await run({ type: "choose-block-result", index: 0 });
    const after = await run({ type: "choose-push-direction", x: 12, y: 5 });

    expect(dice()).toEqual([
      "Rush (Human Lineman #1): 4, needs 2+",
      "Rush (Human Lineman #1): 4, needs 2+",
      "Rolled 1 block dice: push",
    ]);
    expect(after.pendingDecision).toBeNull();
    expect(fixtureValue(attacker).gridPosition).toEqual({ x: 11, y: 5 });
    expect(
      game.ctx.gameService.getMovementUsed(fixtureValue(attacker).id)
    ).toBe(3);
  });
});

describe("Frenzy after a push that scores", () => {
  it("throws no second Block once the drive is over", async () => {
    const { game, run, attacker, defender } = session(
      {
        ...scenario({ x: 2, y: 5 }, { x: 1, y: 5 }),
        setup: {
          ...scenario({ x: 2, y: 5 }, { x: 1, y: 5 }).setup,
          ballPosition: { x: 1, y: 5 },
        },
      },
      PUSH_SEED
    );
    await run({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "block",
    });
    const rolled = await run({
      type: "block",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
    });
    expect(
      rolled.pendingDecision?.type === "block-dice" &&
        rolled.pendingDecision.options.map((o) => o.type)
    ).toEqual(["push"]);
    await run({ type: "choose-block-result", index: 0 });
    const pushed = await run({ type: "choose-push-direction", x: 0, y: 5 });

    expect(pushed.snapshot.score).toEqual({ team1: 0, team2: 1 });
    expect(pushed.pendingDecision).toBeNull();
    expect(game.pendingDecision()).toBeNull();
    expect(game.snapshot().phase).not.toBe(GamePhase.PLAY);
  });
});

describe("Frenzy's follow-up that scores", () => {
  it("throws no second Block once the carrier is in the end zone", async () => {
    const base = scenario({ x: 18, y: 4 }, { x: 19, y: 5 });
    const { game, run, attacker, defender } = session(
      { ...base, setup: { ...base.setup, ballPosition: { x: 18, y: 4 } } },
      PUSH_SEED
    );
    await run({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "block",
    });
    const rolled = await run({
      type: "block",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
    });
    expect(
      rolled.pendingDecision?.type === "block-dice" &&
        rolled.pendingDecision.options.map((o) => o.type)
    ).toEqual(["push"]);
    await run({ type: "choose-block-result", index: 0 });
    const pushed = await run({ type: "choose-push-direction", x: 19, y: 6 });

    expect(pushed.snapshot.score).toEqual({ team1: 1, team2: 0 });
    expect(pushed.pendingDecision).toBeNull();
    expect(game.pendingDecision()).toBeNull();
  });
});

describe("Frenzy's follow-up into the end zone with Bloodlust unsated", () => {
  it("throws no second Block after the failed bite", async () => {
    for (let seed = 1; seed < 200; seed++) {
      const base = scenario(
        { x: 18, y: 4, skills: [SkillType.FRENZY, SkillType.BLOODLUST] },
        { x: 19, y: 5 }
      );
      const { game, run, attacker, defender } = session(
        { ...base, setup: { ...base.setup, ballPosition: { x: 18, y: 4 } } },
        seed
      );
      const declared = await run({
        type: "declare-action",
        playerId: fixtureValue(attacker).id,
        action: "block",
      });

      if (declared.pendingDecision?.type !== "reaction") continue;
      await run({ type: "use-reaction", accept: false });
      const rolled = await run({
        type: "block",
        attackerId: fixtureValue(attacker).id,
        defenderId: fixtureValue(defender).id,
      });
      if (rolled.pendingDecision?.type !== "block-dice") continue;
      const push = rolled.pendingDecision.options.findIndex(
        (o) => o.type === "push"
      );
      if (push < 0) continue;
      await run({ type: "choose-block-result", index: push });
      const pushed = await run({ type: "choose-push-direction", x: 19, y: 6 });

      expect(
        hasCondition(fixtureValue(attacker), PlayerCondition.DISTRACTED)
      ).toBe(true);
      expect(pushed.snapshot.score).toEqual({ team1: 0, team2: 0 });
      expect(pushed.pendingDecision?.type).not.toBe("block-dice");
      expect(game.pendingDecision()?.type).not.toBe("block-dice");
      return;
    }
    throw new Error("no seed reached the unsated follow-up");
  });
});

describe("Multiple Block after a push that scores", () => {
  it("throws no second Block and gives the Strength back", async () => {
    for (let seed = 1; seed < 80; seed++) {
      const game = new HeadlessGame({
        scenario: {
          id: "multiple-block-scores",
          name: "Multiple Block scores",
          description: "",
          setup: {
            team1Placements: [
              {
                playerIndex: 0,
                x: 2,
                y: 5,
                stats: { ST: 5 },
                skills: [SkillType.MULTIPLE_BLOCK],
              },
              { playerIndex: 1, x: 10, y: 9 },
            ],
            team2Placements: [
              { playerIndex: 0, x: 1, y: 5, stats: { ST: 1 } },
              { playerIndex: 1, x: 2, y: 6, stats: { ST: 1 } },
            ],
            activeTeam: "team1",
            phase: GamePhase.PLAY,
            subPhase: SubPhase.TURN_RECEIVING,
            ballPosition: { x: 1, y: 5 },
          },
        },
        seed,
      });
      const attacker = game.ctx.team1.players[0];
      await game.execute({
        type: "declare-action",
        playerId: fixtureValue(attacker).id,
        action: "multipleBlock",
      });
      const rolled = await game.execute({
        type: "multiple-block",
        attackerId: fixtureValue(attacker).id,
        defender1Id: fixtureValue(game.ctx.team2.players[0]).id,
        defender2Id: fixtureValue(game.ctx.team2.players[1]).id,
      });
      if (rolled.pendingDecision?.type !== "block-dice") continue;
      const push = rolled.pendingDecision.options.findIndex(
        (o) => o.type === "push"
      );
      if (push < 0) continue;
      const chosen = await game.execute({
        type: "choose-block-result",
        index: push,
      });
      if (chosen.pendingDecision?.type !== "push-direction") continue;
      let pushed = await game.execute({
        type: "choose-push-direction",
        x: 0,
        y: 5,
      });
      if (pushed.pendingDecision?.type === "follow-up")
        pushed = await game.execute({
          type: "choose-follow-up",
          followUp: false,
        });

      expect(pushed.snapshot.score).toEqual({ team1: 0, team2: 1 });
      expect(pushed.pendingDecision).toBeNull();
      expect(fixtureValue(attacker).stats.ST).toBe(5);
      return;
    }
    throw new Error("no seed rolled a Push on the first target");
  });
});
