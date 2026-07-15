/**
 * Drives the sandbox scenarios through the headless CLI protocol so the
 * rules and their intersecting edge cases are covered without a browser:
 * seeded outcomes stay honest (a stale seed fails here first) and the
 * engine-level rules (turnover latch, blitz rush, touchback, prone blocks)
 * are asserted from the same commands an external agent would send.
 */

import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { PlayerStatus } from "../../src/types/Player";
import { Scenario } from "../../src/types/Scenario";
import { SCENARIOS } from "../../src/data/scenarios";
import { CommandResponse } from "../../src/headless/protocol";

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
    .map((e) => e.data as { rollType: string; resultState?: string });
}

describe("double-turnover-seeded", () => {
  it("failed pickup bouncing into a dropped catch is exactly ONE turnover", async () => {
    const game = new HeadlessGame({ scenario: scenario("double-turnover-seeded") });
    const snap = game.snapshot();
    const mover = snap.teams[0].players[0];

    await game.execute({
      type: "declare-action",
      playerId: mover.id,
      action: "move",
    });
    const moved = await game.execute({
      type: "move",
      playerId: mover.id,
      path: [
        { x: 9, y: 7 },
        { x: 10, y: 7 }, // the ball square
      ],
    });
    expect(moved.ok).toBe(true);

    // The seed produces: pickup fails, bounce hits a teammate, catch fails
    expect(
      moved.events.some(
        (e) =>
          e.name === GameEventNames.BallPickup &&
          (e.data as { success: boolean }).success === false
      )
    ).toBe(true);
    expect(
      diceRolls(moved).some(
        (r) => r.rollType.startsWith("Catch") && r.resultState === "failure"
      )
    ).toBe(true);

    // Exactly one turnover and one turn switch, to the opponent
    const n = names(moved);
    expect(n.filter((x) => x === GameEventNames.Turnover)).toHaveLength(1);
    expect(n.filter((x) => x === GameEventNames.TurnStarted)).toHaveLength(1);
    expect(moved.snapshot.activeTeamId).toBe(snap.teams[1].id);

    // The mover was interrupted on the ball square — no walking on
    const moverAfter = moved.snapshot.teams[0].players.find(
      (p) => p.id === mover.id
    )!;
    expect(moverAfter.position).toEqual({ x: 10, y: 7 });
  });
});

describe("blitz scenarios", () => {
  it("blitz-test: block within MA rolls block dice with no rush", async () => {
    const game = new HeadlessGame({ scenario: scenario("blitz-test") });
    const snap = game.snapshot();
    const blitzer = snap.teams[0].players[0]; // (10,7)
    const target = snap.teams[1].players[0]; // (14,7)

    await game.execute({
      type: "declare-action",
      playerId: blitzer.id,
      action: "blitz",
    });
    const moved = await game.execute({
      type: "move",
      playerId: blitzer.id,
      path: [
        { x: 11, y: 7 },
        { x: 12, y: 7 },
        { x: 13, y: 7 },
      ],
    });
    expect(moved.ok).toBe(true);

    const blocked = await game.execute({
      type: "block",
      attackerId: blitzer.id,
      defenderId: target.id,
    });
    expect(blocked.ok).toBe(true);
    expect(names(blocked)).toContain(GameEventNames.BlockDiceRolled);
    expect(
      diceRolls(blocked).some((r) => r.rollType.includes("Rush"))
    ).toBe(false);
    expect(blocked.pendingDecision?.type).toBe("block-dice");
  });

  it("blitz-rush-fail-seeded: the rush before the block fails — blitzer falls, no block dice", async () => {
    const game = new HeadlessGame({
      scenario: scenario("blitz-rush-fail-seeded"),
    });
    const snap = game.snapshot();
    const blitzer = snap.teams[0].players[0]; // (10,7), MA 6
    const target = snap.teams[1].players[0]; // (17,7)

    await game.execute({
      type: "declare-action",
      playerId: blitzer.id,
      action: "blitz",
    });
    const moved = await game.execute({
      type: "move",
      playerId: blitzer.id,
      path: [11, 12, 13, 14, 15, 16].map((x) => ({ x, y: 7 })),
    });
    expect(moved.ok).toBe(true);

    const blocked = await game.execute({
      type: "block",
      attackerId: blitzer.id,
      defenderId: target.id,
    });

    // The 7th movement point is a Rush: it fails, the blitzer goes prone in
    // front of the target, it's a turnover, and NO block dice are rolled
    expect(
      diceRolls(blocked).some(
        (r) => r.rollType.includes("Rush") && r.resultState === "failure"
      )
    ).toBe(true);
    const n = names(blocked);
    expect(n).toContain(GameEventNames.PlayerKnockedDown);
    expect(n).not.toContain(GameEventNames.BlockDiceRolled);
    expect(n.filter((x) => x === GameEventNames.Turnover)).toHaveLength(1);

    const blitzerAfter = blocked.snapshot.teams[0].players.find(
      (p) => p.id === blitzer.id
    )!;
    expect(blitzerAfter.status).toBe(PlayerStatus.PRONE);
    expect(blitzerAfter.position).toEqual({ x: 16, y: 7 });
  });
});

describe("touchback", () => {
  it("kick out of bounds → receiving coach hands the ball to a chosen player", async () => {
    const game = new HeadlessGame({ scenario: scenario("touchback-test") });
    const snap = game.snapshot();
    const kicker = snap.teams[0].players[0];

    const kicked = await game.execute({
      type: "kick-ball",
      playerId: kicker.id,
      x: 18,
      y: 1,
    });
    expect(kicked.ok).toBe(true);
    expect(names(kicked)).toContain(GameEventNames.TouchbackAwarded);
    expect(kicked.pendingDecision).toEqual({
      type: "touchback",
      teamId: snap.teams[1].id,
    });
    // The ball never landed on the pitch
    expect(kicked.snapshot.ballPosition).toBeNull();

    // Other commands are gated until the touchback is resolved
    const gated = await game.execute({ type: "end-turn" });
    expect(gated.ok).toBe(false);
    expect(gated.reason).toContain("decision-pending:touchback");

    // A kicking-team player is not a legal recipient
    const kickerTeamPlayer = snap.teams[0].players[1];
    const wrong = await game.execute({
      type: "touchback",
      playerId: kickerTeamPlayer.id,
    });
    expect(wrong.ok).toBe(false);
    expect(wrong.pendingDecision?.type).toBe("touchback");

    // Any receiving player on the pitch may take the ball
    const receiver = snap.teams[1].players.find((p) => p.position)!;
    const taken = await game.execute({
      type: "touchback",
      playerId: receiver.id,
    });
    expect(taken.ok).toBe(true);
    expect(taken.snapshot.ballPosition).toEqual(receiver.position);
    expect(taken.pendingDecision).toBeNull();
    // Play continues with the receiving team's turn
    expect(taken.snapshot.phase).toBe(GamePhase.PLAY);
    expect(taken.snapshot.activeTeamId).toBe(snap.teams[1].id);
  });
});

describe("pickup scenarios (seeded)", () => {
  it("pickup-success-seeded: the mover picks the ball up and walks on", async () => {
    const game = new HeadlessGame({ scenario: scenario("pickup-success-seeded") });
    const mover = game.snapshot().teams[0].players[0]; // (9,7), ball (10,7)

    await game.execute({
      type: "declare-action",
      playerId: mover.id,
      action: "move",
    });
    const moved = await game.execute({
      type: "move",
      playerId: mover.id,
      path: [
        { x: 10, y: 7 },
        { x: 11, y: 7 },
      ],
    });

    expect(
      moved.events.some(
        (e) =>
          e.name === GameEventNames.BallPickup &&
          (e.data as { success: boolean }).success === true
      )
    ).toBe(true);
    const moverAfter = moved.snapshot.teams[0].players[0];
    expect(moverAfter.position).toEqual({ x: 11, y: 7 });
    // The ball travelled with the carrier
    expect(moved.snapshot.ballPosition).toEqual({ x: 11, y: 7 });
  });

  it("pickup-fumble-seeded: the mover is interrupted on the ball square", async () => {
    const game = new HeadlessGame({ scenario: scenario("pickup-fumble-seeded") });
    const mover = game.snapshot().teams[0].players[0];

    await game.execute({
      type: "declare-action",
      playerId: mover.id,
      action: "move",
    });
    const moved = await game.execute({
      type: "move",
      playerId: mover.id,
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
          (e.data as { success: boolean }).success === false
      )
    ).toBe(true);
    // Turnover: the rest of the movement is lost
    expect(names(moved)).toContain(GameEventNames.Turnover);
    const moverAfter = moved.snapshot.teams[0].players[0];
    expect(moverAfter.position).toEqual({ x: 10, y: 7 });
    // The ball bounced off the pickup square
    expect(moved.snapshot.ballPosition).not.toEqual({ x: 10, y: 7 });
  });
});

describe("pass scenarios (seeded)", () => {
  it("pass-success-seeded: accurate pass, catch succeeds", async () => {
    const game = new HeadlessGame({ scenario: scenario("pass-success-seeded") });
    const snap = game.snapshot();
    const thrower = snap.teams[0].players[0]; // (10,7) with ball
    const receiver = snap.teams[0].players[1]; // (12,7)

    await game.execute({
      type: "declare-action",
      playerId: thrower.id,
      action: "pass",
    });
    const passed = await game.execute({
      type: "pass",
      playerId: thrower.id,
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
    expect(passed.snapshot.ballPosition).toEqual(receiver.position);
  });

  it("pass-fumble-seeded: the throw is fumbled and it is a turnover", async () => {
    const game = new HeadlessGame({ scenario: scenario("pass-fumble-seeded") });
    const thrower = game.snapshot().teams[0].players[0];

    await game.execute({
      type: "declare-action",
      playerId: thrower.id,
      action: "pass",
    });
    const passed = await game.execute({
      type: "pass",
      playerId: thrower.id,
      x: 12,
      y: 7,
    });

    const n = names(passed);
    expect(n).toContain(GameEventNames.Turnover);
    expect(
      passed.events.some(
        (e) =>
          e.name === GameEventNames.UI_Notification && e.data === "FUMBLE!"
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
        { playerIndex: 1, x: 5, y: 5 }, // keeps the turn alive
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
    const proneBlocker = snap.teams[0].players[0];
    const defender = snap.teams[1].players[0];

    const declared = await game.execute({
      type: "declare-action",
      playerId: proneBlocker.id,
      action: "block",
    });
    expect(declared.ok).toBe(false);
    expect(declared.reason).toContain("illegal-action-declaration");

    // Even a direct block command must refuse to roll
    const blocked = await game.execute({
      type: "block",
      attackerId: proneBlocker.id,
      defenderId: defender.id,
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
      attackerId: snap.teams[0].players[0].id,
      defenderId: snap.teams[1].players[0].id,
    });
    expect(names(blocked)).not.toContain(GameEventNames.BlockDiceRolled);
  });
});

describe("turnover ownership", () => {
  /**
   * blocked-carrier-seeded: team 2 (active) blocks team 1's ball carrier
   * with a POW. The carrier dropping the ball is NOT a turnover for team 2
   * — only the team whose turn it is dropping the ball on their own action
   * turns the ball over.
   */
  it("the defending carrier dropping the ball does not end the blocker's turn", async () => {
    const game = new HeadlessGame({
      scenario: scenario("blocked-carrier-seeded"),
    });
    const snap = game.snapshot();
    const carrier = snap.teams[0].players[0];
    const blocker = snap.teams[1].players[0];

    await game.execute({
      type: "declare-action",
      playerId: blocker.id,
      action: "block",
    });
    const rolled = await game.execute({
      type: "block",
      attackerId: blocker.id,
      defenderId: carrier.id,
    });
    expect(rolled.pendingDecision?.type).toBe("block-dice");
    const options = (rolled.pendingDecision as { options: { type: string }[] })
      .options;
    const powIndex = options.findIndex((o) => o.type === "pow");
    expect(powIndex).toBeGreaterThanOrEqual(0); // the seed guarantees a POW

    const chosen = await game.execute({
      type: "choose-block-result",
      index: powIndex,
    });
    expect(chosen.pendingDecision?.type).toBe("push-direction");
    const dir = (chosen.pendingDecision as { options: { x: number; y: number }[] })
      .options[0];
    const pushed = await game.execute({
      type: "choose-push-direction",
      x: dir.x,
      y: dir.y,
    });

    let events = [...pushed.events];
    if (pushed.pendingDecision?.type === "follow-up") {
      const followed = await game.execute({
        type: "choose-follow-up",
        followUp: false,
      });
      events = events.concat(followed.events);
    }

    // The carrier went down and the ball came loose…
    const allNames = events.map((e) => e.name);
    expect(allNames).toContain(GameEventNames.PlayerKnockedDown);
    const carrierAfter = game
      .snapshot()
      .teams[0].players.find((p) => p.id === carrier.id)!;
    expect(carrierAfter.status).toBe(PlayerStatus.PRONE);

    // …but that is NOT a turnover: team 2 keeps playing
    expect(allNames).not.toContain(GameEventNames.Turnover);
    expect(game.snapshot().activeTeamId).toBe(snap.teams[1].id);
  });
});

describe("stunned recovery at turn start", () => {
  const stunnedRecoveryScenario: Scenario = {
    id: "stunned-recovery",
    name: "Stunned recovery",
    description: "stunned players roll to prone at their team's turn start",
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

  it("a stunned player becomes prone but already-activated when their turn starts", async () => {
    const game = new HeadlessGame({ scenario: stunnedRecoveryScenario, seed: 1 });
    const snap = game.snapshot();
    const stunned = snap.teams[1].players[0];
    const teammate = snap.teams[1].players[1];

    // Hand the turn to team 2
    const ended = await game.execute({ type: "end-turn" });
    expect(ended.ok).toBe(true);
    expect(ended.snapshot.activeTeamId).toBe(snap.teams[1].id);

    // The stunned player rolled face-up…
    const stunnedAfter = ended.snapshot.teams[1].players.find(
      (p) => p.id === stunned.id
    )!;
    expect(stunnedAfter.status).toBe(PlayerStatus.PRONE);

    // …but has missed their action this turn
    const declined = await game.execute({
      type: "declare-action",
      playerId: stunned.id,
      action: "move",
    });
    expect(declined.ok).toBe(false);

    // Their teammate activates normally
    const allowed = await game.execute({
      type: "declare-action",
      playerId: teammate.id,
      action: "move",
    });
    expect(allowed.ok).toBe(true);
  });
});

describe("block-injury scenarios (seeded)", () => {
  /**
   * Drives the seeded injury-chain scenarios end to end: block → POW →
   * push → armour → injury. Verifies each scenario's advertised outcome so
   * a stale seed is caught here instead of confusing someone in the sandbox.
   */
  async function runInjuryChain(id: string): Promise<{
    defenderStatus: string;
    events: string[];
  }> {
    const game = new HeadlessGame({ scenario: scenario(id) });
    const snap = game.snapshot();
    const defender = snap.teams[0].players.find((p) => p.position)!;
    const attacker = snap.teams[1].players.find((p) => p.position)!;

    await game.execute({
      type: "declare-action",
      playerId: attacker.id,
      action: "block",
    });
    const rolled = await game.execute({
      type: "block",
      attackerId: attacker.id,
      defenderId: defender.id,
    });
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
        x: dir.x,
        y: dir.y,
      });
      events = events.concat(response.events);
    }
    if (response.pendingDecision?.type === "follow-up") {
      response = await game.execute({ type: "choose-follow-up", followUp: false });
      events = events.concat(response.events);
    }

    const defenderAfter = game
      .snapshot()
      .teams[0].players.find((p) => p.id === defender.id)!;
    const notifications = events
      .filter((e) => e.name === GameEventNames.UI_Notification)
      .map((e) => e.data as string);
    return {
      defenderStatus: defenderAfter.status,
      notifications,
      activeTeamId: game.snapshot().activeTeamId,
      defenderTeamId: snap.teams[0].id,
      events: events.map((e) => e.name),
    };
  }

  it("block-injury-stun: defender is stunned, then recovers prone at their turn start", async () => {
    const result = await runInjuryChain("block-injury-stun");
    expect(result.notifications).toContain("STUNNED!");
    // The attacker was their team's last player, so the turn flipped to the
    // defender's team — whose turn start rolls the stunned player face-up
    expect(result.activeTeamId).toBe(result.defenderTeamId);
    expect(result.defenderStatus).toBe(PlayerStatus.PRONE);
  });

  it("block-injury-ko: defender is knocked out", async () => {
    const { defenderStatus } = await runInjuryChain("block-injury-ko");
    expect(defenderStatus).toBe(PlayerStatus.KO);
  });

  it("block-injury-casualty: defender becomes a casualty", async () => {
    const { defenderStatus } = await runInjuryChain("block-injury-casualty");
    expect([PlayerStatus.INJURED, PlayerStatus.DEAD]).toContain(
      defenderStatus
    );
  });
});
