import { oneBall } from "../../src/game/rules/balls";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import { GameService } from "../../src/services/GameService";
import { arenaTeam } from "../../src/scenes/sandboxTeam";
import { DEATHBOWL_FORMAT } from "../../src/game/variants/activeMatch";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";
import type { Scenario } from "../../src/types/Scenario";

interface Placement {
  seat: number;
  x: number;
  y: number;
}

const PASSER = { seat: 0, x: 2, y: 6 };

function arenaGame(others: readonly Placement[]) {
  const teams = [
    RosterName.HUMAN,
    RosterName.ORC,
    RosterName.SKAVEN,
    RosterName.DWARF,
  ].map((roster, index) =>
    stabilizeIds(arenaTeam(roster, roster, 0xcc0000), `seat${String(index)}`)
  );
  const placed = new Map<number, number>();
  for (const { seat, x, y } of [PASSER, ...others]) {
    const index = placed.get(seat) ?? 0;
    placed.set(seat, index + 1);
    const player = teams[seat]?.players[index];
    if (!player) throw new Error(`Seat ${String(seat)} has no player ${String(index)}.`);
    player.gridPosition = { x, y };
    player.status = PlayerStatus.ACTIVE;
  }
  const initialState = {
    ...GameService.createInitialState({ teams, startingPhase: GamePhase.PLAY }),
    ...DEATHBOWL_FORMAT,
    subPhase: SubPhase.TURN_RECEIVING,
    activeTeamId: "seat0",
    balls: oneBall(PASSER),
  };
  return new HeadlessGame({ teams, initialState, seed: 5 });
}

function stadiumGame(others: readonly Placement[]) {
  const placements = (seat: number) =>
    [PASSER, ...others]
      .filter((placement) => placement.seat === seat)
      .map(({ x, y }, playerIndex) => ({ playerIndex, x, y }));
  const scenario: Scenario = {
    id: "db-b2-rectangle",
    name: "The same pass on a rectangle",
    description: "a passer on the Sevens stadium",
    setup: {
      team1Placements: placements(0),
      team2Placements: placements(1),
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: PASSER.x, y: PASSER.y },
    },
  };
  return new HeadlessGame({ scenario, seed: 5 });
}

async function passFrom(game: HeadlessGame, to: { x: number; y: number }) {
  const [passer] = game.ctx.teams[0].players;
  if (!passer) throw new Error("The passing team has no players.");
  await game.execute({ type: "declare-action", playerId: passer.id, action: "pass" });
  const result = await game.execute({ type: "pass", playerId: passer.id, ...to });
  return { ok: result.ok, reason: result.reason ?? null };
}

const ACROSS_THE_CORNER = { x: 6, y: 2 };

describe("pass targets and paths across teams (DB-B2)", () => {
  it("refuses a pass whose path crosses a corner of the plus", async () => {
    const game = arenaGame([{ seat: 0, ...ACROSS_THE_CORNER }]);

    expect(await passFrom(game, ACROSS_THE_CORNER)).toEqual({
      ok: false,
      reason: "command-failed: The pass would cross a corner of the pitch",
    });
  });

  it("allows a pass along an arm of the plus", async () => {
    const game = arenaGame([{ seat: 0, x: 2, y: 10 }]);

    expect(await passFrom(game, { x: 2, y: 10 })).toEqual({
      ok: true,
      reason: null,
    });
  });

  it("allows the same pass on a rectangle", async () => {
    const game = stadiumGame([{ seat: 0, ...ACROSS_THE_CORNER }]);

    expect(await passFrom(game, ACROSS_THE_CORNER)).toEqual({
      ok: true,
      reason: null,
    });
  });

  it("refuses a pass at an opposing player on the plus", async () => {
    const game = arenaGame([{ seat: 1, x: 2, y: 10 }]);

    expect(await passFrom(game, { x: 2, y: 10 })).toEqual({
      ok: false,
      reason: "command-failed: A pass cannot target an opposing player",
    });
  });

  it("still allows a pass at an opposing player on a rectangle", async () => {
    const game = stadiumGame([{ seat: 1, x: 2, y: 10 }]);

    expect(await passFrom(game, { x: 2, y: 10 })).toEqual({
      ok: true,
      reason: null,
    });
  });

  it("refuses a hand-off to an opposing player on the plus", async () => {
    const game = arenaGame([{ seat: 2, x: 3, y: 6 }]);
    const [hander] = game.ctx.teams[0].players;
    const [rival] = game.ctx.teams[2]?.players ?? [];
    if (!hander || !rival) throw new Error("The teams have no players.");

    await game.execute({ type: "declare-action", playerId: hander.id, action: "handoff" });
    const result = await game.execute({
      type: "handoff",
      playerId: hander.id,
      targetId: rival.id,
    });

    expect({ ok: result.ok, reason: result.reason }).toEqual({
      ok: false,
      reason: "command-failed: Illegal hand-off target",
    });
  });
});
