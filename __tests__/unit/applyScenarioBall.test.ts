import { describe, it, expect } from "vitest";
import { applyScenario } from "../../src/game/applyScenario";
import { SCENARIOS } from "../../src/data/scenarios";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { Scenario } from "../../src/types/Scenario";
import { createTestTeam } from "../fixtures/teams";

const scenario = (setup: Partial<Scenario["setup"]>): Scenario => ({
  id: "ball-test",
  name: "Ball test",
  description: "",
  setup: {
    team1Placements: [],
    team2Placements: [],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ...setup,
  },
});

describe("where a scenario's ball starts", () => {
  it("is in the hands of the placement marked hasBall", () => {
    const state = applyScenario(
      scenario({
        team2Placements: [
          { playerIndex: 0, x: 3, y: 4 },
          { playerIndex: 1, x: 9, y: 2, hasBall: true },
        ],
      }),
      createTestTeam(),
      createTestTeam()
    );
    expect(state.ballPosition).toEqual({ x: 9, y: 2 });
  });

  it("is refused in two places at once", () => {
    expect(() =>
      applyScenario(
        scenario({
          team1Placements: [{ playerIndex: 0, x: 3, y: 4, hasBall: true }],
          ballPosition: { x: 5, y: 5 },
        }),
        createTestTeam(),
        createTestTeam()
      )
    ).toThrow('Scenario "ball-test" puts the ball in more than one place');
  });

  it("still sits with the score-run carrier", () => {
    const run = SCENARIOS.find((s) => s.id === "score-run-dodge-rush")!;
    expect(
      applyScenario(run, createTestTeam(), createTestTeam()).ballPosition
    ).toEqual({ x: 12, y: 5 });
  });
});
