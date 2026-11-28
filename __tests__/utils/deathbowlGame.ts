import { vi } from "vitest";
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
