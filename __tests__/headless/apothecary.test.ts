import { describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { InjuryOperation } from "../../src/game/operations/InjuryOperation";
import { CrowdInjuryOperation } from "../../src/game/operations/CrowdInjuryOperation";
import { GameOperation } from "../../src/game/core/GameOperation";
import { SCENARIOS } from "../../src/data/scenarios";
import { InjuryType, PlayerStatus } from "../../src/types/Player";
import { SkillType, getSkill } from "../../src/types/Skills";
import { GameEventNames } from "../../src/types/events";
import { createMatchSave } from "../../src/headless/serialization";
import { forceDice } from "../utils/test-helpers";

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

  // Sevens injury table totals (docs/SEVENS_RULES.md I3-I5).
  for (const [rollTotal, label, casualtyType, initialStatus] of [
    [10, "Badly Hurt", "badly-hurt", PlayerStatus.INJURED],
    [11, "Seriously Hurt", "seriously-hurt", PlayerStatus.INJURED],
    [12, "Dead", "dead", PlayerStatus.DEAD],
  ] as const) {
    it(`offers a patch-up for ${label} and succeeds on a 4+ roll`, async () => {
      const game = newGame();
      game.ctx.team1.apothecary = true;
      const player = game.ctx.team1.players[0];
      vi.spyOn(
        game.ctx.gameService.getDiceController(),
        "roll2D6"
      ).mockReturnValue(rollTotal);
      vi.spyOn(game.ctx.gameService.getDiceController(), "rollD6").mockReturnValue(4); // success

      await runUntilSettledOrDecision(game, new InjuryOperation(player.id));
      const pending = game.pendingDecision();
      expect(pending?.type).toBe("apothecary");
      if (pending?.type === "apothecary") {
        expect(pending.resultKind).toBe("casualty");
        expect(pending.casualtyType).toBe(casualtyType);
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
        "roll2D6"
      ).mockReturnValue(rollTotal);
      vi.spyOn(game.ctx.gameService.getDiceController(), "rollD6").mockReturnValue(2); // fail

      await runUntilSettledOrDecision(game, new InjuryOperation(player.id));
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
        "roll2D6"
      ).mockReturnValue(10);
      await runUntilSettledOrDecision(game, new InjuryOperation(player.id));
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

describe("Sevens Apothecary decision — what a patch-up undoes", () => {
  /** A Block by a Plague Ridden player of team2 against team1's first player. */
  async function blockByPlagueRidden(game: HeadlessGame) {
    game.ctx.team1.apothecary = true;
    const victim = game.ctx.team1.players[0];
    const killer = game.ctx.team2.players[0];
    killer.skills.push(getSkill(SkillType.PLAGUE_RIDDEN));
    await runUntilSettledOrDecision(
      game,
      new InjuryOperation(victim.id, { causedById: killer.id, cause: "block" })
    );
    return { victim, killer };
  }

  const kills = (events: { name: string; data?: unknown }[]) =>
    events
      .filter((e) => e.name === GameEventNames.PlayerKilled)
      .map((e) => e.data);

  it("a patched-up Seriously Hurt player carries no Miss Next Game", async () => {
    const game = newGame();
    game.ctx.team1.apothecary = true;
    const player = game.ctx.team1.players[0];
    forceDice(game.ctx.rng, [5, 6, 4]); // 11 Seriously Hurt, patch-up 4

    await runUntilSettledOrDecision(game, new InjuryOperation(player.id));
    await answer(game, true);

    expect(player.status).toBe(PlayerStatus.RESERVE);
    expect(player.injuries).toEqual([]);
  });

  it("announces no kill before the Apothecary decides, and none after a save", async () => {
    const game = newGame();
    forceDice(game.ctx.rng, [6, 6, 4]); // 12 Dead, patch-up 4
    const { victim, killer } = await blockByPlagueRidden(game);
    const rosterSize = game.ctx.team2.players.length;

    expect(game.pendingDecision()?.type).toBe("apothecary");
    expect(kills(game.events())).toEqual([]);

    const response = await answer(game, true);
    expect(kills(response.events)).toEqual([]);
    expect(victim.status).toBe(PlayerStatus.RESERVE);
    expect(victim.injuries).toEqual([]);
    expect(killer.plagueRiddenUsed).toBeUndefined();
    expect(game.ctx.team2.players.length).toBe(rosterSize);
  });

  it("a failed patch-up on a Dead result is a kill that arms Plague Ridden", async () => {
    const game = newGame();
    forceDice(game.ctx.rng, [6, 6, 3]); // 12 Dead, patch-up 3
    const { victim, killer } = await blockByPlagueRidden(game);
    const rosterSize = game.ctx.team2.players.length;

    const response = await answer(game, true);
    expect(kills(response.events)).toEqual([
      { causerId: killer.id, victimId: victim.id },
    ]);
    expect(victim.status).toBe(PlayerStatus.DEAD);
    expect(victim.injuries).toEqual([InjuryType.DEAD]);
    expect(killer.plagueRiddenUsed).toBe(true);
    expect(game.ctx.team2.players.length).toBe(rosterSize + 1);
  });

  it("a Dead decision resumed from a save still counts the kill when declined", async () => {
    const game = newGame();
    forceDice(game.ctx.rng, [6, 6]); // 12 Dead
    const { victim, killer } = await blockByPlagueRidden(game);
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
    const rosterSize = resumed.ctx.team2.players.length;
    const response = await resumed.execute({
      type: "use-apothecary",
      accept: false,
    });

    expect(kills(response.events)).toEqual([
      { causerId: killer.id, victimId: victim.id },
    ]);
    const resumedKiller = resumed.ctx.team2.players.find(
      (p) => p.id === killer.id
    );
    expect(resumedKiller?.plagueRiddenUsed).toBe(true);
    expect(resumed.ctx.team2.players.length).toBe(rosterSize + 1);
  });
});
