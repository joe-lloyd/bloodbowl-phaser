import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";

/**
 * "The declared square must be wholly underneath the maximum range of the
 * Range Ruler" (2025 rulebook p.74). Only a Hail Mary Pass may "declare any
 * square on the pitch as the target square rather than using the Range
 * Ruler" (p.129). A refused pass rolls nothing and keeps the ball in hand.
 */
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

async function passTo(
  skills: SkillType[],
  x: number,
  y: number,
  hailMary?: boolean
) {
  const game = new HeadlessGame({ scenario: scenario(skills), seed: 1 });
  const passerId = game.ctx.team1.players[0].id;
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
    ...(hailMary === undefined ? {} : { hailMary }),
  });
}

describe("a pass target beyond the Range Ruler", () => {
  it("is refused for an ordinary pass", async () => {
    const response = await passTo([], 18, 5);

    expect(response.ok).toBe(false);
    expect(response.reason).toBe(
      "command-failed: Target is beyond the Range Ruler"
    );
    expect(response.snapshot.ballPosition).toEqual({ x: 1, y: 5 });
  });

  it("is refused for a Hail Mary passer who does not declare a Hail Mary", async () => {
    const response = await passTo([SkillType.HAIL_MARY_PASS], 18, 5);

    expect(response.ok).toBe(false);
    expect(response.reason).toBe(
      "command-failed: Target is beyond the Range Ruler"
    );
  });

  it("is thrown as a declared Hail Mary Pass", async () => {
    const response = await passTo([SkillType.HAIL_MARY_PASS], 18, 5, true);

    expect(response.ok).toBe(true);
    const pass = response.events.find((e) => e.name === "diceRoll");
    expect((pass?.data as { description: string }).description).toBe(
      "Pass (Human Lineman #1): 4, needs 6+"
    );
  });

  it("must still be a square on the pitch for a Hail Mary Pass", async () => {
    const response = await passTo([SkillType.HAIL_MARY_PASS], 20, 5, true);

    expect(response.ok).toBe(false);
    expect(response.reason).toBe("command-failed: Target is off the pitch");
  });
});
