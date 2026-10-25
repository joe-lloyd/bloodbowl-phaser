import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { SCENARIOS } from "../../src/data/scenarios";
import { Inducement } from "../../src/types/Inducements";
import { createMatchSave } from "../../src/headless/serialization";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import { TeamFactory } from "../../src/game/TeamFactory";
import { RosterName } from "../../src/types/Team";

/**
 * Sevens pregame inducement selection over the headless protocol (tasks.md
 * 2.1-2.6): offer/select/remove/confirm commands, authoritative budget and
 * catalog enforcement, and commit into match state once both teams confirm.
 */

const scrimmage = SCENARIOS.find((s) => s.id === "basic-scrimmage")!;

function newGame(seed = 1): HeadlessGame {
  return new HeadlessGame({ scenario: scrimmage, seed });
}

describe("headless pregame inducement commands", () => {
  it("offer-inducements reports each team's Sevens catalogue", async () => {
    const game = newGame();
    const response = await game.execute({ type: "offer-inducements" });
    expect(response.ok).toBe(true);
    const offer = response.inducementOffer!;
    expect(
      offer.catalogs[game.ctx.team1.id].map((e) => e.inducement)
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
      offer.catalogs[game.ctx.team1.id].find(
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
    game.ctx.team2.rerolls = 6; // gives team1 a petty-cash budget
    const response = await game.execute({
      type: "select-inducement",
      teamId: game.ctx.team1.id,
      inducement: Inducement.EXTRA_TEAM_TRAINING,
      quantity: 1,
    });
    expect(response.ok).toBe(true);

    const offer = (await game.execute({ type: "offer-inducements" }))
      .inducementOffer!;
    expect(offer.selections[game.ctx.team1.id]).toEqual([
      { inducement: Inducement.EXTRA_TEAM_TRAINING, quantity: 1 },
    ]);
  });

  it("a selection exceeding the resolved budget is rejected", async () => {
    const game = newGame(); // both teams start at equal TV: budget 0 each
    const response = await game.execute({
      type: "select-inducement",
      teamId: game.ctx.team1.id,
      inducement: Inducement.EXTRA_TEAM_TRAINING,
      quantity: 1,
    });
    expect(response.ok).toBe(false);
    expect(response.reason).toContain("budget-exceeded");
  });

  it("a seventh Extra Team Training is rejected even with a large budget", async () => {
    const game = newGame();
    // Force a budget by inflating team2's treasury-independent TV (rerolls).
    game.ctx.team2.rerolls = 12;
    const response = await game.execute({
      type: "select-inducement",
      teamId: game.ctx.team1.id,
      inducement: Inducement.EXTRA_TEAM_TRAINING,
      quantity: 7,
    });
    expect(response.ok).toBe(false);
    expect(response.reason).toContain("quantity-exceeds-limit");
  });

  it("a forged Star Player selection is rejected", async () => {
    const game = newGame();
    game.ctx.team2.rerolls = 6; // give team1 a budget
    const response = await game.execute({
      type: "select-inducement",
      teamId: game.ctx.team1.id,
      inducement: Inducement.STAR_PLAYER,
      quantity: 1,
    });
    expect(response.ok).toBe(false);
    expect(response.reason).toContain("star-players-unavailable-in-sevens");
  });

  it("removes a selection back to zero", async () => {
    const game = newGame();
    game.ctx.team2.rerolls = 6;
    await game.execute({
      type: "select-inducement",
      teamId: game.ctx.team1.id,
      inducement: Inducement.EXTRA_TEAM_TRAINING,
      quantity: 1,
    });
    const removed = await game.execute({
      type: "remove-inducement",
      teamId: game.ctx.team1.id,
      inducement: Inducement.EXTRA_TEAM_TRAINING,
    });
    expect(removed.ok).toBe(true);
    const offer = removed.inducementOffer;
    expect(offer).toBeUndefined(); // remove-inducement is a mutation, not a query
    const check = (await game.execute({ type: "offer-inducements" }))
      .inducementOffer!;
    expect(check.selections[game.ctx.team1.id]).toEqual([]);
  });

  it("commits inventory into match state only once both teams confirm", async () => {
    const game = newGame();
    game.ctx.team2.rerolls = 6; // team1 gets a budget
    await game.execute({
      type: "select-inducement",
      teamId: game.ctx.team1.id,
      inducement: Inducement.EXTRA_TEAM_TRAINING,
      quantity: 1,
    });

    const firstConfirm = await game.execute({
      type: "confirm-inducements",
      teamId: game.ctx.team1.id,
    });
    expect(firstConfirm.ok).toBe(true);
    expect(game.ctx.gameService.getState().inducements?.inventory ?? []).toEqual(
      []
    );

    const secondConfirm = await game.execute({
      type: "confirm-inducements",
      teamId: game.ctx.team2.id,
    });
    expect(secondConfirm.ok).toBe(true);
    const inventory = game.ctx.gameService.getState().inducements!.inventory;
    expect(inventory).toHaveLength(1);
    expect(inventory[0]).toMatchObject({
      inducement: Inducement.EXTRA_TEAM_TRAINING,
      ownerTeamId: game.ctx.team1.id,
      quantity: 1,
      remainingUses: 1,
      price: 125_000,
    });
  });

  it("a confirmed inventory survives save/restore without recharging", async () => {
    const game = newGame();
    game.ctx.team2.rerolls = 6;
    await game.execute({
      type: "select-inducement",
      teamId: game.ctx.team1.id,
      inducement: Inducement.EXTRA_TEAM_TRAINING,
      quantity: 1,
    });
    await game.execute({ type: "confirm-inducements", teamId: game.ctx.team1.id });
    await game.execute({ type: "confirm-inducements", teamId: game.ctx.team2.id });

    const save = createMatchSave({
      state: game.ctx.gameService.getState(),
      teams: [game.ctx.team1, game.ctx.team2],
      drive: {
        kickingTeamId: game.ctx.team1.id,
        receivingTeamId: game.ctx.team2.id,
      },
      rng: game.ctx.rng.captureState(),
      matchStats: game.ctx.matchStats.captureState(),
    });

    const resumed = new HeadlessGame({ matchSave: save });
    const inventory = resumed.ctx.gameService.getState().inducements!.inventory;
    expect(inventory).toHaveLength(1);
    expect(inventory[0].remainingUses).toBe(1);
    expect(inventory[0].ownerTeamId).toBe(game.ctx.team1.id);
  });
});

describe("Matched Play inducements (MP2)", () => {
  function matchedPlayTeam(id: string) {
    const team = stabilizeIds(
      TeamFactory.createTestTeam(RosterName.HUMAN, id, 0xcc0000),
      id
    );
    team.advancementMode = "matched-play";
    return team;
  }

  it("brings the draft list's inducements into the match with no pregame step", () => {
    const team1 = matchedPlayTeam("team1");
    team1.draftInducements = [
      { inducement: Inducement.BRIBE, quantity: 2 },
    ];
    const game = new HeadlessGame({
      scenario: scrimmage,
      seed: 1,
      team1,
      team2: matchedPlayTeam("team2"),
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

  it("offers no petty cash, even to the lower-value team", async () => {
    const team2 = matchedPlayTeam("team2");
    team2.rerolls += 3;
    const game = new HeadlessGame({
      scenario: scrimmage,
      seed: 1,
      team1: matchedPlayTeam("team1"),
      team2,
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
