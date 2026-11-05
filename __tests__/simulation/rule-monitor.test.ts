import { describe, it, expect } from "vitest";
import { createRuleMonitor } from "../../src/simulation/invariants";
import { createSimGame } from "../../src/simulation/runMatch";
import { GameSnapshot } from "../../src/headless/serialization";
import { GamePhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";

/**
 * The monitor's command-aware rules, fed doctored snapshots so each rule is
 * proved whatever the engine currently does.
 */
function playState(): GameSnapshot {
  const snapshot = createSimGame(
    1,
    [RosterName.HUMAN, RosterName.ORC],
    3
  ).snapshot();
  snapshot.phase = GamePhase.PLAY;
  snapshot.activeTeamId = "team1";
  snapshot.teams[0].players[0].position = { x: 5, y: 5 };
  snapshot.teams[0].players[0].status = PlayerStatus.ACTIVE;
  snapshot.teams[1].players[0].position = { x: 8, y: 5 };
  snapshot.teams[1].players[0].status = PlayerStatus.ACTIVE;
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
    // Same half, team and turn number, after a score and a Time-Out.
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
    const mover = after.teams[0].players[0];
    after.turn.movementUsed[mover.id] = mover.stats.MA + 3;
    const move = {
      type: "move" as const,
      playerId: mover.id,
      path: [{ x: 6, y: 5 }],
    };

    expect(rules(monitor.observe(move, before, after, false))).toEqual([
      "movement-allowance",
    ]);
  });

  it("does not flag movement a lapsed skill allowed earlier in the turn", () => {
    const monitor = createRuleMonitor();
    const before = playState();
    const mover = before.teams[0].players[0];
    // Sprint gave a third Rush; it lapsed when the drive ended, but the
    // turn's counter still holds the squares it allowed.
    before.turn.movementUsed[mover.id] = mover.stats.MA + 3;
    const after = structuredClone(before);
    after.phase = GamePhase.GAME_OVER;

    expect(
      rules(monitor.observe({ type: "end-turn" }, before, after, false))
    ).toEqual([]);
  });
});
