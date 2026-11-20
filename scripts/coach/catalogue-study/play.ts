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
import { calculateInducementBudgets } from "../../../src/game/inducements/rules";
import { sevensInducementCatalog } from "../../../src/game/inducements/catalog";
import {
  Inducement,
  buildSeventsInducementProfile,
  type InducementInventoryEntry,
} from "../../../src/types/Inducements";
import { RosterName } from "../../../src/types/Team";

const PETTY_LIST = [
  Inducement.EXTRA_TEAM_TRAINING,
  Inducement.BLITZERS_BEST_KEGS,
  Inducement.PART_TIME_ASSISTANT_COACH,
  Inducement.TEMP_AGENCY_CHEERLEADER,
];

function pettyShopping(team: Team, budget: number): InducementInventoryEntry[] {
  const catalog = sevensInducementCatalog(team);
  const list =
    process.env["LAB_INDUCEMENTS"] === "chef" &&
    team.rosterName === RosterName.HALFLING
      ? [Inducement.HALFLING_MASTER_CHEF, ...PETTY_LIST]
      : PETTY_LIST;
  let remaining = budget;
  const entries: InducementInventoryEntry[] = [];
  for (const inducement of list) {
    const entry = catalog.find((line) => line.inducement === inducement);
    if (!entry) continue;
    const quantity = Math.min(entry.maxCount, Math.floor(remaining / entry.price));
    if (quantity <= 0) continue;
    remaining -= quantity * entry.price;
    entries.push({
      inducement,
      ownerTeamId: team.id,
      quantity,
      remainingUses: quantity,
      price: quantity * entry.price,
      provenance: "purchased",
    });
  }
  return entries;
}

async function buyPettyCash(game: HeadlessGame, team1: Team, team2: Team) {
  const budgets = calculateInducementBudgets(team1, team2);
  game.ctx.gameService.commitInducements(
    buildSeventsInducementProfile({ advancedLeague: false }),
    budgets,
    [
      ...pettyShopping(team1, budgets[team1.id] ?? 0),
      ...pettyShopping(team2, budgets[team2.id] ?? 0),
    ]
  );
  for (let i = 0; i < 20; i++)
    await new Promise((resolve) => setImmediate(resolve));
}

export async function playStudyGame(
  job: StudyJob,
  out: string,
  suppliedTeams?: [Team, Team],
  suppliedCoaches?: [Coach, Coach]
): Promise<StudyGame> {
  const started = Date.now();
  const side = (i: 0 | 1) =>
    stabilizeIds(
      suppliedTeams?.[i] ?? createComputerTeamFromTemplate(job.templates[i]),
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
  });
  if (process.env["LAB_INDUCEMENTS"]) await buyPettyCash(game, team1, team2);
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
