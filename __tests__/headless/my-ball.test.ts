import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";

function scenario(ball: { x: number; y: number }): Scenario {
  return {
    id: "my-ball",
    name: "My Ball",
    description: "a My Ball player beside a team-mate",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 5, y: 5, skills: [SkillType.MY_BALL] },
        { playerIndex: 1, x: 6, y: 5 },
      ],
      team2Placements: [{ playerIndex: 0, x: 15, y: 1 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: ball,
    },
  };
}

async function optionsFor(ball: { x: number; y: number }) {
  const game = new HeadlessGame({ scenario: scenario(ball), seed: 1 });
  const id = fixtureValue(game.ctx.teams[0].players[0]).id;
  const legal = await game.execute({ type: "legal-actions", playerId: id });
  const actions = fixtureValue(
    fixtureValue(legal.legalActions).players.find((p) => p.playerId === id)
  ).actions;
  const handoff = await game.execute({
    type: "declare-action",
    playerId: id,
    action: "handoff",
  });
  return { actions, handoffAccepted: handoff.ok };
}

describe("My Ball", () => {
  it("offers a carrier no Pass or Hand-off, and refuses them", async () => {
    const { actions, handoffAccepted } = await optionsFor({ x: 5, y: 5 });

    expect(actions).not.toContain("pass");
    expect(actions).not.toContain("handoff");
    expect(handoffAccepted).toBe(false);
  });

  it("refuses them before the player has picked the ball up, too", async () => {
    const { actions, handoffAccepted } = await optionsFor({ x: 4, y: 5 });

    expect(actions).not.toContain("pass");
    expect(actions).not.toContain("handoff");
    expect(handoffAccepted).toBe(false);
  });
});
