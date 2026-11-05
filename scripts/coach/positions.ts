/**
 * Positions for fitting the position score: planner self-play, read at the
 * start of each team turn from the mover's side, with the touchdown
 * difference that side went on to score. One JSON row a line on stdout.
 *
 *     pnpm exec tsx scripts/coach/positions.ts <firstSeed> <games> > positions.jsonl
 *
 * A game is one process's work for a second or two, so run shards side by
 * side; scripts/coach/fit-evaluation.ts reads them all.
 */

import { Coach } from "../../src/simulation/coach";
import { features } from "../../src/simulation/ai/evaluate";
import { readBoard } from "../../src/simulation/ai/board";
import { createPlannerCoach } from "../../src/simulation/ai/planner";
import { createCoachRng } from "../../src/simulation/rng";
import { runMatch } from "../../src/simulation/runMatch";
import { GamePhase } from "../../src/types/GameState";
import { RosterName } from "../../src/types/Team";

// The engine narrates every operation; thousands of games would bury the rows.
console.log = () => {};
console.info = () => {};
console.debug = () => {};
console.warn = () => {};

interface Seen {
  /** The mover is the home team, whose score comes first in a recording. */
  home: boolean;
  /** Home's lead when the turn started. */
  homeLead: number;
  f: ReturnType<typeof features>;
}

/** The planner, noting the board each time a team starts a turn. */
function noting(seen: Seen[]): Coach {
  const planner = createPlannerCoach();
  let lastTurn = "";
  return {
    name: "planner",
    async choose(context) {
      const { game, point } = context;
      const state = game.ctx.gameService.getState();
      const turn = `${state.turn.isHalf2}:${state.turn.turnNumber}:${point.teamId}`;
      if (
        point.phase === GamePhase.PLAY &&
        state.activeTeamId === point.teamId &&
        turn !== lastTurn
      ) {
        lastTurn = turn;
        const [home, away] = [game.ctx.team1.id, game.ctx.team2.id];
        seen.push({
          home: point.teamId === home,
          homeLead: (state.score[home] ?? 0) - (state.score[away] ?? 0),
          f: features(readBoard(game, point.teamId)),
        });
      }
      return planner.choose(context);
    },
  };
}

/** Play the games and print a row for every team turn of each clean one. */
async function main() {
  const [firstSeed, games] = process.argv.slice(2).map(Number);
  if (!Number.isInteger(firstSeed) || !Number.isInteger(games) || games < 1)
    throw new Error("usage: positions.ts <firstSeed> <games>");
  const rosters = Object.values(RosterName);
  const pick = createCoachRng(firstSeed);
  for (let seed = firstSeed; seed < firstSeed + games; seed++) {
    const seen: Seen[] = [];
    const recording = await runMatch({
      seed,
      rosters: [pick.pick(rosters), pick.pick(rosters)],
      coaches: [noting(seen), noting(seen)],
    });
    // A game the engine could not finish cleanly teaches the wrong ending.
    if (
      recording.final.phase !== GamePhase.GAME_OVER ||
      recording.findings.some((f) => f.kind !== "rejected-candidate")
    )
      continue;
    const [homeScore, awayScore] = recording.final.score;
    const rows = seen.map(({ home, homeLead, f }) => {
      const homeGain = homeScore - awayScore - homeLead;
      return JSON.stringify({ seed, y: home ? homeGain : -homeGain, f });
    });
    if (rows.length) process.stdout.write(rows.join("\n") + "\n");
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
