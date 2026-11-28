import { describe, expect, it, vi } from "vitest";
import type { HeadlessGame } from "../../src/headless/HeadlessGame";
import type { HeadlessCommand } from "../../src/headless/protocol";
import { ballSquare, placeBall } from "../../src/game/rules/balls";
import { movePlayerToBox } from "../../src/game/rules/playerLocation";
import { seatOf } from "../../src/game/seating";
import { type Player, PlayerStatus } from "../../src/types/Player";
import { getSkill, SkillType } from "../../src/types/Skills";
import { deathbowlGame, rig, setUpSeat } from "../utils/deathbowlGame";

interface Square {
  x: number;
  y: number;
}

const PARKED = { x: 10, y: 12 };

async function northToPlay(): Promise<HeadlessGame> {
  const game = deathbowlGame();
  for (let seat = 0; seat < 3; seat++) await setUpSeat(game);
  rig(game, [7, 2, 6, 1, 1, 1]);
  await setUpSeat(game);
  placeBall(game.ctx.gameService.getState(), 1, PARKED);
  return game;
}

const stateOf = (game: HeadlessGame) => game.ctx.gameService.getState();

function fielded(game: HeadlessGame, teamId: string): Player[] {
  const { team } = seatOf(game.ctx.gameService.getSeating(), teamId);
  return team.players.filter((player) => player.gridPosition);
}

function fieldedAt(game: HeadlessGame, teamId: string, index: number): Player {
  const player = fielded(game, teamId)[index];
  if (!player) throw new Error(`${teamId} has no fielded player ${String(index)}.`);
  return player;
}

function put(
  game: HeadlessGame,
  player: Player,
  { at, ball }: { at: Square; ball?: 0 | 1 }
): void {
  movePlayerToBox(player, { box: "pitch", position: at });
  if (ball !== undefined) placeBall(stateOf(game), ball, at);
}

async function play(game: HeadlessGame, command: HeadlessCommand) {
  const response = await game.execute(command);
  if (!response.ok) throw new Error(`${command.type}: ${String(response.reason)}`);
  return response;
}

async function northScores(
  game: HeadlessGame,
  rolls: readonly number[],
  path: readonly Square[] = [{ x: 5, y: 20 }]
): Promise<Player> {
  const carrier = fieldedAt(game, "seat0", 0);
  put(game, carrier, { at: { x: 5, y: 19 }, ball: 0 });
  rig(game, rolls);
  await play(game, { type: "declare-action", playerId: carrier.id, action: "move" });
  await play(game, { type: "move", playerId: carrier.id, path: [...path] });
  return carrier;
}

const endActivation = (game: HeadlessGame, carrier: Player) =>
  play(game, { type: "end-activation", playerId: carrier.id });

describe("a touchdown does not end the drive (DB-F2)", () => {
  it("re-enters the ball, lets the carrier finish its move, then ends the turn", async () => {
    const game = await northToPlay();
    const carrier = await northScores(game, [1], [
      { x: 5, y: 20 },
      { x: 5, y: 19 },
      { x: 5, y: 18 },
    ]);
    const state = stateOf(game);

    expect(state.score).toEqual({ seat0: 1, seat1: 0, seat2: 0, seat3: 0 });
    expect(ballSquare(state, 0)).toEqual({ x: 9, y: 9 });
    expect(carrier.gridPosition).toEqual({ x: 5, y: 18 });
    expect(state.turn.movementUsed.get(carrier.id)).toBe(3);
    expect(state.activeTeamId).toBe("seat0");
    expect(state.turn.endsAfterActivation).toBe(true);

    await endActivation(game, carrier);
    expect(state.stallingPlayerIds).toBeUndefined();
    expect(carrier.status).toBe(PlayerStatus.ACTIVE);
    expect(state.turn.teamId).toBe("seat1");
    expect(state.turn.scoringTeamIds).toBeUndefined();
    expect(state.turn.endsAfterActivation).toBeUndefined();
  });

  it("strips the other ball from the scoring team and re-enters both", async () => {
    const game = await northToPlay();
    const holder = fieldedAt(game, "seat0", 1);
    put(game, holder, { at: { x: 10, y: 13 }, ball: 1 });
    await northScores(game, [1, 8]);
    const state = stateOf(game);

    expect(ballSquare(state, 0)).toEqual({ x: 9, y: 9 });
    expect(ballSquare(state, 1)).toEqual({ x: 11, y: 11 });
    expect(holder.gridPosition).toEqual({ x: 10, y: 13 });
    expect(state.score.seat0).toBe(1);
  });

  it("scores for a carrier pushed into its end zone and the blocker's turn goes on", async () => {
    const game = await northToPlay();
    const attacker = fieldedAt(game, "seat0", 0);
    const carrier = fieldedAt(game, "seat2", 0);
    put(game, attacker, { at: { x: 5, y: 2 } });
    put(game, carrier, { at: { x: 5, y: 1 }, ball: 0 });
    vi.spyOn(game.ctx.rng, "rollMultipleDice").mockReturnValueOnce([3]);
    rig(game, [1]);

    await play(game, { type: "declare-action", playerId: attacker.id, action: "block" });
    await play(game, { type: "block", attackerId: attacker.id, defenderId: carrier.id });
    await play(game, { type: "choose-block-result", index: 0 });
    await play(game, { type: "choose-push-direction", x: 5, y: 0 });
    await play(game, { type: "choose-follow-up", followUp: false });
    const state = stateOf(game);

    expect(carrier.gridPosition).toEqual({ x: 5, y: 0 });
    expect(state.score).toEqual({ seat0: 0, seat1: 0, seat2: 1, seat3: 0 });
    expect(ballSquare(state, 0)).toEqual({ x: 9, y: 9 });
    expect(state.activeTeamId).toBe("seat0");
    expect(state.turn.endsAfterActivation).toBeUndefined();
    expect(state.turn.scoringTeamIds).toEqual(["seat2"]);
  });
});

describe("a ball re-enters in the centre (DB-F3)", () => {
  it("bounces once off a Prone player", async () => {
    const game = await northToPlay();
    const prone = fieldedAt(game, "seat1", 0);
    put(game, prone, { at: { x: 9, y: 9 } });
    prone.status = PlayerStatus.PRONE;
    await northScores(game, [1, 5]);

    expect(ballSquare(stateOf(game), 0)).toEqual({ x: 10, y: 9 });
  });

  it("bounces once off the other ball and leaves it where it lies", async () => {
    const game = await northToPlay();
    placeBall(stateOf(game), 1, { x: 9, y: 9 });
    await northScores(game, [1, 5]);

    expect(ballSquare(stateOf(game), 0)).toEqual({ x: 10, y: 9 });
    expect(ballSquare(stateOf(game), 1)).toEqual({ x: 9, y: 9 });
  });

  it("bounces off a standing carrier of the other ball, who has No Hands for it (DB-B1)", async () => {
    const game = await northToPlay();
    const carrier = fieldedAt(game, "seat1", 0);
    put(game, carrier, { at: { x: 9, y: 9 }, ball: 1 });
    await northScores(game, [1, 5]);

    expect(ballSquare(stateOf(game), 0)).toEqual({ x: 10, y: 9 });
    expect(ballSquare(stateOf(game), 1)).toEqual({ x: 9, y: 9 });
  });

  it("lets a standing player without a ball catch it", async () => {
    const game = await northToPlay();
    const catcher = fieldedAt(game, "seat1", 0);
    put(game, catcher, { at: { x: 9, y: 9 } });
    await northScores(game, [1, 6]);

    expect(ballSquare(stateOf(game), 0)).toEqual({ x: 9, y: 9 });
    expect(catcher.gridPosition).toEqual({ x: 9, y: 9 });
  });
});

const line = (x: number) =>
  Array.from({ length: 7 }, (_, i) => ({ x, y: 7 + i }));

describe("after a scoring turn (DB-F4)", () => {
  it("rolls for Knocked-out players, then offers each seat its reserves in turn order", async () => {
    const game = await northToPlay();
    const east = fielded(game, "seat1");
    const west = fielded(game, "seat3");
    const [eastKo, ...eastLine] = east;
    const [westKo, ...westBack] = west;
    if (!eastKo || !westKo) throw new Error("A seat fielded nobody.");
    for (const [i, player] of eastLine.entries()) put(game, player, { at: { x: 14, y: 7 + i } });
    for (const [i, player] of westBack.entries()) put(game, player, { at: { x: 3, y: 7 + i } });
    movePlayerToBox(eastKo, { box: "ko" });
    movePlayerToBox(westKo, { box: "ko" });
    const carrier = await northScores(game, [1]);

    rig(game, [6, 1]);
    const ended = await endActivation(game, carrier);
    expect(eastKo.status).toBe(PlayerStatus.RESERVE);
    expect(westKo.status).toBe(PlayerStatus.KO);
    expect(ended.pendingDecision).toMatchObject({
      type: "reserve-move",
      chooserTeamId: "seat1",
      squares: line(15),
    });

    const moved = await play(game, { type: "move-reserve", playerId: eastKo.id, x: 15, y: 10 });
    expect(eastKo.gridPosition).toEqual({ x: 15, y: 10 });
    expect(eastKo.status).toBe(PlayerStatus.ACTIVE);
    expect(moved.pendingDecision).toMatchObject({
      type: "reserve-move",
      chooserTeamId: "seat3",
      squares: line(6),
    });

    await play(game, { type: "keep-reserves" });
    expect(fielded(game, "seat3")).toHaveLength(7);
    expect(stateOf(game).turn.teamId).toBe("seat1");
  });
});

describe("Secret Weapons (DB-F6)", () => {
  it("stay on until their own team scores, then are Sent-off", async () => {
    const game = await northToPlay();
    const weapon = fieldedAt(game, "seat3", 0);
    weapon.skills.push(getSkill(SkillType.SECRET_WEAPON));
    const carrier = await northScores(game, [1]);
    await endActivation(game, carrier);
    expect(weapon.status).toBe(PlayerStatus.ACTIVE);
    expect(stateOf(game).turn.teamId).toBe("seat1");

    const reentryThenArgueThenBriberyReroll = [1, 1, 1];
    rig(game, reentryThenArgueThenBriberyReroll);
    game.ctx.gameService.addTouchdown(fieldedAt(game, "seat3", 1).id);
    const ended = await play(game, { type: "end-turn" });
    expect(ended.pendingDecision).toMatchObject({ type: "reserve-move", chooserTeamId: "seat3" });
    await play(game, { type: "keep-reserves" });

    expect(stateOf(game).score.seat3).toBe(1);
    expect(weapon.status).toBe(PlayerStatus.REMOVED);
    expect(weapon.gridPosition).toBeUndefined();
    expect(stateOf(game).turn.teamId).toBe("seat2");
  });
});
