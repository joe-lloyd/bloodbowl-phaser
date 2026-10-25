// @vitest-environment node
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseRecording, replayRecording } from "../../src/simulation/replay";
import { buildMatchDump, renderMatchHtml } from "../../src/simulation/viewer";

const recording = parseRecording(
  fs.readFileSync(
    path.join(__dirname, "recordings", "failed-rush-onto-loose-ball.json"),
    "utf8"
  )
);

describe("match playback page", () => {
  it("has one frame per step plus the opening, ending on the replayed board", async () => {
    const dump = await buildMatchDump(recording);
    const final = (await replayRecording(recording)).game.snapshot();

    expect(dump.frames).toHaveLength(recording.steps.length + 1);
    const last = dump.frames[dump.frames.length - 1];
    expect(last.ball).toEqual([4, 7]);
    expect(last.score).toEqual([
      final.score[final.teams[0].id],
      final.score[final.teams[1].id],
    ]);
    expect(last.label).toBe("Accept the failed rush");
    expect(last.log).toContain("TURNOVER: Failed GFI");
    const faller = dump.players.findIndex((p) => p.id === "team1-player-2");
    expect(last.board[faller]).toBe("KO");
  });

  it("inlines the match so the page opens from disk, and cannot close its script early", async () => {
    const dump = await buildMatchDump(recording);
    dump.frames[1].label = "</script><b>not markup</b>";
    const html = renderMatchHtml(dump);

    expect(html).not.toContain("/*__MATCH_DATA__*/");
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).toContain("<title>Black Orc vs Halfling, seed 3007</title>");
  });
});
