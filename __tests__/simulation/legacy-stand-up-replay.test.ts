import { expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { parseRecording, replayRecording } from "../../src/simulation/replay";
import { runMatch } from "../../src/simulation/runMatch";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { RosterName } from "../../src/types/Team";
import { SCENARIOS } from "../../src/data/scenarios";
import { PlayerStatus } from "../../src/types/Player";
import { fixtureValue } from "../../src/testing/fixtureValue";

it("executes a recorded Stand Up declaration and its stand-up", async () => {
  const scenario = fixtureValue(SCENARIOS.find(({ id }) => id === "base-move"));
  const game = new HeadlessGame({ scenario, seed: 1 });
  const playerId = fixtureValue(game.ctx.team1.players[1]).id;
  const declared = await game.execute({
    type: "declare-action",
    playerId,
    action: "standUp",
  });
  const stood = await game.execute({ type: "stand-up", playerId });
  expect([declared.ok, stood.ok]).toEqual([true, true]);
  const player = game.ctx.gameService.getPlayerById(playerId);
  expect(player?.status).toBe(PlayerStatus.ACTIVE);
  expect(game.ctx.gameService.getState().activePlayer?.action).toBe("move");
});

it("replays a recording from before Stand Up joined Move", async () => {
  const recording = await runMatch({
    seed: 101,
    rosters: [RosterName.HUMAN, RosterName.ORC],
    coaches: [heuristicCoach, heuristicCoach],
  });
  const legacy = structuredClone(recording);
  let rewritten = 0;
  for (const [index, { command }] of legacy.steps.entries()) {
    const before = legacy.steps[index - 1]?.command;
    if (command.type !== "stand-up" || before?.type !== "declare-action") continue;
    if (before.action !== "move") continue;
    Reflect.set(before, "action", "standUp");
    rewritten++;
  }
  expect(rewritten).toBeGreaterThan(0);
  const replayed = await replayRecording(parseRecording(JSON.stringify(legacy)));
  expect(replayed.divergedAt).toBeNull();
  expect(replayed.matches).toBe(true);
}, 60_000);
