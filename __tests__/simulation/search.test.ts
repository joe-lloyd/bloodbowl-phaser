import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { Scenario } from "../../src/types/Scenario";
import { enumerateDecision } from "../../src/simulation/candidates";
import { createCoachRng } from "../../src/simulation/rng";
import {
  createSearchCoach,
  scorePlayout,
} from "../../src/simulation/ai/search";
import type {
  SearchReply,
  SearchRequest,
} from "../../src/simulation/ai/searchWorker";
import { createWorkerSearchCoach } from "../../src/simulation/ai/workerSearchCoach";
import { plannerCoach } from "../../src/simulation/ai/planner";
import { readBoard } from "../../src/simulation/ai/board";
import { FEATURES, evaluate } from "../../src/simulation/ai/evaluate";
import { EVALUATION_WEIGHTS } from "../../src/simulation/ai/evaluationWeights";

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
  it("has a finite weight for every feature, so a missed refit shows", () => {
    for (const name of ["bias", ...FEATURES] as const)
      expect(Number.isFinite(EVALUATION_WEIGHTS[name]), name).toBe(true);
  });

  const score = (hasBall: "team1" | "team2" | null) => {
    const scenario = position(hasBall);
    // Nobody marking anybody, so only the ball differs.
    scenario.setup.team2Placements[0] = {
      ...scenario.setup.team2Placements[0],
      x: 17,
    };
    const game = new HeadlessGame({ scenario, seed: 1 });
    return evaluate(readBoard(game, game.ctx.team1.id));
  };

  it("prefers holding the ball to it lying loose or the opponent holding it", () => {
    expect(score("team1")).toBeGreaterThan(score(null));
    expect(score("team1")).toBeGreaterThan(score("team2"));
  });

  it("counts a touchdown once while the scorer still holds the ball", () => {
    // A decision such as a Bribe can pause the drive's end with the scorer
    // standing in the end zone; the drive is over all the same.
    const after = (ball: "scorer" | "gone") => {
      const scenario = position(null);
      scenario.setup.team1Placements[0] = {
        playerIndex: 0,
        x: 19,
        y: 5,
        ...(ball === "scorer" ? { hasBall: true as const } : {}),
      };
      delete scenario.setup.ballPosition;
      const game = new HeadlessGame({ scenario, seed: 1 });
      return evaluate(readBoard(game, game.ctx.team1.id));
    };
    expect(after("scorer")).toBeCloseTo(after("gone"), 9);
  });
});

describe("the lookahead's note", () => {
  it("names roll targets and never odds", async () => {
    const game = new HeadlessGame({ scenario: position("team1"), seed: 3 });
    const point = await enumerateDecision(game, null);
    const { note } = await createSearchCoach({
      budget: { samples: 1, options: 2 },
    }).choose({
      game,
      snapshot: game.snapshot(),
      point,
      rng: createCoachRng(9),
    });
    expect(note).toBeTruthy();
    expect(note).not.toMatch(/%|\d\.\d/);
  });
});

describe("the lookahead over workers", () => {
  type Answer = (worker: FakeWorker, request: SearchRequest) => void;
  class FakeWorker extends EventTarget {
    asked = 0;
    terminated = false;
    constructor(private answer: Answer) {
      super();
    }
    postMessage(request: SearchRequest) {
      this.asked++;
      this.answer(this, request);
    }
    terminate() {
      this.terminated = true;
    }
  }
  const reply = (worker: FakeWorker, data: SearchReply) =>
    worker.dispatchEvent(new MessageEvent("message", { data }));
  const coachOn = (...workers: FakeWorker[]) => {
    let next = 0;
    return createWorkerSearchCoach({
      budget: { samples: 1, options: 2, deadlineMs: 1 },
      createWorker: () => workers[next++ % workers.length] as unknown as Worker,
      workers: workers.length,
    });
  };
  const declaration = async () => {
    const game = new HeadlessGame({ scenario: position(null), seed: 1 });
    const point = await enumerateDecision(game, null);
    const context = {
      game,
      snapshot: game.snapshot(),
      point,
      rng: createCoachRng(1),
    };
    const planned = await plannerCoach.choose(context);
    return { game, point, context, planned };
  };

  it("plays the rival the workers score above the plan", async () => {
    const { context, planned } = await declaration();
    const worker = new FakeWorker((self, { id, jobs }) =>
      reply(self, {
        id,
        scores: jobs.map(({ index }) => (index === planned.index ? 0 : 1)),
      })
    );
    const choice = await coachOn(worker).choose(context);
    expect(choice.index).not.toBe(planned.index);
    expect(choice.note).toBeTruthy();
  });

  it("chooses what the search in this thread chooses, over three workers", async () => {
    const budget = { samples: 2, options: 3 };
    const { context } = await declaration();
    const workers = [0, 1, 2].map(
      () =>
        new FakeWorker((self, { id, save, us, jobs }) => {
          void Promise.all(
            jobs.map(({ index, seed }) => scorePlayout(save, us, index, seed))
          ).then((scores) => reply(self, { id, scores }));
        })
    );
    let next = 0;
    const pooled = createWorkerSearchCoach({
      budget,
      createWorker: () => workers[next++] as unknown as Worker,
      workers: 3,
    });
    const here = createSearchCoach({ budget });
    const fresh = () => ({ ...context, rng: createCoachRng(7) });
    expect(await pooled.choose(fresh())).toEqual(await here.choose(fresh()));
    expect(workers.map((w) => w.asked > 0)).toEqual([true, true, true]);
  }, 60000);

  it.each([
    [
      "crashes",
      (self: FakeWorker) => {
        queueMicrotask(() => self.dispatchEvent(new Event("error")));
      },
    ],
    ["never answers", () => {}],
  ])(
    "falls back to the plan when the worker %s",
    async (_, answer) => {
      const { context, planned } = await declaration();
      const worker = new FakeWorker(answer);
      const choice = await coachOn(worker).choose(context);
      expect(choice.index).toBe(planned.index);
      expect(worker.terminated).toBe(true);
    },
    5000
  );

  it("falls back to the plan when the worker cannot start", async () => {
    const { context, planned } = await declaration();
    const coach = createWorkerSearchCoach({
      budget: { samples: 1, options: 2, deadlineMs: 1 },
      createWorker: () => {
        throw new Error("no workers here");
      },
    });
    const choice = await coach.choose(context);
    expect(choice.index).toBe(planned.index);
  });

  it("falls back to the plan when the request cannot be sent", async () => {
    const { context, planned } = await declaration();
    const worker = new FakeWorker(() => {
      throw new Error("could not clone");
    });
    const choice = await coachOn(worker).choose(context);
    expect(choice.index).toBe(planned.index);
    expect(worker.terminated).toBe(true);
  });

  it("does not ask the workers about a decision mid-activation", async () => {
    const { game, context } = await declaration();
    const reroll = {
      type: "reroll",
      playerId: game.ctx.team1.players[0].id,
      chooserTeamId: game.ctx.team1.id,
      rollKind: "dodge",
      sources: ["team"],
    } as const;
    game.adoptPending(reroll);
    const point = await enumerateDecision(game, null);
    const worker = new FakeWorker(() => {});
    await coachOn(worker).choose({ ...context, point });
    expect(worker.asked).toBe(0);
  });
});
