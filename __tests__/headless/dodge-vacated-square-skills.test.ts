import { z } from "zod";
import { skillTypeSchema } from "../../src/boundary/schemas/SkillType";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { SkillType } from "../../src/types/Skills";
import type { CommandResponse } from "../../src/headless/protocol";

function scenario(skill: SkillType, at: { x: number; y: number }): Scenario {
  return {
    id: "dodge-vacated-square-skills",
    name: "Skills of the vacated square's markers",
    description: "a Dodge-skilled lineman dodges past a skilled opponent",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 10, y: 5, skills: [SkillType.DODGE] },
      ],
      team2Placements: [
        { playerIndex: 0, x: 9, y: 5 },
        { playerIndex: 1, ...at, skills: [skill] },
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 1 },
    },
  };
}

async function dodge(skill: SkillType, at: { x: number; y: number }) {
  const game = new HeadlessGame({ scenario: scenario(skill, at), seed: 7 });
  const dodger = fixtureValue(game.snapshot().teams[0]).players[0];
  await game.execute({
    type: "declare-action",
    playerId: fixtureValue(dodger).id,
    action: "move",
  });
  return game.execute({
    type: "move",
    playerId: fixtureValue(dodger).id,
    path: [{ x: 11, y: 5 }],
  });
}

const triggered = (response: CommandResponse, skill: SkillType) =>
  response.events.some(
    (e) =>
      e.name === GameEventNames.SkillTriggered &&
      z.object({ skill: skillTypeSchema }).parse(e.data).skill === skill
  );

function dodgeModifier(response: CommandResponse): number | undefined {
  const roll = response.events.find(
    (e) =>
      e.name === GameEventNames.DiceRoll &&
      z
        .object({ rollType: z.string() })
        .parse(e.data)
        .rollType.startsWith("Dodge")
  );
  if (!roll) return undefined;
  const data = z
    .object({ value: z.number(), total: z.number() })
    .parse(roll.data);
  return data.total - data.value;
}

const destinationOnly = { x: 12, y: 5 };
const bothSquares = { x: 11, y: 4 };

describe("skills of the vacated square's markers", () => {
  it("Tackle does not fire from a player marking only the destination", async () => {
    const response = await dodge(SkillType.TACKLE, destinationOnly);
    expect(triggered(response, SkillType.TACKLE)).toBe(false);
  });

  it("Tackle fires from a player marking the vacated square", async () => {
    const response = await dodge(SkillType.TACKLE, bothSquares);
    expect(triggered(response, SkillType.TACKLE)).toBe(true);
  });

  it("Prehensile Tail does not fire from a player marking only the destination", async () => {
    const response = await dodge(SkillType.PREHENSILE_TAIL, destinationOnly);
    expect(triggered(response, SkillType.PREHENSILE_TAIL)).toBe(false);

    expect(dodgeModifier(response)).toBe(-1);
  });

  it("Prehensile Tail fires from a player marking the vacated square", async () => {
    const response = await dodge(SkillType.PREHENSILE_TAIL, bothSquares);
    expect(triggered(response, SkillType.PREHENSILE_TAIL)).toBe(true);

    expect(dodgeModifier(response)).toBe(-2);
  });
});
