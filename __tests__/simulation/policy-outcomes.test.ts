import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { tacticalGame } from "../../scripts/coach/policy-lab/fixtures";
import { annotateTrace } from "../../scripts/coach/policy-lab/outcomes";
import { createPlannerCoach } from "../../src/simulation/ai/planner";
import { enumerateDecision } from "../../src/simulation/candidates";
import { createCoachRng } from "../../src/simulation/rng";
import { RECORDING_FORMAT, snapshotHash } from "../../src/simulation/runMatch";
import type { MatchRecording } from "../../src/simulation/runMatch";
import type { HeadlessCommand } from "../../src/headless/protocol";
import type { HeadlessGame } from "../../src/headless/HeadlessGame";
import { SkillType } from "../../src/types/Skills";

async function replayScore(
  game: HeadlessGame,
  commands: HeadlessCommand[] = []
) {
  const initial = game.matchSave(),
    coach = createPlannerCoach();
  const steps: MatchRecording["steps"] = [];
  for (const command of commands) {
    const response = await game.execute(command);
    expect(response.ok).toBe(true);
    steps.push({ command, ok: response.ok, team: 0, label: "recorded play" });
  }
  for (
    let i = 0;
    i < 20 && game.ctx.gameService.getState().score.team1 === 0;
    i++
  ) {
    const point = await enumerateDecision(game, null);
    const choice = await coach.choose({
      game,
      snapshot: game.snapshot(),
      point,
      rng: createCoachRng(1),
    });
    for (const command of point.candidates[choice.index].commands) {
      const response = await game.execute(command);
      expect(response.ok).toBe(true);
      steps.push({
        command,
        ok: response.ok,
        team: 0,
        label: "tactical trace",
        note: choice.note,
      });
    }
  }
  expect(game.ctx.gameService.getState().score.team1).toBe(1);
  const recording: MatchRecording = {
    format: RECORDING_FORMAT,
    version: 1,
    seed: 1,
    coachSeed: 1,
    rosters: [game.ctx.team1.rosterName, game.ctx.team2.rosterName],
    coaches: ["planner", "planner"],
    rerolls: 0,
    steps,
    final: {
      phase: game.ctx.gameService.getState().phase,
      score: [1, 0],
      hash: snapshotHash(game.snapshot()),
    },
    findings: [],
  };
  const out = mkdtempSync(join(tmpdir(), "bb7-outcome-"));
  try {
    const file = join(out, "trace.json.gz");
    writeFileSync(file, gzipSync(JSON.stringify({ initial, recording })));
    return await annotateTrace(file);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

describe("saved policy outcome evidence", () => {
  it("counts the actual landing square of a scoring jump", async () => {
    const game = tacticalGame({
      team1Placements: [
        {
          playerIndex: 0,
          x: 13,
          y: 5,
          hasBall: true,
          stats: { MA: 6, AG: 2 },
          skills: [SkillType.LEAP],
        },
      ],
    });
    const playerId = game.ctx.team1.players[0].id;
    const result = await replayScore(game, [
      { type: "declare-action", playerId, action: "move" },
      {
        type: "move",
        playerId,
        path: [14, 15, 16, 17].map((x) => ({ x, y: 5 })),
      },
      { type: "jump", playerId, x: 19, y: 5 },
    ]);
    expect(result.totals[0]).toEqual({
      passes: 0,
      completions: 0,
      receiverTouchdowns: 0,
      lateTouchdowns: 1,
      lateLongRuns: 1,
    });
  });
  it("credits a completed end-zone pass and its same-turn receiver score", async () => {
    const result = await replayScore(
      tacticalGame({
        team1Placements: [
          {
            playerIndex: 0,
            x: 15,
            y: 5,
            hasBall: true,
            stats: { MA: 1, PA: 2 },
            skills: [SkillType.PASS],
          },
          {
            playerIndex: 1,
            x: 19,
            y: 5,
            stats: { MA: 1, AG: 2 },
            skills: [SkillType.CATCH],
          },
        ],
      })
    );
    expect(result.totals[0]).toEqual({
      passes: 1,
      completions: 1,
      receiverTouchdowns: 1,
      lateTouchdowns: 1,
      lateLongRuns: 0,
    });
    expect(result.totals[1]).toEqual({
      passes: 0,
      completions: 0,
      receiverTouchdowns: 0,
      lateTouchdowns: 0,
      lateLongRuns: 0,
    });
  });
  it("keeps a scoring handoff separate from actual passing evidence", async () => {
    const result = await replayScore(
      tacticalGame({
        team1Placements: [
          {
            playerIndex: 0,
            x: 17,
            y: 5,
            hasBall: true,
            stats: { MA: 1, PA: 0 },
          },
          {
            playerIndex: 1,
            x: 19,
            y: 5,
            stats: { MA: 1, AG: 2 },
            skills: [SkillType.CATCH],
          },
        ],
      })
    );
    expect(result.totals[0]).toEqual({
      passes: 0,
      completions: 0,
      receiverTouchdowns: 0,
      lateTouchdowns: 1,
      lateLongRuns: 0,
    });
  });
  it("credits a seven-column final-turn scoring run without inventing a pass", async () => {
    const result = await replayScore(
      tacticalGame({
        team1Placements: [
          {
            playerIndex: 0,
            x: 12,
            y: 5,
            hasBall: true,
            stats: { MA: 6, AG: 2 },
          },
        ],
      })
    );
    expect(result.totals[0]).toEqual({
      passes: 0,
      completions: 0,
      receiverTouchdowns: 0,
      lateTouchdowns: 1,
      lateLongRuns: 1,
    });
  });
});
