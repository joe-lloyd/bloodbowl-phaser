import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { RosterName } from "../../src/types/Team";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";

const SKULL_SEED = 1;

function trollSlayerHatred(roster: RosterName) {
  const slayer = getRosterByRosterName(roster).playerTemplates.find(
    (t) => t.positionName === "Troll Slayer"
  );
  const hatred = slayer?.skills.find((s) => s.type === SkillType.HATRED);
  if (!hatred) throw new Error(`${roster} has no Troll Slayer Hatred`);
  return { type: SkillType.HATRED, parameter: hatred.parameter ?? "" };
}

function scenario(roster: RosterName): Scenario {
  return {
    id: "troll-slayer-hatred",
    name: "Troll Slayer blocks a Troll",
    description: "a Troll Slayer's Hatred (Troll) meets a Troll",
    setup: {
      team1Roster: roster,
      team2Roster: RosterName.UNDERWORLD_DENIZENS,
      team1Placements: [
        { playerIndex: 0, x: 10, y: 5, skills: [trollSlayerHatred(roster)] },
      ],

      team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 1 },
    },
  };
}

describe.each([RosterName.DWARF, RosterName.OLD_WORLD_ALLIANCE])(
  "%s Troll Slayer",
  (roster) => {
    it("offers to re-roll a Player Down against a Troll", async () => {
      const game = new HeadlessGame({
        scenario: scenario(roster),
        seed: SKULL_SEED,
      });
      const attackerId = fixtureValue(game.ctx.teams[0].players[0]).id;
      const defenderId = fixtureValue(game.ctx.teams[1].players[0]).id;
      await game.execute({
        type: "declare-action",
        playerId: attackerId,
        action: "block",
      });
      const rolled = await game.execute({
        type: "block",
        attackerId,
        defenderId,
      });

      expect(
        rolled.events
          .filter((e) => e.name === "diceRoll")
          .map(
            (e) =>
              z.object({ description: z.string() }).parse(e.data).description
          )
      ).toEqual(["Rolled 2 block dice: push, skull"]);
      expect(rolled.pendingDecision).toMatchObject({
        type: "reaction",
        skill: SkillType.HATRED,
      });

      const rerolled = await game.execute({
        type: "use-reaction",
        accept: true,
      });
      expect(
        rerolled.pendingDecision?.type === "block-dice"
          ? rerolled.pendingDecision.options.map((o) => o.type)
          : undefined
      ).toEqual(["push", "push"]);
      expect(
        rerolled.events
          .filter((e) => e.name === "rerollUsed")
          .map((e) => e.data)
      ).toEqual([
        {
          playerId: attackerId,
          source: "skill",
          skill: SkillType.HATRED,
          rollKind: "block",
          before: ["Push", "Attacker Down"],
          after: ["Push", "Push"],
        },
      ]);
    });
  }
);
