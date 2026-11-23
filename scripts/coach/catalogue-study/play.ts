import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { createComputerTeamFromTemplate } from "../../../src/competition/computerTeamTemplates";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import { stabilizeIds } from "../../../src/headless/createHeadlessGame";
import { GamePhase } from "../../../src/types/GameState";
import { makeCoach } from "../../../src/simulation/commands/shared";
import {
  type MatchRecording,
  type RecordedStep,
  runMatch,
} from "../../../src/simulation/runMatch";
import { createTelemetry } from "./telemetry";
import type { StudyGame, StudyJob } from "./model";
import type { Team } from "../../../src/types/Team";
import type { Coach } from "../../../src/simulation/coach";
import { InjuryType } from "../../../src/types/Player";
import { computerInducementPurchases } from "../../../src/game/inducements/computerPurchases";
import type { HeadlessCommand } from "../../../src/headless/protocol";
import { startingFreeInducements } from "../../../src/game/inducements/catalog";
import { DEFAULT_GAME_TYPE } from "../../../src/game/variants/gameTypes";

async function mustExecute(
  game: HeadlessGame,
  command: HeadlessCommand,
  team: 0 | 1
): Promise<RecordedStep> {
  const response = await game.execute(command);
  if (!response.ok)
    throw new Error(`${command.type} refused: ${String(response.reason)}`);
  return { command, ok: true, team, label: "Buy inducements" };
}

export function withInducementFlag<Job extends StudyJob>(
  jobs: Job[],
  args: readonly string[]
): Job[] {
  const inducements = !args.includes("--no-inducements");
  return jobs.map((job) => ({ ...job, inducements }));
}

async function settleInducements(
  game: HeadlessGame,
  shopping: boolean
): Promise<RecordedStep[]> {
  const offer = game.ctx.gameService.getInducementOffer();
  const steps: RecordedStep[] = [];
  for (const [team, teamId] of [
    game.ctx.team1.id,
    game.ctx.team2.id,
  ].entries()) {
    const side = team === 0 ? 0 : 1;
    const basket = shopping ? computerInducementPurchases(offer, teamId) : [];
    for (const line of basket)
      steps.push(
        await mustExecute(
          game,
          { type: "select-inducement", teamId, ...line },
          side
        )
      );
    steps.push(
      await mustExecute(game, { type: "confirm-inducements", teamId }, side)
    );
  }
  return steps;
}

function withLeadingSteps(
  recording: MatchRecording,
  leading: RecordedStep[]
): MatchRecording {
  return {
    ...recording,
    steps: [...leading, ...recording.steps],
    findings: recording.findings.map((finding) => ({
      ...finding,
      step: finding.step + leading.length,
    })),
  };
}

function openingReceiver(
  recording: MatchRecording,
  team1Id: string
): { initialReceivingSide?: 0 | 1 } {
  const opening = recording.steps.find(
    (step) => step.command.type === "start-setup"
  );
  if (opening?.command.type !== "start-setup" || !opening.ok) return {};
  return {
    initialReceivingSide: opening.command.kickingTeamId === team1Id ? 1 : 0,
  };
}

export async function playStudyGame(
  job: StudyJob,
  out: string,
  suppliedTeams?: [Team, Team],
  suppliedCoaches?: [Coach, Coach]
): Promise<StudyGame> {
  const started = Date.now();
  const draft = job.format ? { gameType: job.format.gameType } : {};
  const side = (i: 0 | 1) =>
    stabilizeIds(
      suppliedTeams?.[i] ??
        createComputerTeamFromTemplate(job.templates[i], draft),
      `team${String(i + 1)}`
    );
  const team1 = side(0);
  const team2 = side(1);
  const game = new HeadlessGame({
    seed: job.seed,
    team1,
    team2,
    startingPhase: GamePhase.SETUP,
    progressionEnabled: job.persistentInjuries ?? false,
    ...(job.format ? { format: job.format } : {}),
  });
  const participants = [team1.players.slice(), team2.players.slice()];
  const initial = game.matchSave();
  const telemetry = createTelemetry(game);
  const freeAtStart =
    startingFreeInducements(job.format?.gameType ?? DEFAULT_GAME_TYPE).length >
    0;
  const bought =
    job.inducements === true || freeAtStart
      ? await settleInducements(game, job.inducements === true)
      : [];
  const coaches = job.coaches.map((name, side) =>
    telemetry.wrap(suppliedCoaches?.[side] ?? makeCoach(name, []))
  ) as Parameters<typeof runMatch>[0]["coaches"];
  const played = await runMatch({
    seed: job.seed,
    rosters: [team1.rosterName, team2.rosterName],
    coaches,
    game,
    inducements: false,
    ...(job.receivingSide === undefined
      ? {}
      : { kickingTeamId: job.receivingSide === 0 ? team2.id : team1.id }),
  });
  const recording = withLeadingSteps(played, bought);
  const observed = telemetry.snapshot();

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
    ...openingReceiver(recording, team1.id),
    playerLosses: participants.map((players) => ({
      deaths: players.filter((p) => p.injuries.includes(InjuryType.DEAD))
        .length,
      missNextGame: players.filter((p) =>
        p.injuries.includes(InjuryType.MISS_NEXT_GAME)
      ).length,
    })),
  };
}
