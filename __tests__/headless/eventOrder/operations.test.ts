import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { PlayerStatus } from "../../../src/types/Player";
import { SkillType } from "../../../src/types/Skills";
import {
  type Answer,
  SEEDS,
  acceptAll,
  acrossSeeds,
  playOut,
  turnGame,
} from "./eventOrder";

const intercepting: Answer = (pending) =>
  fixtureValue(
    pending.type === "interception"
      ? {
          type: "choose-interception",
          ...(pending.candidates[0]
            ? { playerId: pending.candidates[0].playerId }
            : {}),
        }
      : acceptAll(pending)
  );

const SPARE = { x: 2, y: 12 };

describe("operation events keep their order", () => {
  it("Breathe Fire", async () => {
    const bySeed = await acrossSeeds(SEEDS, async (seed) => {
      const game = turnGame({
        seed: seed,
        team1: [{ x: 10, y: 5, skills: [SkillType.BREATHE_FIRE] }, SPARE],
        team2: [{ x: 11, y: 5, stats: { ST: 5 } }],
        ballPosition: { x: 11, y: 5 },
      });
      const [attacker] = game.ctx.team1.players;
      const [target] = game.ctx.team2.players;
      return playOut(game, [
        {
          type: "declare-action",
          playerId: fixtureValue(attacker).id,
          action: "breatheFire",
        },
        {
          type: "special-action",
          action: "breatheFire",
          attackerId: fixtureValue(attacker).id,
          defenderId: fixtureValue(target).id,
        },
      ]);
    });
    expect(bySeed).toMatchSnapshot();
  });

  it("Projectile Vomit", async () => {
    const bySeed = await acrossSeeds(SEEDS, async (seed) => {
      const game = turnGame({
        seed: seed,
        team1: [{ x: 10, y: 5, skills: [SkillType.PROJECTILE_VOMIT] }, SPARE],
        team2: [{ x: 11, y: 5 }],
        ballPosition: { x: 11, y: 5 },
      });
      const [attacker] = game.ctx.team1.players;
      const [target] = game.ctx.team2.players;
      return playOut(game, [
        {
          type: "declare-action",
          playerId: fixtureValue(attacker).id,
          action: "vomit",
        },
        {
          type: "special-action",
          action: "vomit",
          attackerId: fixtureValue(attacker).id,
          defenderId: fixtureValue(target).id,
        },
      ]);
    });
    expect(bySeed).toMatchSnapshot();
  });

  it("Pile Driver after a Block", async () => {
    const bySeed = await acrossSeeds(SEEDS, async (seed) => {
      const game = turnGame({
        seed: seed,
        team1: [{ x: 10, y: 5, skills: [SkillType.PILE_DRIVER] }, SPARE],
        team2: [{ x: 11, y: 5 }],
        ballPosition: { x: 10, y: 5 },
      });
      const [attacker] = game.ctx.team1.players;
      const [defender] = game.ctx.team2.players;
      return playOut(
        game,
        [
          {
            type: "declare-action",
            playerId: fixtureValue(attacker).id,
            action: "block",
          },
          {
            type: "block",
            attackerId: fixtureValue(attacker).id,
            defenderId: fixtureValue(defender).id,
          },
        ],
        acceptAll
      );
    });
    expect(bySeed).toMatchSnapshot();
  });

  it("Punt with Kick", async () => {
    const bySeed = await acrossSeeds(SEEDS, async (seed) => {
      const game = turnGame({
        seed: seed,
        team1: [
          { x: 3, y: 5, skills: [SkillType.PUNT, SkillType.KICK] },
          SPARE,
        ],
        team2: [{ x: 8, y: 5 }],
        ballPosition: { x: 3, y: 5 },
      });
      const [punter] = game.ctx.team1.players;
      return playOut(
        game,
        [
          {
            type: "declare-action",
            playerId: fixtureValue(punter).id,
            action: "punt",
          },
          { type: "punt", playerId: fixtureValue(punter).id, x: 1, y: 5 },
        ],
        acceptAll
      );
    });
    expect(bySeed).toMatchSnapshot();
  });

  for (const variant of [
    { name: "a throw onto a team-mate", skills: [], aim: { x: 8, y: 5 } },
    {
      name: "an Always Hungry throw",
      skills: [SkillType.ALWAYS_HUNGRY, SkillType.STRONG_ARM],
      aim: { x: 7, y: 6 },
    },
    {
      name: "a Bullseye throw onto a team-mate",
      skills: [SkillType.BULLSEYE],
      aim: { x: 8, y: 5 },
    },
  ]) {
    it(`Throw Team-mate: ${variant.name}`, async () => {
      const bySeed = await acrossSeeds(SEEDS, async (seed) => {
        const game = turnGame({
          seed: seed,
          team1: [
            {
              x: 4,
              y: 5,
              skills: [SkillType.THROW_TEAM_MATE, ...variant.skills],
            },
            { x: 5, y: 5, skills: [SkillType.RIGHT_STUFF] },
            { x: 8, y: 5 },
            SPARE,
          ],
          team2: [{ x: 8, y: 7 }],
          ballPosition: { x: 5, y: 5 },
        });
        const [thrower, teammate] = game.ctx.team1.players;
        return playOut(game, [
          {
            type: "declare-action",
            playerId: fixtureValue(thrower).id,
            action: "throwTeamMate",
          },
          {
            type: "throw-teammate",
            throwerId: fixtureValue(thrower).id,
            teammateId: fixtureValue(teammate).id,
            ...variant.aim,
          },
        ]);
      });
      expect(bySeed).toMatchSnapshot();
    });
  }

  it("Throw Team-mate: a Swoop and a kick", async () => {
    const swoop = await acrossSeeds(SEEDS, async (seed) => {
      const game = turnGame({
        seed: seed,
        team1: [
          { x: 4, y: 5, skills: [SkillType.THROW_TEAM_MATE] },
          { x: 5, y: 5, skills: [SkillType.RIGHT_STUFF, SkillType.SWOOP] },
          SPARE,
        ],
        team2: [{ x: 8, y: 6 }],
        ballPosition: { x: 1, y: 1 },
      });
      const [thrower, teammate] = game.ctx.team1.players;
      return playOut(game, [
        {
          type: "declare-action",
          playerId: fixtureValue(thrower).id,
          action: "throwTeamMate",
        },
        {
          type: "throw-teammate",
          throwerId: fixtureValue(thrower).id,
          teammateId: fixtureValue(teammate).id,
          x: 8,
          y: 5,
          swoopFacing: "east",
        },
      ]);
    });
    const kick = await acrossSeeds(SEEDS, async (seed) => {
      const game = turnGame({
        seed: seed,
        team1: [
          { x: 4, y: 5, skills: [SkillType.KICK_TEAM_MATE] },
          { x: 5, y: 5, skills: [SkillType.RIGHT_STUFF] },
          SPARE,
        ],
        team2: [{ x: 8, y: 6 }],
        ballPosition: { x: 5, y: 5 },
      });
      const [thrower, teammate] = game.ctx.team1.players;
      return playOut(game, [
        {
          type: "declare-action",
          playerId: fixtureValue(thrower).id,
          action: "throwTeamMate",
        },
        {
          type: "throw-teammate",
          throwerId: fixtureValue(thrower).id,
          teammateId: fixtureValue(teammate).id,
          x: 8,
          y: 5,
          mode: "kick",
        },
      ]);
    });
    expect({ swoop, kick }).toMatchSnapshot();
  });

  for (const variant of [
    {
      name: "a short pass",
      target: { x: 8, y: 5 },
      team2: [{ x: 7, y: 7 }],
      answer: acceptAll,
    },
    {
      name: "a long pass past an On the Ball interceptor",
      target: { x: 14, y: 5 },
      answer: intercepting,
      team2: [
        { x: 9, y: 5, skills: [SkillType.ON_THE_BALL] },
        { x: 11, y: 6 },
      ],
    },
    {
      name: "a pass to an empty square by a Diving Catch",
      target: { x: 9, y: 9 },
      team2: [{ x: 10, y: 10, skills: [SkillType.DIVING_CATCH] }],
      answer: acceptAll,
    },
  ]) {
    it(`Pass: ${variant.name}`, async () => {
      const bySeed = await acrossSeeds(SEEDS, async (seed) => {
        const game = turnGame({
          seed: seed,
          team1: [{ x: 4, y: 5 }, { x: 8, y: 5 }, { x: 14, y: 5 }, SPARE],
          team2: variant.team2,
          ballPosition: { x: 4, y: 5 },
        });
        const [passer] = game.ctx.team1.players;
        return playOut(
          game,
          [
            {
              type: "declare-action",
              playerId: fixtureValue(passer).id,
              action: "pass",
            },
            {
              type: "pass",
              playerId: fixtureValue(passer).id,
              ...variant.target,
            },
          ],
          variant.answer
        );
      });
      expect(bySeed).toMatchSnapshot();
      if (variant.answer === intercepting) {
        const rolls = Object.values(bySeed).flat();
        expect(
          rolls.some((line) => line.startsWith("diceRoll: Interception"))
        ).toBe(true);
      }
    });
  }

  it("Armour, Injury and the crowd after a Block", async () => {
    const bySeed = await acrossSeeds(SEEDS, async (seed) => {
      const game = turnGame({
        seed: seed,
        team1: [{ x: 10, y: 1, skills: [SkillType.MIGHTY_BLOW] }, SPARE],
        team2: [
          { x: 10, y: 0 },
          { x: 11, y: 1, status: PlayerStatus.PRONE },
        ],
        ballPosition: { x: 10, y: 0 },
      });
      const [attacker] = game.ctx.team1.players;
      const [defender] = game.ctx.team2.players;
      return playOut(
        game,
        [
          {
            type: "declare-action",
            playerId: fixtureValue(attacker).id,
            action: "block",
          },
          {
            type: "block",
            attackerId: fixtureValue(attacker).id,
            defenderId: fixtureValue(defender).id,
          },
        ],
        acceptAll
      );
    });
    expect(bySeed).toMatchSnapshot();
  });

  it("the end of a drive sends off a Secret Weapon", async () => {
    const bySeed = await acrossSeeds(SEEDS.slice(0, 3), async (seed) => {
      const game = turnGame({
        seed: seed,
        team1: [
          { x: 17, y: 5 },
          { x: 10, y: 5, skills: [SkillType.SECRET_WEAPON] },
        ],
        team2: [{ x: 12, y: 9, skills: [SkillType.SECRET_WEAPON] }],
        ballPosition: { x: 17, y: 5 },
      });
      const [carrier] = game.ctx.team1.players;
      return playOut(game, [
        {
          type: "declare-action",
          playerId: fixtureValue(carrier).id,
          action: "move",
        },
        {
          type: "move",
          playerId: fixtureValue(carrier).id,
          path: [
            { x: 18, y: 5 },
            { x: 19, y: 5 },
          ],
        },
      ]);
    });
    expect(bySeed).toMatchSnapshot();
  });
});
