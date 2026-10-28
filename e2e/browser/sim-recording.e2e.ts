/**
 * A headless simulation recording, opened on the real board.
 *
 * `pnpm sim` plays matches with no browser at all. This proves the bridge
 * back: replay a recorded match in the engine, hand the resulting
 * match save to the browser exactly as a resumed match would load it, and
 * check the browser builds the same board. If this holds, any step of any
 * recording can be inspected visually with `pnpm sim:replay --save-out`.
 */

import { test, expect } from "@playwright/test";
import { matchSaveAt, replayRecording } from "../../src/simulation/replay";
import { runMatch } from "../../src/simulation/runMatch";
import { randomCoach } from "../../src/simulation/coaches/random";
import { RosterName } from "../../src/types/Team";
import {
  serializeMatchSave,
  GameSnapshot,
} from "../../src/headless/serialization";
import { MATCH_SAVE_STORAGE_KEY } from "../../src/game/persistence/MatchSaveRepository";
import { GameBridge } from "../support/pages/bridge";

const board = (snapshot: GameSnapshot) => ({
  phase: snapshot.phase,
  activeTeamId: snapshot.activeTeamId,
  turn: snapshot.turn.turnNumber,
  half2: snapshot.turn.isHalf2,
  score: snapshot.score,
  ball: snapshot.ballPosition,
  players: snapshot.teams.flatMap((team) =>
    team.players.map(
      (p) =>
        `${p.id} ${p.status} ${p.position ? `${p.position.x},${p.position.y}` : "-"}`
    )
  ),
});

test("a recording's state resumes on the real board unchanged", async ({
  page,
}) => {
  // The opening 100 commands of a random-coach match.
  const recording = await runMatch({
    seed: 3007,
    rosters: [RosterName.BLACK_ORC, RosterName.HALFLING],
    coaches: [randomCoach, randomCoach],
    maxCommands: 100,
  });
  const { game } = await replayRecording(recording);
  const engine = game.snapshot();
  const save = serializeMatchSave(matchSaveAt(game));

  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [MATCH_SAVE_STORAGE_KEY, save] as const
  );
  await page.goto("/play");

  const bridge = new GameBridge(page);
  await bridge.waitForReady();
  await expect
    .poll(async () => board(await bridge.snapshot()))
    .toEqual(board(engine));
});
