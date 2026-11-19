import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import type { MatchSave } from "../../../src/headless/serialization";
import type { MatchRecording } from "../../../src/simulation/runMatch";
import { GameEventNames } from "../../../src/types/events";
import { PlayerStatus } from "../../../src/types/Player";
import { GameConfig } from "../../../src/config/GameConfig";
import { RosterName } from "../../../src/types/Team";

const otherSide = (side: 0 | 1): 0 | 1 => (side === 0 ? 1 : 0);

const WIDTH = GameConfig.PITCH_WIDTH;
const ROSTERS = new Set<string>(Object.values(RosterName));

export interface DriveTally {
  turns: number;
  scored: number;
  kept: number;
  lost: number;

  gained: number;

  heldAtHalf: number;

  toGo: number;

  marked: number;

  keptMarked: number;
  gainedMarked: number;

  stalledFree: number;
  stalledMarked: number;
}

const empty = (): DriveTally => ({
  turns: 0,
  scored: 0,
  kept: 0,
  lost: 0,
  gained: 0,
  heldAtHalf: 0,
  toGo: 0,
  marked: 0,
  keptMarked: 0,
  gainedMarked: 0,
  stalledFree: 0,
  stalledMarked: 0,
});

async function drivesOfTrace(file: string) {
  const trace = JSON.parse(gunzipSync(readFileSync(file)).toString()) as {
    initial: MatchSave;
    recording: MatchRecording;
  };
  const game = new HeadlessGame({ matchSave: trace.initial });
  const tallies: [DriveTally, DriveTally] = [empty(), empty()];
  const watch = watchDrives(game, tallies);
  for (const [index, step] of trace.recording.steps.entries()) {
    const response = await game.execute(step.command);
    if (response.ok !== step.ok)
      throw new Error(`Replay diverged at ${String(index)}`);
  }
  watch.finish();
  return {
    rosters: [game.ctx.team1.rosterName, game.ctx.team2.rosterName] as const,
    tallies,
  };
}

interface Open {
  side: 0 | 1;
  toGo: number;
  marked: boolean;
}

export function watchDrives(
  game: HeadlessGame,
  tallies: [DriveTally, DriveTally]
) {
  const teams = [game.ctx.team1, game.ctx.team2] as const;
  const sideOf = new Map(teams.map((t, i) => [t.id, i as 0 | 1]));
  const state = () => game.ctx.gameService.getState();

  const holder = (): { side: 0 | 1; toGo: number } | null => {
    const at = state().ballPosition;
    if (!at) return null;
    for (const side of [0, 1] as const)
      if (
        teams[side].players.some(
          (p) =>
            p.gridPosition?.x === at.x &&
            p.gridPosition?.y === at.y &&
            p.status === PlayerStatus.ACTIVE
        )
      )
        return { side, toGo: side === 0 ? WIDTH - 1 - at.x : at.x };
    return null;
  };
  const markedAt = (side: 0 | 1) => {
    const at = state().ballPosition!;
    return teams[otherSide(side)].players.some(
      (p) =>
        p.status === PlayerStatus.ACTIVE &&
        p.gridPosition &&
        Math.max(
          Math.abs(p.gridPosition.x - at.x),
          Math.abs(p.gridPosition.y - at.y)
        ) === 1
    );
  };
  let open: Open | null = null;
  let scored = false;

  let ended: { holder: 0 | 1 | null; half2: boolean } | null = null;

  const settle = () => {
    if (!open) return;
    const t = tallies[open.side];
    const now = holder();
    if (scored) t.scored++;
    else if (now?.side !== open.side) t.lost++;
    else {
      const gain = open.toGo - now.toGo;
      t.kept++;
      t.gained += gain;
      if (open.marked) {
        t.keptMarked++;
        t.gainedMarked += gain;
      }
      if (gain <= 0) t[open.marked ? "stalledMarked" : "stalledFree"]++;
    }
    open = null;
  };
  const halfOver = () => {
    if (ended?.holder != null) tallies[ended.holder].heldAtHalf++;
    ended = null;
  };

  game.ctx.eventBus.on(GameEventNames.Touchdown, ({ teamId }) => {
    if (open && sideOf.get(teamId) === open.side) scored = true;
    else settle();
    ended = null;
  });
  game.ctx.eventBus.on(GameEventNames.TurnEnded, () => {
    settle();
    const held = scored ? null : holder();
    scored = false;
    ended = { holder: held?.side ?? null, half2: !!state().turn.isHalf2 };
  });
  game.ctx.eventBus.on(GameEventNames.TurnStarted, () => {
    settle();
    const now = state();
    if (ended && ended.half2 !== !!now.turn.isHalf2) halfOver();
    ended = null;
    scored = false;
    const side = sideOf.get(now.activeTeamId ?? "");
    const held = holder();
    if (side === undefined || held?.side !== side) return;
    const t = tallies[side];
    const marked = markedAt(side);
    t.turns++;
    t.toGo += held.toGo;
    if (marked) t.marked++;
    open = { side, toGo: held.toGo, marked };
  });
  return {
    finish() {
      settle();
      halfOver();
    },
  };
}

const USAGE =
  "Usage: drives.ts <stage directory> [roster] [--shard i/n], with 0 <= i < n";

export function driveArgs(argv: string[]) {
  const [dir, ...rest] = argv;
  if (!dir) throw new Error(USAGE);
  const at = rest.indexOf("--shard");
  let shard: [number, number] = [0, 1];
  if (at >= 0) {
    const match = /^(\d+)\/(\d+)$/.exec(rest[at + 1] ?? "");
    const [i, n] = match ? [Number(match[1]), Number(match[2])] : [-1, 0];
    if (!(n > 0 && i >= 0 && i < n)) throw new Error(USAGE);
    shard = [i, n];
  }
  const roster = rest.find(
    (a, k) => !a.startsWith("--") && (at < 0 || k !== at + 1)
  );
  if (roster !== undefined && !ROSTERS.has(roster))
    throw new Error(`${roster} is not a roster. ${USAGE}`);

  const scope = [
    roster ? roster.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "",
    shard[1] > 1 ? `${String(shard[0])}-of-${String(shard[1])}` : "",
  ].filter(Boolean);
  return {
    run: resolve(dir),
    roster,
    shard,
    out: `drives-summary${scope.map((p) => "-" + p).join("")}.json`,
  };
}

async function main() {
  const { run, roster: only, shard, out } = driveArgs(process.argv.slice(2));

  const files = readdirSync(join(run, "traces"))
    .filter((f) => f.endsWith(".json.gz"))
    .filter((_, i) => i % shard[1] === shard[0]);
  const byRoster: Record<string, DriveTally> = {};
  for (const file of files) {
    const { rosters, tallies } = await drivesOfTrace(join(run, "traces", file));
    for (const side of [0, 1] as const) {
      if (only && rosters[side] !== only) continue;
      const into = (byRoster[rosters[side]] ??= empty());
      for (const k of Object.keys(into) as (keyof DriveTally)[])
        into[k] += tallies[side][k];
    }
  }
  writeFileSync(join(run, out), JSON.stringify(byRoster, null, 2));
  for (const [roster, t] of Object.entries(byRoster).sort(
    (a, b) => b[1].scored / b[1].turns - a[1].scored / a[1].turns
  ))
    console.log(
      roster.padEnd(22),
      `turns ${String(t.turns)}`,
      `toGo ${(t.toGo / t.turns).toFixed(1)}`,
      `score ${((100 * t.scored) / t.turns).toFixed(0)}%`,
      `lost ${((100 * t.lost) / t.turns).toFixed(0)}%`,
      `gain/kept ${(t.gained / Math.max(1, t.kept)).toFixed(2)}`,
      `heldAtHalf ${String(t.heldAtHalf)}`,
      `marked ${((100 * t.marked) / t.turns).toFixed(0)}%`
    );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
