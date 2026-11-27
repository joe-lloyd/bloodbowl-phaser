import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { RosterName } from "../../src/types/Team";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";

const SEED = 1;
const SKAVEN = [
  "Skaven Clanrat",
  "Skaven Thrower",
  "Gutter Runner",
  "Skaven Blitzer",
];

function skavenAnimosity(position: string) {
  const template = getRosterByRosterName(
    RosterName.UNDERWORLD_DENIZENS
  ).playerTemplates.find((t) => t.positionName === position);
  const animosity = template?.skills.find(
    (s) => s.type === SkillType.ANIMOSITY
  );
  if (!animosity) throw new Error(`${position} has no Animosity`);
  return { type: SkillType.ANIMOSITY, parameter: animosity.parameter ?? "" };
}

function scenario(position: string): Scenario {
  return {
    id: "underworld-animosity",
    name: "Skaven hands off to a Goblin",
    description: "an Underworld Skaven's Animosity (Goblin) on a hand-off",
    setup: {
      team1Roster: RosterName.UNDERWORLD_DENIZENS,

      team1Placements: [
        { playerIndex: 1, x: 10, y: 5, skills: [skavenAnimosity(position)] },
        { playerIndex: 2, x: 11, y: 5 },
      ],
      team2Placements: [{ playerIndex: 0, x: 3, y: 9 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 10, y: 5 },
    },
  };
}

describe.each(SKAVEN)("Underworld %s", (position) => {
  it("rolls Animosity before handing off to a Goblin", async () => {
    const game = new HeadlessGame({ scenario: scenario(position), seed: SEED });
    const passer = game.ctx.teams[0].players[1];
    const target = game.ctx.teams[0].players[2];
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(passer).id,
      action: "handoff",
    });
    const handed = await game.execute({
      type: "handoff",
      playerId: fixtureValue(passer).id,
      targetId: fixtureValue(target).id,
    });

    expect(
      handed.events
        .filter((e) => e.name === "diceRoll")
        .map(
          (e) => z.object({ description: z.string() }).parse(e.data).description
        )[0]
    ).toBe("Animosity (Underworld Goblin Lineman #2): 4, needs 2+");
  });
});
