import { readFileSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import type { MatchSave } from "../../../src/headless/serialization";
import { snapshotHash } from "../../../src/simulation/runMatch";
import type { MatchRecording } from "../../../src/simulation/runMatch";
import { GameEventNames } from "../../../src/types/events";
import { PlayerStatus } from "../../../src/types/Player";
import type { Player } from "../../../src/types/Player";
import { hasSkill, SkillType } from "../../../src/types/Skills";
import { isBigGuy } from "../../../src/game/rules/rosterLegality";
import { processPool } from "../policy-study/pool";
import type { PolicyJob } from "../policy-study/schedule";

const otherSide = (side: 0 | 1): 0 | 1 => (side === 0 ? 1 : 0);

interface Tally {
  fouls: number;
  sentOff: number;

  removed: number;
  casualties: number;

  stunned: number;
}

const tally = (): Tally => ({
  fouls: 0,
  sentOff: 0,
  removed: 0,
  casualties: 0,
  stunned: 0,
});

interface Foul {
  side: 0 | 1;
  key: string;
  target: Player;
  sentOff: boolean;
}

function groupOf(roster: string, p: Player): string {
  const marks = [
    isBigGuy(p.keywords ?? []) ? "big guy" : "",
    hasSkill(p.skills, SkillType.SNEAKY_GIT) ? "Sneaky Git" : "",
  ].filter(Boolean);
  const cost = Math.round(p.cost / 1000);
  return `${roster} / ${p.positionName} (${String(cost)}k${marks.map((m) => ", " + m).join("")})`;
}

async function foulsOfTrace(file: string) {
  const trace = JSON.parse(gunzipSync(readFileSync(file)).toString()) as {
    initial: MatchSave;
    recording: MatchRecording;
  };
  const game = new HeadlessGame({ matchSave: trace.initial });
  const teams = [game.ctx.team1, game.ctx.team2] as const;
  const byGroup: [Record<string, Tally>, Record<string, Tally>] = [{}, {}];
  let open: Foul | null = null;

  const settle = () => {
    if (!open) return;
    const t = (byGroup[open.side][open.key] ??= tally());
    t.fouls++;
    if (open.sentOff) t.sentOff++;
    const status = open.target.status;
    if (
      status === PlayerStatus.KO ||
      status === PlayerStatus.INJURED ||
      status === PlayerStatus.DEAD
    )
      t.removed++;
    if (status === PlayerStatus.INJURED || status === PlayerStatus.DEAD)
      t.casualties++;
    if (status === PlayerStatus.STUNNED) t.stunned++;
    open = null;
  };

  game.ctx.eventBus.on(GameEventNames.RefereeCall, (call) => {
    if (open && call.step === "outcome" && call.result === "sent-off")
      open.sentOff = true;
  });
  game.ctx.eventBus.on(GameEventNames.TurnStarted, settle);

  for (const [index, step] of trace.recording.steps.entries()) {
    const command = step.command;
    if (command.type === "declare-action") settle();
    if (command.type === "foul" && step.ok) {
      settle();
      const side = teams.findIndex((t) =>
        t.players.some((p) => p.id === command.playerId)
      ) as 0 | 1;
      const fouler = teams[side].players.find(
        (p) => p.id === command.playerId
      )!;
      const target = teams[otherSide(side)].players.find(
        (p) =>
          p.gridPosition?.x === command.x && p.gridPosition?.y === command.y
      );
      if (target)
        open = {
          side,
          key: groupOf(teams[side].rosterName, fouler),
          target,
          sentOff: false,
        };
    }
    const response = await game.execute(command);
    if (response.ok !== step.ok)
      throw new Error(`Replay diverged at ${String(index)}`);
  }
  settle();
  if (snapshotHash(game.snapshot()) !== trace.recording.final.hash)
    throw new Error("Foul replay final hash differs");
  return { byGroup };
}

type GameFouls = Awaited<ReturnType<typeof foulsOfTrace>> & {
  id: string;
  candidateSide: number;
};

function argument(index: number): string {
  const value = process.argv[index];
  if (value === undefined)
    throw new Error(`Missing argument ${String(index - 1)}`);
  return value;
}

async function main() {
  const entry = fileURLToPath(import.meta.url);
  const run = resolve(argument(2));
  const out = join(run, "fouls");
  mkdirSync(out, { recursive: true });
  if (process.argv.includes("--worker")) {
    process.on("message", async (job: PolicyJob | null) => {
      if (!job) {
        process.disconnect();
        return;
      }
      try {
        const result = await foulsOfTrace(
          join(run, "traces", job.id + ".json.gz")
        );
        writeFileSync(
          join(out, job.id + ".json"),
          JSON.stringify({
            id: job.id,
            candidateSide: job.candidateSide,
            ...result,
          })
        );
        process.send?.({ done: job.id });
      } catch (error) {
        process.send?.({ error: `${job.id}: ${String(error)}` });
      }
    });
    process.send?.({ ready: true });
    return;
  }
  const manifest = JSON.parse(
    readFileSync(join(run, "manifest.json"), "utf8")
  ) as { jobs: PolicyJob[]; revision: string };
  await processPool(entry, [run], manifest.jobs, 8);
  const files = readdirSync(out).filter((name) => name.endsWith(".json"));
  if (files.length !== manifest.jobs.length)
    throw new Error("Incomplete or foreign foul files");
  const policies: Record<"candidate" | "frozen", Record<string, Tally>> = {
    candidate: {},
    frozen: {},
  };
  for (const file of files) {
    const game = JSON.parse(readFileSync(join(out, file), "utf8")) as GameFouls;
    for (const side of [0, 1] as const) {
      const into =
        policies[side === game.candidateSide ? "candidate" : "frozen"];
      for (const [key, t] of Object.entries(game.byGroup[side])) {
        const own = (into[key] ??= tally());
        for (const k of Object.keys(own) as (keyof Tally)[]) own[k] += t[k];
      }
    }
  }
  const receipt = {
    revision: manifest.revision,
    games: files.length,
    policies,
    scope:
      "A Foul is a foul command the engine accepted. The target's state is read when the fouler's activation ends.",
  };
  writeFileSync(
    join(run, "fouls-summary.json"),
    JSON.stringify(receipt, null, 2)
  );
  console.log(JSON.stringify({ games: receipt.games }));
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
