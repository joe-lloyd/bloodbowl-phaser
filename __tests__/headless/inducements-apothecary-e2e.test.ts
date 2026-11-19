import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { InjuryOperation } from "../../src/game/operations/InjuryOperation";
import { SCENARIOS } from "../../src/data/scenarios";
import { Inducement } from "../../src/types/Inducements";
import { PlayerStatus } from "../../src/types/Player";
import {
  createMatchSave,
  deserializeMatchSave,
  serializeMatchSave,
} from "../../src/headless/serialization";

const scrimmage = fixtureValue(
  SCENARIOS.find((s) => s.id === "basic-scrimmage")
);

describe("Sevens inducements + Apothecary — full pregame-to-final-state flow", () => {
  it("selects, confirms, plays through a KO, and reaches a final patched-up state", async () => {
    const game = new HeadlessGame({ scenario: scrimmage, seed: 5 });
    const team1 = game.ctx.team1;
    const team2 = game.ctx.team2;
    team1.apothecary = true;
    team2.rerolls = 6;

    const selectResponse = await game.execute({
      type: "select-inducement",
      teamId: team1.id,
      inducement: Inducement.EXTRA_TEAM_TRAINING,
      quantity: 1,
    });
    expect(selectResponse.ok).toBe(true);

    await game.execute({ type: "confirm-inducements", teamId: team1.id });
    const confirmed = await game.execute({
      type: "confirm-inducements",
      teamId: team2.id,
    });
    expect(confirmed.ok).toBe(true);
    expect(game.ctx.gameService.getState().inducements?.inventory).toHaveLength(
      1
    );

    const player = team1.players[0];
    vi.spyOn(
      game.ctx.gameService.getDiceController(),
      "roll2D6"
    ).mockReturnValue(9);
    game.ctx.gameService.flowManager.add(
      new InjuryOperation(fixtureValue(player).id),
      true
    );
    for (let i = 0; i < 50 && !game.pendingDecision(); i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(game.pendingDecision()?.type).toBe("apothecary");

    const resolved = await game.execute({
      type: "use-apothecary",
      accept: true,
    });
    expect(resolved.ok).toBe(true);
    expect(fixtureValue(player).status).toBe(PlayerStatus.STUNNED);
    expect(
      game.ctx.gameService.getState().inducements?.apothecaryUsed[team1.id]
    ).toBe(true);

    const save = createMatchSave({
      state: game.ctx.gameService.getState(),
      teams: [team1, team2],
      drive: { kickingTeamId: team1.id, receivingTeamId: team2.id },
      rng: game.ctx.rng.captureState(),
      matchStats: game.ctx.matchStats.captureState(),
    });
    const roundTripped = deserializeMatchSave(serializeMatchSave(save));
    expect(roundTripped.snapshot.inducements?.inventory).toHaveLength(1);
    expect(roundTripped.snapshot.inducements?.apothecaryUsed[team1.id]).toBe(
      true
    );
    const restoredPlayer = fixtureValue(
      roundTripped.teams[0].players.find(
        (p) => p.id === fixtureValue(player).id
      )
    );

    expect(restoredPlayer).toBeDefined();

    const resumed = new HeadlessGame({ matchSave: save });
    const resumedPlayer = fixtureValue(
      resumed.ctx.team1.players.find((p) => p.id === fixtureValue(player).id)
    );
    expect(resumedPlayer.status).toBe(PlayerStatus.STUNNED);
    expect(
      resumed.ctx.gameService.getState().inducements?.apothecaryUsed[team1.id]
    ).toBe(true);
    expect(resumed.pendingDecision()).toBeNull();
  });
});
