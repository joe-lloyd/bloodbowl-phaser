import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GameEventNames } from "../../../src/types/events";
import { PlayerStatus } from "../../../src/types/Player";
import type { Player } from "../../../src/types/Player";
import { hasSkill, SkillType } from "../../../src/types/Skills";
import { isBigGuy } from "../../../src/game/rules/rosterLegality";
import { openTrace } from "../catalogue-study/replay";
import {
  annotateRun,
  annotationFiles,
  isEntry,
  replaySteps,
  verifiedHash,
} from "./lab";

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
  const { recording, game } = openTrace(file);
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

  await replaySteps({
    game,
    recording,
    before: (step) => {
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
    },
  });
  settle();
  verifiedHash(game, recording, "Foul");
  return { byGroup };
}

type GameFouls = Awaited<ReturnType<typeof foulsOfTrace>> & {
  id: string;
  candidateSide: number;
};

async function main() {
  const lab = await annotateRun({
    entry: fileURLToPath(import.meta.url),
    folder: "fouls",
    workers: 8,
    annotate: async (file, job) => ({
      id: job.id,
      candidateSide: job.candidateSide,
      ...(await foulsOfTrace(file)),
    }),
  });
  if (!lab) return;
  const { run, out, manifest } = lab;
  const files = annotationFiles(out, manifest.jobs.length, "foul");
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
if (isEntry(import.meta.url)) await main();
