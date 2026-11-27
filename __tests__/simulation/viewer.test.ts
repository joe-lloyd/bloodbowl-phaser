import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { RosterName } from "../../src/types/Team";
import { runMatch } from "../../src/simulation/runMatch";
import { randomCoach } from "../../src/simulation/coaches/random";
import { replayRecording } from "../../src/simulation/replay";
import { buildMatchDump, renderMatchHtml } from "../../src/simulation/viewer";

const recording = await runMatch({
  seed: 3007,
  rosters: [RosterName.BLACK_ORC, RosterName.HALFLING],
  coaches: [randomCoach, randomCoach],
  maxCommands: 100,
});

describe("match playback page", () => {
  it("has one frame per step plus the opening, ending on the replayed board", async () => {
    const dump = await buildMatchDump(recording);
    const replay = await replayRecording(recording);
    const final = replay.game.snapshot();

    expect(recording.steps).toHaveLength(100);
    expect(dump.frames).toHaveLength(recording.steps.length + 1);
    const last = dump.frames.at(-1);
    expect(fixtureValue(last).ball).toEqual(
      final.ballPosition ? [final.ballPosition.x, final.ballPosition.y] : null
    );
    expect(fixtureValue(last).score).toEqual([
      final.score[fixtureValue(final.teams[0]).id],
      final.score[fixtureValue(final.teams[1]).id],
    ]);
    expect(fixtureValue(last).label).toBe(
      fixtureValue(recording.steps[99]).label
    );
    const players = final.teams.flatMap((team) => team.players);
    expect(dump.players.map((p) => p.id)).toEqual(players.map((p) => p.id));
  });

  it("inlines the match so the page opens from disk, and cannot close its script early", async () => {
    const dump = await buildMatchDump(recording);
    fixtureValue(dump.frames[1]).label = "</script><b>not markup</b>";
    const html = renderMatchHtml(dump);

    expect(html).not.toContain("/*__MATCH_DATA__*/");
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).toContain("<title>Black Orc vs Halfling, seed 3007</title>");
  });
});
