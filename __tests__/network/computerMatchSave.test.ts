import { describe, expect, it, vi } from "vitest";
import { confirmComputerPregame } from "../utils/computerPregame";
import { restoreMatchSave } from "../../src/headless/serialization";
import { GamePhase } from "../../src/types/GameState";
import { type CompetitionContext } from "../../src/competition/types";
import {
  ms,
  latest,
  liveGame,
  startNew,
  resume,
  playToHumanTurn,
  savedTurn,
} from "../utils/computerMatchSession";

describe("saving a match against the computer", () => {
  it("saves readiness before the toss and keeps the match resumable", async () => {
    const live = startNew(0);
    await ms(150);
    expect(latest?.snapshot.pregameInducements?.ready["team2"]).toBe(true);

    await confirmComputerPregame(live);
    await live.run({ type: "start-setup", kickingTeamId: "team2" });
    while (!latest) await ms(10);

    expect(latest.computer).toEqual({
      computerTeamId: "team2",
      difficulty: "standard",
    });

    expect(latest).not.toHaveProperty("presentation");
  });

  it("plays a cup tie under cup rules and saves which fixture it is", async () => {
    const tie: CompetitionContext = {
      competitionType: "tournament",
      competitionId: "the-cup",
      fixtureId: "round-1-match-1",
      knockout: true,
    };
    const live = startNew(0, tie);

    expect(liveGame().ctx.gameService.getState().knockout).toBe(true);

    await confirmComputerPregame(live);
    await live.run({ type: "start-setup", kickingTeamId: "team2" });
    while (!latest) await ms(10);
    expect(latest.competition).toEqual(tie);
    expect(restoreMatchSave(latest).state.knockout).toBe(true);
  });

  it("saves once a coin-flip command has made the toss", async () => {
    const live = startNew(0);
    await confirmComputerPregame(live);
    await live.run({ type: "coin-flip" });
    const end = Date.now() + 2000;
    while (!latest && Date.now() < end) await ms(10);
    expect(latest?.computer).toMatchObject({ computerTeamId: "team2" });
  });

  it.each([
    { landing: "touchback", seed: 510_522_575 },
    { landing: "on the pitch", seed: 764_218_399 },
  ])(
    "resumes on the same board, score and turn after landing $landing",
    async ({ seed }) => {
      const random = vi.spyOn(Math, "random").mockReturnValue(seed / 2 ** 31);
      const live = startNew(0);
      random.mockRestore();
      await confirmComputerPregame(live);
      await live.run({ type: "start-setup", kickingTeamId: "team2" });
      await playToHumanTurn(live);
      const save = await vi.waitUntil(() =>
        latest?.snapshot.phase === GamePhase.PLAY &&
        latest.snapshot.activeTeamId === "team1"
          ? latest
          : null
      );
      live.close();

      resume(save);

      const { turnManager, ...resumed } = liveGame().snapshot();
      expect(structuredClone(resumed)).toEqual({
        ...save.snapshot,
        turnManager: undefined,
      });
      expect(turnManager).toEqual(save.turnManager);
      expect(resumed.phase).toBe(GamePhase.PLAY);
      expect(resumed.activeTeamId).toBe("team1");
    },
    60_000
  );

  it("holds the computer's turn until the board is ready", async () => {
    const live = startNew(1);
    await confirmComputerPregame(live);
    await live.run({ type: "start-setup", kickingTeamId: "team2" });
    await playToHumanTurn(live);
    await live.run({ type: "end-turn" });
    const save = await savedTurn("team2");
    live.close();

    const { boardReady } = resume(save);
    const before = JSON.stringify(liveGame().snapshot());
    await ms(400);
    expect(JSON.stringify(liveGame().snapshot())).toBe(before);

    boardReady();
    while (JSON.stringify(liveGame().snapshot()) === before) await ms(20);
  }, 60_000);
});
