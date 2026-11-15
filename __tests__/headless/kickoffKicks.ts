/**
 * The kickoff the Sevens kickoff event tests share: a seeded kick from a
 * fixed scenario, and a search for a seed that rolls every event.
 */

import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { Scenario } from "../../src/types/Scenario";
import { GameEventNames } from "../../src/types/events";
import {
  INTERACTIVE_KICKOFF_EVENTS,
  KickoffEvent,
} from "../../src/game/kickoff/kickoffEvents";

export const kickoffScenario: Scenario = {
  id: "kickoff-events",
  name: "Kickoff events",
  description: "Seven Open players per team and a team-one kick.",
  setup: {
    team1Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
      playerIndex,
      x: 5,
      y: playerIndex + 2,
    })),
    team2Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
      playerIndex,
      x: 14,
      y: playerIndex + 2,
    })),
    activeTeam: "team2",
    turn: 2,
    phase: GamePhase.KICKOFF,
    subPhase: SubPhase.ROLL_KICKOFF,
  },
};

export type KickoffResult = {
  roll: number;
  event: KickoffEvent;
  meaning: string;
  outcome: {
    event: KickoffEvent;
    meaning: string;
    perTeam: Record<string, string[]>;
  };
};

export async function kick(seed: number) {
  const game = new HeadlessGame({ scenario: kickoffScenario, seed });
  game.ctx.gameService.seedTurnCounts(2);
  const response = await game.execute({
    type: "kick-ball",
    playerId: game.ctx.team1.players[0].id,
    x: 14,
    y: 5,
  });
  const result = response.events.find(
    (event) => event.name === GameEventNames.KickoffResult
  )?.data as KickoffResult | undefined;
  if (!result) throw new Error(`seed ${seed} produced no kickoff result`);
  return { game, response, result };
}

export async function findEveryEvent() {
  const found = new Map<
    KickoffEvent,
    Awaited<ReturnType<typeof kick>>
  >();
  for (let seed = 1; seed <= 800 && found.size < 11; seed++) {
    const run = await kick(seed);
    const needsPending = INTERACTIVE_KICKOFF_EVENTS.has(run.result.event);
    const hasPending = run.response.pendingDecision?.type === "kickoff-event";
    const highKickLandingEmpty =
      run.result.event !== KickoffEvent.HIGH_KICK ||
      (run.response.pendingDecision?.type === "kickoff-event" &&
        !!run.response.pendingDecision.landingSquare &&
        !run.game
          .snapshot()
          .teams.flatMap((team) => team.players)
          .some(
            (player) =>
              player.position?.x ===
                run.response.pendingDecision!.landingSquare!.x &&
              player.position?.y ===
                run.response.pendingDecision!.landingSquare!.y
          ));
    // High Kick can be suppressed by a touchback; retain a seed whose landing
    // square exists so the interactive requirement is actually exercised.
    if (
      !found.has(run.result.event) &&
      (!needsPending || hasPending) &&
      highKickLandingEmpty
    ) {
      found.set(run.result.event, run);
    } else if (hasPending) {
      await run.game.execute({ type: "kickoff-skip" });
    }
  }
  return found;
}
