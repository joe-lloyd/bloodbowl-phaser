import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario, type PlayerPlacement } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { playerBoxOf } from "../../src/game/rules/playerLocation";
import type {
  CommandResponse,
  EmittedEvent,
} from "../../src/headless/protocol";

function scenario(
  attacker: Partial<PlayerPlacement>,
  target: Partial<PlayerPlacement>
): Scenario {
  return {
    id: "armour-roll-skills",
    name: "Armour roll skills",
    description: "",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 10, y: 5, ...attacker },

        { playerIndex: 1, x: 2, y: 12 },
      ],
      team2Placements: [{ playerIndex: 0, x: 11, y: 5, ...target }],
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
  const dataOf = <T>(name: string, schema: z.ZodType<T>) =>
    events.filter((e) => e.name === name).map((e) => schema.parse(e.data));
  return {
    run,
    dice: () =>
      dataOf("diceRoll", z.object({ description: z.string() })).map(
        (d) => d.description
      ),
    skills: () =>
      dataOf("skillTriggered", z.object({ effect: z.string() })).map(
        (d) => d.effect
      ),
    attacker: game.ctx.team1.players[0],
    target: game.ctx.team2.players[0],
  };
}

const BREATHE_FIRE_SEED = 30;

const POW_SEED = 150;

describe("Mighty Blow and Claws", () => {
  it("stay out of a knockdown that is not a Block Action", async () => {
    const { run, dice, skills, attacker, target } = session(
      scenario(
        {
          skills: [
            SkillType.BREATHE_FIRE,
            SkillType.MIGHTY_BLOW,
            SkillType.CLAWS,
          ],
        },
        { stats: { AV: 10 } }
      ),
      BREATHE_FIRE_SEED
    );

    await run({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "breatheFire",
    });
    await run({
      type: "special-action",
      action: "breatheFire",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(target).id,
    });

    expect(dice()).toEqual([
      "Breathe Fire (Human Lineman #1): 6, needs 4+",
      "Armour Roll (Human Lineman #1): 6 + 3 = 9",
    ]);
    expect(skills()).toEqual([
      "Breathe Fire: a gout of flame at Human Lineman #1",
    ]);
    expect(fixtureValue(target).status).toBe(PlayerStatus.PRONE);
  });

  for (const order of [
    [SkillType.MIGHTY_BLOW, SkillType.CLAWS],
    [SkillType.CLAWS, SkillType.MIGHTY_BLOW],
  ]) {
    it(`saves Mighty Blow for the injury when Claws breaks armour (${order.join(", ")})`, async () => {
      const { run, dice, skills, attacker, target } = session(
        scenario({ skills: order }, { stats: { AV: 10 } }),
        POW_SEED
      );

      await run({
        type: "declare-action",
        playerId: fixtureValue(attacker).id,
        action: "block",
      });
      await run({
        type: "block",
        attackerId: fixtureValue(attacker).id,
        defenderId: fixtureValue(target).id,
      });
      await run({ type: "choose-block-result", index: 0 });
      await run({ type: "choose-push-direction", x: 12, y: 5 });
      await run({ type: "choose-follow-up", followUp: false });

      expect(dice()).toEqual([
        "Rolled 1 block dice: pow",
        "Armour Roll (Human Lineman #1): 3 + 6 = 9",
        "Injury Roll (Human Lineman #1): 5 + 2 = 7",
      ]);
      expect(skills()).toEqual(
        expect.arrayContaining([
          "Claws: natural 9 breaks armour regardless of AV",
          "Mighty Blow: +1 saved for the injury roll",
        ])
      );

      expect(playerBoxOf(fixtureValue(target))).toBe("ko");
    });
  }
});

const CHAINSAW_SEED = 5;

describe("a Chainsaw Attack's armour roll", () => {
  it("loses its +3 against Iron Hard Skin", async () => {
    const { run, dice, skills, attacker, target } = session(
      scenario(
        { skills: [SkillType.CHAINSAW] },
        { stats: { AV: 10 }, skills: [SkillType.IRON_HARD_SKIN] }
      ),
      CHAINSAW_SEED
    );

    await run({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "chainsaw",
    });
    await run({
      type: "special-action",
      action: "chainsaw",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(target).id,
    });

    expect(dice()).toEqual([
      "Chainsaw Kick-back (Human Lineman #1): 5, needs 2+",
      "Human Lineman #1 Armour: 5+2 +3 = 10 (AV 10+)",
    ]);
    expect(skills()).toContain(
      "Iron Hard Skin: armour roll modifiers cancelled"
    );
    expect(fixtureValue(target).status).toBe(PlayerStatus.ACTIVE);
  });
});

const FOUL_SEED = 2;

describe("a Chainsaw owner's own armour", () => {
  it("takes no +3 when they are Fouled rather than Knocked Down", async () => {
    const { run, dice, skills, attacker, target } = session(
      scenario(
        {},
        { status: PlayerStatus.PRONE, skills: [SkillType.CHAINSAW] }
      ),
      FOUL_SEED
    );

    await run({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "foul",
    });
    await run({
      type: "foul",
      playerId: fixtureValue(attacker).id,
      x: 11,
      y: 5,
    });

    expect(dice()).toEqual([
      "Foul Armour Roll (Human Lineman #1): 5 + 2 = 7 (AV 9+)",
    ]);
    expect(skills()).toEqual([]);
    expect(fixtureValue(target).status).toBe(PlayerStatus.PRONE);
  });
});
