/**
 * Which plays each policy chose, and what came of them. Replays saved
 * commands, classifies every declaration by the coach's note, and credits a
 * play when its team scores that turn or its next one, or turns the ball over
 * during the activation. Scoring moments are kept with their game and turn,
 * so a replay can be watched. Sequence attribution, not a skill's causal value.
 */
import { readFileSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import type { MatchSave } from "../../../src/headless/serialization";
import { snapshotHash } from "../../../src/simulation/runMatch";
import type { MatchRecording } from "../../../src/simulation/runMatch";
import { GameEventNames } from "../../../src/types/events";
import { processPool } from "../policy-study/pool";
import type { PolicyJob } from "../policy-study/schedule";

/** Note prefixes, most specific first, and the play each names. */
const PLAYS: readonly [string, string][] = [
  ["throws the ball carrier", "throw-carrier"],
  ["throws a team-mate", "throw-teammate"],
  ["throws a pass", "pass"],
  ["hands off", "handoff"],
  ["runs in to score", "run-in"],
  ["moves to flank", "flank"],
  ["moves to throw", "launch-setup"],
  ["moves to receiver", "receiver"],
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

export function playOf(note: string | undefined, action: string): string {
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
  /** The declaration's index among the recording's steps. */
  step: number;
  /** Scored in the same team turn, or only in its next one. */
  scored: "this-turn" | "next-turn";
}

interface Pending {
  play: string;
  note: string;
  side: 0 | 1;
  half: 1 | 2;
  turn: number;
  step: number;
  /** Our team turns since the play: 0 is its own. */
  turnsSince: number;
}

/** Plays by side and roster, from one saved game. */
export async function usageOfTrace(file: string, id: string) {
  const trace = JSON.parse(gunzipSync(readFileSync(file)).toString()) as {
    initial: MatchSave;
    recording: MatchRecording;
  };
  const game = new HeadlessGame({ matchSave: trace.initial });
  const rosters = [game.ctx.team1.rosterName, game.ctx.team2.rosterName];
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
    // A score in the other team's turn, say from a push, follows none of
    // this team's plays. The drive still ends, so nothing claims it later.
    const ownTurn = game.ctx.gameService.getState().activeTeamId === teamId;
    for (const p of ownTurn ? open : []) {
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
    // A drive ends with the score: nothing earlier can claim it again.
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

  for (const [index, step] of trace.recording.steps.entries()) {
    const command = step.command;
    if (command.type === "declare-action" && step.ok) {
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
    }
    const response = await game.execute(command);
    if (response.ok !== step.ok) throw new Error(`Replay diverged at ${index}`);
  }
  const hash = snapshotHash(game.snapshot());
  if (hash !== trace.recording.final.hash)
    throw new Error("Usage replay final hash differs");
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

/** Rarer plays first in the moment list: they are the ones worth watching. */
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
      list
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
  const run = resolve(process.argv[2]);
  const out = join(run, "usage");
  mkdirSync(out, { recursive: true });
  if (process.argv.includes("--worker")) {
    process.on("message", async (job: PolicyJob | null) => {
      if (!job) {
        process.disconnect();
        return;
      }
      try {
        const result = await usageOfTrace(
          join(run, "traces", job.id + ".json.gz"),
          job.id
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
        process.send?.({ error: `${job.id}: ${error}` });
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
    throw new Error("Incomplete or foreign usage files");
  const policies = { candidate: {}, frozen: {} } as Record<
    "candidate" | "frozen",
    Record<string, Tally>
  >;
  const rosters: Record<string, Record<string, Tally>> = {};
  const moments: Moment[] = [];
  for (const file of files) {
    const game = JSON.parse(readFileSync(join(out, file), "utf8")) as GameUsage;
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
    analyzerSha256: createHash("sha256")
      .update(readFileSync(entry))
      .digest("hex"),
    games: files.length,
    verified: true,
    policies,
    rosters,
    moments: pickMoments(moments, 12),
    scope:
      "A play is a declaration, named by the coach's note; unplanned plays came from the heuristic fallback. It scored this turn when its team scored in the same team turn, next turn when in that team's following turn. Turnovers occurred during its activation. Sequence attribution, not a counterfactual value.",
  };
  writeFileSync(
    join(run, "usage-summary.json"),
    JSON.stringify(receipt, null, 2)
  );
  console.log(JSON.stringify({ games: receipt.games, policies }));
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
