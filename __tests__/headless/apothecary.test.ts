import { describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { InjuryOperation } from "../../src/game/operations/InjuryOperation";
import { CasualtyOperation } from "../../src/game/operations/CasualtyOperation";
import { CrowdInjuryOperation } from "../../src/game/operations/CrowdInjuryOperation";
import { GameOperation } from "../../src/game/core/GameOperation";
import { SCENARIOS } from "../../src/data/scenarios";
import { PlayerStatus } from "../../src/types/Player";
import { GameEventNames } from "../../src/types/events";
import { createMatchSave } from "../../src/headless/serialization";

/**
 * Sevens Apothecary: the once-per-match, owner-only patch-up decision
 * (tasks.md 4.1-4.6, 5.2, 5.3). Injury/casualty operations are triggered
 * directly against the flow manager (bypassing the block/armour chain,
 * which is exercised elsewhere) so the injury result itself is fully
 * controlled via stubbed dice rolls.
 */

const scrimmage = SCENARIOS.find((s) => s.id === "basic-scrimmage")!;

function newGame(seed = 1): HeadlessGame {
  return new HeadlessGame({ scenario: scrimmage, seed });
}

/** Run an operation and wait until either it settles or a decision pauses it. */
async function runUntilSettledOrDecision(
  game: HeadlessGame,
  op: GameOperation
): Promise<void> {
  game.ctx.gameService.flowManager.add(op, true);
  for (let i = 0; i < 50; i++) {
    if (game.pendingDecision()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function answer(game: HeadlessGame, accept: boolean) {
  const response = await game.execute({ type: "use-apothecary", accept });
  expect(response.ok).toBe(true);
  return response;
}

describe("Sevens Apothecary decision", () => {
  it("offers no decision when the team has no Apothecary", async () => {
    const game = newGame();
    const player = game.ctx.team1.players[0];
    vi.spyOn(game.ctx.gameService.getDiceController(), "roll2D6").mockReturnValue(9); // KO
    await runUntilSettledOrDecision(game, new InjuryOperation(player.id));

    expect(game.pendingDecision()).toBeNull();
    expect(player.status).toBe(PlayerStatus.KO);
  });

  it("declining leaves the Apothecary unused and applies the original KO", async () => {
    const game = newGame();
    game.ctx.team1.apothecary = true;
    const player = game.ctx.team1.players[0];
    vi.spyOn(game.ctx.gameService.getDiceController(), "roll2D6").mockReturnValue(9); // KO

    await runUntilSettledOrDecision(game, new InjuryOperation(player.id));
    const pending = game.pendingDecision();
    expect(pending?.type).toBe("apothecary");
    if (pending?.type !== "apothecary") return;
    expect(pending.chooserTeamId).toBe(game.ctx.team1.id);
    expect(pending.resultKind).toBe("ko");
    expect(pending.location).toBe("pitch");

    await answer(game, false);
    expect(player.status).toBe(PlayerStatus.KO);
    expect(player.gridPosition).toBeUndefined();
    expect(
      game.ctx.gameService.getState().inducements?.apothecaryUsed[
        game.ctx.team1.id
      ]
    ).toBeFalsy();
  });

  it("an on-pitch KO patch-up returns the player Stunned on their square", async () => {
    const game = newGame();
    game.ctx.team1.apothecary = true;
    const player = game.ctx.team1.players[0];
    const square = { ...player.gridPosition! };
    vi.spyOn(game.ctx.gameService.getDiceController(), "roll2D6").mockReturnValue(9); // KO

    await runUntilSettledOrDecision(game, new InjuryOperation(player.id));
    await answer(game, true);

    expect(player.status).toBe(PlayerStatus.STUNNED);
    expect(player.gridPosition).toEqual(square);
    expect(
      game.ctx.gameService.getState().inducements?.apothecaryUsed[
        game.ctx.team1.id
      ]
    ).toBe(true);
  });

  it("a crowd KO patch-up moves the player to Reserves", async () => {
    const game = newGame();
    game.ctx.team1.apothecary = true;
    const player = game.ctx.team1.players[0];
    vi.spyOn(game.ctx.gameService.getDiceController(), "roll2D6").mockReturnValue(9); // KO

    await runUntilSettledOrDecision(
      game,
      new CrowdInjuryOperation(player.id, { x: 0, y: 0 }, false)
    );
    const pending = game.pendingDecision();
    expect(pending?.type).toBe("apothecary");
    if (pending?.type === "apothecary") expect(pending.location).toBe("crowd");

    await answer(game, true);
    expect(player.status).toBe(PlayerStatus.RESERVE);
    expect(player.gridPosition).toBeUndefined();
  });

  for (const [rollTotal, label, initialStatus] of [
    [3, "Badly Hurt", PlayerStatus.INJURED],
    [9, "Seriously Hurt", PlayerStatus.INJURED],
    [16, "Dead", PlayerStatus.DEAD],
  ] as const) {
    it(`offers a patch-up for ${label} and succeeds on a 4+ roll`, async () => {
      const game = newGame();
      game.ctx.team1.apothecary = true;
      const player = game.ctx.team1.players[0];
      vi.spyOn(
        game.ctx.gameService.getDiceController(),
        "rollD16"
      ).mockReturnValue(rollTotal);
      vi.spyOn(game.ctx.gameService.getDiceController(), "rollD6").mockReturnValue(4); // success

      await runUntilSettledOrDecision(game, new CasualtyOperation(player.id));
      const pending = game.pendingDecision();
      expect(pending?.type).toBe("apothecary");
      if (pending?.type === "apothecary") {
        expect(pending.resultKind).toBe("casualty");
      }

      await answer(game, true);
      expect(player.status).toBe(PlayerStatus.RESERVE);
    });

    it(`a failed patch-up (1-3) for ${label} keeps the original result`, async () => {
      const game = newGame();
      game.ctx.team1.apothecary = true;
      const player = game.ctx.team1.players[0];
      vi.spyOn(
        game.ctx.gameService.getDiceController(),
        "rollD16"
      ).mockReturnValue(rollTotal);
      vi.spyOn(game.ctx.gameService.getDiceController(), "rollD6").mockReturnValue(2); // fail

      await runUntilSettledOrDecision(game, new CasualtyOperation(player.id));
      await answer(game, true);

      expect(player.status).toBe(initialStatus);
      // The Apothecary is still consumed even on a failed patch-up.
      expect(
        game.ctx.gameService.getState().inducements?.apothecaryUsed[
          game.ctx.team1.id
        ]
      ).toBe(true);
    });
  }

  it("Serious Injury and Lasting Injury are not eligible for a patch-up", async () => {
    for (const roll of [11, 13]) {
      const game = newGame();
      game.ctx.team1.apothecary = true;
      const player = game.ctx.team1.players[0];
      vi.spyOn(
        game.ctx.gameService.getDiceController(),
        "rollD16"
      ).mockReturnValue(roll);

      await runUntilSettledOrDecision(game, new CasualtyOperation(player.id));
      expect(game.pendingDecision()).toBeNull();
      expect(player.status).toBe(PlayerStatus.INJURED);
    }
  });

  it("is offered once per match: a used Apothecary offers nothing further", async () => {
    const game = newGame();
    game.ctx.team1.apothecary = true;
    const first = game.ctx.team1.players[0];
    const second = game.ctx.team1.players[1];
    vi.spyOn(game.ctx.gameService.getDiceController(), "roll2D6").mockReturnValue(9); // KO

    await runUntilSettledOrDecision(game, new InjuryOperation(first.id));
    expect(game.pendingDecision()?.type).toBe("apothecary");
    await answer(game, true);

    await runUntilSettledOrDecision(game, new InjuryOperation(second.id));
    expect(game.pendingDecision()).toBeNull();
    expect(second.status).toBe(PlayerStatus.KO);
  });

  it("resolving the decision a second time has no effect (idempotent)", async () => {
    const game = newGame();
    game.ctx.team1.apothecary = true;
    const player = game.ctx.team1.players[0];
    vi.spyOn(game.ctx.gameService.getDiceController(), "roll2D6").mockReturnValue(9);

    await runUntilSettledOrDecision(game, new InjuryOperation(player.id));
    await answer(game, true);
    expect(player.status).toBe(PlayerStatus.STUNNED);

    const repeat = await game.execute({ type: "use-apothecary", accept: false });
    expect(repeat.ok).toBe(false);
    expect(player.status).toBe(PlayerStatus.STUNNED); // untouched by the repeat
  });

  it("determinism: identical seed + answer produce identical outcomes", async () => {
    const run = async () => {
      const game = newGame(77);
      game.ctx.team1.apothecary = true;
      const player = game.ctx.team1.players[0];
      vi.spyOn(
        game.ctx.gameService.getDiceController(),
        "rollD16"
      ).mockReturnValue(3);
      await runUntilSettledOrDecision(game, new CasualtyOperation(player.id));
      const response = await answer(game, true);
      return JSON.stringify(response.snapshot);
    };
    const a = await run();
    const b = await run();
    expect(a).toBe(b);
  });
});

describe("Sevens Apothecary decision — save and resume", () => {
  it("a pending decision survives a save/restore without re-rolling", async () => {
    const game = newGame();
    game.ctx.team1.apothecary = true;
    const player = game.ctx.team1.players[0];
    vi.spyOn(game.ctx.gameService.getDiceController(), "roll2D6").mockReturnValue(9); // KO

    await runUntilSettledOrDecision(game, new InjuryOperation(player.id));
    const original = game.pendingDecision();
    expect(original?.type).toBe("apothecary");

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
    expect(resumed.pendingDecision()).toEqual(original);

    const diceBefore = resumed.snapshot();
    const response = await resumed.execute({
      type: "use-apothecary",
      accept: true,
    });
    expect(response.ok).toBe(true);
    // No fresh Injury Roll happened on resume — only the resolution itself.
    expect(
      response.events.some(
        (e) =>
          e.name === GameEventNames.DiceRoll &&
          typeof (e.data as { rollType?: string })?.rollType === "string" &&
          (e.data as { rollType: string }).rollType.startsWith("Injury Roll")
      )
    ).toBe(false);
    const resumedPlayer = resumed.ctx.team1.players.find(
      (p) => p.id === player.id
    )!;
    expect(resumedPlayer.status).toBe(PlayerStatus.STUNNED);
    expect(diceBefore.phase).toBe(response.snapshot.phase);
  });
});
