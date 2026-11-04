import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { Scenario } from "../../src/types/Scenario";
import { enumerateDecision } from "../../src/simulation/candidates";
import { createCoachRng } from "../../src/simulation/rng";
import { createSearchCoach } from "../../src/simulation/ai/search";
import { readBoard } from "../../src/simulation/ai/board";
import { evaluate } from "../../src/simulation/ai/evaluate";
import { DEFAULT_WEIGHTS } from "../../src/simulation/ai/weights";

const position = (hasBall: "team1" | "team2" | null): Scenario => ({
  id: "search",
  name: "Search",
  description: "",
  setup: {
    team1Placements: [
      {
        playerIndex: 0,
        x: 12,
        y: 5,
        ...(hasBall === "team1" ? { hasBall: true as const } : {}),
      },
      { playerIndex: 1, x: 10, y: 3 },
      { playerIndex: 2, x: 10, y: 7 },
    ],
    team2Placements: [
      {
        playerIndex: 0,
        x: 13,
        y: 5,
        ...(hasBall === "team2" ? { hasBall: true as const } : {}),
      },
      { playerIndex: 1, x: 15, y: 3 },
    ],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ...(hasBall ? {} : { ballPosition: { x: 14, y: 5 } }),
  },
});

async function search(game: HeadlessGame) {
  const coach = createSearchCoach({ budget: { samples: 2, options: 3 } });
  const point = await enumerateDecision(game, null);
  const { index } = await coach.choose({
    game,
    snapshot: game.snapshot(),
    point,
    rng: createCoachRng(9),
  });
  return { index, label: point.candidates[index].label };
}

describe("the lookahead", () => {
  it("does not touch the real dice", async () => {
    const game = new HeadlessGame({ scenario: position("team1"), seed: 3 });
    const before = game.ctx.rng.captureState();
    await search(game);
    expect(game.ctx.rng.captureState()).toEqual(before);
  });

  it("does not change the real game", async () => {
    const game = new HeadlessGame({ scenario: position("team1"), seed: 3 });
    // Reading the drive's effects creates their empty record; nothing else.
    const state = () => ({ ...game.snapshot(), driveEffects: undefined });
    const before = state();
    await search(game);
    expect(state()).toEqual(before);
  });

  it("chooses the same whatever dice are coming", async () => {
    const dice = [11, 222, 3333];
    const picks = new Set<string>();
    for (const seed of dice) {
      const game = new HeadlessGame({ scenario: position("team1"), seed });
      picks.add((await search(game)).label);
    }
    expect(picks.size).toBe(1);
  });
});

describe("the position score", () => {
  const score = (hasBall: "team1" | "team2" | null) => {
    const scenario = position(hasBall);
    // Nobody marking anybody, so only the ball differs.
    scenario.setup.team2Placements[0] = {
      ...scenario.setup.team2Placements[0],
      x: 17,
    };
    const game = new HeadlessGame({ scenario, seed: 1 });
    return evaluate(readBoard(game, game.ctx.team1.id), DEFAULT_WEIGHTS);
  };

  it("prefers holding the ball to the opponent holding it", () => {
    expect(score("team1")).toBeGreaterThan(score(null));
    expect(score(null)).toBeGreaterThan(score("team2"));
  });
});
