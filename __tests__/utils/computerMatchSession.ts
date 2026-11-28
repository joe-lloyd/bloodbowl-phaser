import { fixtureValue } from "../../src/testing/fixtureValue";
import { rollKickoffsAtOnce } from "./computerPregame";

import { afterEach, expect } from "vitest";
import { createComputerMatch } from "../../src/network/ComputerMatch";
import { type OnlineMatch } from "../../src/network/OnlineMatch";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { createLineupTeam } from "../../src/simulation/lineups";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import { enumerateDecision } from "../../src/simulation/candidates";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { createCoachRng } from "../../src/simulation/rng";
import {
  type MatchSave,
  restoreMatchSave,
} from "../../src/headless/serialization";
import { whenEngineQuiet } from "../../src/game/core/GameFlowManager";
import {
  type MatchSaveRepository,
  describeMatchSave,
  setMatchSaveRepository,
} from "../../src/game/persistence/MatchSaveRepository";
import { GamePhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { RosterName } from "../../src/types/Team";
import { type CompetitionContext } from "../../src/competition/types";

const autosave = { difficulty: "standard" };
export const ms = (time: number) =>
  new Promise((resolve) => setTimeout(resolve, time));

export let latest: MatchSave | null = null;

export let writtenOver: (string | null)[] = [];
const repository: MatchSaveRepository = {
  read: () => latest,
  write: (save) => {
    latest = save;
    writtenOver.push(liveGame().pendingDecision()?.type ?? null);
  },
  clear: () => {
    latest = null;
  },
  describe: () => (latest ? describeMatchSave(latest) : null),
};

let match: OnlineMatch | null = null;
afterEach(() => {
  match?.close();
  match = null;
  latest = null;
  writtenOver = [];
  setMatchSaveRepository(null);
  ServiceContainer.reset();
});

export const liveGame = () => fixtureValue(globalThis.__computerMatch).game;

export function startNew(
  pace: number,
  competitionContext?: CompetitionContext
): OnlineMatch {
  setMatchSaveRepository(repository);
  match = createComputerMatch({
    ...(competitionContext !== undefined && {
      competitionContext: competitionContext,
    }),
    eventBus: new EventBus(),
    teams: [
      stabilizeIds(
        createLineupTeam(RosterName.DARK_ELF, "Poin", 0xcc0000),
        "team1"
      ),
      stabilizeIds(
        createLineupTeam(RosterName.HUMAN, "Ready-made", 0x0000cc),
        "team2"
      ),
    ],
    humanTeamId: "team1",
    pace,
    autosave,
  });
  return match;
}

export function resume(save: MatchSave) {
  const restored = restoreMatchSave(save);
  const eventBus = new EventBus();
  rollKickoffsAtOnce(eventBus);
  match = createComputerMatch({
    eventBus,
    teams: restored.teams,
    humanTeamId: "team1",
    pace: 0,
    resume: restored,
    autosave,
  });
  return {
    live: match,
    boardReady: () => {
      eventBus.emit(
        GameEventNames.GameStateRestored,
        liveGame().ctx.gameService.getState()
      );
    },
  };
}

export async function humanStep(
  live: OnlineMatch,
  rng: ReturnType<typeof createCoachRng>
): Promise<number> {
  await whenEngineQuiet();
  const game = liveGame();
  const snapshot = game.snapshot();
  if (
    !live.mayAct() ||
    (snapshot.phase === GamePhase.KICKOFF &&
      !game.pendingDecision() &&
      game.ctx.gameService.getState().kick)
  ) {
    await ms(1);
    return 0;
  }
  const receiver = snapshot.activeTeamId === "team1" ? "team2" : "team1";
  const kicker = snapshot.phase === GamePhase.KICKOFF ? receiver : null;
  const point = await enumerateDecision(game, kicker);
  const { index } = await heuristicCoach.choose({
    game,
    snapshot,
    point,
    rng,
  });
  let commands = 0;
  const { commands: sequence } = fixtureValue(point.candidates[index]);
  for (const command of sequence) {
    const response = await live.run(command);
    expect(response.reason).toBeUndefined();
    commands++;
  }
  return commands;
}

export async function playToHumanTurn(live: OnlineMatch): Promise<void> {
  const rng = createCoachRng(5);
  const humanTurn = () =>
    liveGame().snapshot().phase === GamePhase.PLAY &&
    !liveGame().pendingDecision() &&
    live.mayAct();
  await whenEngineQuiet();
  while (!humanTurn()) {
    await humanStep(live, rng);
    await whenEngineQuiet();
  }
}

export async function savedTurn(teamId: string): Promise<MatchSave> {
  while (latest?.snapshot.activeTeamId !== teamId) await ms(10);
  return latest;
}

export function forgetMatch(): void {
  match = null;
}
