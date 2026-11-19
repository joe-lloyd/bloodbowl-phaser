import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { createRuleMonitor } from "../../src/simulation/invariants";
import { createSimGame } from "../../src/simulation/runMatch";
import { type GameSnapshot } from "../../src/headless/serialization";
import { GamePhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";

function playState(): GameSnapshot {
  const snapshot = createSimGame(
    1,
    [RosterName.HUMAN, RosterName.ORC],
    3
  ).snapshot();
  snapshot.phase = GamePhase.PLAY;
  snapshot.activeTeamId = "team1";
  fixtureValue(fixtureValue(snapshot.teams[0]).players[0]).position = {
    x: 5,
    y: 5,
  };
  fixtureValue(fixtureValue(snapshot.teams[0]).players[0]).status =
    PlayerStatus.ACTIVE;
  fixtureValue(fixtureValue(snapshot.teams[1]).players[0]).position = {
    x: 8,
    y: 5,
  };
  fixtureValue(fixtureValue(snapshot.teams[1]).players[0]).status =
    PlayerStatus.ACTIVE;
  return snapshot;
}

const rules = (violations: { rule: string }[]) => violations.map((v) => v.rule);

describe("rule monitor", () => {
  it("flags a second block in one Blitz", () => {
    const monitor = createRuleMonitor();
    const before = playState();
    before.activePlayer = { id: "team1-player-1", action: "blitz" };
    const block = {
      type: "block" as const,
      attackerId: "team1-player-1",
      defenderId: "team2-player-1",
    };

    expect(rules(monitor.observe(block, before, before, false))).toEqual([]);
    expect(rules(monitor.observe(block, before, before, false))).toEqual([
      "one-block-per-blitz",
    ]);
  });

  it("lets a player blitz again when Time-Out repeats a turn number", () => {
    const monitor = createRuleMonitor();
    const before = playState();
    before.activePlayer = { id: "team1-player-1", action: "blitz" };
    const declare = {
      type: "declare-action" as const,
      playerId: "team1-player-1",
      action: "blitz" as const,
    };
    const block = {
      type: "block" as const,
      attackerId: "team1-player-1",
      defenderId: "team2-player-1",
    };

    monitor.observe(declare, before, before, false);
    expect(rules(monitor.observe(block, before, before, false))).toEqual([]);

    monitor.observe(declare, before, before, false);
    expect(rules(monitor.observe(block, before, before, false))).toEqual([]);
  });

  it("flags a pass that ends in opposition hands while the passing team keeps the turn", () => {
    const monitor = createRuleMonitor();
    const before = playState();
    const after = structuredClone(before);
    after.ballPosition = { x: 8, y: 5 };
    const pass = {
      type: "pass" as const,
      playerId: "team1-player-1",
      x: 8,
      y: 5,
    };

    expect(rules(monitor.observe(pass, before, after, false))).toEqual([
      "uncaught-pass-is-turnover",
    ]);
  });

  it("waits for a pending interception before judging the pass, and accepts a turnover", () => {
    const monitor = createRuleMonitor();
    const before = playState();
    const pass = {
      type: "pass" as const,
      playerId: "team1-player-1",
      x: 8,
      y: 5,
    };
    expect(rules(monitor.observe(pass, before, before, true))).toEqual([]);

    const turnedOver = structuredClone(before);
    turnedOver.activeTeamId = "team2";
    turnedOver.ballPosition = { x: 8, y: 5 };
    const decline = { type: "choose-interception" as const };
    expect(rules(monitor.observe(decline, before, turnedOver, false))).toEqual(
      []
    );
  });

  it("flags movement beyond MA plus two Rushes", () => {
    const monitor = createRuleMonitor();
    const before = playState();
    const after = structuredClone(before);
    const mover = fixtureValue(after.teams[0]).players[0];
    after.turn.movementUsed[fixtureValue(mover).id] =
      fixtureValue(mover).stats.MA + 3;
    const move = {
      type: "move" as const,
      playerId: fixtureValue(mover).id,
      path: [{ x: 6, y: 5 }],
    };

    expect(rules(monitor.observe(move, before, after, false))).toEqual([
      "movement-allowance",
    ]);
  });

  it("does not flag movement a skill allowed when the same command ends it", () => {
    const monitor = createRuleMonitor();
    const before = playState();
    const mover = fixtureValue(before.teams[0]).players[0];
    fixtureValue(mover).skills = [...fixtureValue(mover).skills, "Sprint"];
    const after = structuredClone(before);
    const moved = fixtureValue(after.teams[0]).players[0];
    after.turn.movementUsed[fixtureValue(moved).id] =
      fixtureValue(moved).stats.MA + 3;

    fixtureValue(moved).skills = fixtureValue(moved).skills.filter(
      (s) => s !== "Sprint"
    );
    after.phase = GamePhase.GAME_OVER;
    const move = {
      type: "move" as const,
      playerId: fixtureValue(moved).id,
      path: [{ x: 6, y: 5 }],
    };

    expect(rules(monitor.observe(move, before, after, false))).toEqual([]);
  });

  it("does not flag movement a lapsed skill allowed earlier in the turn", () => {
    const monitor = createRuleMonitor();
    const before = playState();
    const mover = fixtureValue(before.teams[0]).players[0];

    before.turn.movementUsed[fixtureValue(mover).id] =
      fixtureValue(mover).stats.MA + 3;
    const after = structuredClone(before);
    after.phase = GamePhase.GAME_OVER;

    expect(
      rules(monitor.observe({ type: "end-turn" }, before, after, false))
    ).toEqual([]);
  });
});
