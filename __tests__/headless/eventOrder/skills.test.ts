import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { SCENARIOS } from "../../../src/data/scenarios";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import { Inducement } from "../../../src/types/Inducements";
import { SkillType } from "../../../src/types/Skills";
import { bought, commit } from "../../utils/inducement-helpers";
import { forceDice } from "../../utils/test-helpers";
import {
  type Answer,
  SEEDS,
  acceptAll,
  acrossSeeds,
  eventOrder,
  playOut,
  turnGame,
} from "./eventOrder";

const SPARE = { x: 2, y: 12 };

describe("skill and prayer events keep their order", () => {
  for (const variant of [
    {
      name: "Dodge re-roll past Tentacles",
      mover: [SkillType.DODGE],
      marker: [SkillType.TENTACLES],
    },
    {
      name: "Pro past a Shadowing marker",
      mover: [SkillType.PRO],
      marker: [SkillType.SHADOWING],
    },
    {
      name: "a team re-roll past Tentacles and Shadowing",
      mover: [],
      marker: [SkillType.TENTACLES, SkillType.SHADOWING],
    },
  ]) {
    it(variant.name, async () => {
      const bySeed = await acrossSeeds(SEEDS, async (seed) => {
        const game = turnGame({
          seed: seed,
          team1: [{ x: 10, y: 5, skills: variant.mover }, SPARE],
          team2: [{ x: 11, y: 5, skills: variant.marker }],
          ballPosition: { x: 1, y: 1 },
        });
        const [mover] = game.ctx.team1.players;
        return playOut(
          game,
          [
            {
              type: "declare-action",
              playerId: fixtureValue(mover).id,
              action: "move",
            },
            {
              type: "move",
              playerId: fixtureValue(mover).id,
              path: [
                { x: 9, y: 5 },
                { x: 8, y: 5 },
              ],
            },
          ],
          acceptAll
        );
      });
      expect(bySeed).toMatchSnapshot();
    });
  }

  it("every Prayer to Nuffle", async () => {
    const scrimmage = fixtureValue(
      SCENARIOS.find((s) => s.id === "basic-scrimmage")
    );
    const game = new HeadlessGame({ scenario: scrimmage, seed: 1 });
    const team1 = game.ctx.team1;
    forceDice(game.ctx.rng, [1, 2, 3, 4, 5, 6, 7, 8]);
    await commit(game, [bought(team1.id, Inducement.PRAYERS_TO_NUFFLE, 8)]);
    const first = eventOrder(game.events());
    const choose: Answer = (pending) =>
      fixtureValue(
        pending.type === "inducement-choice"
          ? {
              type: "choose-inducement",
              ...(pending.playerIds[0] && { playerId: pending.playerIds[0] }),
              ...(pending.skills?.[0] && { skill: pending.skills[0] }),
            }
          : undefined
      );
    const rest = await playOut(game, [{ type: "state" }], choose);
    expect([...first, ...rest]).toMatchSnapshot();
  });
});
