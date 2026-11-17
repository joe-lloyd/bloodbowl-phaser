import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { enumerateDecision } from "../../src/simulation/candidates";
import { createPlannerCoach } from "../../src/simulation/ai/planner";
import { createCoachRng } from "../../src/simulation/rng";
import { GAME_PLANS, choosePlan } from "../../src/simulation/ai/gamePlans";
import type { Activation } from "../../src/simulation/ai/activations";

const plan = (name: string) => GAME_PLANS.find((p) => p.name === name)!;

const [us, them] = new HeadlessGame({ seed: 1 }).ctx.team1.players;

/** A plan worth `value`: a pass to a team-mate, or a block on an opponent. */
function option(
  id: string,
  value: number,
  kind: "pass" | "block",
  tier: Activation["tier"] = "support"
): { id: string; activation: Activation } {
  const intent: Activation["intent"] =
    kind === "pass" ? { kind, to: them, route: null } : { kind, target: them };
  return {
    id,
    activation: { player: us, action: kind, intent, tier, value, rolls: [] },
  };
}

function counts(margin: number, name: string, draws = 2000) {
  const options = [
    option("best", 30, "block"),
    option("close", 25, "pass"),
    option("poor", 10, "block"),
  ];
  const rng = createCoachRng(7);
  const out: Record<string, number> = {};
  for (let i = 0; i < draws; i++) {
    const { id } = choosePlan(options, plan(name), { margin }, rng);
    out[id] = (out[id] ?? 0) + 1;
  }
  return out;
}

describe("game plans", () => {
  it("takes the best plan when there is no margin", () => {
    expect(counts(0, "balanced")).toEqual({ best: 2000 });
  });

  it("leans an aerial game plan towards a close pass", () => {
    expect(counts(0, "aerial")).toEqual({ close: 2000 });
  });

  it("varies between close plans, the closer the likelier, never a poor one", () => {
    const seen = counts(8, "balanced");
    expect(Object.keys(seen).sort()).toEqual(["best", "close"]);
    expect(seen.best).toBeGreaterThan(seen.close);
  });

  it("never puts a risky close plan ahead of a safe best one", () => {
    const options = [
      option("safe", 30, "block"),
      option("risky", 29, "block", "risky"),
    ];
    const rng = createCoachRng(3);
    const picks = new Set<string>();
    for (let i = 0; i < 500; i++)
      picks.add(choosePlan(options, plan("balanced"), { margin: 8 }, rng).id);
    expect([...picks]).toEqual(["safe"]);
  });

  it("ends a varied coach's turn in different places on the same board", async () => {
    const openings = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const game = new HeadlessGame({
        seed: 1,
        scenario: {
          id: "variety",
          name: "Varied opening",
          description: "",
          setup: {
            phase: GamePhase.PLAY,
            subPhase: SubPhase.TURN_RECEIVING,
            activeTeam: "team1",
            turn: 2,
            teamRerolls: { team1: 1, team2: 1 },
            team1Placements: [
              { playerIndex: 0, x: 6, y: 5, hasBall: true },
              { playerIndex: 1, x: 7, y: 3 },
              { playerIndex: 2, x: 7, y: 7 },
              { playerIndex: 3, x: 9, y: 5 },
            ],
            team2Placements: [
              { playerIndex: 0, x: 10, y: 5 },
              { playerIndex: 1, x: 12, y: 3 },
              { playerIndex: 2, x: 12, y: 7 },
            ],
          },
        },
      });
      const coach = createPlannerCoach({ variety: { margin: 8 } });
      const rng = createCoachRng(seed);
      for (let i = 0; i < 40; i++) {
        if (game.snapshot().activeTeamId !== "team1") break;
        const point = await enumerateDecision(game, null);
        const { index } = await coach.choose({
          game,
          snapshot: game.snapshot(),
          point,
          rng,
        });
        await game.execute(point.candidates[index].commands[0]);
      }
      const carrier = game.ctx.team1.players[0].gridPosition;
      openings.add(`${carrier?.x},${carrier?.y}`);
    }
    // The same board and dice: only the coach's own choices differ.
    expect(openings.size).toBeGreaterThan(1);
  });

  it("never trades a safe touchdown for a close call", async () => {
    const notes = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const game = new HeadlessGame({
        seed: 1,
        scenario: {
          id: "variety-score",
          name: "Varied coach with a safe score",
          description: "",
          setup: {
            phase: GamePhase.PLAY,
            subPhase: SubPhase.TURN_RECEIVING,
            activeTeam: "team1",
            turn: 4,
            team1Placements: [
              { playerIndex: 0, x: 15, y: 5, hasBall: true },
              { playerIndex: 1, x: 12, y: 3 },
              { playerIndex: 2, x: 12, y: 7 },
            ],
            team2Placements: [
              { playerIndex: 0, x: 4, y: 5 },
              { playerIndex: 1, x: 13, y: 3 },
            ],
          },
        },
      });
      const coach = createPlannerCoach({ variety: { margin: 8 } });
      const point = await enumerateDecision(game, null);
      const { note } = await coach.choose({
        game,
        snapshot: game.snapshot(),
        point,
        rng: createCoachRng(seed),
      });
      notes.add(note ?? "");
    }
    expect([...notes]).toEqual(["runs in to score"]);
  });
});
