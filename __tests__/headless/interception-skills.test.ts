import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";

/**
 * No Ball: "A player with this Trait may not attempt to Intercept a Pass"
 * (2025 rulebook p.132). Extra Arms: "This player applies a +1 modifier to
 * the Agility Test whenever they attempt to Catch, Pick Up or Intercept the
 * ball" (p.128). Seeds are committed, never searched.
 */
function scenario(interceptorSkills: SkillType[]): Scenario {
  return {
    id: "interception-skills",
    name: "Defender under the Range Ruler",
    description: "team1 throws past a team2 player standing on the ruler",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 4, y: 5 },
        { playerIndex: 1, x: 10, y: 5 },
      ],
      team2Placements: [
        { playerIndex: 0, x: 7, y: 5, skills: interceptorSkills },
        { playerIndex: 1, x: 16, y: 9 },
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 4, y: 5 },
    },
  };
}

/** The pass is Accurate: "Pass (Human Lineman #1): 5, needs 5+". */
const ACCURATE_PASS_SEED = 2;

async function passOverDefender(skills: SkillType[]) {
  const game = new HeadlessGame({
    scenario: scenario(skills),
    seed: ACCURATE_PASS_SEED,
  });
  const passerId = game.ctx.team1.players[0].id;
  await game.execute({
    type: "declare-action",
    playerId: passerId,
    action: "pass",
  });
  const response = await game.execute({
    type: "pass",
    playerId: passerId,
    x: 10,
    y: 5,
  });
  return { game, response };
}

describe("interception skills", () => {
  it("a No Ball player is never offered the interception", async () => {
    const { response } = await passOverDefender([SkillType.NO_BALL]);

    const dice = response.events
      .filter((e) => e.name === "diceRoll")
      .map((e) => (e.data as { description: string }).description);
    expect(dice[0]).toBe("Pass (Human Lineman #1): 5, needs 5+");
    expect(response.pendingDecision?.type).not.toBe("interception");
  });

  it("an Extra Arms player intercepts an Accurate Pass at -2", async () => {
    const { game, response } = await passOverDefender([SkillType.EXTRA_ARMS]);

    expect(response.pendingDecision).toMatchObject({
      type: "interception",
      candidates: [{ playerId: "team2-player-1", modifier: -2 }],
    });
    const attempt = await game.execute({
      type: "choose-interception",
      playerId: "team2-player-1",
    });
    const roll = attempt.events.find((e) => e.name === "diceRoll");
    expect((roll?.data as { description: string }).description).toBe(
      "Interception (Human Lineman #1): 2, needs 5+"
    );
  });
});
