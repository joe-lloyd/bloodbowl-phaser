/**
 * Plays computer-v-computer matches on the real engine and writes each
 * match's dice log, for audit.ts to check against chance.
 *
 *   pnpm dice:simulate <out.json> [matches] [first seed]
 */
import { writeFileSync } from "node:fs";
import {
  createSimGame,
  grantSimInducements,
  runMatch,
} from "../../src/simulation/runMatch";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { RosterName } from "../../src/types/Team";
import {
  createDiceLog,
  DiceLog,
  DiceLogRecorder,
} from "../../src/game/persistence/DiceLog";

const [out, matchArg = "100", seedArg = "1000"] = process.argv.slice(2);
if (!out) {
  console.error("usage: pnpm dice:simulate <out.json> [matches] [first seed]");
  process.exit(1);
}
const rosters: [RosterName, RosterName] = [RosterName.ORC, RosterName.HALFLING];

const logs: DiceLog[] = [];
for (let i = 0; i < Number(matchArg); i++) {
  const seed = Number(seedArg) + i;
  const game = createSimGame(seed, rosters, 3, "sevens-lineup");
  await grantSimInducements(game);
  const recorder = new DiceLogRecorder(
    game.ctx.eventBus,
    () => game.ctx.gameService.getState(),
    createDiceLog({
      id: `sim-${seed}`,
      mode: "computer",
      seed,
      teams: [game.ctx.team1, game.ctx.team2],
    })
  );
  await runMatch({
    seed,
    rosters,
    coaches: [heuristicCoach, heuristicCoach],
    game,
  });
  recorder.dispose();
  logs.push(recorder.log);
}
writeFileSync(out, JSON.stringify(logs));
console.log(`wrote ${logs.length} dice logs to ${out}`);
