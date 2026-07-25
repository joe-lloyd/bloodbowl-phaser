import { describe, expect, it } from "vitest";
import { createHeadlessGame } from "../../src/headless/createHeadlessGame";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import {
  createMatchSave,
  deserializeMatchSave,
  serializeMatchSave,
} from "../../src/headless/serialization";
import { SCENARIOS } from "../../src/data/scenarios";
import { GameEventNames } from "../../src/types/events";
import { InjuryType, PlayerStatus } from "../../src/types/Player";
import { CompetitionContext } from "../../src/competition/types";

const scrimmage = SCENARIOS.find(
  (scenario) => scenario.id === "basic-scrimmage"
)!;

function saveCurrent(
  game: ReturnType<typeof createHeadlessGame>,
  savedAt = 1234,
  competition?: CompetitionContext
) {
  return createMatchSave({
    state: game.gameService.getState(),
    teams: [game.team1, game.team2],
    drive: {
      kickingTeamId: game.team1.id,
      receivingTeamId: game.team2.id,
    },
    rng: game.rng.captureState(),
    matchStats: game.matchStats.captureState(),
    turnManager: game.gameService.captureTurnManagerState(),
    competition,
    savedAt,
  });
}

describe("resumable match save", () => {
  it("round-trips through JSON without changing GameSnapshot", () => {
    const game = createHeadlessGame({ scenario: scrimmage, seed: 21 });
    const competition: CompetitionContext = {
      competitionType: "league",
      competitionId: "league-1",
      fixtureId: "fixture-7",
    };
    const save = saveCurrent(game, 1234, competition);
    const restored = deserializeMatchSave(serializeMatchSave(save));

    expect(restored).toEqual(save);
    expect(Object.keys(restored.snapshot)).toEqual(Object.keys(save.snapshot));
    expect(restored.version).toBe(1);
    expect(restored.savedAt).toBe(1234);
    expect(restored.competition).toEqual(competition);
  });

  it("restores the engine's per-team turn counters", () => {
    const game = createHeadlessGame({ scenario: scrimmage, seed: 31 });
    game.gameService.seedTurnCounts(3);

    const resumed = createHeadlessGame({ matchSave: saveCurrent(game) });

    expect(resumed.gameService.getTurnNumber(resumed.team1.id)).toBe(3);
    expect(resumed.gameService.getTurnNumber(resumed.team2.id)).toBe(3);
  });

  it("continues RNG and legal commands identically after a cold restore", async () => {
    const original = createHeadlessGame({ scenario: scrimmage, seed: 99 });
    original.rng.rollMultipleDice(4, 6);
    const save = saveCurrent(original);
    const uninterruptedNext = original.rng.rollMultipleDice(6, 6);

    const resumed = new HeadlessGame({ matchSave: save });
    const resumedNext = resumed.ctx.rng.rollMultipleDice(6, 6);
    expect(resumedNext).toEqual(uninterruptedNext);

    const legal = await resumed.execute({ type: "legal-actions" });
    expect(legal.ok).toBe(true);
    expect(legal.snapshot.phase).toBe(save.snapshot.phase);
    expect(legal.snapshot.subPhase).toBe(save.snapshot.subPhase);
  });

  it("preserves full player progression, conditions, and injuries", () => {
    const game = createHeadlessGame({ scenario: scrimmage, seed: 17 });
    const player = game.team1.players[0];
    player.status = PlayerStatus.PRONE;
    player.spp = 12;
    player.injuries = [InjuryType.NIGGLING_INJURY];
    player.skills = [...player.skills, { type: "Block" } as never];

    const resumed = createHeadlessGame({ matchSave: saveCurrent(game) });
    const restored = resumed.team1.players.find(
      (candidate) => candidate.id === player.id
    )!;
    expect(restored.status).toBe(PlayerStatus.PRONE);
    expect(restored.spp).toBe(12);
    expect(restored.injuries).toEqual([InjuryType.NIGGLING_INJURY]);
    expect(restored.skills).toEqual(player.skills);
  });

  it("continues accumulating match statistics after resume", () => {
    const game = createHeadlessGame({
      scenario: scrimmage,
      seed: 42,
      progressionEnabled: true,
    });
    const passer = game.team1.players[0];
    const catcher = game.team1.players[1];
    game.eventBus.emit(GameEventNames.PassCompleted, {
      playerId: passer.id,
      catcherId: catcher.id,
      position: { x: 1, y: 1 },
    });

    const resumed = createHeadlessGame({ matchSave: saveCurrent(game) });
    resumed.eventBus.emit(GameEventNames.PassCompleted, {
      playerId: passer.id,
      catcherId: catcher.id,
      position: { x: 2, y: 1 },
    });

    const stats = resumed.matchStats
      .summary(resumed.team1.players)
      .players.find((entry) => entry.playerId === passer.id)!;
    expect(stats.completions).toBe(2);
  });
});
