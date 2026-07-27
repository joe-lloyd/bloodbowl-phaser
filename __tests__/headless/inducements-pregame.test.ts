import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { SCENARIOS } from "../../src/data/scenarios";
import { Inducement } from "../../src/types/Inducements";
import { createMatchSave } from "../../src/headless/serialization";

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
  it("offer-inducements reports the Sevens catalog with no Star Player", async () => {
    const game = newGame();
    const response = await game.execute({ type: "offer-inducements" });
    expect(response.ok).toBe(true);
    const offer = response.inducementOffer!;
    expect(offer.profile.starPlayersAllowed).toBe(false);
    expect(
      offer.profile.catalog.some((e) => e.inducement === Inducement.STAR_PLAYER)
    ).toBe(false);
    expect(offer.profile.extraTeamTraining).toEqual({
      price: 150_000,
      maxCount: 8,
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

  it("a ninth Extra Team Training is rejected even with a large budget", async () => {
    const game = newGame();
    // Force a budget by inflating team2's treasury-independent TV (rerolls).
    game.ctx.team2.rerolls = 6;
    const response = await game.execute({
      type: "select-inducement",
      teamId: game.ctx.team1.id,
      inducement: Inducement.EXTRA_TEAM_TRAINING,
      quantity: 9,
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
      price: 150_000,
    });
  });

  it("resetDriveState refills drive-scoped uses but leaves match-scoped ones alone", async () => {
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

    const state = game.ctx.gameService.getState();
    // Extra Team Training is match-scoped; simulate a drive-scoped grant
    // alongside it to prove resetDriveState only refills the latter.
    state.inducements!.inventory.push({
      inducement: Inducement.WANDERING_APOTHECARY,
      ownerTeamId: game.ctx.team1.id,
      quantity: 1,
      remainingUses: 0,
      price: 50_000,
      provenance: "free",
      duration: "drive",
    });
    state.inducements!.inventory[0].remainingUses = 0; // spend the match-scoped one

    game.ctx.gameService.resetDriveState();

    const inventory = game.ctx.gameService.getState().inducements!.inventory;
    const ett = inventory.find(
      (e) => e.inducement === Inducement.EXTRA_TEAM_TRAINING
    )!;
    const drive = inventory.find(
      (e) => e.inducement === Inducement.WANDERING_APOTHECARY
    )!;
    expect(ett.remainingUses).toBe(0); // match-scoped: still spent
    expect(drive.remainingUses).toBe(1); // drive-scoped: refilled
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
