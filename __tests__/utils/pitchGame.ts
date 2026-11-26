import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type PlayerPlacement, type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { BounceOperation } from "../../src/game/operations/BounceOperation";
import type { MatchFormat } from "../../src/game/variants/activeMatch";
import { fixtureValue } from "../../src/testing/fixtureValue";

export const SEVENS: MatchFormat = { gameType: "sevens", venue: "stadium" };
export const STREET: MatchFormat = { gameType: "street-bowl", venue: "street" };
export const BEACH: MatchFormat = { gameType: "beach-bowl", venue: "beach" };
export const MARKET: MatchFormat = { gameType: "gutter-bowl", venue: "gutter-street" };
export const SEWER: MatchFormat = { gameType: "gutter-bowl", venue: "gutter-sewer" };

export interface Pitch {
  format: MatchFormat;
  team1?: PlayerPlacement[];
  team2?: PlayerPlacement[];
  ball?: { x: number; y: number };
}

export function pitchGame({ format, team1 = [], team2 = [], ball }: Pitch) {
  const scenario: Scenario = {
    id: "game-type-pitch",
    name: "Game type pitch",
    description: "",
    setup: {
      team1Placements: team1,
      team2Placements: team2,
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ...(ball && { ballPosition: ball }),
    },
  };
  const game = new HeadlessGame({ scenario, seed: 1, format });
  const rolls: string[] = [];
  game.ctx.eventBus.on(GameEventNames.DiceRoll, (roll) =>
    rolls.push(`${roll.rollType} ${String(roll.value)}`)
  );
  const wallHits: unknown[] = [];
  game.ctx.eventBus.on(GameEventNames.BallHitWall, (hit) => wallHits.push(hit));
  return { game, rolls, wallHits };
}

export async function bounceFrom(
  game: HeadlessGame,
  square: { x: number; y: number }
) {
  game.ctx.gameService.setBallPosition(square.x, square.y);
  await game.ctx.gameService
    .getFlowContext()
    .flowManager.runToRest(new BounceOperation(square));
  return game.ctx.gameService.getState().ballPosition;
}

export async function blockAndPush(
  game: HeadlessGame,
  push: { x: number; y: number }
) {
  const attacker = fixtureValue(game.ctx.team1.players[0]);
  const defender = fixtureValue(game.ctx.team2.players[0]);
  await game.execute({
    type: "declare-action",
    playerId: attacker.id,
    action: "block",
  });
  await game.execute({
    type: "block",
    attackerId: attacker.id,
    defenderId: defender.id,
  });
  const offered = await game.execute({ type: "choose-block-result", index: 0 });
  const response = await game.execute({
    type: "choose-push-direction",
    ...push,
  });
  return { attacker, defender, offered, response };
}

export const PUSH = 3;
export const POW = 5;



export {forceDice} from "./test-helpers";
