import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { PlayerStatus } from "../../src/types/Player";
import { type Scenario } from "../../src/types/Scenario";
import { SCENARIOS } from "../../src/data/scenarios";
import { type CommandResponse } from "../../src/headless/protocol";

function scenario(id: string): Scenario {
  const found = SCENARIOS.find((s) => s.id === id);
  if (!found) throw new Error(`scenario not found: ${id}`);
  return found;
}

function names(response: CommandResponse): string[] {
  return response.events.map((e) => e.name);
}

function diceRolls(response: CommandResponse): {
  rollType: string;
  resultState?: string;
}[] {
  return response.events
    .filter((e) => e.name === GameEventNames.DiceRoll)
    .map((e) =>
      z
        .object({
          rollType: z.string(),
          resultState: z.string().exactOptional(),
        })
        .parse(e.data)
    );
}

describe("double-turnover-seeded", () => {
  it("failed pickup bouncing into a dropped catch is exactly ONE turnover", async () => {
    const game = new HeadlessGame({
      scenario: scenario("double-turnover-seeded"),
    });
    const snap = game.snapshot();
    const mover = fixtureValue(snap.teams[0]).players[0];

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(mover).id,
      action: "move",
    });
    const moved = await game.execute({
      type: "move",
      playerId: fixtureValue(mover).id,
      path: [
        { x: 9, y: 7 },
        { x: 10, y: 7 },
      ],
    });
    expect(moved.ok).toBe(true);

    expect(
      moved.events.some(
        (e) =>
          e.name === GameEventNames.BallPickup &&
          !z.object({ success: z.boolean() }).parse(e.data).success
      )
    ).toBe(true);
    expect(
      diceRolls(moved).some(
        (r) => r.rollType.startsWith("Catch") && r.resultState === "failure"
      )
    ).toBe(true);

    const n = names(moved);
    expect(n.filter((x) => x === GameEventNames.Turnover)).toHaveLength(1);
    expect(n.filter((x) => x === GameEventNames.TurnStarted)).toHaveLength(1);
    expect(moved.snapshot.activeTeamId).toBe(fixtureValue(snap.teams[1]).id);

    const moverAfter = fixtureValue(
      fixtureValue(moved.snapshot.teams[0]).players.find(
        (p) => p.id === fixtureValue(mover).id
      )
    );
    expect(moverAfter.position).toEqual({ x: 10, y: 7 });
  });
});

describe("blitz scenarios", () => {
  it("blitz-test: block within MA rolls block dice with no rush", async () => {
    const game = new HeadlessGame({ scenario: scenario("blitz-test") });
    const snap = game.snapshot();
    const blitzer = fixtureValue(snap.teams[0]).players[0];
    const target = fixtureValue(snap.teams[1]).players[0];

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(blitzer).id,
      action: "blitz",
    });
    const moved = await game.execute({
      type: "move",
      playerId: fixtureValue(blitzer).id,
      path: [
        { x: 11, y: 7 },
        { x: 12, y: 7 },
        { x: 13, y: 7 },
      ],
    });
    expect(moved.ok).toBe(true);

    const blocked = await game.execute({
      type: "block",
      attackerId: fixtureValue(blitzer).id,
      defenderId: fixtureValue(target).id,
    });
    expect(blocked.ok).toBe(true);
    expect(names(blocked)).toContain(GameEventNames.BlockDiceRolled);
    expect(diceRolls(blocked).some((r) => r.rollType.includes("Rush"))).toBe(
      false
    );
    expect(blocked.pendingDecision?.type).toBe("block-dice");
  });

  it("blitz-rush-fail-seeded: the rush before the block fails — blitzer falls, no block dice", async () => {
    const game = new HeadlessGame({
      scenario: scenario("blitz-rush-fail-seeded"),
    });
    const snap = game.snapshot();
    const blitzer = fixtureValue(snap.teams[0]).players[0];
    const target = fixtureValue(snap.teams[1]).players[0];

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(blitzer).id,
      action: "blitz",
    });
    const moved = await game.execute({
      type: "move",
      playerId: fixtureValue(blitzer).id,
      path: [11, 12, 13, 14, 15, 16].map((x) => ({ x, y: 7 })),
    });
    expect(moved.ok).toBe(true);

    const blocked = await game.execute({
      type: "block",
      attackerId: fixtureValue(blitzer).id,
      defenderId: fixtureValue(target).id,
    });

    expect(
      diceRolls(blocked).some(
        (r) => r.rollType.includes("Rush") && r.resultState === "failure"
      )
    ).toBe(true);
    const n = names(blocked);
    expect(n).toContain(GameEventNames.PlayerKnockedDown);
    expect(n).not.toContain(GameEventNames.BlockDiceRolled);
    expect(n.filter((x) => x === GameEventNames.Turnover)).toHaveLength(1);

    const blitzerAfter = fixtureValue(
      fixtureValue(blocked.snapshot.teams[0]).players.find(
        (p) => p.id === fixtureValue(blitzer).id
      )
    );
    expect(blitzerAfter.status).toBe(PlayerStatus.PRONE);
    expect(blitzerAfter.position).toEqual({ x: 16, y: 7 });
  });
});

describe("touchback", () => {
  it("kick out of bounds → receiving coach hands the ball to a chosen player", async () => {
    const game = new HeadlessGame({ scenario: scenario("touchback-test") });
    const snap = game.snapshot();
    const kicker = fixtureValue(snap.teams[0]).players[0];

    const kicked = await game.execute({
      type: "kick-ball",
      playerId: fixtureValue(kicker).id,
      x: 18,
      y: 1,
    });
    expect(kicked.ok).toBe(true);
    expect(names(kicked)).toContain(GameEventNames.TouchbackAwarded);
    expect(kicked.pendingDecision).toEqual({
      type: "touchback",
      teamId: fixtureValue(snap.teams[1]).id,
    });

    expect(kicked.snapshot.ballPosition).toBeNull();

    const gated = await game.execute({ type: "end-turn" });
    expect(gated.ok).toBe(false);
    expect(gated.reason).toContain("decision-pending:touchback");

    const kickerTeamPlayer = fixtureValue(snap.teams[0]).players[1];
    const wrong = await game.execute({
      type: "touchback",
      playerId: fixtureValue(kickerTeamPlayer).id,
    });
    expect(wrong.ok).toBe(false);
    expect(wrong.pendingDecision?.type).toBe("touchback");

    const receiver = fixtureValue(
      fixtureValue(snap.teams[1]).players.find((p) => p.position)
    );
    const taken = await game.execute({
      type: "touchback",
      playerId: receiver.id,
    });
    expect(taken.ok).toBe(true);
    expect(taken.snapshot.ballPosition).toEqual(receiver.position);
    expect(taken.pendingDecision).toBeNull();

    expect(taken.snapshot.phase).toBe(GamePhase.PLAY);
    expect(taken.snapshot.activeTeamId).toBe(fixtureValue(snap.teams[1]).id);
  });
});

describe("pickup scenarios (seeded)", () => {
  it("pickup-success-seeded: the mover picks the ball up and walks on", async () => {
    const game = new HeadlessGame({
      scenario: scenario("pickup-success-seeded"),
    });
    const mover = fixtureValue(game.snapshot().teams[0]).players[0];

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(mover).id,
      action: "move",
    });
    const moved = await game.execute({
      type: "move",
      playerId: fixtureValue(mover).id,
      path: [
        { x: 10, y: 7 },
        { x: 11, y: 7 },
      ],
    });

    expect(
      moved.events.some(
        (e) =>
          e.name === GameEventNames.BallPickup &&
          z.object({ success: z.boolean() }).parse(e.data).success
      )
    ).toBe(true);
    const moverAfter = fixtureValue(moved.snapshot.teams[0]).players[0];
    expect(fixtureValue(moverAfter).position).toEqual({ x: 11, y: 7 });

    expect(moved.snapshot.ballPosition).toEqual({ x: 11, y: 7 });
  });

  it("pickup-fumble-seeded: the mover is interrupted on the ball square", async () => {
    const game = new HeadlessGame({
      scenario: scenario("pickup-fumble-seeded"),
    });
    const mover = fixtureValue(game.snapshot().teams[0]).players[0];

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(mover).id,
      action: "move",
    });
    const moved = await game.execute({
      type: "move",
      playerId: fixtureValue(mover).id,
      path: [
        { x: 10, y: 7 },
        { x: 11, y: 7 },
        { x: 12, y: 7 },
      ],
    });

    expect(
      moved.events.some(
        (e) =>
          e.name === GameEventNames.BallPickup &&
          !z.object({ success: z.boolean() }).parse(e.data).success
      )
    ).toBe(true);

    expect(names(moved)).toContain(GameEventNames.Turnover);
    const moverAfter = fixtureValue(moved.snapshot.teams[0]).players[0];
    expect(fixtureValue(moverAfter).position).toEqual({ x: 10, y: 7 });

    expect(moved.snapshot.ballPosition).not.toEqual({ x: 10, y: 7 });
  });
});

describe("pass scenarios (seeded)", () => {
  it("pass-success-seeded: accurate pass, catch succeeds", async () => {
    const game = new HeadlessGame({
      scenario: scenario("pass-success-seeded"),
    });
    const snap = game.snapshot();
    const thrower = fixtureValue(snap.teams[0]).players[0];
    const receiver = fixtureValue(snap.teams[0]).players[1];

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(thrower).id,
      action: "pass",
    });
    const passed = await game.execute({
      type: "pass",
      playerId: fixtureValue(thrower).id,
      x: 12,
      y: 7,
    });

    expect(passed.ok).toBe(true);
    expect(
      diceRolls(passed).some(
        (r) => r.rollType.startsWith("Catch") && r.resultState === "success"
      )
    ).toBe(true);
    expect(names(passed)).not.toContain(GameEventNames.Turnover);
    expect(passed.snapshot.ballPosition).toEqual(
      fixtureValue(receiver).position
    );
  });

  it("pass-fumble-seeded: the throw is fumbled and it is a turnover", async () => {
    const game = new HeadlessGame({ scenario: scenario("pass-fumble-seeded") });
    const thrower = fixtureValue(game.snapshot().teams[0]).players[0];

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(thrower).id,
      action: "pass",
    });
    const passed = await game.execute({
      type: "pass",
      playerId: fixtureValue(thrower).id,
      x: 12,
      y: 7,
    });

    const n = names(passed);
    expect(n).toContain(GameEventNames.Turnover);
    expect(
      passed.events.some(
        (e) => e.name === GameEventNames.UI_Notification && e.data === "FUMBLE!"
      )
    ).toBe(true);
  });
});

describe("blocking legality", () => {
  const proneBlockerScenario: Scenario = {
    id: "prone-blocker",
    name: "Prone blocker",
    description: "a prone player may not throw a block",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 10, y: 7, status: PlayerStatus.PRONE },
        { playerIndex: 1, x: 5, y: 5 },
      ],
      team2Placements: [{ playerIndex: 0, x: 11, y: 7 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
    },
  };

  it("a prone player cannot declare Block and rolls no block dice", async () => {
    const game = new HeadlessGame({ scenario: proneBlockerScenario, seed: 3 });
    const snap = game.snapshot();
    const proneBlocker = fixtureValue(snap.teams[0]).players[0];
    const defender = fixtureValue(snap.teams[1]).players[0];

    const declared = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(proneBlocker).id,
      action: "block",
    });
    expect(declared.ok).toBe(false);
    expect(declared.reason).toContain("illegal-action-declaration");

    const blocked = await game.execute({
      type: "block",
      attackerId: fixtureValue(proneBlocker).id,
      defenderId: fixtureValue(defender).id,
    });
    const n = names(blocked);
    expect(n).not.toContain(GameEventNames.BlockDiceRolled);
    expect(n).toContain(GameEventNames.UI_BlockRollCancelled);
    expect(blocked.pendingDecision).toBeNull();
  });

  it("a stunned player cannot block either", async () => {
    const stunnedScenario: Scenario = {
      ...proneBlockerScenario,
      id: "stunned-blocker",
      setup: {
        ...proneBlockerScenario.setup,
        team1Placements: [
          { playerIndex: 0, x: 10, y: 7, status: PlayerStatus.STUNNED },
          { playerIndex: 1, x: 5, y: 5 },
        ],
      },
    };
    const game = new HeadlessGame({ scenario: stunnedScenario, seed: 3 });
    const snap = game.snapshot();

    const blocked = await game.execute({
      type: "block",
      attackerId: fixtureValue(fixtureValue(snap.teams[0]).players[0]).id,
      defenderId: fixtureValue(fixtureValue(snap.teams[1]).players[0]).id,
    });
    expect(names(blocked)).not.toContain(GameEventNames.BlockDiceRolled);
  });
});

describe("turnover ownership", () => {
  it("the defending carrier dropping the ball does not end the blocker's turn", async () => {
    const game = new HeadlessGame({
      scenario: scenario("blocked-carrier-seeded"),
    });
    const snap = game.snapshot();
    const carrier = fixtureValue(snap.teams[0]).players[0];
    const blocker = fixtureValue(snap.teams[1]).players[0];

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(blocker).id,
      action: "block",
    });
    const rolled = await game.execute({
      type: "block",
      attackerId: fixtureValue(blocker).id,
      defenderId: fixtureValue(carrier).id,
    });
    expect(rolled.pendingDecision?.type).toBe("block-dice");
    const options = z
      .object({ options: z.object({ type: z.string() }).array() })
      .parse(rolled.pendingDecision).options;
    const powIndex = options.findIndex((o) => o.type === "pow");
    expect(powIndex).toBeGreaterThanOrEqual(0);

    const chosen = await game.execute({
      type: "choose-block-result",
      index: powIndex,
    });
    expect(chosen.pendingDecision?.type).toBe("push-direction");
    const dir = z
      .object({ options: z.object({ x: z.number(), y: z.number() }).array() })
      .parse(chosen.pendingDecision).options[0];
    const pushed = await game.execute({
      type: "choose-push-direction",
      x: fixtureValue(dir).x,
      y: fixtureValue(dir).y,
    });

    let events = [...pushed.events];
    if (pushed.pendingDecision?.type === "follow-up") {
      const followed = await game.execute({
        type: "choose-follow-up",
        followUp: false,
      });
      events = events.concat(followed.events);
    }

    const allNames = events.map((e) => e.name);
    expect(allNames).toContain(GameEventNames.PlayerKnockedDown);
    const carrierAfter = fixtureValue(
      fixtureValue(game.snapshot().teams[0]).players.find(
        (p) => p.id === fixtureValue(carrier).id
      )
    );
    expect(carrierAfter.status).toBe(PlayerStatus.PRONE);

    expect(allNames).not.toContain(GameEventNames.Turnover);
    expect(game.snapshot().activeTeamId).toBe(fixtureValue(snap.teams[1]).id);
  });
});

describe("stunned recovery at turn end", () => {
  const stunnedRecoveryScenario: Scenario = {
    id: "stunned-recovery",
    name: "Stunned recovery",
    description: "stunned players roll to prone at their team's turn end",
    setup: {
      team1Placements: [{ playerIndex: 0, x: 5, y: 5 }],
      team2Placements: [
        { playerIndex: 0, x: 15, y: 5, status: PlayerStatus.STUNNED },
        { playerIndex: 1, x: 15, y: 7 },
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
    },
  };

  it("a stunned player stays stunned and misses their team's turn", async () => {
    const game = new HeadlessGame({
      scenario: stunnedRecoveryScenario,
      seed: 1,
    });
    const snap = game.snapshot();
    const stunned = fixtureValue(snap.teams[1]).players[0];
    const teammate = fixtureValue(snap.teams[1]).players[1];

    const ended = await game.execute({ type: "end-turn" });
    expect(ended.ok).toBe(true);
    expect(ended.snapshot.activeTeamId).toBe(fixtureValue(snap.teams[1]).id);

    const stunnedAfter = fixtureValue(
      fixtureValue(ended.snapshot.teams[1]).players.find(
        (p) => p.id === fixtureValue(stunned).id
      )
    );
    expect(stunnedAfter.status).toBe(PlayerStatus.STUNNED);

    const declined = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(stunned).id,
      action: "move",
    });
    expect(declined.ok).toBe(false);

    const allowed = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(teammate).id,
      action: "move",
    });
    expect(allowed.ok).toBe(true);
  });
});

describe("block-injury scenarios (seeded)", () => {
  async function runInjuryChain(id: string): Promise<{
    defenderStatus: string;
    events: string[];
    notifications: string[];
    activeTeamId: string | null;
    defenderTeamId: string;
  }> {
    const game = new HeadlessGame({ scenario: scenario(id) });
    const snap = game.snapshot();
    const defender = fixtureValue(
      fixtureValue(snap.teams[0]).players.find((p) => p.position)
    );
    const attacker = fixtureValue(
      fixtureValue(snap.teams[1]).players.find((p) => p.position)
    );

    await game.execute({
      type: "declare-action",
      playerId: attacker.id,
      action: "block",
    });
    let rolled = await game.execute({
      type: "block",
      attackerId: attacker.id,
      defenderId: defender.id,
    });

    if (rolled.pendingDecision?.type === "reaction") {
      rolled = await game.execute({ type: "use-reaction", accept: false });
    }
    if (rolled.pendingDecision?.type !== "block-dice") {
      throw new Error(`no block decision for ${id}`);
    }
    const powIndex = rolled.pendingDecision.options.findIndex(
      (o) => o.type === "pow" || o.type === "pow-dodge"
    );
    if (powIndex === -1) {
      throw new Error(
        `seed for ${id} did not roll POW: ${rolled.pendingDecision.options
          .map((o) => o.type)
          .join(", ")}`
      );
    }

    let response = await game.execute({
      type: "choose-block-result",
      index: powIndex,
    });
    let events = [...rolled.events, ...response.events];
    if (response.pendingDecision?.type === "push-direction") {
      const dir = response.pendingDecision.options[0];
      response = await game.execute({
        type: "choose-push-direction",
        x: fixtureValue(dir).x,
        y: fixtureValue(dir).y,
      });
      events = events.concat(response.events);
    }
    if (response.pendingDecision?.type === "follow-up") {
      response = await game.execute({
        type: "choose-follow-up",
        followUp: false,
      });
      events = events.concat(response.events);
    }

    const defenderAfter = fixtureValue(
      fixtureValue(game.snapshot().teams[0]).players.find(
        (p) => p.id === defender.id
      )
    );
    const notifications = events
      .filter((e) => e.name === GameEventNames.UI_Notification)
      .map((e) => z.string().parse(e.data));
    return {
      defenderStatus: defenderAfter.status,
      notifications,
      activeTeamId: game.snapshot().activeTeamId,
      defenderTeamId: fixtureValue(snap.teams[0]).id,
      events: events.map((e) => e.name),
    };
  }

  it("block-injury-stun: defender is stunned, and stays so as their turn starts", async () => {
    const result = await runInjuryChain("block-injury-stun");
    expect(result.notifications).toContain("STUNNED!");

    expect(result.activeTeamId).toBe(result.defenderTeamId);
    expect(result.defenderStatus).toBe(PlayerStatus.STUNNED);
  });

  it("block-injury-ko: defender is knocked out", async () => {
    const { defenderStatus } = await runInjuryChain("block-injury-ko");
    expect(defenderStatus).toBe(PlayerStatus.KO);
  });

  it("block-injury-casualty: defender becomes a casualty", async () => {
    const { defenderStatus } = await runInjuryChain("block-injury-casualty");
    expect([PlayerStatus.INJURED, PlayerStatus.DEAD]).toContain(defenderStatus);
  });
});
