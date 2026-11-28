import { headlessCommandSchema } from "../../src/boundary/schemas/HeadlessCommand";
import { getSkill, SkillType } from "../../src/types/Skills";
import { fixtureValue } from "../../src/testing/fixtureValue";
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
import { type CompetitionContext } from "../../src/competition/types";

const scrimmage = fixtureValue(SCENARIOS.find(
  (scenario) => scenario.id === "basic-scrimmage"
));

function saveCurrent(
  game: ReturnType<typeof createHeadlessGame>,
  competition?: CompetitionContext
) {
  return createMatchSave({
    state: game.gameService.getState(),
    teams: [game.teams[0], game.teams[1]],
    drive: {
      kickingTeamId: game.teams[0].id,
      receivingTeamId: game.teams[1].id,
    },
    rng: game.rng.captureState(),
    matchStats: game.matchStats.captureState(),
    turnManager: game.gameService.captureTurnManagerState(),
    ...(competition !== undefined && { competition: competition }),
    savedAt: 1234,
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
    const save = saveCurrent(game, competition);
    const restored = deserializeMatchSave(serializeMatchSave(save));

    expect(restored).toEqual(save);
    expect(Object.keys(restored.snapshot)).toEqual(Object.keys(save.snapshot));
    expect(restored.version).toBe(1);
    expect(restored.savedAt).toBe(1234);
    expect(restored.competition).toEqual(competition);
  });

  it("restores a save written before the Throw Team-Mate, Kick Team-Mate and Bomb turn limits", () => {
    const game = createHeadlessGame({ scenario: scrimmage, seed: 21 });
    const save = saveCurrent(game);
    const older = structuredClone(save);
    Reflect.deleteProperty(older.snapshot.turn, "hasThrownTeamMate");
    Reflect.deleteProperty(older.snapshot.turn, "hasKickedTeamMate");
    Reflect.deleteProperty(older.snapshot.turn, "hasThrownBomb");

    const restored = deserializeMatchSave(serializeMatchSave(older));

    expect(restored.snapshot.turn).toMatchObject({
      hasThrownTeamMate: false,
      hasKickedTeamMate: false,
      hasThrownBomb: false,
    });
  });

  it("restores a save whose players carry keywords the rosters no longer use", () => {
    const game = createHeadlessGame({ scenario: scrimmage, seed: 21 });
    const save = saveCurrent(game);
    const older = structuredClone(save);
    const player = fixtureValue(older.teams[0].players[0]);
    Reflect.set(player, "keywords", [...player.keywords, "Skink"]);

    const restored = deserializeMatchSave(serializeMatchSave(older));

    expect(fixtureValue(restored.teams[0].players[0]).keywords).toEqual(
      fixtureValue(save.teams[0].players[0]).keywords
    );
  });

  it("restores a save held mid Stand Up, now a Move", () => {
    const game = createHeadlessGame({ scenario: scrimmage, seed: 21 });
    const older = structuredClone(saveCurrent(game));
    Reflect.set(older.snapshot, "activePlayer", {
      id: fixtureValue(older.teams[0].players[0]).id,
      action: "standUp",
    });

    const restored = deserializeMatchSave(serializeMatchSave(older));

    expect(restored.snapshot.activePlayer?.action).toBe("move");
  });

  it("reads a recorded Stand Up declaration as a Move", () => {
    const command = { type: "declare-action", playerId: "p1", action: "standUp" };
    expect(headlessCommandSchema.parse(command)).toEqual({
      ...command,
      action: "move",
    });
  });

  it("restores a save whose drive opened with Solid Defence, now Alert Defence", () => {
    const game = createHeadlessGame({ scenario: scrimmage, seed: 21 });
    const older = structuredClone(saveCurrent(game));
    const outcome = { event: "Solid Defence", meaning: "Redeploy", perTeam: {} };
    Reflect.set(older.snapshot, "kickoffResolution", {
      roll: 4,
      event: "Solid Defence",
      meaning: "Redeploy",
      outcome,
    });

    const restored = deserializeMatchSave(serializeMatchSave(older));

    expect(restored.snapshot.kickoffResolution?.event).toBe("Alert Defence");
    expect(restored.snapshot.kickoffResolution?.outcome.event).toBe(
      "Alert Defence"
    );
  });

  it("restores the engine's per-team turn counters", () => {
    const game = createHeadlessGame({ scenario: scrimmage, seed: 31 });
    game.gameService.seedTurnCounts(3);

    const resumed = createHeadlessGame({ matchSave: saveCurrent(game) });

    expect(resumed.gameService.getTurnNumber(resumed.teams[0].id)).toBe(3);
    expect(resumed.gameService.getTurnNumber(resumed.teams[1].id)).toBe(3);
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
    const player = game.teams[0].players[0];
    fixtureValue(player).status = PlayerStatus.PRONE;
    fixtureValue(player).spp = 12;
    fixtureValue(player).injuries = [InjuryType.NIGGLING_INJURY];
    fixtureValue(player).skills = [...fixtureValue(player).skills, getSkill(SkillType.BLOCK)];

    const resumed = createHeadlessGame({ matchSave: saveCurrent(game) });
    const restored = fixtureValue(resumed.teams[0].players.find(
      (candidate) => candidate.id === fixtureValue(player).id
    ));
    expect(restored.status).toBe(PlayerStatus.PRONE);
    expect(restored.spp).toBe(12);
    expect(restored.injuries).toEqual([InjuryType.NIGGLING_INJURY]);
    expect(restored.skills).toEqual(fixtureValue(player).skills);
  });

  it("continues accumulating match statistics after resume", () => {
    const game = createHeadlessGame({
      scenario: scrimmage,
      seed: 42,
      progressionEnabled: true,
    });
    const passer = game.teams[0].players[0];
    const catcher = game.teams[0].players[1];
    game.eventBus.emit(GameEventNames.PassCompleted, {
      playerId: fixtureValue(passer).id,
      catcherId: fixtureValue(catcher).id,
      action: "pass",
      position: { x: 1, y: 1 },
    });

    const resumed = createHeadlessGame({ matchSave: saveCurrent(game) });
    resumed.eventBus.emit(GameEventNames.PassCompleted, {
      playerId: fixtureValue(passer).id,
      catcherId: fixtureValue(catcher).id,
      action: "pass",
      position: { x: 2, y: 1 },
    });

    const stats = fixtureValue(resumed.matchStats
      .summary(resumed.teams[0].players)
      .players.find((entry) => entry.playerId === fixtureValue(passer).id));
    expect(stats.completions).toBe(2);
  });
});
