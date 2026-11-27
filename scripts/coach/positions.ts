import { type Coach } from "../../src/simulation/coach";
import { features } from "../../src/simulation/ai/evaluate";
import { readBoard } from "../../src/simulation/ai/board";
import { createPlannerCoach } from "../../src/simulation/ai/planner";
import { createCoachRng } from "../../src/simulation/rng";
import { runMatch } from "../../src/simulation/runMatch";
import { GamePhase } from "../../src/types/GameState";
import { RosterName } from "../../src/types/Team";

console.log = () => {};
console.info = () => {};
console.debug = () => {};
console.warn = () => {};

interface Seen {
  home: boolean;

  homeLead: number;
  f: ReturnType<typeof features>;
}

function noting(seen: Seen[]): Coach {
  const planner = createPlannerCoach();
  let lastTurn = "";
  return {
    name: "planner",
    async choose(context) {
      const { game, point } = context;
      const state = game.ctx.gameService.getState();
      const turn = `${String(state.turn.isHalf2)}:${String(state.turn.turnNumber)}:${point.teamId}`;
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

async function main() {
  const [firstSeed = NaN, games = NaN] = process.argv.slice(2).map(Number);
  if (!Number.isSafeInteger(firstSeed) || !Number.isSafeInteger(games) || games < 1)
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
    if (rows.length > 0) process.stdout.write(rows.join("\n") + "\n");
  }
}

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(
    `${String(error instanceof Error ? error.stack : error)}\n`
  );
  process.exit(1);
}
