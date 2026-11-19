import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { type Scenario } from "../../src/types/Scenario";
import { PlayerStatus } from "../../src/types/Player";
import { playerBoxOf } from "../../src/game/rules/playerLocation";
import { findBoardStateConflicts } from "../../src/game/presentation/boardState";

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
    playerId: fixtureValue(fouler).id,
    action: "foul",
  });
  const response = await game.execute({
    type: "foul",
    playerId: fixtureValue(fouler).id,
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
      if (fixtureValue(attempt.target).status === PlayerStatus.KO)
        found = attempt;
    }
    expect(found).not.toBeNull();
    const { game, target, response } = fixtureValue(found);

    expect(playerBoxOf(fixtureValue(target))).toBe("ko");
    expect(fixtureValue(target).gridPosition).toBeUndefined();
    expect(
      findBoardStateConflicts(game.ctx.gameService.getState(), [
        ...game.ctx.team1.players,
        ...game.ctx.team2.players,
      ])
    ).toEqual([]);

    const announced = response.events.some(
      (e) =>
        e.name === GameEventNames.PlayerStatusChanged &&
        z
          .object({
            id: z.string().exactOptional(),
            status: z.string().exactOptional(),
          })
          .parse(e.data).id === fixtureValue(target).id &&
        z.object({ status: z.string().exactOptional() }).parse(e.data)
          .status === PlayerStatus.KO
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
        fixtureValue(attempt.target).status === PlayerStatus.INJURED ||
        fixtureValue(attempt.target).status === PlayerStatus.DEAD
      ) {
        found = attempt;
      }
    }
    expect(found).not.toBeNull();
    const { game, target, response } = fixtureValue(found);

    expect(playerBoxOf(fixtureValue(target))).toBe("casualty");
    expect(fixtureValue(target).gridPosition).toBeUndefined();
    expect(
      findBoardStateConflicts(game.ctx.gameService.getState(), [
        ...game.ctx.team1.players,
        ...game.ctx.team2.players,
      ])
    ).toEqual([]);

    expect(
      response.events.some(
        (e) => e.name === GameEventNames.PlayerCasualtyInflicted
      )
    ).toBe(true);

    expect(
      response.events.some(
        (e) =>
          e.name === GameEventNames.PlayerStatusChanged &&
          z.object({ id: z.string().exactOptional() }).parse(e.data).id ===
            fixtureValue(target).id
      )
    ).toBe(true);
  });
});

describe("A sent-off player leaves the pitch", () => {
  it("removes the fouling player from the pitch into the sent-off box", async () => {
    let found: Awaited<ReturnType<typeof runFoul>> | null = null;
    for (let seed = 1; seed <= 300 && !found; seed++) {
      const attempt = await runFoul("foul-sendoff", seed);
      if (fixtureValue(attempt.fouler).status === PlayerStatus.REMOVED)
        found = attempt;
    }
    expect(found).not.toBeNull();
    const { game, fouler, response } = fixtureValue(found);

    expect(playerBoxOf(fixtureValue(fouler))).toBe("sent-off");
    expect(fixtureValue(fouler).gridPosition).toBeUndefined();
    expect(
      findBoardStateConflicts(game.ctx.gameService.getState(), [
        ...game.ctx.team1.players,
        ...game.ctx.team2.players,
      ])
    ).toEqual([]);

    const announced = response.events.some(
      (e) =>
        e.name === GameEventNames.PlayerStatusChanged &&
        z
          .object({
            id: z.string().exactOptional(),
            status: z.string().exactOptional(),
          })
          .parse(e.data).id === fixtureValue(fouler).id &&
        z.object({ status: z.string().exactOptional() }).parse(e.data)
          .status === PlayerStatus.REMOVED
    );
    expect(announced).toBe(true);
  });
});
