import { z } from "zod";
import { fixtureValue } from "../../../src/testing/fixtureValue";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import { type Scenario, type PlayerPlacement } from "../../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../../src/types/GameState";
import type { CommandResponse } from "../../../src/headless/protocol";
import { GameEventNames } from "../../../src/types/events";
import { type GameType } from "../../../src/game/variants/gameTypes";
import { gameTypeRules } from "../../../src/game/variants/gameTypeRules";
import { forceDice } from "../../utils/test-helpers";
import { type TeamAdvancementMode } from "../../../src/types/Team";

export function duel(
  team1: Partial<PlayerPlacement>[],
  team2: Partial<PlayerPlacement>[]
): Scenario {
  return {
    id: "game-type-duel",
    name: "Game type duel",
    description: "",
    setup: {
      team1Placements: team1.map((p, playerIndex) => ({
        playerIndex,
        x: 10,
        y: 3,
        ...p,
      })),
      team2Placements: team2.map((p, playerIndex) => ({
        playerIndex,
        x: 11,
        y: 3,
        ...p,
      })),
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 1 },
    },
  };
}

const WATCHED = [
  GameEventNames.DiceRoll,
  GameEventNames.ArmorRolled,
  GameEventNames.InjuryRolled,
  GameEventNames.PlayerCasualtyInflicted,
  GameEventNames.SkillTriggered,
  GameEventNames.UI_Turnover,
  GameEventNames.UI_GameLog,
  GameEventNames.KORecoveryRolled,
] as const;

export interface League {
  mode: TeamAdvancementMode;
  competition: boolean;
}

export const ADVANCED_LEAGUE: League = {
  mode: "advanced-league",
  competition: true,
};

export function inLeague<T extends { game: HeadlessGame }>(
  s: T,
  league: League | undefined
): T {
  if (!league) return s;
  const { ctx } = s.game;
  if (league.competition) ctx.gameService.getState().competition = true;
  ctx.team1.advancementMode = league.mode;
  ctx.team2.advancementMode = league.mode;
  return s;
}

export function session(gameType: GameType, scenario: Scenario, dice: number[]) {
  const venue = gameTypeRules(gameType).venues[0];
  const game = new HeadlessGame({
    scenario,
    seed: 1,
    format: { gameType, venue },
  });
  forceDice(game.ctx.rng, dice);
  const events: { name: string; data: unknown }[] = [];
  for (const name of WATCHED) {
    game.ctx.eventBus.on(name, (data: unknown) => {
      events.push({ name, data });
    });
  }
  const run = async (command: unknown): Promise<CommandResponse> => {
    let response = await game.execute(command);
    while (response.pendingDecision?.type === "reroll") {
      response = await game.execute({ type: "use-reroll", accept: false });
    }
    return response;
  };
  const dataOf = <T>(name: string, schema: z.ZodType<T>): T[] =>
    events.filter((e) => e.name === name).map((e) => schema.parse(e.data));
  return {
    game,
    run,
    dataOf,
    rolls: () =>
      dataOf("diceRoll", z.object({ description: z.string() })).map(
        (d) => d.description
      ),
    armour: () =>
      dataOf(
        "armorRolled",
        z.object({ roll: z.number(), broken: z.boolean() })
      ),
    player: (team: 1 | 2, index = 0) =>
      fixtureValue(
        (team === 1 ? game.ctx.team1 : game.ctx.team2).players[index]
      ),
  };
}
