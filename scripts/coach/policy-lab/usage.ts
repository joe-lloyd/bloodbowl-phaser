import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GameEventNames } from "../../../src/types/events";
import { openTrace } from "../catalogue-study/replay";
import {
  analyzerSha256,
  annotateRun,
  annotationFiles,
  isEntry,
  replaySteps,
  verifiedHash,
} from "./lab";

const PLAYS: readonly [string, string][] = [
  ["throws the ball carrier", "throw-carrier"],
  ["throws a team-mate", "throw-teammate"],
  ["throws a pass", "pass"],
  ["hands off", "handoff"],
  ["runs in to score", "run-in"],
  ["moves to flank", "flank"],
  ["moves to throw", "launch-setup"],
  ["moves to receiver", "receiver"],
  ["moves to deep", "deep-receiver"],
  ["moves to feed", "feed"],
  ["moves to", "reposition"],
  ["moves the ball carrier", "carrier"],
  ["uses Hypnotic Gaze", "gaze"],
  ["blocks two opponents", "multiple-block"],
  ["secures the ball", "secure-ball"],
  ["goes for the ball", "pickup"],
  ["blitzes", "blitz"],
  ["fouls", "foul"],
  ["blocks", "block"],
  ["stands up", "stand-up"],
];

function playOf(note: string | undefined, action: string): string {
  if (!note) return `unplanned:${action}`;
  return PLAYS.find(([prefix]) => note.startsWith(prefix))?.[1] ?? "other";
}

export interface Tally {
  plays: number;
  scoredThisTurn: number;
  scoredNextTurn: number;
  turnovers: number;
}
const tally = (): Tally => ({
  plays: 0,
  scoredThisTurn: 0,
  scoredNextTurn: 0,
  turnovers: 0,
});

export interface Moment {
  game: string;
  side: 0 | 1;
  roster: string;
  play: string;
  note: string;
  half: 1 | 2;
  turn: number;

  step: number;

  scored: "this-turn" | "next-turn";
}

interface Pending {
  play: string;
  note: string;
  side: 0 | 1;
  half: 1 | 2;
  turn: number;
  step: number;

  turnsSince: number;
}

export async function usageOfTrace(file: string, id: string) {
  const { recording, game } = openTrace(file);
  const rosters = [
    game.ctx.team1.rosterName,
    game.ctx.team2.rosterName,
  ] as const;
  const sides = new Map([
    [game.ctx.team1.id, 0 as const],
    [game.ctx.team2.id, 1 as const],
  ]);
  const byPlay: [Record<string, Tally>, Record<string, Tally>] = [{}, {}];
  const moments: Moment[] = [];
  let open: Pending[] = [];
  let active: Pending | null = null;
  const count = (p: Pending) => (byPlay[p.side][p.play] ??= tally());

  game.ctx.eventBus.on(GameEventNames.Touchdown, ({ teamId }) => {
    const side = sides.get(teamId);

    const ownTurn = game.ctx.gameService.getState().activeTeamId === teamId;
    const ownOpen = ownTurn ? open : [];
    for (const p of ownOpen) {
      if (p.side !== side || p.turnsSince > 1) continue;
      const scored = p.turnsSince === 0 ? "this-turn" : "next-turn";
      count(p)[scored === "this-turn" ? "scoredThisTurn" : "scoredNextTurn"]++;
      moments.push({
        game: id,
        side: p.side,
        roster: rosters[p.side],
        play: p.play,
        note: p.note,
        half: p.half,
        turn: p.turn,
        step: p.step,
        scored,
      });
    }

    open = [];
  });
  game.ctx.eventBus.on(GameEventNames.Turnover, ({ teamId }) => {
    if (active && sides.get(teamId) === active.side) count(active).turnovers++;
  });
  game.ctx.eventBus.on(GameEventNames.TurnStarted, () => {
    const state = game.ctx.gameService.getState();
    const side = sides.get(state.activeTeamId ?? "");
    active = null;
    open = open
      .map((p) =>
        p.side === side ? { ...p, turnsSince: p.turnsSince + 1 } : p
      )
      .filter((p) => p.turnsSince <= 1);
  });

  await replaySteps({
    game,
    recording,
    before: (step, index) => {
      const command = step.command;
      if (command.type !== "declare-action" || !step.ok) return;
      const state = game.ctx.gameService.getState();
      const pending: Pending = {
        play: playOf(step.note, command.action),
        note: step.note ?? command.action,
        side: step.team,
        half: state.turn.isHalf2 ? 2 : 1,
        turn: state.turn.turnNumber,
        step: index,
        turnsSince: 0,
      };
      count(pending).plays++;
      open.push(pending);
      active = pending;
    },
  });
  const hash = verifiedHash(game, recording, "Usage");
  return { rosters, byPlay, moments, hash };
}

type GameUsage = Awaited<ReturnType<typeof usageOfTrace>> & {
  id: string;
  candidateSide: number;
};

const add = (into: Record<string, Tally>, from: Record<string, Tally>) => {
  for (const [play, t] of Object.entries(from)) {
    const own = (into[play] ??= tally());
    for (const key of Object.keys(own) as (keyof Tally)[]) own[key] += t[key];
  }
};

function pickMoments(all: Moment[], perPlay: number): Moment[] {
  const byPlay = new Map<string, Moment[]>();
  for (const m of all) {
    const list = byPlay.get(m.play);
    if (list) list.push(m);
    else byPlay.set(m.play, [m]);
  }
  return [...byPlay.values()]
    .sort((a, b) => a.length - b.length)
    .flatMap((list) =>
      [...list]
        .sort(
          (a, b) =>
            Number(a.scored !== "this-turn") -
              Number(b.scored !== "this-turn") ||
            a.game.localeCompare(b.game) ||
            a.half - b.half ||
            a.turn - b.turn
        )
        .slice(0, perPlay)
    );
}

async function main() {
  const entry = fileURLToPath(import.meta.url);
  const lab = await annotateRun({
    entry,
    folder: "usage",
    workers: 8,
    annotate: async (file, job) => ({
      id: job.id,
      candidateSide: job.candidateSide,
      ...(await usageOfTrace(file, job.id)),
    }),
  });
  if (!lab) return;
  const { run, out, manifest } = lab;
  const files = annotationFiles(out, manifest.jobs.length, "usage");
  const policies: Record<"candidate" | "frozen", Record<string, Tally>> = {
    candidate: {},
    frozen: {},
  };
  const rosters: Record<string, Record<string, Tally>> = {};
  const moments: Moment[] = [];
  for (const file of files) {
    const game = JSON.parse(readFileSync(path.join(out, file), "utf8")) as GameUsage;
    for (const side of [0, 1] as const) {
      const policy = side === game.candidateSide ? "candidate" : "frozen";
      add(policies[policy], game.byPlay[side]);
      add(
        (rosters[`${policy}/${game.rosters[side]}`] ??= {}),
        game.byPlay[side]
      );
    }
    moments.push(...game.moments.filter((m) => m.side === game.candidateSide));
  }
  const receipt = {
    revision: manifest.revision,
    analyzerSha256: analyzerSha256(entry),
    games: files.length,
    verified: true,
    policies,
    rosters,
    moments: pickMoments(moments, 12),
    scope:
      "A play is a declaration, named by the coach's note; unplanned plays came from the heuristic fallback. It scored this turn when its team scored in the same team turn, next turn when in that team's following turn. Turnovers occurred during its activation. Sequence attribution, not a counterfactual value.",
  };
  writeFileSync(
    path.join(run, "usage-summary.json"),
    JSON.stringify(receipt, null, 2)
  );
  console.log(JSON.stringify({ games: receipt.games, policies }));
}
if (isEntry(import.meta.url)) await main();
