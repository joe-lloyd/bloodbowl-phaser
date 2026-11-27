import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { HeadlessGame } from "../../../src/headless/HeadlessGame";
import type { BlockRollData } from "../../../src/services/BlockResolutionService";
import { GameEventNames } from "../../../src/types/events";
import { type Player, PlayerStatus } from "../../../src/types/Player";
import { pitchWidth } from "../../../src/simulation/ai/board";
import { openTrace } from "../catalogue-study/replay";
import { isEntry, replaySteps } from "./lab";

const otherSide = (side: 0 | 1): 0 | 1 => (side === 0 ? 1 : 0);

export interface DefenceTally {
  turns: number;
  won: number;
  loose: number;
  toGo: number;
  carrierHits: number;
  wallHits: number;
  otherHits: number;
  markedEnd: number;
  screenEnd: number;
  within: number;
  conceded: number;
  concededFar: number;
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

const isReroll = (command: unknown) =>
  typeof command === "object" &&
  command !== null &&
  "type" in command &&
  typeof command.type === "string" &&
  command.type.endsWith("-reroll-block");

export function watchDefence(
  game: HeadlessGame,
  tallies: [DefenceTally, DefenceTally]
) {
  const teams = [game.ctx.teams[0], game.ctx.teams[1]] as const;
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
    side === 0 ? at.x : pitchWidth() - 1 - at.x;
  let open: Side | null = null;
  let watching: { side: Side; far: boolean } | null = null;
  let rerolling = false;

  const countDice = (b: BlockRollData) => {
    const by = teams.findIndex((t) =>
      t.players.some((p) => p.id === b.attackerId)
    );
    if (by === -1) return;
    const dice =
      Math.min(3, b.numDice) * (b.isAttackerChoice || b.numDice === 1 ? 1 : -1);
    const t = tallies[by as Side];
    t.blocks++;
    t.dice[dice] = (t.dice[dice] ?? 0) + 1;
  };
  const countTarget = (side: Side, defenderId: string) => {
    const target = teams[otherSide(side)].players.find(
      (p) => p.id === defenderId
    );
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
    else if (c) {
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
    else {t.loose++;}
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
  const { recording, game } = openTrace(file);
  const tallies: [DefenceTally, DefenceTally] = [
    emptyDefence(),
    emptyDefence(),
  ];
  const watch = watchDefence(game, tallies);
  await replaySteps({
    game,
    recording,
    before: (step) => {
      watch.before(step.command);
    },
  });
  return {
    rosters: [game.ctx.teams[0].rosterName, game.ctx.teams[1].rosterName] as const,
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
  const run = path.resolve(dir);
  const files = readdirSync(path.join(run, "traces"))
    .filter((f) => f.endsWith(".json.gz"))
    .filter((_, k) => k % n === i);
  const by: Record<string, DefenceTally> = {};
  for (const f of files) {
    const { rosters, tallies } = await defenceOfTrace(path.join(run, "traces", f));
    for (const s of [0, 1] as const)
      add((by[rosters[s]] ??= emptyDefence()), tallies[s]);
  }
  writeFileSync(
    path.join(run, `defence-${i}-of-${n}.json`),
    JSON.stringify(by, null, 2)
  );
}
if (isEntry(import.meta.url)) await main();
