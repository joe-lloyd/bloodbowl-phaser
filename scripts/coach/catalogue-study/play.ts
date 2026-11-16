import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { createComputerTeamFromTemplate } from "../../../src/competition/computerTeamTemplates";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import { stabilizeIds } from "../../../src/headless/createHeadlessGame";
import { GamePhase } from "../../../src/types/GameState";
import { makeCoach } from "../../../src/simulation/commands/shared";
import { runMatch } from "../../../src/simulation/runMatch";
import { createTelemetry } from "./telemetry";
import type { StudyGame, StudyJob } from "./model";
import type { Team } from "../../../src/types/Team";
import type { Coach } from "../../../src/simulation/coach";
import { InjuryType } from "../../../src/types/Player";

export async function playStudyGame(
  job: StudyJob,
  out: string,
  suppliedTeams?: [Team, Team],
  suppliedCoaches?: [Coach, Coach]
): Promise<StudyGame> {
  const started = Date.now();
  const [team1, team2] = job.templates.map((id, i) =>
    stabilizeIds(
      suppliedTeams?.[i] ?? createComputerTeamFromTemplate(id),
      `team${i + 1}`
    )
  );
  const game = new HeadlessGame({
    seed: job.seed,
    team1,
    team2,
    startingPhase: GamePhase.SETUP,
    progressionEnabled: job.persistentInjuries ?? false,
  });
  const participants = [team1.players.slice(), team2.players.slice()];
  if (job.receivingSide !== undefined) {
    const kickingTeamId = job.receivingSide === 0 ? team2.id : team1.id;
    const response = await game.execute({ type: "start-setup", kickingTeamId });
    if (!response.ok) throw new Error("Cannot set requested first receiver");
  }
  const initial = game.matchSave();
  const telemetry = createTelemetry(game);
  const coaches = job.coaches.map((name, side) =>
    telemetry.wrap(suppliedCoaches?.[side] ?? makeCoach(name, []))
  ) as Parameters<typeof runMatch>[0]["coaches"];
  const recording = await runMatch({
    seed: job.seed,
    rosters: [team1.rosterName, team2.rosterName],
    coaches,
    game,
    inducements: false,
  });
  const observed = telemetry.snapshot();
  // The initial save is essential: runMatch's generic recording does not
  // serialize supplied catalogue teams or their unequal reroll banks.
  mkdirSync(join(out, "traces"), { recursive: true });
  writeFileSync(
    join(out, "traces", `${job.id}.json.gz`),
    gzipSync(
      JSON.stringify({
        job,
        initial,
        recording,
        observations: observed,
        observationVersion: 2,
      })
    )
  );
  return {
    ...job,
    ...observed,
    completed: recording.final.phase === GamePhase.GAME_OVER,
    score: recording.final.score,
    stats: recording.stats!,
    findings: recording.findings,
    commands: recording.steps.length,
    ms: Date.now() - started,
    observationVersion: 2,
    initialReceivingSide: initial.drive.receivingTeamId === team1.id ? 0 : 1,
    playerLosses: participants.map((players) => ({
      deaths: players.filter((p) => p.injuries.includes(InjuryType.DEAD))
        .length,
      missNextGame: players.filter((p) =>
        p.injuries.includes(InjuryType.MISS_NEXT_GAME)
      ).length,
    })),
  };
}
