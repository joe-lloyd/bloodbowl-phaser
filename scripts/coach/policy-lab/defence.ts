/**
 * How each roster defends. Replays saved games and, for every team turn
 * that starts with an opposing standing carrier, records whether the turn
 * won the ball back or knocked it loose, whom its blocks hit, and how the
 * carrier is covered when the turn ends. A turn that leaves the carrier in
 * their hands is conceded if the carrier's team scores in its next turn.
 * It also counts every block either team throws by its dice.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import type { MatchSave } from "../../../src/headless/serialization";
import type { MatchRecording } from "../../../src/simulation/runMatch";
import type { BlockRollData } from "../../../src/services/BlockResolutionService";
import { GameEventNames } from "../../../src/types/events";
import { Player, PlayerStatus } from "../../../src/types/Player";
import { GameConfig } from "../../../src/config/GameConfig";

const WIDTH = GameConfig.PITCH_WIDTH;

export interface DefenceTally {
  /** Turns that started with an opposing standing carrier. */
  turns: number;
  /** Of those, turns that ended with our standing carrier, or that we scored in. */
  won: number;
  /** Turns that ended with the ball on the ground. */
  loose: number;
  /** Squares the opposing carrier had to go at the start of each turn. */
  toGo: number;
  /** Blocks on the carrier, on a player beside it, and on anyone else. */
  carrierHits: number;
  wallHits: number;
  otherHits: number;
  /** Turns that left the carrier in their hands: marked, and our players goalside. */
  markedEnd: number;
  screenEnd: number;
  /** Of those, the carrier within its Movement plus two rushes of our end zone. */
  within: number;
  /** Of those, their team scored next turn; `concededFar` from beyond its Movement. */
  conceded: number;
  concededFar: number;
  /** Every block thrown, by dice: negative when the defender chooses. */
  blocks: number;
  dice: Record<string, number>;
}

export const emptyDefence = (): DefenceTally => ({
  turns: 0,
  won: 0,
  loose: 0,
  toGo: 0,
  carrierHits: 0,
  wallHits: 0,
  otherHits: 0,
  markedEnd: 0,
  screenEnd: 0,
  within: 0,
  conceded: 0,
  concededFar: 0,
  blocks: 0,
  dice: {},
});

type Side = 0 | 1;
type At = { x: number; y: number };

const near = (a: At, b: At) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** A re-roll re-announces the dice of a block already counted. */
const isReroll = (command: unknown) =>
  typeof command === "object" &&
  command !== null &&
  "type" in command &&
  typeof command.type === "string" &&
  command.type.endsWith("-reroll-block");

/**
 * Tallies defence as the game plays. Call `before` with each command
 * before executing it, so a block re-roll is not counted as a new block.
 */
export function watchDefence(
  game: HeadlessGame,
  tallies: [DefenceTally, DefenceTally]
) {
  const teams = [game.ctx.team1, game.ctx.team2];
  const sideOf = new Map(teams.map((t, i) => [t.id, i as Side]));
  const state = () => game.ctx.gameService.getState();
  const carrier = (): { side: Side; p: Player; at: At } | null => {
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
  const toGoFor = (side: Side, at: At) =>
    side === 0 ? at.x : WIDTH - 1 - at.x;
  let open: Side | null = null;
  let watching: { side: Side; far: boolean } | null = null;
  let rerolling = false;

  const countDice = (b: BlockRollData) => {
    const by = teams.findIndex((t) =>
      t.players.some((p) => p.id === b.attackerId)
    );
    if (by < 0) return;
    const dice =
      Math.min(3, b.numDice) * (b.isAttackerChoice || b.numDice === 1 ? 1 : -1);
    const t = tallies[by as Side];
    t.blocks++;
    t.dice[dice] = (t.dice[dice] ?? 0) + 1;
  };
  const countTarget = (side: Side, defenderId: string) => {
    const target = teams[1 - side].players.find((p) => p.id === defenderId);
    if (!target?.gridPosition) return;
    const c = carrier();
    const t = tallies[side];
    if (c?.p.id === target.id) t.carrierHits++;
    else if (c && near(target.gridPosition, c.at) === 1) t.wallHits++;
    else t.otherHits++;
  };
  const settle = (side: Side) => {
    const t = tallies[side];
    const c = carrier();
    if (c?.side === side) t.won++;
    else if (!c) t.loose++;
    else {
      const mine = teams[side].players.filter(
        (p) => p.status === PlayerStatus.ACTIVE && p.gridPosition
      );
      if (mine.some((p) => near(p.gridPosition!, c.at) === 1)) t.markedEnd++;
      t.screenEnd += mine.filter((p) =>
        side === 0 ? p.gridPosition!.x < c.at.x : p.gridPosition!.x > c.at.x
      ).length;
      const toGo = toGoFor(side, c.at);
      if (toGo <= c.p.stats.MA + 2) t.within++;
      watching = { side, far: toGo > c.p.stats.MA };
    }
  };

  game.ctx.eventBus.on(GameEventNames.BlockDiceRolled, (b) => {
    if (rerolling) return;
    countDice(b);
    if (open !== null) countTarget(open, b.defenderId);
  });
  game.ctx.eventBus.on(GameEventNames.Touchdown, ({ teamId }) => {
    const scorer = sideOf.get(teamId);
    if (watching && scorer === 1 - watching.side) {
      tallies[watching.side].conceded++;
      if (watching.far) tallies[watching.side].concededFar++;
    }
    // A defending turn that scores ends the drive without a TurnEnded.
    if (open !== null && scorer === open) tallies[open].won++;
    open = null;
    watching = null;
  });
  game.ctx.eventBus.on(GameEventNames.TurnEnded, () => {
    if (open !== null) settle(open);
    open = null;
  });
  game.ctx.eventBus.on(GameEventNames.TurnStarted, () => {
    open = null;
    const side = sideOf.get(state().activeTeamId ?? "");
    if (watching && side === watching.side) watching = null;
    const c = carrier();
    if (side === undefined || !c || c.side === side) return;
    open = side;
    tallies[side].turns++;
    tallies[side].toGo += toGoFor(side, c.at);
  });
  return {
    before(command: unknown) {
      rerolling = isReroll(command);
    },
  };
}

async function defenceOfTrace(file: string) {
  const trace = JSON.parse(gunzipSync(readFileSync(file)).toString()) as {
    initial: MatchSave;
    recording: MatchRecording;
  };
  const game = new HeadlessGame({ matchSave: trace.initial });
  const tallies: [DefenceTally, DefenceTally] = [
    emptyDefence(),
    emptyDefence(),
  ];
  const watch = watchDefence(game, tallies);
  for (const [index, step] of trace.recording.steps.entries()) {
    watch.before(step.command);
    const response = await game.execute(step.command);
    if (response.ok !== step.ok) throw new Error(`Replay diverged at ${index}`);
  }
  return {
    rosters: [game.ctx.team1.rosterName, game.ctx.team2.rosterName],
    tallies,
  };
}

function add(into: DefenceTally, from: DefenceTally) {
  for (const k of Object.keys(into) as (keyof DefenceTally)[]) {
    if (k === "dice") continue;
    into[k] += from[k];
  }
  for (const [d, n] of Object.entries(from.dice))
    into.dice[d] = (into.dice[d] ?? 0) + n;
}

async function main() {
  const [dir, shardArg = "0/1"] = process.argv.slice(2);
  const match = /^(\d+)\/(\d+)$/.exec(shardArg);
  const [i, n] = match ? [Number(match[1]), Number(match[2])] : [-1, 0];
  if (!dir || !(n > 0 && i >= 0 && i < n))
    throw new Error(
      "Usage: defence.ts <stage directory> [i/n], with 0 <= i < n"
    );
  const run = resolve(dir);
  const files = readdirSync(join(run, "traces"))
    .filter((f) => f.endsWith(".json.gz"))
    .filter((_, k) => k % n === i);
  const by: Record<string, DefenceTally> = {};
  for (const f of files) {
    const { rosters, tallies } = await defenceOfTrace(join(run, "traces", f));
    for (const s of [0, 1] as const)
      add((by[rosters[s]] ??= emptyDefence()), tallies[s]);
  }
  writeFileSync(
    join(run, `defence-${i}-of-${n}.json`),
    JSON.stringify(by, null, 2)
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
