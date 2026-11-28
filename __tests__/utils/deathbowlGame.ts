import { vi } from "vitest";
import type { HeadlessCommand } from "../../src/headless/protocol";
import { placeBall } from "../../src/game/rules/balls";
import { movePlayerToBox } from "../../src/game/rules/playerLocation";
import { seatOf } from "../../src/game/seating";
import type { Player } from "../../src/types/Player";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import { arenaSquad } from "../../src/game/deathbowl/squad";
import { DEATHBOWL_FORMAT } from "../../src/game/variants/activeMatch";
import { enumerateDecision } from "../../src/simulation/candidates";
import { GamePhase } from "../../src/types/GameState";
import { RosterName } from "../../src/types/Team";

const ROSTERS = [
  RosterName.HUMAN,
  RosterName.ORC,
  RosterName.SKAVEN,
  RosterName.DWARF,
];

export function deathbowlGame(): HeadlessGame {
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

export async function setUpSeat(game: HeadlessGame): Promise<string> {
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

export async function setUpAll(game: HeadlessGame): Promise<string[]> {
  const order: string[] = [];
  while (game.ctx.gameService.getPhase() === GamePhase.SETUP) {
    order.push(await setUpSeat(game));
  }
  return order;
}

export function rig(game: HeadlessGame, rolls: readonly number[]) {
  const spy = vi.spyOn(game.ctx.rng, "rollDie");
  for (const roll of rolls) spy.mockReturnValueOnce(roll);
  return spy;
}

export interface Square {
  x: number;
  y: number;
}

const PARKED = { x: 10, y: 12 };

export async function northToPlay(): Promise<HeadlessGame> {
  const game = deathbowlGame();
  for (let seat = 0; seat < 3; seat++) await setUpSeat(game);
  rig(game, [7, 2, 6, 1, 1, 1]);
  await setUpSeat(game);
  placeBall(game.ctx.gameService.getState(), 1, PARKED);
  return game;
}

export const stateOf = (game: HeadlessGame) => game.ctx.gameService.getState();

export function fielded(game: HeadlessGame, teamId: string): Player[] {
  const { team } = seatOf(game.ctx.gameService.getSeating(), teamId);
  return team.players.filter((player) => player.gridPosition);
}

export function fieldedAt(game: HeadlessGame, teamId: string, index: number): Player {
  const player = fielded(game, teamId)[index];
  if (!player) throw new Error(`${teamId} has no fielded player ${String(index)}.`);
  return player;
}

export function put(
  game: HeadlessGame,
  player: Player,
  { at, ball }: { at: Square; ball?: 0 | 1 }
): void {
  movePlayerToBox(player, { box: "pitch", position: at });
  if (ball !== undefined) placeBall(stateOf(game), ball, at);
}

export async function play(game: HeadlessGame, command: HeadlessCommand) {
  const response = await game.execute(command);
  if (!response.ok) throw new Error(`${command.type}: ${String(response.reason)}`);
  return response;
}

export async function northWithBallsAside(): Promise<HeadlessGame> {
  const game = await northToPlay();
  placeBall(stateOf(game), 0, { x: 8, y: 0 });
  placeBall(stateOf(game), 1, { x: 12, y: 0 });
  return game;
}

export function stand(
  game: HeadlessGame,
  [seat, index]: readonly [string, number],
  { at, ball }: { at: Square; ball?: 0 | 1 }
): Player {
  const player = fieldedAt(game, seat, index);
  put(game, player, { at, ...(ball !== undefined && { ball }) });
  return player;
}
