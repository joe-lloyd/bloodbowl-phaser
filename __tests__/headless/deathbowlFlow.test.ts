import { describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import { arenaSquad } from "../../src/game/deathbowl/squad";
import { placings } from "../../src/game/deathbowl/placings";
import { DeathbowlTouchdownPending } from "../../src/game/deathbowl/flow";
import { DEATHBOWL_FORMAT } from "../../src/game/variants/activeMatch";
import {
  inSetupSection,
  onScrimmage,
  wideZoneOf,
} from "../../src/game/rules/frames";
import { seatOf } from "../../src/game/seating";
import { enumerateDecision } from "../../src/simulation/candidates";
import { snapshotHash } from "../../src/simulation/runMatch";
import { GamePhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";
import { getSkill, SkillType } from "../../src/types/Skills";

const ROSTERS = [
  RosterName.HUMAN,
  RosterName.ORC,
  RosterName.SKAVEN,
  RosterName.DWARF,
];

function deathbowlGame() {
  const teams = ROSTERS.map((roster, index) =>
    stabilizeIds(arenaSquad(roster, roster, 0xcc0000), `seat${String(index)}`)
  );
  return new HeadlessGame({
    teams,
    seed: 3,
    startingPhase: GamePhase.SETUP,
    format: DEATHBOWL_FORMAT,
  });
}

async function setUpSeat(game: HeadlessGame): Promise<string> {
  const { activeTeamId } = game.ctx.gameService.getState();
  const point = await enumerateDecision(game, null);
  const [candidate] = point.candidates;
  if (!candidate || !activeTeamId) throw new Error("No seat is setting up.");
  for (const command of candidate.commands) {
    const response = await game.execute(command);
    if (!response.ok) throw new Error(`${command.type}: ${String(response.reason)}`);
  }
  return activeTeamId;
}

async function setUpAll(game: HeadlessGame): Promise<string[]> {
  const order: string[] = [];
  while (game.ctx.gameService.getPhase() === GamePhase.SETUP) {
    order.push(await setUpSeat(game));
  }
  return order;
}

function rig(game: HeadlessGame, rolls: readonly number[]) {
  const spy = vi.spyOn(game.ctx.rng, "rollDie");
  for (const roll of rolls) spy.mockReturnValueOnce(roll);
  return spy;
}

const turnLabel = (game: HeadlessGame) => {
  const { turn } = game.ctx.gameService.getState();
  return `${turn.isHalf2 ? "H2" : "H1"} ${turn.teamId} ${String(turn.turnNumber)}`;
};

async function endTurnsUntil(game: HeadlessGame, stop: () => boolean) {
  const turns: string[] = [];
  while (!stop()) {
    if (game.ctx.gameService.getPhase() === GamePhase.SETUP) {
      await setUpAll(game);
      continue;
    }
    turns.push(turnLabel(game));
    const response = await game.execute({ type: "end-turn" });
    if (!response.ok) throw new Error(String(response.reason));
  }
  return turns;
}

describe("set-up in turn order (DB-S1)", () => {
  it("sets the four seats up North, East, South, West", async () => {
    expect(await setUpAll(deathbowlGame())).toEqual([
      "seat0",
      "seat1",
      "seat2",
      "seat3",
    ]);
  });

  it("fields eight per seat, three on its line, none wide, all in its own arm", async () => {
    const game = deathbowlGame();
    await setUpAll(game);
    const seating = game.ctx.gameService.getSeating();
    const fielded = seating.seats.map(({ frame, team }) => {
      const onPitch = team.players.flatMap((player) =>
        player.gridPosition ? [player.gridPosition] : []
      );
      return {
        players: onPitch.length,
        onLine: onPitch.filter((at) => onScrimmage(frame, at)).length,
        wide: onPitch.filter((at) => wideZoneOf(frame, at) !== null).length,
        ownArm: onPitch.every((at) => inSetupSection(frame, at)),
      };
    });
    expect(fielded).toEqual(
      Array.from({ length: 4 }, () => ({
        players: 8,
        onLine: 3,
        wide: 0,
        ownArm: true,
      }))
    );
  });

  it("refuses a placement in another seat's arm", async () => {
    const game = deathbowlGame();
    const north = game.ctx.teams[0].players[0];
    const response = await game.execute({
      type: "place-player",
      playerId: north?.id ?? "",
      x: 10,
      y: 18,
    });
    expect(response.ok).toBe(false);
  });
});

describe("opening balls (DB-S2)", () => {
  it("puts two balls on distinct squares around the centre, rolling a repeat again", async () => {
    const fresh = deathbowlGame();
    for (let seat = 0; seat < 3; seat++) await setUpSeat(fresh);
    rig(fresh, [2, 2, 8, 6, 3, 1, 1]);
    await setUpSeat(fresh);

    const { balls } = fresh.ctx.gameService.getState();
    expect(balls.map(({ at }) => at)).toEqual([
      { x: 10, y: 9 },
      { x: 11, y: 11 },
    ]);
  });
});

describe("roll-off and turn order (DB-S3)", () => {
  it("re-rolls a tie among the highest and starts with the winner", async () => {
    const game = deathbowlGame();
    for (let seat = 0; seat < 3; seat++) await setUpSeat(game);
    rig(game, [1, 2, 6, 3, 6, 2, 4, 5]);
    await setUpSeat(game);

    const state = game.ctx.gameService.getState();
    expect(state.phase).toBe(GamePhase.PLAY);
    expect(state.activeTeamId).toBe("seat2");
  });

  it("goes clockwise from the winner, then anticlockwise from the last mover", async () => {
    const game = deathbowlGame();
    for (let seat = 0; seat < 3; seat++) await setUpSeat(game);
    rig(game, [1, 2, 6, 3, 6, 2, 4, 5]);
    await setUpSeat(game);
    const turns = await endTurnsUntil(
      game,
      () => game.ctx.gameService.getState().turn.isHalf2 &&
        game.ctx.gameService.getPhase() === GamePhase.PLAY &&
        game.ctx.gameService.getState().turn.turnNumber === 2
    );

    expect(turns.slice(0, 5)).toEqual([
      "H1 seat2 1",
      "H1 seat3 1",
      "H1 seat0 1",
      "H1 seat1 1",
      "H1 seat2 2",
    ]);
    expect(turns.slice(-5)).toEqual([
      "H1 seat1 8",
      "H2 seat1 1",
      "H2 seat0 1",
      "H2 seat3 1",
      "H2 seat2 1",
    ]);
  });

  it("sets up again at half time starting with the last mover, then anticlockwise", async () => {
    const game = deathbowlGame();
    for (let seat = 0; seat < 3; seat++) await setUpSeat(game);
    rig(game, [1, 2, 6, 3, 6, 2, 4, 5]);
    await setUpSeat(game);
    await endTurnsUntil(
      game,
      () => game.ctx.gameService.getPhase() === GamePhase.SETUP
    );
    expect(await setUpAll(game)).toEqual(["seat1", "seat0", "seat3", "seat2"]);
  });
});

describe("two halves of eight turns (DB-F1)", () => {
  it("plays 64 turns when every team ends every turn at once, then ends the match", async () => {
    const game = deathbowlGame();
    await setUpAll(game);
    const turns = await endTurnsUntil(
      game,
      () => game.ctx.gameService.getPhase() === GamePhase.GAME_OVER
    );
    expect(turns).toHaveLength(64);
    expect(game.ctx.gameService.getState().result).toEqual({ reason: "completed" });
  });
});

describe("half time (DB-F5)", () => {
  it("brings Knocked-out players back without a roll and sets everyone up again", async () => {
    const game = deathbowlGame();
    await setUpAll(game);
    const knocked = game.ctx.teams[1].players.find((player) => player.gridPosition);
    if (!knocked) throw new Error("East fielded nobody.");
    delete knocked.gridPosition;
    knocked.status = PlayerStatus.KO;
    const rolls = vi.spyOn(game.ctx.rng, "rollDie");

    await endTurnsUntil(
      game,
      () => game.ctx.gameService.getPhase() === GamePhase.SETUP
    );

    expect(knocked.status).toBe(PlayerStatus.RESERVE);
    expect(rolls).not.toHaveBeenCalled();
    expect(
      game.ctx.teams.flatMap((team) => team.players).filter((p) => p.gridPosition)
    ).toEqual([]);
    expect(game.ctx.gameService.getState().balls.map(({ at }) => at)).toEqual([
      null,
      null,
    ]);
  });
});

describe("re-rolls once per match (DB-D2)", () => {
  it("keeps spent team and Leader re-rolls spent after half time", async () => {
    const game = deathbowlGame();
    const [north] = game.ctx.teams;
    const leader = north.players[0];
    if (!leader) throw new Error("North has no players.");
    leader.skills.push(getSkill(SkillType.LEADER));
    await setUpAll(game);
    const state = game.ctx.gameService.getState();
    expect(state.leaderRerolls?.teamIds).toContain("seat0");
    state.teamRerollsUsed = { seat0: 1 };
    state.leaderRerolls = { half: "h1", teamIds: [] };

    await endTurnsUntil(
      game,
      () => game.ctx.gameService.getState().turn.isHalf2 &&
        game.ctx.gameService.getPhase() === GamePhase.PLAY
    );

    expect(state.teamRerollsUsed).toEqual({ seat0: 1 });
    expect(state.leaderRerolls).toEqual({ half: "h1", teamIds: [] });
  });
});

describe("placings (DB-R2)", () => {
  it("places by points, tied teams sharing a place, touchdowns alongside", () => {
    expect(
      placings([
        { teamId: "north", points: 12, touchdowns: 1 },
        { teamId: "east", points: 20, touchdowns: 2 },
        { teamId: "south", points: 12, touchdowns: 0 },
        { teamId: "west", points: 3, touchdowns: 0 },
      ])
    ).toEqual([
      { teamId: "east", points: 20, touchdowns: 2, place: 1 },
      { teamId: "north", points: 12, touchdowns: 1, place: 2 },
      { teamId: "south", points: 12, touchdowns: 0, place: 2 },
      { teamId: "west", points: 3, touchdowns: 0, place: 4 },
    ]);
  });

  it("starts every seat level on zero points", async () => {
    const game = deathbowlGame();
    await setUpAll(game);
    await endTurnsUntil(
      game,
      () => game.ctx.gameService.getPhase() === GamePhase.GAME_OVER
    );
    expect(game.snapshot().points).toEqual({ seat0: 0, seat1: 0, seat2: 0, seat3: 0 });
  });
});

describe("save and resume", () => {
  it("resumes a second-half save to the same snapshot", async () => {
    const game = deathbowlGame();
    await setUpAll(game);
    await endTurnsUntil(
      game,
      () => game.ctx.gameService.getState().turn.isHalf2 &&
        game.ctx.gameService.getPhase() === GamePhase.PLAY &&
        game.ctx.gameService.getState().turn.turnNumber === 3
    );
    const resumed = new HeadlessGame({ matchSave: game.matchSave() });

    expect(snapshotHash(resumed.snapshot())).toBe(snapshotHash(game.snapshot()));
    expect(resumed.snapshot().turnManager?.rotation).toBe(-1);
    expect(resumed.snapshot().extraBalls).toHaveLength(1);
    const next = async (from: HeadlessGame) => {
      await from.execute({ type: "end-turn" });
      return turnLabel(from);
    };
    expect(await next(resumed)).toBe(await next(game));
  });
});

describe("the touchdown seam", () => {
  it("names the missing Deathbowl touchdown rather than scoring it", async () => {
    const game = deathbowlGame();
    await setUpAll(game);
    const { gameService } = game.ctx;
    const carrier = seatOf(gameService.getSeating(), "seat0").team.players.find(
      (player) => player.gridPosition
    );
    if (!carrier) throw new Error("North fielded nobody.");
    expect(() => {
      gameService.addTouchdown(carrier.id);
    }).toThrow(DeathbowlTouchdownPending);
  });
});
