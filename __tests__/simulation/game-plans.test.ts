import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { enumerateDecision } from "../../src/simulation/candidates";
import { createPlannerCoach } from "../../src/simulation/ai/planner";
import { createCoachRng } from "../../src/simulation/rng";
import { GAME_PLANS, choosePlan } from "../../src/simulation/ai/gamePlans";
import type { Activation } from "../../src/simulation/ai/activations";

const plan = (name: string) =>
  fixtureValue(GAME_PLANS.find((p) => p.name === name));

const [us, them] = new HeadlessGame({ seed: 1 }).ctx.team1.players;

function option({
  id,
  value,
  kind,
  tier = "support",
}: {
  id: string;
  value: number;
  kind: "pass" | "block";
  tier?: Activation["tier"];
}): { id: string; activation: Activation } {
  const intent: Activation["intent"] =
    kind === "pass"
      ? {
          kind,
          to: { ...fixtureValue(them), gridPosition: { x: 1, y: 0 } },
          route: null,
        }
      : {
          kind,
          target: { ...fixtureValue(them), gridPosition: { x: 1, y: 0 } },
        };
  return {
    id,
    activation: {
      player: { ...fixtureValue(us), gridPosition: { x: 0, y: 0 } },
      action: kind,
      intent,
      tier,
      value,
      rolls: [],
    },
  };
}

function counts(margin: number, name: string) {
  const options = [
    option({ id: "best", value: 30, kind: "block" }),
    option({ id: "close", value: 25, kind: "pass" }),
    option({ id: "poor", value: 10, kind: "block" }),
  ];
  const rng = createCoachRng(7);
  const out: Record<string, number> = {};
  for (let i = 0; i < 2000; i++) {
    const { id } = choosePlan({
      options: options,
      plan: plan(name),
      variety: { margin },
      rng: rng,
    });
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
    expect(Object.keys(seen).sort((a, b) => a.localeCompare(b))).toEqual(["best", "close"]);
    expect(seen["best"]).toBeGreaterThan(fixtureValue(seen["close"]));
  });

  it("never puts a risky close plan ahead of a safe best one", () => {
    const options = [
      option({ id: "safe", value: 30, kind: "block" }),
      option({ id: "risky", value: 29, kind: "block", tier: "risky" }),
    ];
    const rng = createCoachRng(3);
    const picks = new Set<string>();
    for (let i = 0; i < 500; i++)
      picks.add(
        choosePlan({
          options: options,
          plan: plan("balanced"),
          variety: { margin: 8 },
          rng: rng,
        }).id
      );
    expect([...picks]).toEqual(["safe"]);
  });

  it("never lets a game plan's lean put a risky plan ahead of a safe best one", () => {
    const options = [
      option({ id: "safe", value: 30, kind: "block" }),
      option({ id: "risky-pass", value: 29, kind: "pass", tier: "risky" }),
    ];
    const rng = createCoachRng(3);
    const picks = new Set<string>();
    for (let i = 0; i < 1000; i++)
      picks.add(
        choosePlan({
          options: options,
          plan: plan("aerial"),
          variety: { margin: 8 },
          rng: rng,
        }).id
      );
    expect([...picks]).toEqual(["safe"]);
  });

  it("treats a tie for best as safe when any tied plan is safe", () => {
    const options = [
      option({ id: "risky", value: 30, kind: "block", tier: "risky" }),
      option({ id: "safe", value: 30, kind: "block" }),
      option({ id: "close-risky", value: 28, kind: "block", tier: "risky" }),
    ];
    const rng = createCoachRng(5);
    const picks = new Set<string>();
    for (let i = 0; i < 500; i++)
      picks.add(
        choosePlan({
          options: options,
          plan: plan("balanced"),
          variety: { margin: 8 },
          rng: rng,
        }).id
      );
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
      for (let i = 0; i < 40 && game.snapshot().activeTeamId === "team1"; i++) {
        const point = await enumerateDecision(game, null);
        const { index } = await coach.choose({
          game,
          snapshot: game.snapshot(),
          point,
          rng,
        });
        await game.execute(fixtureValue(point.candidates[index]).commands[0]);
      }
      const carrier = fixtureValue(game.ctx.team1.players[0]).gridPosition;
      openings.add(`${String(carrier?.x)},${String(carrier?.y)}`);
    }

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
      const { note = "" } = await coach.choose({
        game,
        snapshot: game.snapshot(),
        point,
        rng: createCoachRng(seed),
      });
      notes.add(note);
    }
    expect([...notes]).toEqual(["runs in to score"]);
  });

  it("runs in a certain score rather than pass it to a skilled receiver", async () => {
    const notes = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const game = new HeadlessGame({
        seed: 7,
        scenario: {
          id: "variety-certain-score",
          name: "Varied coach beside a scoring receiver",
          description: "",
          setup: {
            phase: GamePhase.PLAY,
            subPhase: SubPhase.TURN_RECEIVING,
            activeTeam: "team1",
            turn: 6,
            teamRerolls: { team1: 0, team2: 0 },
            team1Placements: [
              {
                playerIndex: 0,
                x: 17,
                y: 5,
                hasBall: true,
                skills: [SkillType.PASS],
                stats: { MA: 6, PA: 2 },
              },
              {
                playerIndex: 1,
                x: 19,
                y: 4,
                skills: [SkillType.CATCH],
                stats: { AG: 2 },
              },
            ],
            team2Placements: [{ playerIndex: 0, x: 1, y: 1 }],
          },
        },
      });
      const coach = createPlannerCoach({ variety: { margin: 8 } });
      const point = await enumerateDecision(game, null);
      const { note = "" } = await coach.choose({
        game,
        snapshot: game.snapshot(),
        point,
        rng: createCoachRng(seed),
      });
      notes.add(note);
    }
    expect([...notes]).toEqual(["runs in to score"]);
  });
});
