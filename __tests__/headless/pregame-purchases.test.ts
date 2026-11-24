import { fixtureValue } from "../../src/testing/fixtureValue";
import { pregameGame } from "../utils/pregameGame";
import { describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { deserializeGameState } from "../../src/headless/serialization";
import { SubPhase } from "../../src/types/GameState";
import { Inducement } from "../../src/types/Inducements";

async function ready(game: HeadlessGame) {
  for (const team of [game.ctx.team2, game.ctx.team1])
    expect(
      (await game.execute({ type: "ready-weather", teamId: team.id })).ok
    ).toBe(true);
}

const team2Confirms = { type: "confirm-inducements", teamId: "team2" } as const;
const buyTraining = {
  type: "select-inducement",
  teamId: "team1",
  inducement: Inducement.EXTRA_TEAM_TRAINING,
  quantity: 1,
};

describe("graphical match pregame through the protocol", () => {
  it("requires both ready and the coach with petty cash confirmed before any coin toss or setup mutation", async () => {
    const game = pregameGame();
    const rng = game.ctx.rng.captureState();
    expect((await game.execute(buyTraining)).reason).toContain(
      "teams-not-ready"
    );
    expect((await game.execute({ type: "coin-flip" })).ok).toBe(false);
    expect(game.ctx.rng.captureState()).toEqual(rng);
    expect(
      (await game.execute({ type: "start-setup", kickingTeamId: "team2" })).ok
    ).toBe(false);
    expect(game.driveKickingTeamId()).toBeNull();
    await ready(game);

    expect(game.snapshot().pregameInducements?.offer?.confirmed).toEqual({
      team1: false,
      team2: true,
    });
    expect((await game.execute(team2Confirms)).ok).toBe(true);
    expect(
      (await game.execute({ type: "start-setup", kickingTeamId: "team2" })).ok
    ).toBe(false);
    expect((await game.execute(buyTraining)).ok).toBe(true);
    await game.execute({ type: "confirm-inducements", teamId: "team1" });
    expect(game.snapshot().inducements?.inventory).toEqual([
      expect.objectContaining({
        inducement: Inducement.EXTRA_TEAM_TRAINING,
        quantity: 1,
        ownerTeamId: "team1",
      }),
    ]);
    expect(
      (await game.execute({ type: "start-setup", kickingTeamId: "team2" })).ok
    ).toBe(true);
    expect(game.snapshot().subPhase).toBe(SubPhase.SETUP_KICKING);
  });

  it("restores one coach's locked purchases and the other coach's readiness", async () => {
    const original = pregameGame();
    await ready(original);
    await original.execute(team2Confirms);
    await original.execute(buyTraining);
    const snapshot = original.snapshot();
    const game = new HeadlessGame({
      team1: structuredClone(original.ctx.team1),
      team2: structuredClone(original.ctx.team2),
      initialState: deserializeGameState(snapshot),
      seed: 23,
    });
    expect(game.ctx.gameService.getInducementOffer()).toEqual(
      original.ctx.gameService.getInducementOffer()
    );

    expect(
      (await game.execute({ ...buyTraining, teamId: "team2" })).reason
    ).toContain("not-your-turn-to-buy");
    await game.execute({ type: "confirm-inducements", teamId: "team1" });
    expect(game.snapshot().pregameInducements?.complete).toBe(true);
    expect(game.snapshot().inducements?.inventory).toHaveLength(1);
    fixtureValue(
      fixtureValue(game.ctx.gameService.getState().inducements).inventory[0]
    ).remainingUses = 0;
    await game.execute({ type: "confirm-inducements", teamId: "team1" });
    expect(
      fixtureValue(game.snapshot().inducements?.inventory[0]).remainingUses
    ).toBe(0);
    expect((await game.execute(buyTraining)).ok).toBe(false);
  });

  it("defers draft loading, preserves zero Matched Play petty cash, and loads its list once", async () => {
    const game = pregameGame(true);
    expect(game.snapshot().inducements).toBeUndefined();
    await ready(game);
    expect(game.ctx.gameService.getInducementOffer().budgets["team1"]).toBe(0);

    expect(game.ctx.gameService.getInducementOffer().budgets["team2"]).toBe(0);
    expect(game.snapshot().pregameInducements?.buyOrder).toEqual([
      "team2",
      "team1",
    ]);
    expect(game.snapshot().pregameInducements?.complete).toBe(true);
    expect((await game.execute(buyTraining)).ok).toBe(false);
    expect(game.snapshot().inducements?.inventory).toHaveLength(1);
    expect(
      fixtureValue(game.snapshot().inducements?.inventory[0]).quantity
    ).toBe(1);
    await game.execute({ type: "confirm-inducements", teamId: "team1" });
    expect(game.snapshot().inducements?.inventory).toHaveLength(1);
  });

  it("passes a broke coach when an older save left them at the purchases", async () => {
    const original = pregameGame();
    await ready(original);
    const snapshot = original.snapshot();
    fixtureValue(snapshot.pregameInducements?.offer).confirmed["team2"] = false;
    const game = new HeadlessGame({
      team1: structuredClone(original.ctx.team1),
      team2: structuredClone(original.ctx.team2),
      initialState: deserializeGameState(snapshot),
      seed: 23,
    });
    expect(game.snapshot().pregameInducements?.offer?.confirmed).toEqual({
      team1: false,
      team2: true,
    });
    expect((await game.execute(buyTraining)).ok).toBe(true);
  });

  it.each(["sevens", "street-bowl", "beach-bowl", "gutter-bowl"] as const)(
    "finishes the purchases of a %s match nobody can afford to buy in",
    async (gameType) => {
      const game = pregameGame(false, gameType);
      game.ctx.team2.rerolls = game.ctx.team1.rerolls;
      await ready(game);
      expect(game.snapshot().pregameInducements?.complete).toBe(true);
      if (gameType === "street-bowl")
        expect(game.pendingDecision()?.type).toBe("inducement-choice");
      else expect(game.pendingDecision()).toBeNull();
    }
  );

  it("resolves bought prayer choices before allowing setup", async () => {
    const game = pregameGame();
    await ready(game);
    await game.execute(team2Confirms);
    vi.spyOn(game.ctx.rng, "rollDie").mockReturnValue(3);
    await game.execute({
      ...buyTraining,
      inducement: Inducement.PRAYERS_TO_NUFFLE,
    });
    expect(
      (
        await game.execute({
          ...buyTraining,
          inducement: Inducement.DESPERATE_MEASURES,
        })
      ).ok
    ).toBe(true);
    const confirmed = await game.execute({
      type: "confirm-inducements",
      teamId: "team1",
    });
    expect(confirmed.pendingDecision?.type).toBe("inducement-choice");
    const service = game.ctx.gameService;
    const before = game.snapshot();
    const rng = game.ctx.rng.captureState();

    expect(() => service.tossCoin()).toThrow("inducements-not-confirmed");
    expect(() => {
      service.startSetup("team2");
    }).toThrow("inducements-not-confirmed");
    expect(game.ctx.rng.captureState()).toEqual(rng);
    expect(game.snapshot()).toEqual(before);
    expect(() => game.matchSave()).toThrow("Finish pregame choices");
    expect(
      (await game.execute({ type: "start-setup", kickingTeamId: "team2" })).ok
    ).toBe(false);
    const pending = game.pendingDecision();
    if (pending?.type !== "inducement-choice")
      throw new Error("missing prayer choice");
    const playerId = pending.playerIds[0];
    const armour = fixtureValue(
      game.ctx.gameService.getPlayerById(fixtureValue(playerId))
    ).stats.AV;
    await game.execute({ type: "choose-inducement", playerId });
    expect(
      fixtureValue(game.ctx.gameService.getPlayerById(fixtureValue(playerId)))
        .stats.AV
    ).toBe(armour + 1);
    const hangover = game.pendingDecision();
    if (hangover?.type !== "inducement-choice" || hangover.kind !== "hangover")
      throw new Error("missing Hangover choice");
    expect(() => game.matchSave()).toThrow("Finish pregame choices");
    expect(() => service.tossCoin()).toThrow("inducements-not-confirmed");
    await game.execute({
      type: "choose-inducement",
      playerId: hangover.playerIds[0],
    });
    expect(game.snapshot().pregameInducements?.resolving).toBe(false);
    expect(game.matchSave().snapshot.pregameInducements?.resolving).toBe(false);
    expect(
      game.matchSave().snapshot.driveEffects?.playerModifiers[
        fixtureValue(hangover.playerIds[0])
      ]?.confinedToReserves
    ).toBe(true);
    expect(
      (await game.execute({ type: "start-setup", kickingTeamId: "team2" })).ok
    ).toBe(true);
  });
});
