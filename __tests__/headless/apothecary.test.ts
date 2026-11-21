import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { InjuryOperation } from "../../src/game/operations/InjuryOperation";
import { CrowdInjuryOperation } from "../../src/game/operations/CrowdInjuryOperation";
import type { GameOperation } from "../../src/game/core/GameOperation";
import { SCENARIOS } from "../../src/data/scenarios";
import { InjuryType, PlayerStatus } from "../../src/types/Player";
import { SkillType, getSkill } from "../../src/types/Skills";
import { GameEventNames } from "../../src/types/events";
import { createMatchSave } from "../../src/headless/serialization";
import { forceDice } from "../utils/test-helpers";

const scrimmage = fixtureValue(
  SCENARIOS.find((s) => s.id === "basic-scrimmage")
);

function newGame(seed = 1): HeadlessGame {
  return new HeadlessGame({ scenario: scrimmage, seed });
}

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
    vi.spyOn(
      game.ctx.gameService.getDiceController(),
      "roll2D6"
    ).mockReturnValue(9);
    await runUntilSettledOrDecision(
      game,
      new InjuryOperation(fixtureValue(player).id)
    );

    expect(game.pendingDecision()).toBeNull();
    expect(fixtureValue(player).status).toBe(PlayerStatus.KO);
  });

  it("declining leaves the Apothecary unused and applies the original KO", async () => {
    const game = newGame();
    game.ctx.team1.apothecary = true;
    const player = game.ctx.team1.players[0];
    vi.spyOn(
      game.ctx.gameService.getDiceController(),
      "roll2D6"
    ).mockReturnValue(9);

    await runUntilSettledOrDecision(
      game,
      new InjuryOperation(fixtureValue(player).id)
    );
    const pending = game.pendingDecision();
    expect(pending?.type).toBe("apothecary");
    if (pending?.type !== "apothecary") return;
    expect(pending.chooserTeamId).toBe(game.ctx.team1.id);
    expect(pending.resultKind).toBe("ko");
    expect(pending.location).toBe("pitch");

    await answer(game, false);
    expect(fixtureValue(player).status).toBe(PlayerStatus.KO);
    expect(fixtureValue(player).gridPosition).toBeUndefined();
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
    const square = { ...fixtureValue(fixtureValue(player).gridPosition) };
    vi.spyOn(
      game.ctx.gameService.getDiceController(),
      "roll2D6"
    ).mockReturnValue(9);

    await runUntilSettledOrDecision(
      game,
      new InjuryOperation(fixtureValue(player).id)
    );
    await answer(game, true);

    expect(fixtureValue(player).status).toBe(PlayerStatus.STUNNED);
    expect(fixtureValue(player).gridPosition).toEqual(square);
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
    vi.spyOn(
      game.ctx.gameService.getDiceController(),
      "roll2D6"
    ).mockReturnValue(9);

    await runUntilSettledOrDecision(
      game,
      new CrowdInjuryOperation(fixtureValue(player).id, { x: 0, y: 0 }, false)
    );
    const pending = game.pendingDecision();
    expect(pending?.type).toBe("apothecary");
    if (pending?.type === "apothecary") expect(pending.location).toBe("crowd");

    await answer(game, true);
    expect(fixtureValue(player).status).toBe(PlayerStatus.RESERVE);
    expect(fixtureValue(player).gridPosition).toBeUndefined();
  });

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
      vi.spyOn(
        game.ctx.gameService.getDiceController(),
        "rollD6"
      ).mockReturnValue(4);

      await runUntilSettledOrDecision(
        game,
        new InjuryOperation(fixtureValue(player).id)
      );
      const pending = game.pendingDecision();
      expect(pending?.type).toBe("apothecary");
      if (pending?.type === "apothecary") {
        expect(pending.resultKind).toBe("casualty");
        expect(pending.casualtyType).toBe(casualtyType);
      }

      await answer(game, true);
      expect(fixtureValue(player).status).toBe(PlayerStatus.RESERVE);
    });

    it(`a failed patch-up (1-3) for ${label} keeps the original result`, async () => {
      const game = newGame();
      game.ctx.team1.apothecary = true;
      const player = game.ctx.team1.players[0];
      vi.spyOn(
        game.ctx.gameService.getDiceController(),
        "roll2D6"
      ).mockReturnValue(rollTotal);
      vi.spyOn(
        game.ctx.gameService.getDiceController(),
        "rollD6"
      ).mockReturnValue(2);

      await runUntilSettledOrDecision(
        game,
        new InjuryOperation(fixtureValue(player).id)
      );
      await answer(game, true);

      expect(fixtureValue(player).status).toBe(initialStatus);

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
    vi.spyOn(
      game.ctx.gameService.getDiceController(),
      "roll2D6"
    ).mockReturnValue(9);

    await runUntilSettledOrDecision(
      game,
      new InjuryOperation(fixtureValue(first).id)
    );
    expect(game.pendingDecision()?.type).toBe("apothecary");
    await answer(game, true);

    await runUntilSettledOrDecision(
      game,
      new InjuryOperation(fixtureValue(second).id)
    );
    expect(game.pendingDecision()).toBeNull();
    expect(fixtureValue(second).status).toBe(PlayerStatus.KO);
  });

  it("resolving the decision a second time has no effect (idempotent)", async () => {
    const game = newGame();
    game.ctx.team1.apothecary = true;
    const player = game.ctx.team1.players[0];
    vi.spyOn(
      game.ctx.gameService.getDiceController(),
      "roll2D6"
    ).mockReturnValue(9);

    await runUntilSettledOrDecision(
      game,
      new InjuryOperation(fixtureValue(player).id)
    );
    await answer(game, true);
    expect(fixtureValue(player).status).toBe(PlayerStatus.STUNNED);

    const repeat = await game.execute({
      type: "use-apothecary",
      accept: false,
    });
    expect(repeat.ok).toBe(false);
    expect(fixtureValue(player).status).toBe(PlayerStatus.STUNNED);
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
      await runUntilSettledOrDecision(
        game,
        new InjuryOperation(fixtureValue(player).id)
      );
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
    vi.spyOn(
      game.ctx.gameService.getDiceController(),
      "roll2D6"
    ).mockReturnValue(9);

    await runUntilSettledOrDecision(
      game,
      new InjuryOperation(fixtureValue(player).id)
    );
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

    expect(
      response.events.some(
        (e) =>
          e.name === GameEventNames.DiceRoll &&
          typeof z
            .object({ rollType: z.string().exactOptional() })
            .parse(e.data).rollType === "string" &&
          z
            .object({ rollType: z.string() })
            .parse(e.data)
            .rollType.startsWith("Injury Roll")
      )
    ).toBe(false);
    const resumedPlayer = fixtureValue(
      resumed.ctx.team1.players.find((p) => p.id === fixtureValue(player).id)
    );
    expect(resumedPlayer.status).toBe(PlayerStatus.STUNNED);
    expect(diceBefore.phase).toBe(response.snapshot.phase);
  });
});

describe("Sevens Apothecary decision — what a patch-up undoes", () => {
  async function blockByPlagueRidden(game: HeadlessGame) {
    game.ctx.team1.apothecary = true;
    const victim = game.ctx.team1.players[0];
    const killer = game.ctx.team2.players[0];
    fixtureValue(killer).skills.push(getSkill(SkillType.PLAGUE_RIDDEN));
    await runUntilSettledOrDecision(
      game,
      new InjuryOperation(fixtureValue(victim).id, {
        causedById: fixtureValue(killer).id,
        cause: "block",
      })
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
    forceDice(game.ctx.rng, [5, 6, 4]);

    await runUntilSettledOrDecision(
      game,
      new InjuryOperation(fixtureValue(player).id)
    );
    await answer(game, true);

    expect(fixtureValue(player).status).toBe(PlayerStatus.RESERVE);
    expect(fixtureValue(player).injuries).toEqual([]);
  });

  it("announces no kill before the Apothecary decides, and none after a save", async () => {
    const game = newGame();
    forceDice(game.ctx.rng, [6, 6, 4]);
    const { victim, killer } = await blockByPlagueRidden(game);
    const rosterSize = game.ctx.team2.players.length;

    expect(game.pendingDecision()?.type).toBe("apothecary");
    expect(kills(game.events())).toEqual([]);

    const response = await answer(game, true);
    expect(kills(response.events)).toEqual([]);
    expect(fixtureValue(victim).status).toBe(PlayerStatus.RESERVE);
    expect(fixtureValue(victim).injuries).toEqual([]);
    expect(fixtureValue(killer).plagueRiddenUsed).toBeUndefined();
    expect(game.ctx.team2.players.length).toBe(rosterSize);
  });

  it("a failed patch-up on a Dead result is a kill that arms Plague Ridden", async () => {
    const game = newGame();
    forceDice(game.ctx.rng, [6, 6, 3]);
    const { victim, killer } = await blockByPlagueRidden(game);
    const rosterSize = game.ctx.team2.players.length;

    const response = await answer(game, true);
    expect(kills(response.events)).toEqual([
      { causerId: fixtureValue(killer).id, victimId: fixtureValue(victim).id },
    ]);
    expect(fixtureValue(victim).status).toBe(PlayerStatus.DEAD);
    expect(fixtureValue(victim).injuries).toEqual([InjuryType.DEAD]);
    expect(fixtureValue(killer).plagueRiddenUsed).toBe(true);
    expect(game.ctx.team2.players.length).toBe(rosterSize + 1);
  });

  it("a Dead decision resumed from a save still counts the kill when declined", async () => {
    const game = newGame();
    forceDice(game.ctx.rng, [6, 6]);
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
      { causerId: fixtureValue(killer).id, victimId: fixtureValue(victim).id },
    ]);
    const resumedKiller = resumed.ctx.team2.players.find(
      (p) => p.id === fixtureValue(killer).id
    );
    expect(resumedKiller?.plagueRiddenUsed).toBe(true);
    expect(resumed.ctx.team2.players.length).toBe(rosterSize + 1);
  });
});

describe("Advanced League Apothecary: the rulebook second Casualty roll", () => {
  async function casualty(dice: number[]) {
    const game = new HeadlessGame({
      scenario: scrimmage,
      seed: 1,
      competition: true,
    });
    game.ctx.team1.advancementMode = "advanced-league";
    game.ctx.team1.apothecary = true;
    forceDice(game.ctx.rng, dice);
    const player = fixtureValue(game.ctx.team1.players[0]);
    await runUntilSettledOrDecision(game, new InjuryOperation(player.id));
    return { game, player };
  }

  it("offers the Apothecary with the Casualty roll's grade", async () => {
    const { game } = await casualty([5, 5, 14, 3]);
    expect(
      game.ctx.gameService.getState().inducements?.pendingApothecaryDecision
        ?.casualtyRoll
    ).toEqual({
      grade: "Lasting Injury",
      lasting: "MA",
    });
  });

  it("a milder second roll of Badly Hurt sends the player to the Reserves", async () => {
    const { game, player } = await casualty([5, 5, 14, 3, 2]);
    await answer(game, true);
    expect(player.status).toBe(PlayerStatus.RESERVE);
    expect(player.injuries).toEqual([]);
    expect(player.stats.MA).toBe(6);
  });

  it("a worse second roll keeps the first result", async () => {
    const { game, player } = await casualty([5, 5, 9, 16]);
    await answer(game, true);
    expect(player.status).toBe(PlayerStatus.INJURED);
    expect(player.injuries).toEqual([InjuryType.MISS_NEXT_GAME]);
  });

  it("a Dead player can come back with the second roll's Serious Injury", async () => {
    const { game, player } = await casualty([5, 5, 16, 11]);
    await answer(game, true);
    expect(player.status).toBe(PlayerStatus.INJURED);
    expect(player.injuries).toEqual([
      InjuryType.NIGGLING_INJURY,
      InjuryType.MISS_NEXT_GAME,
    ]);
  });

  it("keeping a Lasting Injury from the second roll takes the point", async () => {
    const { game, player } = await casualty([5, 5, 16, 13, 1]);
    await answer(game, true);
    expect(player.stats.AV).toBe(8);
    expect(player.injuries).toEqual([
      InjuryType.MISS_NEXT_GAME,
      InjuryType.STAT_DECREASE_AV,
    ]);
  });

  it("declining still applies the Lasting Injury", async () => {
    const { game, player } = await casualty([5, 5, 14, 3]);
    await answer(game, false);
    expect(player.status).toBe(PlayerStatus.INJURED);
    expect(player.stats.MA).toBe(5);
    expect(player.injuries).toEqual([
      InjuryType.MISS_NEXT_GAME,
      InjuryType.STAT_DECREASE_MA,
    ]);
  });

  it("a Skill Selection team keeps the Sevens 4+ patch-up", async () => {
    const game = new HeadlessGame({
      scenario: scrimmage,
      seed: 1,
      competition: true,
    });
    game.ctx.team1.advancementMode = "sevens-skill-selection";
    game.ctx.team1.apothecary = true;
    forceDice(game.ctx.rng, [5, 5, 4]);
    const player = fixtureValue(game.ctx.team1.players[0]);
    await runUntilSettledOrDecision(game, new InjuryOperation(player.id));
    expect(
      game.ctx.gameService.getState().inducements?.pendingApothecaryDecision
        ?.casualtyRoll
    ).toBeUndefined();
    await answer(game, true);
    expect(player.status).toBe(PlayerStatus.RESERVE);
    expect(player.injuries).toEqual([]);
  });
});
