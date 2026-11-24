import { HeadlessGame } from "../../src/headless/HeadlessGame";
import type { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import type { Scenario } from "../../src/types/Scenario";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { kickoffScenario } from "./kickoffKicks";

export const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};

export async function rehearse(
  event: KickoffEvent,
  options: { players?: number; scenario?: Scenario; seed?: number } = {}
) {
  const { players, scenario = kickoffScenario, seed = 1 } = options;
  const game = new HeadlessGame({
    scenario,
    seed,
    kickingTeamId: "team1",
  });
  const gs = game.ctx.gameService;
  void gs.rehearseKickoffEvent({
    event,
    isTeam1Kicking: true,
    landing: { x: 17, y: 5 },
    ...(players === undefined ? {} : { selectionLimit: players }),
  });
  await settle();
  const home = (index: number) => fixtureValue(game.ctx.team1.players[index]);
  const away = (index: number) => fixtureValue(game.ctx.team2.players[index]);
  return { game, gs, home, away };
}

export async function choose(game: HeadlessGame, ids: string[]): Promise<void> {
  for (const playerId of ids)
    await game.execute({ type: "kickoff-select-player", playerId });
  await game.execute({ type: "kickoff-confirm" });
}
