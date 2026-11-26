import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { type Scenario } from "../../src/types/Scenario";
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

export const kickoffResultSchema = z.object({
  roll: z.number(),
  event: z.enum(KickoffEvent),
  meaning: z.string(),
  outcome: z.object({
    event: z.enum(KickoffEvent),
    meaning: z.string(),
    perTeam: z.record(z.string(), z.string().array()),
  }),
});

export async function kick(seed: number) {
  const game = new HeadlessGame({ scenario: kickoffScenario, seed });
  game.ctx.gameService.seedTurnCounts(2);
  const response = await game.execute({
    type: "kick-ball",
    playerId: fixtureValue(game.ctx.team1.players[0]).id,
    x: 14,
    y: 5,
  });
  const result = kickoffResultSchema.parse(
    response.events.find((event) => event.name === GameEventNames.KickoffResult)
      ?.data
  );
  return { game, response, result };
}

export async function findEveryEvent() {
  const found = new Map<KickoffEvent, Awaited<ReturnType<typeof kick>>>();
  for (let seed = 1; seed <= 800 && found.size < 11; seed++) {
    const run = await kick(seed);
    const needsPending = INTERACTIVE_KICKOFF_EVENTS.has(run.result.event);
    const hasPending = run.response.pendingDecision?.type === "kickoff-event";
    const pending = run.response.pendingDecision;
    const landing =
      pending?.type === "kickoff-event" ? pending.landingSquare : undefined;
    const highKickLandingEmpty =
      run.result.event !== KickoffEvent.HIGH_KICK ||
      (run.response.pendingDecision?.type === "kickoff-event" &&
        !!run.response.pendingDecision.landingSquare &&
        run.game
          .snapshot()
          .teams.flatMap((team) => team.players)
          .every(
            (player) =>
              !(player.position?.x === fixtureValue(landing).x &&
              player.position.y === fixtureValue(landing).y)
          ));

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
