import { appendFileSync } from "node:fs";
import {
  createComputerTeamFromTemplate,
  getComputerTeamTemplates,
} from "../../../src/competition/computerTeamTemplates";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import { stabilizeIds } from "../../../src/headless/createHeadlessGame";
import { GamePhase } from "../../../src/types/GameState";
import { runMatch } from "../../../src/simulation/runMatch";
import { createPlannerCoach } from "../../../src/simulation/ai/planner";
import {
  DEFAULT_WEIGHTS,
  ROSTER_WEIGHTS,
} from "../../../src/simulation/ai/weights";
import { calculateInducementBudgets } from "../../../src/game/inducements/rules";
import { sevensInducementCatalog } from "../../../src/game/inducements/catalog";
import {
  Inducement,
  buildSeventsInducementProfile,
  type InducementInventoryEntry,
} from "../../../src/types/Inducements";
import { RosterName, calculateTeamValue, type Team } from "../../../src/types/Team";

type Mode = "none" | "petty" | "chef";
const [modeArg, shardArg, seedsArg, out, rosterArg] = process.argv.slice(2);
const mode = (modeArg ?? "none") as Mode;
const [shard, shards] = (shardArg ?? "0/1").split("/").map(Number) as [
  number,
  number,
];
const seeds = Number(seedsArg ?? "2");
const focus = (rosterArg ?? RosterName.HALFLING) as RosterName;

const COMPUTER_LIST = [
  Inducement.EXTRA_TEAM_TRAINING,
  Inducement.BLITZERS_BEST_KEGS,
  Inducement.PART_TIME_ASSISTANT_COACH,
  Inducement.TEMP_AGENCY_CHEERLEADER,
];

function shopping(team: Team, budget: number): InducementInventoryEntry[] {
  const catalog = sevensInducementCatalog(team);
  const list =
    mode === "chef" && team.rosterName === RosterName.HALFLING
      ? [Inducement.HALFLING_MASTER_CHEF, ...COMPUTER_LIST]
      : COMPUTER_LIST;
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

const templates = getComputerTeamTemplates();
const builds = templates.filter((t) => t.rosterName === focus);
const opponents = templates.filter((t) => t.rosterName !== focus);
const jobs: { build: string; opponent: string; seed: number; side: 0 | 1 }[] =
  [];
builds.forEach((b, bi) =>
  opponents.forEach((o, oi) => {
    for (let k = 0; k < seeds; k++)
      for (const side of [0, 1] as const)
        jobs.push({
          build: b.id,
          opponent: o.id,
          seed: 31_000_000 + oi * 1000 + k * 10 + side,
          side,
        });
    void bi;
  })
);

async function play(job: (typeof jobs)[number]) {
  const ids = job.side === 0 ? [job.build, job.opponent] : [job.opponent, job.build];
  const team1 = stabilizeIds(createComputerTeamFromTemplate(ids[0]!), "team1");
  const team2 = stabilizeIds(createComputerTeamFromTemplate(ids[1]!), "team2");
  const game = new HeadlessGame({
    seed: job.seed,
    team1,
    team2,
    startingPhase: GamePhase.SETUP,
  });
  const tv = [calculateTeamValue(team1), calculateTeamValue(team2)];
  let bought: InducementInventoryEntry[] = [];
  if (mode !== "none") {
    const budgets = calculateInducementBudgets(team1, team2);
    bought = [
      ...shopping(team1, budgets[team1.id] ?? 0),
      ...shopping(team2, budgets[team2.id] ?? 0),
    ];
    game.ctx.gameService.commitInducements(
      buildSeventsInducementProfile({ advancedLeague: false }),
      budgets,
      bought
    );
    for (let i = 0; i < 20; i++)
      await new Promise((resolve) => setImmediate(resolve));
  }
  const coach = () =>
    createPlannerCoach({
      name: "planner-skill-plans",
      weights: DEFAULT_WEIGHTS,
      rosters: ROSTER_WEIGHTS,
    });
  const recording = await runMatch({
    seed: job.seed,
    rosters: [team1.rosterName, team2.rosterName],
    coaches: [coach(), coach()],
    game,
    inducements: false,
  });
  const score = recording.final.score;
  const mine = job.side === 0 ? score[0] : score[1];
  const theirs = job.side === 0 ? score[1] : score[0];
  const ownId = job.side === 0 ? team1.id : team2.id;
  appendFileSync(
    out!,
    JSON.stringify({
      ...job,
      mode,
      over: recording.final.phase === GamePhase.GAME_OVER,
      for: mine,
      against: theirs,
      tv,
      chef: game.ctx.gameService.getState().inducements?.masterChef ?? null,
      bought: bought
        .filter((e) => e.ownerTeamId === ownId)
        .map((e) => `${e.inducement}x${String(e.quantity)}`),
      oppBought: bought
        .filter((e) => e.ownerTeamId !== ownId)
        .map((e) => `${e.inducement}x${String(e.quantity)}`),
    }) + "\n"
  );
}

for (let i = shard; i < jobs.length; i += shards) await play(jobs[i]!);
