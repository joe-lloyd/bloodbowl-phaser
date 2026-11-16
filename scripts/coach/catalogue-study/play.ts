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

export async function playStudyGame(
  job: StudyJob,
  out: string,
  suppliedTeams?: [Team, Team]
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
  });
  const initial = game.matchSave();
  const telemetry = createTelemetry(game);
  const coaches = job.coaches.map((name) =>
    telemetry.wrap(makeCoach(name, []))
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
  };
}
