import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { SCENARIOS } from "../../src/data/scenarios";
import { Inducement, PrayerToNuffle } from "../../src/types/Inducements";
import { SkillType, hasSkill } from "../../src/types/Skills";
import { forceDice } from "../utils/test-helpers";
import { bought, commit } from "../utils/inducement-helpers";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";

/**
 * Sevens Prayers to Nuffle (L4, rules L12 to L19): each prayer bought rolls
 * a D8, duplicates re-rolled, before the first set-up. Every die is forced.
 */

const scrimmage = SCENARIOS.find((s) => s.id === "basic-scrimmage")!;

function prayersOf(game: HeadlessGame, teamId: string): PrayerToNuffle[] {
  return (
    game.ctx.gameService.getState().matchInducements?.prayers[teamId] ?? []
  );
}

describe("Prayers to Nuffle (D8)", () => {
  it("re-rolls a prayer the team already has and grants Stiletto and Blessing to random players", async () => {
    const game = new HeadlessGame({ scenario: scrimmage, seed: 1 });
    const team1 = game.ctx.team1;
    // D8 2 = Stiletto; D8 2 again is a duplicate, re-rolled into 5 =
    // Blessing of Nuffle. Then a D16 per random pick: 1 and 2.
    forceDice(game.ctx.rng, [2, 2, 5, 1, 2]);
    await commit(game, [bought(team1.id, Inducement.PRAYERS_TO_NUFFLE, 2)]);

    expect(prayersOf(game, team1.id)).toEqual([
      PrayerToNuffle.STILETTO,
      PrayerToNuffle.BLESSING_OF_NUFFLE,
    ]);
    expect(game.ctx.gameService.getState().inducements?.prayerLog).toEqual([
      {
        teamId: team1.id,
        rejectedRolls: [],
        result: 2,
        prayer: PrayerToNuffle.STILETTO,
      },
      {
        teamId: team1.id,
        rejectedRolls: [2],
        result: 5,
        prayer: PrayerToNuffle.BLESSING_OF_NUFFLE,
      },
    ]);
    expect(hasSkill(team1.players[0].skills, SkillType.STAB)).toBe(true);
    expect(hasSkill(team1.players[1].skills, SkillType.PRO)).toBe(true);
    expect(
      team1.players.filter((p) => hasSkill(p.skills, SkillType.STAB))
    ).toHaveLength(1);
    expect(prayersOf(game, game.ctx.team2.id)).toEqual([]);
  });

  it("rolls prayers bought through the pregame inducement commands", async () => {
    const game = new HeadlessGame({ scenario: scrimmage, seed: 1 });
    const team1 = game.ctx.team1;
    game.ctx.team2.rerolls += 1; // a team value gap gives team 1 petty cash
    const selected = await game.execute({
      type: "select-inducement",
      teamId: team1.id,
      inducement: Inducement.PRAYERS_TO_NUFFLE,
      quantity: 1,
    });
    expect(selected.ok).toBe(true);
    forceDice(game.ctx.rng, [6]); // D8 6 = Moles Under the Pitch
    await game.execute({ type: "confirm-inducements", teamId: team1.id });
    await game.execute({ type: "confirm-inducements", teamId: game.ctx.team2.id });

    expect(prayersOf(game, team1.id)).toEqual([
      PrayerToNuffle.MOLES_UNDER_THE_PITCH,
    ]);
  });

  it("takes granted skills back at full time", async () => {
    const game = new HeadlessGame({ scenario: scrimmage, seed: 1 });
    const team1 = game.ctx.team1;
    forceDice(game.ctx.rng, [2, 1]);
    await commit(game, [bought(team1.id, Inducement.PRAYERS_TO_NUFFLE, 1)]);
    expect(hasSkill(team1.players[0].skills, SkillType.STAB)).toBe(true);

    game.ctx.gameService.getState().turn.isHalf2 = true;
    game.ctx.gameService.endHalf();

    expect(game.ctx.gameService.getState().phase).toBe("GAME_OVER");
    expect(hasSkill(team1.players[0].skills, SkillType.STAB)).toBe(false);
  });
});

const openField: Scenario = {
  id: "prayers-open-field",
  name: "Open field",
  description: "a runner with room to Rush, a fouler beside a Prone opponent",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 1, y: 5 },
      { playerIndex: 1, x: 10, y: 8 },
    ],
    team2Placements: [
      { playerIndex: 0, x: 11, y: 8, status: PlayerStatus.PRONE },
      { playerIndex: 1, x: 18, y: 1 },
    ],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 19, y: 10 },
  },
};

/** Move the runner one square past their MA: a single Rush on the last step. */
async function rushOnce(game: HeadlessGame) {
  const runner = game.ctx.team1.players[0];
  const path = Array.from({ length: runner.stats.MA + 1 }, (_, i) => ({
    x: 2 + i,
    y: 5,
  }));
  await game.execute({
    type: "declare-action",
    playerId: runner.id,
    action: "move",
  });
  let response = await game.execute({
    type: "move",
    playerId: runner.id,
    path,
  });
  if (response.pendingDecision?.type === "reroll") {
    response = await game.execute({ type: "use-reroll", accept: false });
  }
  return runner;
}

describe("prayers that change the rules", () => {
  it("Moles Under the Pitch makes a Rush of 2 fail for the opposition only", async () => {
    const game = new HeadlessGame({ scenario: openField, seed: 3 });
    // Team 2 prays: D8 6 = Moles. Then team 1's Rush rolls a 2.
    forceDice(game.ctx.rng, [6]);
    await commit(game, [
      bought(game.ctx.team2.id, Inducement.PRAYERS_TO_NUFFLE, 1),
    ]);
    forceDice(game.ctx.rng, [2, 1, 1]);
    const runner = await rushOnce(game);
    expect(runner.status).toBe(PlayerStatus.PRONE);
  });

  it("a team's own Moles leave its Rushes alone", async () => {
    const game = new HeadlessGame({ scenario: openField, seed: 3 });
    forceDice(game.ctx.rng, [6]);
    await commit(game, [
      bought(game.ctx.team1.id, Inducement.PRAYERS_TO_NUFFLE, 1),
    ]);
    forceDice(game.ctx.rng, [2]);
    const runner = await rushOnce(game);
    expect(runner.status).toBe(PlayerStatus.ACTIVE);
    expect(runner.gridPosition).toEqual({ x: 2 + runner.stats.MA, y: 5 });
  });

  it("Under Scrutiny sends off a fouler who breaks armour without a double", async () => {
    const game = new HeadlessGame({ scenario: openField, seed: 3 });
    forceDice(game.ctx.rng, [7]);
    await commit(game, [
      bought(game.ctx.team2.id, Inducement.PRAYERS_TO_NUFFLE, 1),
    ]);
    const fouler = game.ctx.team1.players[1];
    // Armour 5+6 breaks, Injury 2+3 Stunned, Argue the Call 1.
    forceDice(game.ctx.rng, [5, 6, 2, 3, 1]);
    await game.execute({
      type: "declare-action",
      playerId: fouler.id,
      action: "foul",
    });
    await game.execute({ type: "foul", playerId: fouler.id, x: 11, y: 8 });
    expect(fouler.status).toBe(PlayerStatus.REMOVED);
  });

  it("without Under Scrutiny the same Foul goes unseen", async () => {
    const game = new HeadlessGame({ scenario: openField, seed: 3 });
    const fouler = game.ctx.team1.players[1];
    forceDice(game.ctx.rng, [5, 6, 2, 3, 1]);
    await game.execute({
      type: "declare-action",
      playerId: fouler.id,
      action: "foul",
    });
    await game.execute({ type: "foul", playerId: fouler.id, x: 11, y: 8 });
    expect(fouler.status).toBe(PlayerStatus.ACTIVE);
  });
});

describe("prayers that ask the coach", () => {
  it("Iron Man gives the chosen player +1 AV, refusing a player not offered", async () => {
    const game = new HeadlessGame({ scenario: scrimmage, seed: 1 });
    const team1 = game.ctx.team1;
    const chosen = team1.players[2];
    const av = chosen.stats.AV;
    forceDice(game.ctx.rng, [3]);
    await commit(game, [bought(team1.id, Inducement.PRAYERS_TO_NUFFLE, 1)]);

    expect(game.pendingDecision()).toMatchObject({
      type: "inducement-choice",
      kind: "iron-man",
      chooserTeamId: team1.id,
      optional: false,
    });
    const refused = await game.execute({
      type: "choose-inducement",
      playerId: game.ctx.team2.players[0].id,
    });
    expect(refused.ok).toBe(false);

    const answered = await game.execute({
      type: "choose-inducement",
      playerId: chosen.id,
    });
    expect(answered.ok).toBe(true);
    expect(answered.pendingDecision).toBeNull();
    expect(chosen.stats.AV).toBe(av + 1);
  });

  it("Knuckle Dusters gives the chosen player Mighty Blow", async () => {
    const game = new HeadlessGame({ scenario: scrimmage, seed: 1 });
    const team2 = game.ctx.team2;
    forceDice(game.ctx.rng, [4]);
    await commit(game, [bought(team2.id, Inducement.PRAYERS_TO_NUFFLE, 1)]);

    expect(game.pendingDecision()).toMatchObject({
      kind: "knuckle-dusters",
      chooserTeamId: team2.id,
    });
    await game.execute({
      type: "choose-inducement",
      playerId: team2.players[1].id,
    });
    expect(hasSkill(team2.players[1].skills, SkillType.MIGHTY_BLOW)).toBe(true);
  });

  it("Intensive Training lets the coach pick a Primary skill for a random player", async () => {
    const game = new HeadlessGame({ scenario: scrimmage, seed: 1 });
    const team1 = game.ctx.team1;
    // D8 8 = Intensive Training; D16 1 picks the first player.
    forceDice(game.ctx.rng, [8, 1]);
    await commit(game, [bought(team1.id, Inducement.PRAYERS_TO_NUFFLE, 1)]);

    const pending = game.pendingDecision();
    expect(pending).toMatchObject({
      kind: "intensive-training",
      playerIds: [team1.players[0].id],
    });
    const skills =
      pending?.type === "inducement-choice" ? (pending.skills ?? []) : [];
    expect(skills).toContain(SkillType.BLOCK);
    expect(skills).not.toContain(SkillType.STAB);

    const noSkill = await game.execute({
      type: "choose-inducement",
      playerId: team1.players[0].id,
    });
    expect(noSkill.ok).toBe(false);
    await game.execute({
      type: "choose-inducement",
      playerId: team1.players[0].id,
      skill: SkillType.BLOCK,
    });
    expect(hasSkill(team1.players[0].skills, SkillType.BLOCK)).toBe(true);
  });
});
