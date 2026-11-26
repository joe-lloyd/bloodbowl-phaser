import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";

function scenario(passerSkills: SkillType[]): Scenario {
  return {
    id: "pass-range",
    name: "Pass beyond the Range Ruler",
    description: "team1 aims 17 squares downfield",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 1, y: 5, skills: passerSkills },
        { playerIndex: 1, x: 18, y: 5 },
      ],
      team2Placements: [{ playerIndex: 0, x: 16, y: 9 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 5 },
    },
  };
}

async function passTo({
  skills,
  x,
  y,
  hailMary,
}: {
  skills: SkillType[];
  x: number;
  y: number;
  hailMary?: boolean;
}) {
  const game = new HeadlessGame({ scenario: scenario(skills), seed: 1 });
  const passerId = fixtureValue(game.ctx.team1.players[0]).id;
  await game.execute({
    type: "declare-action",
    playerId: passerId,
    action: "pass",
  });
  return game.execute({
    type: "pass",
    playerId: passerId,
    x,
    y,
    ...(hailMary !== undefined && { hailMary }),
  });
}

describe("a pass target beyond the Range Ruler", () => {
  it("is refused for an ordinary pass", async () => {
    const response = await passTo({ skills: [], x: 18, y: 5 });

    expect(response.ok).toBe(false);
    expect(response.reason).toBe(
      "command-failed: Target is beyond the Range Ruler"
    );
    expect(response.snapshot.ballPosition).toEqual({ x: 1, y: 5 });
  });

  it("is refused for a Hail Mary passer who does not declare a Hail Mary", async () => {
    const response = await passTo({
      skills: [SkillType.HAIL_MARY_PASS],
      x: 18,
      y: 5,
    });

    expect(response.ok).toBe(false);
    expect(response.reason).toBe(
      "command-failed: Target is beyond the Range Ruler"
    );
  });

  it("is thrown as a declared Hail Mary Pass", async () => {
    const response = await passTo({
      skills: [SkillType.HAIL_MARY_PASS],
      x: 18,
      y: 5,
      hailMary: true,
    });

    expect(response.ok).toBe(true);
    const pass = response.events.find((e) => e.name === "diceRoll");
    expect(
      z.object({ description: z.string() }).parse(pass?.data).description
    ).toBe("Pass (Human Lineman #1): 4, needs 6+");
  });

  it("must still be a square on the pitch for a Hail Mary Pass", async () => {
    const response = await passTo({
      skills: [SkillType.HAIL_MARY_PASS],
      x: 20,
      y: 5,
      hailMary: true,
    });

    expect(response.ok).toBe(false);
    expect(response.reason).toBe("command-failed: Target is off the pitch");
  });
});
