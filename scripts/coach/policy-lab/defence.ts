/**
 * How each roster defends. Replays saved games and, for every team turn
 * that starts with an opposing standing carrier, records whether the turn
 * won the ball back, whom its blocks hit, and how the carrier is covered
 * when the turn ends. A turn that leaves the carrier in their hands is
 * conceded if the carrier's team scores in its next turn.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, resolve } from "node:path";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import type { MatchSave } from "../../../src/headless/serialization";
import type { MatchRecording } from "../../../src/simulation/runMatch";
import { GameEventNames } from "../../../src/types/events";
import { PlayerStatus } from "../../../src/types/Player";
import { GameConfig } from "../../../src/config/GameConfig";

const WIDTH = GameConfig.PITCH_WIDTH;
const KEYS = [
  "turns",
  "won",
  "toGo",
  "carrierHits",
  "wallHits",
  "otherHits",
  "markedEnd",
  "screenEnd",
  "within",
  "conceded",
  "concededFar",
  "dice-3",
  "dice-2",
  "dice1",
  "dice2",
  "dice3",
  "blocksAll",
] as const;
type Tally = Record<(typeof KEYS)[number], number>;
const empty = (): Tally => Object.fromEntries(KEYS.map((k) => [k, 0])) as Tally;

async function defenceOfTrace(file: string) {
  const trace = JSON.parse(gunzipSync(readFileSync(file)).toString()) as {
    initial: MatchSave;
    recording: MatchRecording;
  };
  const game = new HeadlessGame({ matchSave: trace.initial });
  const teams = [game.ctx.team1, game.ctx.team2];
  const sideOf = new Map(teams.map((t, i) => [t.id, i as 0 | 1]));
  const tallies: [Tally, Tally] = [empty(), empty()];
  const state = () => game.ctx.gameService.getState();
  const carrier = () => {
    const at = state().ballPosition;
    if (!at) return null;
    for (const side of [0, 1] as const) {
      const p = teams[side].players.find(
        (q) =>
          q.gridPosition?.x === at.x &&
          q.gridPosition?.y === at.y &&
          q.status === PlayerStatus.ACTIVE
      );
      if (p) return { side, p, at };
    }
    return null;
  };
  const near = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  let open: { side: 0 | 1; toGo: number } | null = null;
  let watching: { side: 0 | 1; far: boolean } | null = null;
  let last = "";
  game.ctx.eventBus.on(GameEventNames.BlockDiceRolled, (b) => {
    const pair = b.attackerId + ">" + b.defenderId;
    if (pair === last) return;
    last = pair;
    const by = teams.findIndex((t) =>
      t.players.some((p) => p.id === b.attackerId)
    );
    if (by >= 0) {
      const dice =
        Math.min(3, b.numDice) *
        (b.isAttackerChoice || b.numDice === 1 ? 1 : -1);
      tallies[by as 0 | 1][`dice${dice}` as (typeof KEYS)[number]]++;
      tallies[by as 0 | 1].blocksAll++;
    }
    if (!open) return;
    const c = carrier();
    const t = tallies[open.side];
    const target = teams[1 - open.side].players.find(
      (p) => p.id === b.defenderId
    );
    if (!c || !target?.gridPosition) return;
    if (target.id === c.p.id) t.carrierHits++;
    else if (near(target.gridPosition, c.at) === 1) t.wallHits++;
    else t.otherHits++;
  });
  game.ctx.eventBus.on(GameEventNames.Touchdown, ({ teamId }) => {
    if (watching && sideOf.get(teamId) === 1 - watching.side) {
      tallies[watching.side].conceded++;
      if (watching.far) tallies[watching.side].concededFar++;
    }
    watching = null;
  });
  game.ctx.eventBus.on(GameEventNames.TurnEnded, () => {
    if (!open) return;
    const t = tallies[open.side];
    const c = carrier();
    const side = open.side;
    if (!c || c.side === side) t.won++;
    else {
      const mine = teams[side].players.filter(
        (p) => p.status === PlayerStatus.ACTIVE && p.gridPosition
      );
      if (mine.some((p) => near(p.gridPosition!, c.at) === 1)) t.markedEnd++;
      t.screenEnd += mine.filter((p) =>
        side === 0 ? p.gridPosition!.x < c.at.x : p.gridPosition!.x > c.at.x
      ).length;
      const toGo = side === 0 ? c.at.x : WIDTH - 1 - c.at.x;
      const reach = c.p.stats.MA + 2;
      if (toGo <= reach) t.within++;
      watching = { side, far: toGo > c.p.stats.MA };
    }
    open = null;
  });
  game.ctx.eventBus.on(GameEventNames.TurnStarted, () => {
    last = "";
    const side = sideOf.get(state().activeTeamId ?? "");
    if (watching && side === watching.side) watching = null;
    const c = carrier();
    if (side === undefined || !c || c.side === side) return;
    open = { side, toGo: side === 0 ? c.at.x : WIDTH - 1 - c.at.x };
    tallies[side].turns++;
    tallies[side].toGo += open.toGo;
  });
  for (const [index, step] of trace.recording.steps.entries()) {
    const response = await game.execute(step.command);
    if (response.ok !== step.ok) throw new Error(`Replay diverged at ${index}`);
  }
  return { rosters: [teams[0].rosterName, teams[1].rosterName], tallies };
}

const [dir, shardArg] = process.argv.slice(2);
const [i, n] = (shardArg ?? "0/1").split("/").map(Number);
const run = resolve(dir!);
const files = readdirSync(join(run, "traces"))
  .filter((f) => f.endsWith(".json.gz"))
  .filter((_, k) => k % n! === i!);
const by: Record<string, Tally> = {};
for (const f of files) {
  const { rosters, tallies } = await defenceOfTrace(join(run, "traces", f));
  for (const s of [0, 1] as const) {
    const into = (by[rosters[s]!] ??= empty());
    for (const k of KEYS) into[k] += tallies[s][k];
  }
}
writeFileSync(join(run, `defence-${i}-of-${n}.json`), JSON.stringify(by));
