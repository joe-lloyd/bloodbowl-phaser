import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import type { CommandResponse } from "../../src/headless/protocol";

/**
 * Hail Mary Pass is a choice: "When this player performs a Pass Action ...
 * they may declare any square on the pitch as the target square rather than
 * using the Range Ruler. Make a Passing Ability Test as normal treating the
 * throw as a Long Bomb, and treating any result of an Accurate Pass as an
 * Inaccurate Pass" (2025 rulebook p.129). A passer with the skill who throws
 * along the ruler makes an ordinary pass. Seeds are committed, never
 * searched (see docs/E2E_TESTING.md).
 */
function scenario(passerSkills: SkillType[]): Scenario {
  return {
    id: "hail-mary-pass",
    name: "Hail Mary Pass passer",
    description: "team1 throws to a team-mate two squares away",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 4, y: 5, skills: passerSkills },
        { playerIndex: 1, x: 6, y: 5 },
      ],
      team2Placements: [
        { playerIndex: 0, x: 5, y: 1 },
        { playerIndex: 1, x: 18, y: 9 },
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 4, y: 5 },
    },
  };
}

/** The Passing Ability Test rolls a 5 under this seed. */
const PASS_ROLLS_FIVE_SEED = 2;

async function pass(
  skills: SkillType[],
  target: { x: number; y: number },
  hailMary?: boolean
) {
  const game = new HeadlessGame({
    scenario: scenario(skills),
    seed: PASS_ROLLS_FIVE_SEED,
  });
  const passerId = game.ctx.team1.players[0].id;
  await game.execute({
    type: "declare-action",
    playerId: passerId,
    action: "pass",
  });
  let response: CommandResponse = await game.execute({
    type: "pass",
    playerId: passerId,
    ...target,
    ...(hailMary === undefined ? {} : { hailMary }),
  });
  const events = [...response.events];
  while (response.pendingDecision?.type === "reroll") {
    response = await game.execute({ type: "use-reroll", accept: false });
    events.push(...response.events);
  }
  const dice = events
    .filter((e) => e.name === "diceRoll")
    .map((e) => (e.data as { description: string }).description);
  return { response, dice };
}

describe("Hail Mary Pass", () => {
  it("is not used when the coach throws along the Range Ruler", async () => {
    const { response, dice } = await pass([SkillType.HAIL_MARY_PASS], {
      x: 6,
      y: 5,
    });

    expect(response.ok).toBe(true);
    expect(dice[0]).toBe("Pass (Human Lineman #1): 5, needs 4+");
    expect(dice.some((d) => d.startsWith("Scatter"))).toBe(false);
    expect(dice[1]).toMatch(/^Catch \(Human Lineman #2\)/);
  });

  it("throws any square as a Long Bomb that cannot land Accurate when declared", async () => {
    const { response, dice } = await pass(
      [SkillType.HAIL_MARY_PASS],
      { x: 6, y: 5 },
      true
    );

    expect(response.ok).toBe(true);
    expect(dice[0]).toBe("Pass (Human Lineman #1): 5, needs 6+");
    expect(dice[1]).toMatch(/^Scatter: /);
  });

  it("is refused for a passer without the skill", async () => {
    const { response } = await pass([], { x: 6, y: 5 }, true);

    expect(response.ok).toBe(false);
    expect(response.reason).toBe(
      "command-failed: Player does not have Hail Mary Pass"
    );
  });
});
