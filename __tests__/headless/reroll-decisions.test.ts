import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { Scenario } from "../../src/types/Scenario";
import { RerollArbiter } from "../../src/game/skills";
import { GameState } from "../../src/types/GameState";
import { Team } from "../../src/types/Team";
import { Player } from "../../src/types/Player";

/**
 * Reroll machinery (RerollArbiter + DecisionService + protocol):
 * offer/decline/accept paths, constraint matrix, determinism. Team rerolls
 * drive these tests — no skill rules required, so the machinery is proven
 * independently of the starter skills.
 */

const scenario: Scenario = {
  id: "reroll-pickup",
  name: "Reroll on failed pickup",
  description: "mover picks up with team rerolls in the bank",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 4, y: 5 }, // the mover
      { playerIndex: 1, x: 16, y: 4 }, // marked by team2's player (dodge tests)
    ],
    team2Placements: [{ playerIndex: 0, x: 16, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 5, y: 5 },
  },
};

function newGame(seed: number, rerolls = 3): HeadlessGame {
  const game = new HeadlessGame({ scenario, seed });
  game.ctx.team1.rerolls = rerolls;
  return game;
}

async function moveOntoBall(game: HeadlessGame) {
  const mover = game.snapshot().teams[0].players[0];
  await game.execute({
    type: "declare-action",
    playerId: mover.id,
    action: "move",
  });
  return game.execute({
    type: "move",
    playerId: mover.id,
    path: [{ x: 5, y: 5 }],
  });
}

/** First seed whose pickup fails and pauses on a reroll offer. */
async function findOfferSeed(): Promise<number> {
  for (let seed = 1; seed <= 100; seed++) {
    const game = newGame(seed);
    const moved = await moveOntoBall(game);
    if (moved.pendingDecision?.type === "reroll") return seed;
  }
  throw new Error("no failing pickup found in seed range");
}

describe("reroll decisions (headless protocol)", () => {
  it("a failed pickup with a team reroll pauses on a reroll decision", async () => {
    const seed = await findOfferSeed();
    const game = newGame(seed);
    const team1Id = game.ctx.team1.id;
    const moved = await moveOntoBall(game);

    expect(moved.ok).toBe(true);
    const pending = moved.pendingDecision;
    expect(pending?.type).toBe("reroll");
    if (pending?.type !== "reroll") return;
    expect(pending.rollKind).toBe("pickup");
    expect(pending.chooserTeamId).toBe(team1Id);
    expect(pending.sources).toEqual(["team"]); // no skill rule registered

    // The failure has NOT been applied yet: no turnover, no bounce
    expect(
      moved.events.some((e) => e.name === GameEventNames.Turnover)
    ).toBe(false);

    // Other commands are gated until the decision is answered
    const gated = await game.execute({ type: "end-turn" });
    expect(gated.ok).toBe(false);
    expect(gated.reason).toContain("decision-pending:reroll");

    // An invalid source is rejected and the decision stays pending
    const badSource = await game.execute({
      type: "use-reroll",
      accept: true,
      source: "skill",
    });
    expect(badSource.ok).toBe(false);
    expect(badSource.pendingDecision?.type).toBe("reroll");
  });

  it("declining applies the original failure and consumes nothing", async () => {
    const seed = await findOfferSeed();
    const game = newGame(seed);
    await moveOntoBall(game);

    const declined = await game.execute({ type: "use-reroll", accept: false });
    expect(declined.ok).toBe(true);
    expect(declined.pendingDecision).toBeNull();

    // Original failure resolves: turnover to team2, reroll bank untouched
    expect(
      declined.events.filter((e) => e.name === GameEventNames.Turnover)
    ).toHaveLength(1);
    expect(declined.snapshot.activeTeamId).toBe(game.ctx.team2.id);
    expect(game.ctx.team1.rerolls).toBe(3);
    expect(
      declined.events.some((e) => e.name === GameEventNames.RerollUsed)
    ).toBe(false);
  });

  it("accepting spends the team reroll and rerolls through the dice service", async () => {
    const seed = await findOfferSeed();
    const game = newGame(seed);
    await moveOntoBall(game);

    const accepted = await game.execute({
      type: "use-reroll",
      accept: true,
      source: "team",
    });
    expect(accepted.ok).toBe(true);
    expect(game.ctx.team1.rerolls).toBe(2);

    const rerollUsed = accepted.events.find(
      (e) => e.name === GameEventNames.RerollUsed
    );
    expect(rerollUsed).toBeDefined();
    const data = rerollUsed!.data as {
      source: string;
      rollKind: string;
      before: number;
      after: number;
    };
    expect(data.source).toBe("team");
    expect(data.rollKind).toBe("pickup");
    expect(data.before).toBeGreaterThanOrEqual(1);
    expect(data.after).toBeGreaterThanOrEqual(1);

    // A reroll is never offered on the rerolled roll
    expect(accepted.pendingDecision).toBeNull();
  });

  it("no offer when the team has no rerolls", async () => {
    const seed = await findOfferSeed();
    const game = newGame(seed, 0);
    const moved = await moveOntoBall(game);

    expect(moved.pendingDecision).toBeNull();
    expect(
      moved.events.filter((e) => e.name === GameEventNames.Turnover)
    ).toHaveLength(1);
  });

  it("a team reroll is usable once per team turn", async () => {
    for (let seed = 1; seed <= 200; seed++) {
      const game = newGame(seed);
      const moved = await moveOntoBall(game);
      if (moved.pendingDecision?.type !== "reroll") continue;

      const accepted = await game.execute({ type: "use-reroll", accept: true });
      // Need the rerolled pickup to SUCCEED so the turn continues
      const pickedUp = accepted.events.some(
        (e) =>
          e.name === GameEventNames.BallPickup &&
          (e.data as { success: boolean }).success === true
      );
      if (!pickedUp) continue;

      // Same turn: another failing roll (a dodge away from a marker) must
      // get no offer — the team reroll is spent for this turn
      const dodger = game.snapshot().teams[0].players[1];
      await game.execute({
        type: "declare-action",
        playerId: dodger.id,
        action: "move",
      });
      const dodged = await game.execute({
        type: "move",
        playerId: dodger.id,
        path: [{ x: 15, y: 3 }],
      });
      const fell = dodged.events.some(
        (e) => e.name === GameEventNames.PlayerKnockedDown
      );
      if (!fell) continue; // dodge succeeded; try another seed

      expect(dodged.pendingDecision).toBeNull();
      expect(game.ctx.team1.rerolls).toBe(2); // only the pickup spent one
      return;
    }
    throw new Error("no seed produced pickup-reroll-success + failed dodge");
  });

  it("identical seeds and answers produce identical games (determinism)", async () => {
    const seed = await findOfferSeed();

    for (const accept of [true, false]) {
      const run = async () => {
        const game = newGame(seed);
        await moveOntoBall(game);
        const response = await game.execute({ type: "use-reroll", accept });
        return {
          snapshot: JSON.stringify(response.snapshot),
          dice: response.events
            .filter((e) => e.name === GameEventNames.DiceRoll)
            .map((e) => JSON.stringify(e.data)),
        };
      };
      const a = await run();
      const b = await run();
      expect(b.snapshot).toBe(a.snapshot);
      expect(b.dice).toEqual(a.dice);
    }
  });
});

describe("RerollArbiter constraint matrix", () => {
  const makeState = (teamId: string, turnNumber = 1): GameState =>
    ({
      turn: { teamId, turnNumber, isHalf2: false },
    }) as unknown as GameState;
  const player = (id: string, teamId: string): Player =>
    ({ id, teamId }) as unknown as Player;

  it("team reroll: own turn only, bank > 0, once per turn, decrements", () => {
    const team = { rerolls: 2 } as Team;
    const state = makeState("t1");
    const arbiter = new RerollArbiter(state, () => team);

    expect(arbiter.teamRerollAvailable("t2")).toBe(false); // not their turn
    expect(arbiter.teamRerollAvailable("t1")).toBe(true);

    arbiter.consumeTeamReroll("t1");
    expect(team.rerolls).toBe(1);
    expect(arbiter.teamRerollAvailable("t1")).toBe(false); // spent this turn

    state.turn.turnNumber = 2; // next turn: available again
    expect(arbiter.teamRerollAvailable("t1")).toBe(true);

    arbiter.consumeTeamReroll("t1");
    state.turn.turnNumber = 3;
    expect(team.rerolls).toBe(0);
    expect(arbiter.teamRerollAvailable("t1")).toBe(false); // bank empty
  });

  it("skill reroll: once per action per player, independent across players", () => {
    const state = makeState("t1");
    const arbiter = new RerollArbiter(state, () => undefined);
    const dodge = "Dodge" as never;
    const p1 = player("p1", "t1");
    const p2 = player("p2", "t1");

    expect(arbiter.skillRerollAvailable(p1, dodge)).toBe(true);
    arbiter.consumeSkillReroll(p1, dodge);
    expect(arbiter.skillRerollAvailable(p1, dodge)).toBe(false);
    expect(arbiter.skillRerollAvailable(p2, dodge)).toBe(true);

    state.turn.turnNumber = 2; // new activation next turn
    expect(arbiter.skillRerollAvailable(p1, dodge)).toBe(true);
  });
});
