import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import type { CommandResponse } from "../../src/headless/protocol";

/**
 * Sevens D8: once per game the Veteran may re-roll a failed pick-up, catch
 * or Pass Action roll, or the block dice when their own Block would Knock
 * them Down. Every team here has no Team Re-rolls unless a test adds some,
 * so the Veteran is the only source. Seeds are committed, never searched
 * (see docs/E2E_TESTING.md); each test first asserts the failure its seed
 * produces, so a dice-order change fails loudly.
 */

const play = {
  activeTeam: "team1" as const,
  phase: GamePhase.PLAY,
  subPhase: SubPhase.TURN_RECEIVING,
};

const pickupScenario: Scenario = {
  id: "veteran-pickup",
  name: "Veteran picks up",
  description: "a Veteran steps onto the ball; another dodges away",
  setup: {
    ...play,
    team1Placements: [
      { playerIndex: 0, x: 4, y: 5 },
      { playerIndex: 1, x: 16, y: 4 },
    ],
    team2Placements: [{ playerIndex: 0, x: 16, y: 5 }],
    ballPosition: { x: 5, y: 5 },
  },
};

const handoffScenario: Scenario = {
  id: "veteran-catch",
  name: "Hand-off to a Veteran",
  description: "the Veteran is the catcher",
  setup: {
    ...play,
    team1Placements: [
      { playerIndex: 0, x: 5, y: 5 },
      { playerIndex: 1, x: 6, y: 5 },
    ],
    team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
    ballPosition: { x: 5, y: 5 },
  },
};

const passScenario: Scenario = {
  id: "veteran-pass",
  name: "Veteran passes",
  description: "the Veteran throws a Short pass to a team-mate",
  setup: {
    ...play,
    team1Placements: [
      { playerIndex: 0, x: 5, y: 5 },
      { playerIndex: 1, x: 9, y: 5 },
    ],
    team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
    ballPosition: { x: 5, y: 5 },
  },
};

const blockScenario: Scenario = {
  id: "veteran-block",
  name: "Veteran blocks",
  description: "a ST 3 Veteran Lineman blocks a ST 3 Lineman: one die",
  setup: {
    ...play,
    team1Placements: [{ playerIndex: 0, x: 5, y: 5 }],
    team2Placements: [{ playerIndex: 0, x: 6, y: 5 }],
    ballPosition: { x: 1, y: 1 },
  },
};

/** The pick-up fails; so does the dodge from (16,4) to (15,3). */
const PICKUP_FAILS_SEED = 7;
/** The hand-off to (6,5) is dropped. */
const CATCH_FAILS_SEED = 7;
/** The pass to (9,5) is inaccurate. */
const PASS_FAILS_SEED = 1;
/** One block die: Player Down, then the Veteran's re-roll gives Push. */
const BLOCK_SKULL_SEED = 8;
/** One block die: Both Down. */
const BLOCK_BOTH_DOWN_SEED = 9;
/** One block die: POW. */
const BLOCK_POW_SEED = 2;

function newGame(scenario: Scenario, seed: number, veteranIndex: number) {
  const game = new HeadlessGame({ scenario, seed });
  game.ctx.team1.rerolls = 0;
  game.ctx.team1.players[veteranIndex].veteran = true;
  return game;
}

async function pickUp(game: HeadlessGame): Promise<CommandResponse> {
  const id = game.ctx.team1.players[0].id;
  await game.execute({ type: "declare-action", playerId: id, action: "move" });
  return game.execute({ type: "move", playerId: id, path: [{ x: 5, y: 5 }] });
}

async function block(game: HeadlessGame): Promise<CommandResponse> {
  const attackerId = game.ctx.team1.players[0].id;
  const defenderId = game.ctx.team2.players[0].id;
  await game.execute({
    type: "declare-action",
    playerId: attackerId,
    action: "block",
  });
  return game.execute({ type: "block", attackerId, defenderId });
}

function blockDice(response: CommandResponse) {
  const pending = response.pendingDecision;
  return pending?.type === "block-dice"
    ? {
        dice: pending.options.map((o) => o.type),
        veteran: !!pending.veteranRerollAvailable,
      }
    : undefined;
}

describe("Veteran re-roll on failed rolls (D8)", () => {
  it("offers the Veteran re-roll on a failed pick-up", async () => {
    const game = newGame(pickupScenario, PICKUP_FAILS_SEED, 0);
    const moved = await pickUp(game);

    const pending = moved.pendingDecision;
    expect(pending?.type).toBe("reroll");
    if (pending?.type !== "reroll") return;
    expect(pending.rollKind).toBe("pickup");
    expect(pending.sources).toEqual(["veteran"]);
  });

  it("spending it re-rolls the pick-up and marks it used for the game", async () => {
    const game = newGame(pickupScenario, PICKUP_FAILS_SEED, 0);
    const veteranId = game.ctx.team1.players[0].id;
    await pickUp(game);

    const accepted = await game.execute({
      type: "use-reroll",
      accept: true,
      source: "veteran",
    });

    const used = accepted.events.find(
      (e) => e.name === GameEventNames.RerollUsed
    )?.data as { source: string; rollKind: string } | undefined;
    expect(used).toMatchObject({ source: "veteran", rollKind: "pickup" });
    expect(accepted.pendingDecision).toBeNull();
    expect(accepted.snapshot.veteranRerollsUsed).toEqual([veteranId]);
  });

  it("is offered alongside a Team Re-roll", async () => {
    const game = newGame(pickupScenario, PICKUP_FAILS_SEED, 0);
    game.ctx.team1.rerolls = 2;
    const moved = await pickUp(game);

    expect(
      moved.pendingDecision?.type === "reroll" && moved.pendingDecision.sources
    ).toEqual(["team", "veteran"]);
  });

  it("is not offered again once used this game", async () => {
    const game = newGame(pickupScenario, PICKUP_FAILS_SEED, 0);
    game.ctx.gameService.getState().veteranRerollsUsed = [
      game.ctx.team1.players[0].id,
    ];
    const moved = await pickUp(game);

    expect(moved.pendingDecision).toBeNull();
    expect(
      moved.events.filter((e) => e.name === GameEventNames.Turnover)
    ).toHaveLength(1);
  });

  it("does not cover a failed dodge", async () => {
    const game = newGame(pickupScenario, PICKUP_FAILS_SEED, 1);
    const dodgerId = game.ctx.team1.players[1].id;
    await game.execute({
      type: "declare-action",
      playerId: dodgerId,
      action: "move",
    });
    const dodged = await game.execute({
      type: "move",
      playerId: dodgerId,
      path: [{ x: 15, y: 3 }],
    });

    expect(
      dodged.events.some((e) => e.name === GameEventNames.PlayerKnockedDown)
    ).toBe(true);
    expect(dodged.pendingDecision).toBeNull();
  });

  it("offers the Veteran re-roll on a failed catch", async () => {
    const game = newGame(handoffScenario, CATCH_FAILS_SEED, 1);
    const passerId = game.ctx.team1.players[0].id;
    await game.execute({
      type: "declare-action",
      playerId: passerId,
      action: "handoff",
    });
    const handed = await game.execute({
      type: "handoff",
      playerId: passerId,
      targetId: game.ctx.team1.players[1].id,
    });

    const pending = handed.pendingDecision;
    expect(pending?.type === "reroll" && pending.rollKind).toBe("catch");
    expect(pending?.type === "reroll" && pending.sources).toEqual(["veteran"]);
  });

  it("offers the Veteran re-roll on a failed Pass Action roll", async () => {
    const game = newGame(passScenario, PASS_FAILS_SEED, 0);
    const passerId = game.ctx.team1.players[0].id;
    await game.execute({
      type: "declare-action",
      playerId: passerId,
      action: "pass",
    });
    const passed = await game.execute({
      type: "pass",
      playerId: passerId,
      x: 9,
      y: 5,
    });

    const pending = passed.pendingDecision;
    expect(pending?.type === "reroll" && pending.rollKind).toBe("pass");
    expect(pending?.type === "reroll" && pending.sources).toEqual(["veteran"]);
  });
});

describe("Veteran re-roll on block dice (D8)", () => {
  it("is offered when the Veteran's block would Knock them Down", async () => {
    const game = newGame(blockScenario, BLOCK_SKULL_SEED, 0);
    expect(blockDice(await block(game))).toEqual({
      dice: ["skull"],
      veteran: true,
    });
  });

  it("re-rolls the block dice once", async () => {
    const game = newGame(blockScenario, BLOCK_SKULL_SEED, 0);
    const attackerId = game.ctx.team1.players[0].id;
    await block(game);

    const rerolled = await game.execute({
      type: "veteran-reroll-block",
      attackerId,
    });

    expect(blockDice(rerolled)).toEqual({ dice: ["push"], veteran: false });
    const used = rerolled.events.find(
      (e) => e.name === GameEventNames.RerollUsed
    )?.data as { source: string; rollKind: string } | undefined;
    expect(used).toMatchObject({ source: "veteran", rollKind: "block" });
    expect(rerolled.snapshot.veteranRerollsUsed).toEqual([attackerId]);
  });

  it("is offered on a Both Down when the Veteran has no Block", async () => {
    const game = newGame(blockScenario, BLOCK_BOTH_DOWN_SEED, 0);
    expect(blockDice(await block(game))).toEqual({
      dice: ["both-down"],
      veteran: true,
    });
  });

  it("is not offered when the block does not knock the Veteran down", async () => {
    const game = newGame(blockScenario, BLOCK_POW_SEED, 0);
    expect(blockDice(await block(game))).toEqual({
      dice: ["pow"],
      veteran: false,
    });
  });

  it("is not offered to a player who is not the Veteran", async () => {
    const game = newGame(blockScenario, BLOCK_SKULL_SEED, 1);
    expect(blockDice(await block(game))).toEqual({
      dice: ["skull"],
      veteran: false,
    });
  });
});
