/** The lab and behavior tests drive the same public coach and command engine. */
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../../src/types/GameState";
import type { ScenarioSetup } from "../../../src/types/Scenario";
import { enumerateDecision } from "../../../src/simulation/candidates";
import type { Coach } from "../../../src/simulation/coach";
import { createCoachRng } from "../../../src/simulation/rng";

export function tacticalGame(
  setup: Partial<ScenarioSetup>,
  options: {
    seed?: number;
    league?: boolean;
    half2?: boolean;
    score?: [number, number];
    opponentTurnsPlayed?: number;
  } = {}
): HeadlessGame {
  const game = new HeadlessGame({
    seed: options.seed ?? 1,
    progressionEnabled: options.league ?? false,
    scenario: {
      id: "policy-lab",
      name: "Tactical policy contract",
      description: "A controlled tactical state, not a purchased team build.",
      setup: {
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        activeTeam: "team1",
        turn: 6,
        teamRerolls: { team1: 0, team2: 0 },
        team2Placements: [{ playerIndex: 0, x: 1, y: 1 }],
        ...setup,
      },
    },
  });
  const state = game.ctx.gameService.getState();
  if (options.league) game.ctx.team1.advancementMode = "advanced-league";
  if (options.half2) state.turn.isHalf2 = true;
  if (options.score) {
    state.score[game.ctx.team1.id] = options.score[0];
    state.score[game.ctx.team2.id] = options.score[1];
  }
  if (options.opponentTurnsPlayed !== undefined) {
    const turns = game.ctx.gameService.captureTurnManagerState();
    turns.turnCounts[game.ctx.team2.id] = options.opponentTurnsPlayed;
    game.ctx.gameService.restoreTurnManagerState(turns);
  }
  return game;
}

export async function coachStep(game: HeadlessGame, coach: Coach) {
  const point = await enumerateDecision(game, null);
  const choice = await coach.choose({
    game,
    snapshot: game.snapshot(),
    point,
    rng: createCoachRng(1),
  });
  const candidate = point.candidates[choice.index];
  if (!candidate) throw new Error(`Invalid coach choice ${choice.index}`);
  for (const command of candidate.commands) {
    const response = await game.execute(command);
    if (!response.ok)
      throw new Error(`Rejected selected command: ${JSON.stringify(command)}`);
  }
  return { command: candidate.commands[0], note: choice.note };
}
