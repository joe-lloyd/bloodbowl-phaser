import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { SCENARIOS } from "../../src/data/scenarios";
import { Inducement } from "../../src/types/Inducements";
import { createMatchSave } from "../../src/headless/serialization";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import { TeamFactory } from "../../src/game/TeamFactory";
import { RosterName } from "../../src/types/Team";
import { GamePhase } from "../../src/types/GameState";

const scrimmage = fixtureValue(
  SCENARIOS.find((s) => s.id === "basic-scrimmage")
);

function newGame(): HeadlessGame {
  return new HeadlessGame({ scenario: scrimmage, seed: 1 });
}

describe("headless pregame inducement commands", () => {
  it("offer-inducements reports each team's Sevens catalogue", async () => {
    const game = newGame();
    const response = await game.execute({ type: "offer-inducements" });
    expect(response.ok).toBe(true);
    const offer = fixtureValue(response.inducementOffer);
    expect(
      fixtureValue(offer.catalogs[game.ctx.teams[0].id]).map((e) => e.inducement)
    ).toEqual([
      Inducement.TEMP_AGENCY_CHEERLEADER,
      Inducement.PART_TIME_ASSISTANT_COACH,
      Inducement.BLITZERS_BEST_KEGS,
      Inducement.PRAYERS_TO_NUFFLE,
      Inducement.EXTRA_TEAM_TRAINING,
      Inducement.BRIBE,
      Inducement.WANDERING_APOTHECARY,
      Inducement.HALFLING_MASTER_CHEF,
      Inducement.DESPERATE_MEASURES,
    ]);
    expect(
      fixtureValue(offer.catalogs[game.ctx.teams[0].id]).find(
        (e) => e.inducement === Inducement.EXTRA_TEAM_TRAINING
      )
    ).toEqual({
      inducement: Inducement.EXTRA_TEAM_TRAINING,
      price: 125_000,
      maxCount: 6,
    });
  });

  it("selecting a legal quantity within budget succeeds and is reflected in the offer", async () => {
    const game = newGame();
    game.ctx.teams[1].rerolls = 6;
    const response = await game.execute({
      type: "select-inducement",
      teamId: game.ctx.teams[0].id,
      inducement: Inducement.EXTRA_TEAM_TRAINING,
      quantity: 1,
    });
    expect(response.ok).toBe(true);

    const listed = await game.execute({ type: "offer-inducements" });
    const offer = fixtureValue(listed.inducementOffer);
    expect(offer.selections[game.ctx.teams[0].id]).toEqual([
      { inducement: Inducement.EXTRA_TEAM_TRAINING, quantity: 1 },
    ]);
  });

  it("a selection exceeding the resolved budget is rejected", async () => {
    const game = newGame();
    const response = await game.execute({
      type: "select-inducement",
      teamId: game.ctx.teams[0].id,
      inducement: Inducement.EXTRA_TEAM_TRAINING,
      quantity: 1,
    });
    expect(response.ok).toBe(false);
    expect(response.reason).toContain("budget-exceeded");
  });

  it("a seventh Extra Team Training is rejected even with a large budget", async () => {
    const game = newGame();

    game.ctx.teams[1].rerolls = 12;
    const response = await game.execute({
      type: "select-inducement",
      teamId: game.ctx.teams[0].id,
      inducement: Inducement.EXTRA_TEAM_TRAINING,
      quantity: 7,
    });
    expect(response.ok).toBe(false);
    expect(response.reason).toContain("quantity-exceeds-limit");
  });

  it("a forged Star Player selection is rejected", async () => {
    const game = newGame();
    game.ctx.teams[1].rerolls = 6;
    const response = await game.execute({
      type: "select-inducement",
      teamId: game.ctx.teams[0].id,
      inducement: Inducement.STAR_PLAYER,
      quantity: 1,
    });
    expect(response.ok).toBe(false);
    expect(response.reason).toContain("star-players-unavailable-in-sevens");
  });

  it("removes a selection back to zero", async () => {
    const game = newGame();
    game.ctx.teams[1].rerolls = 6;
    await game.execute({
      type: "select-inducement",
      teamId: game.ctx.teams[0].id,
      inducement: Inducement.EXTRA_TEAM_TRAINING,
      quantity: 1,
    });
    const removed = await game.execute({
      type: "remove-inducement",
      teamId: game.ctx.teams[0].id,
      inducement: Inducement.EXTRA_TEAM_TRAINING,
    });
    expect(removed.ok).toBe(true);
    const offer = removed.inducementOffer;
    expect(offer).toBeUndefined();
    const listed = await game.execute({ type: "offer-inducements" });
    const check = fixtureValue(listed.inducementOffer);
    expect(check.selections[game.ctx.teams[0].id]).toEqual([]);
  });

  it("commits inventory into match state only once both teams confirm", async () => {
    const game = newGame();
    game.ctx.teams[1].rerolls = 6;
    await game.execute({
      type: "select-inducement",
      teamId: game.ctx.teams[0].id,
      inducement: Inducement.EXTRA_TEAM_TRAINING,
      quantity: 1,
    });

    const firstConfirm = await game.execute({
      type: "confirm-inducements",
      teamId: game.ctx.teams[0].id,
    });
    expect(firstConfirm.ok).toBe(true);
    expect(
      game.ctx.gameService.getState().inducements?.inventory ?? []
    ).toEqual([]);

    const secondConfirm = await game.execute({
      type: "confirm-inducements",
      teamId: game.ctx.teams[1].id,
    });
    expect(secondConfirm.ok).toBe(true);
    const inventory = fixtureValue(
      game.ctx.gameService.getState().inducements
    ).inventory;
    expect(inventory).toHaveLength(1);
    expect(inventory[0]).toMatchObject({
      inducement: Inducement.EXTRA_TEAM_TRAINING,
      ownerTeamId: game.ctx.teams[0].id,
      quantity: 1,
      remainingUses: 1,
      price: 125_000,
    });
  });

  it("a confirmed inventory survives save/restore without recharging", async () => {
    const game = newGame();
    game.ctx.teams[1].rerolls = 6;
    await game.execute({
      type: "select-inducement",
      teamId: game.ctx.teams[0].id,
      inducement: Inducement.EXTRA_TEAM_TRAINING,
      quantity: 1,
    });
    await game.execute({
      type: "confirm-inducements",
      teamId: game.ctx.teams[0].id,
    });
    await game.execute({
      type: "confirm-inducements",
      teamId: game.ctx.teams[1].id,
    });

    const save = createMatchSave({
      state: game.ctx.gameService.getState(),
      teams: [game.ctx.teams[0], game.ctx.teams[1]],
      drive: {
        kickingTeamId: game.ctx.teams[0].id,
        receivingTeamId: game.ctx.teams[1].id,
      },
      rng: game.ctx.rng.captureState(),
      matchStats: game.ctx.matchStats.captureState(),
    });

    const resumed = new HeadlessGame({ matchSave: save });
    const inventory = fixtureValue(
      resumed.ctx.gameService.getState().inducements
    ).inventory;
    expect(inventory).toHaveLength(1);
    expect(fixtureValue(inventory[0]).remainingUses).toBe(1);
    expect(fixtureValue(inventory[0]).ownerTeamId).toBe(game.ctx.teams[0].id);
  });
});

function matchedPlayTeam(id: string) {
  const team = stabilizeIds(
    TeamFactory.createTestTeam(RosterName.HUMAN, id, 0xcc0000),
    id
  );
  team.advancementMode = "matched-play";
  return team;
}

describe("Matched Play inducements (MP2)", () => {
  it("brings the draft list's inducements into the match with no pregame step", () => {
    const team1 = matchedPlayTeam("team1");
    team1.draftInducements = [{ inducement: Inducement.BRIBE, quantity: 2 }];
    const game = new HeadlessGame({
      scenario: scrimmage,
      seed: 1,
      teams: [team1, matchedPlayTeam("team2")],
    });

    expect(game.ctx.gameService.getState().inducements?.inventory).toEqual([
      {
        inducement: Inducement.BRIBE,
        ownerTeamId: "team1",
        quantity: 2,
        remainingUses: 2,
        price: 200_000,
        provenance: "purchased",
      },
    ]);
  });

  it("brings only the draft list items a Street Bowl match sells (SB-D5)", () => {
    const team1 = matchedPlayTeam("team1");
    team1.draftInducements = [
      { inducement: Inducement.BLITZERS_BEST_KEGS, quantity: 1 },
      { inducement: Inducement.BRIBE, quantity: 1 },
    ];
    const game = new HeadlessGame({
      seed: 1,
      teams: [team1, matchedPlayTeam("team2")],
      startingPhase: GamePhase.SETUP,
      format: { gameType: "street-bowl", venue: "street" },
    });

    expect(game.ctx.gameService.getState().inducements?.inventory ?? []).toEqual(
      []
    );
  });

  it("offers no petty cash, even to the lower-value team", async () => {
    const team2 = matchedPlayTeam("team2");
    team2.rerolls += 3;
    const game = new HeadlessGame({
      scenario: scrimmage,
      seed: 1,
      teams: [matchedPlayTeam("team1"), team2],
    });

    const response = await game.execute({
      type: "select-inducement",
      teamId: "team1",
      inducement: Inducement.PRAYERS_TO_NUFFLE,
      quantity: 1,
    });

    expect(response.reason).toBe("command-failed: budget-exceeded:5000>0");
  });
});
