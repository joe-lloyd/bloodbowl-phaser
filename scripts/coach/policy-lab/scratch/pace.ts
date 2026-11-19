/**
 * Scratch study: for every team turn that starts with the team's own standing
 * carrier, tally by turn of the half the squares to go, whether the carrier is
 * in reach, the defenders ahead and how many of those are free of our marks,
 * and what the turn did. Usage: pace.ts <stage dir> i/n
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, resolve } from "node:path";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import type { MatchSave } from "../../../src/headless/serialization";
import type { MatchRecording } from "../../../src/simulation/runMatch";
import { GameEventNames } from "../../../src/types/events";
import { Player, PlayerStatus } from "../../../src/types/Player";
import { GameConfig } from "../../../src/config/GameConfig";

const WIDTH = GameConfig.PITCH_WIDTH;
type Row = Record<string, number>;
const near = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

async function one(file: string, by: Record<string, Row[]>) {
  const trace = JSON.parse(gunzipSync(readFileSync(file)).toString()) as {
    initial: MatchSave;
    recording: MatchRecording;
  };
  const game = new HeadlessGame({ matchSave: trace.initial });
  // Lab runs: tag each side by policy, candidate or frozen.
  const meta = join(file, "..", "..", "games", file.split("/").pop()!.replace(".gz", ""));
  let cand: number | null = null;
  try {
    cand = (JSON.parse(readFileSync(meta).toString()) as { candidateSide: number }).candidateSide;
  } catch {}
  const teams = [game.ctx.team1, game.ctx.team2];
  const sideOf = new Map(teams.map((t, i) => [t.id, i as 0 | 1]));
  const state = () => game.ctx.gameService.getState();
  const toGo = (side: number, x: number) => (side === 0 ? WIDTH - 1 - x : x);
  const standing = (p: Player) =>
    p.status === PlayerStatus.ACTIVE && !!p.gridPosition;
  const holder = () => {
    const at = state().ballPosition;
    if (!at) return null;
    for (const side of [0, 1] as const) {
      const p = teams[side].players.find(
        (q) =>
          q.gridPosition?.x === at.x &&
          q.gridPosition?.y === at.y &&
          q.status === PlayerStatus.ACTIVE
      );
      if (p) return { side, p };
    }
    return null;
  };
  let open: { side: 0 | 1; k: number; toGo: number; id: string } | null =
    null;
  let scored = false;
  /** Where each side's carrier stood when its last turn ended with the ball. */
  const lastEnd: ({ k: number; toGo: number; tag: string; reach: number } | null)[] = [null, null];
  let half2 = false;
  const row = (side: number, k: number) => {
    const roster =
      teams[side]!.rosterName +
      (cand === null ? "" : side === cand ? "|C" : "|F");
    const rows = (by[roster] ??= []);
    return (rows[k] ??= {});
  };
  const inc = (r: Row, key: string, n = 1) => (r[key] = (r[key] ?? 0) + n);
  const settle = () => {
    if (!open) return;
    const r = row(open.side, open.k);
    const now = holder();
    if (scored) inc(r, "scored");
    else if (now?.side !== open.side) inc(r, "lost");
    else {
      inc(r, "kept");
      inc(r, "gained", open.toGo - toGo(open.side, now.p.gridPosition!.x));
      if (now.p.id !== open.id) inc(r, "newCarrier");
      const at = now.p.gridPosition!;
      const mates = teams[open.side]!.players.filter(
        (p) => standing(p) && p.id !== now.p.id
      );
      const corners = mates.filter(
        (p) =>
          Math.abs(p.gridPosition!.x - at.x) === 1 &&
          Math.abs(p.gridPosition!.y - at.y) === 1
      ).length;
      inc(r, "endCorners", corners);
      if (corners >= 4) inc(r, "endFull");
      const marked = teams[1 - open.side]!.players.some(
        (o) => standing(o) && near(o.gridPosition!, at) === 1
      );
      if (marked) inc(r, "endMarked");
      // Opponents who could reach the carrier next turn, standing or prone.
      const reach = teams[1 - open.side]!.players.filter(
        (o) =>
          o.gridPosition &&
          o.status !== PlayerStatus.STUNNED &&
          near(o.gridPosition, at) <= o.stats.MA + 3
      ).length;
      lastEnd[open.side] = {
        k: open.k,
        toGo: toGo(open.side, at.x),
        tag: `c${corners}${marked ? "m" : ""}`,
        reach,
      };
    }
    open = null;
  };
  game.ctx.eventBus.on(GameEventNames.Touchdown, ({ teamId }) => {
    if (open && sideOf.get(teamId) === open.side) scored = true;
    settle();
    lastEnd[0] = lastEnd[1] = null;
  });
  game.ctx.eventBus.on(GameEventNames.TurnEnded, () => {
    settle();
    scored = false;
  });
  game.ctx.eventBus.on(GameEventNames.TurnStarted, () => {
    settle();
    scored = false;
    const s = state();
    const side = sideOf.get(s.activeTeamId ?? "");
    const h = holder();
    // Half time clears the pitch: a carrier held at the half is not stolen.
    if (half2 !== !!s.turn.isHalf2) lastEnd[0] = lastEnd[1] = null;
    half2 = !!s.turn.isHalf2;
    if (side !== undefined && lastEnd[side]) {
      const was = lastEnd[side]!;
      const rr = row(side, was.k);
      const all = row(side, 0);
      const kept = h?.side === side;
      inc(all, `${kept ? "ok" : "x"}:${was.tag}`);
      inc(all, `${kept ? "ok" : "x"}:r${Math.min(was.reach, 6)}`);
      if (kept) {
        inc(rr, "survived");
        inc(rr, "pushedBack", toGo(side, h!.p.gridPosition!.x) - was.toGo);
      } else inc(rr, "stolen");
      lastEnd[side] = null;
    }
    if (side === undefined || h?.side !== side) return;
    const k = s.turn.turnNumber;
    const at = h.p.gridPosition!;
    const go = toGo(side, at.x);
    const r = row(side, k);
    const ours = teams[side]!.players.filter(standing);
    const theirs = teams[1 - side]!.players.filter(standing);
    const ahead = theirs.filter(
      (o) => toGo(side, o.gridPosition!.x) < go
    );
    const free = ahead.filter(
      (o) => !ours.some((p) => near(p.gridPosition!, o.gridPosition!) === 1)
    );
    const fastest = Math.max(...ours.map((p) => p.stats.MA));
    inc(r, "turns");
    inc(r, "toGo", go);
    if (go <= h.p.stats.MA + 2) inc(r, "inReach");
    if (go <= fastest + 2) inc(r, "teamReach");
    inc(r, "ahead", ahead.length);
    inc(r, "freeAhead", free.length);
    inc(r, "theirStanding", theirs.length);
    inc(r, "ourStanding", ours.length);
    if (theirs.some((o) => near(o.gridPosition!, at) === 1)) inc(r, "marked");
    open = { side, k, toGo: go, id: h.p.id };
  });
  for (const [index, step] of trace.recording.steps.entries()) {
    const response = await game.execute(step.command);
    if (response.ok !== step.ok) throw new Error(`Replay diverged at ${index}`);
  }
  settle();
}

const [dir, shard = "0/1"] = process.argv.slice(2);
const [i, n] = shard.split("/").map(Number) as [number, number];
const run = resolve(dir!);
const by: Record<string, Row[]> = {};
const files = readdirSync(join(run, "traces"))
  .filter((f) => f.endsWith(".json.gz"))
  .filter((_, k) => k % n === i);
for (const f of files) await one(join(run, "traces", f), by);
writeFileSync(join(run, `pace-${i}-of-${n}.json`), JSON.stringify(by));
