import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { Scenario } from "../../src/types/Scenario";
import { PlayerStatus } from "../../src/types/Player";
import { playerBoxOf } from "../../src/game/rules/playerLocation";
import { findBoardStateConflicts } from "../../src/game/presentation/boardState";

/**
 * Regression coverage for fix-foul-ko-sentoff-cleanup: a Foul's KO, Casualty
 * and Send-Off consequences used to mutate `player.status` inline (or not at
 * all, for Send-Off) without ever calling `movePlayerToBox` — so the target's
 * (or fouler's) sprite never left the pitch, even though engine state said
 * they had. These tests lock the fix: every foul-caused departure from the
 * pitch goes through the single `movePlayerToBox` seam, the same one
 * block-caused injuries already use, and always announces
 * `PlayerStatusChanged`.
 */

function foulScenario(id: string): Scenario {
  return {
    id,
    name: id,
    description: "",
    setup: {
      team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
      team2Placements: [
        { playerIndex: 0, x: 11, y: 5, status: PlayerStatus.PRONE },
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 1 },
    },
  };
}

async function runFoul(id: string, seed: number) {
  const game = new HeadlessGame({ scenario: foulScenario(id), seed });
  const fouler = game.ctx.team1.players[0];
  const target = game.ctx.team2.players[0];

  await game.execute({
    type: "declare-action",
    playerId: fouler.id,
    action: "foul",
  });
  const response = await game.execute({
    type: "foul",
    playerId: fouler.id,
    x: 11,
    y: 5,
  });

  return { game, fouler, target, response };
}

describe("A foul-caused KO reaches the KO box", () => {
  it("clears the pitch square, sets KO, and emits PlayerStatusChanged", async () => {
    let found: Awaited<ReturnType<typeof runFoul>> | null = null;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const attempt = await runFoul("foul-ko", seed);
      if (attempt.target.status === PlayerStatus.KO) found = attempt;
    }
    expect(found).not.toBeNull();
    const { game, target, response } = found!;

    // One location, and it is the KO box — not lingering on the pitch.
    expect(playerBoxOf(target)).toBe("ko");
    expect(target.gridPosition).toBeUndefined();
    expect(
      findBoardStateConflicts(game.ctx.gameService.getState(), [
        ...game.ctx.team1.players,
        ...game.ctx.team2.players,
      ])
    ).toEqual([]);

    // The seam announced the move so the view reconciles the sprite off the
    // pitch, exactly as a block-caused KO does.
    const announced = response.events.some(
      (e) =>
        e.name === GameEventNames.PlayerStatusChanged &&
        (e.data as { id?: string; status?: string })?.id === target.id &&
        (e.data as { status?: string })?.status === PlayerStatus.KO
    );
    expect(announced).toBe(true);
  });
});

describe("A foul-caused Casualty reaches dead-and-injured", () => {
  it("removes the target from the pitch into the casualty box", async () => {
    let found: Awaited<ReturnType<typeof runFoul>> | null = null;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const attempt = await runFoul("foul-casualty", seed);
      if (
        attempt.target.status === PlayerStatus.INJURED ||
        attempt.target.status === PlayerStatus.DEAD
      ) {
        found = attempt;
      }
    }
    expect(found).not.toBeNull();
    const { game, target, response } = found!;

    // Routed through CasualtyOperation (the same path InjuryOperation uses),
    // so the target ends in the casualty box with the square released.
    expect(playerBoxOf(target)).toBe("casualty");
    expect(target.gridPosition).toBeUndefined();
    expect(
      findBoardStateConflicts(game.ctx.gameService.getState(), [
        ...game.ctx.team1.players,
        ...game.ctx.team2.players,
      ])
    ).toEqual([]);

    // The existing PlayerCasualtyInflicted emission is preserved...
    expect(
      response.events.some(
        (e) => e.name === GameEventNames.PlayerCasualtyInflicted
      )
    ).toBe(true);
    // ...and PlayerStatusChanged now fires too, once CasualtyOperation
    // places the target in its final box.
    expect(
      response.events.some(
        (e) =>
          e.name === GameEventNames.PlayerStatusChanged &&
          (e.data as { id?: string })?.id === target.id
      )
    ).toBe(true);
  });
});

describe("A sent-off player leaves the pitch", () => {
  it("removes the fouling player from the pitch into the sent-off box", async () => {
    let found: Awaited<ReturnType<typeof runFoul>> | null = null;
    for (let seed = 1; seed <= 300 && !found; seed++) {
      const attempt = await runFoul("foul-sendoff", seed);
      if (attempt.fouler.status === PlayerStatus.REMOVED) found = attempt;
    }
    expect(found).not.toBeNull();
    const { game, fouler, response } = found!;

    expect(playerBoxOf(fouler)).toBe("sent-off");
    expect(fouler.gridPosition).toBeUndefined();
    expect(
      findBoardStateConflicts(game.ctx.gameService.getState(), [
        ...game.ctx.team1.players,
        ...game.ctx.team2.players,
      ])
    ).toEqual([]);

    const announced = response.events.some(
      (e) =>
        e.name === GameEventNames.PlayerStatusChanged &&
        (e.data as { id?: string; status?: string })?.id === fouler.id &&
        (e.data as { status?: string })?.status === PlayerStatus.REMOVED
    );
    expect(announced).toBe(true);
  });
});
