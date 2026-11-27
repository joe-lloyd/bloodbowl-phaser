import { describe, expect, it } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { confirmComputerPregame } from "../utils/computerPregame";
import { createCoachRng } from "../../src/simulation/rng";
import { whenEngineQuiet } from "../../src/game/core/GameFlowManager";
import { GamePhase } from "../../src/types/GameState";
import {
  ms,
  latest,
  liveGame,
  startNew,
  resume,
  humanStep,
  forgetMatch,
} from "../utils/computerMatchSession";

describe("saving a match against the computer", () => {
  it("plays to full time across reloads, then clears the save", async () => {
    let live = startNew(0);
    await confirmComputerPregame(live);
    await live.run({ type: "start-setup", kickingTeamId: "team2" });
    const rng = createCoachRng(5);
    let reloads = 0;
    let sinceReload = 0;
    let resumedFrom = "";
    for (let i = 0; i < 60_000; i++) {
      if (liveGame().snapshot().phase === GamePhase.GAME_OVER) break;
      sinceReload += await humanStep(live, rng);
      if (sinceReload < 25) continue;
      await whenEngineQuiet();
      await ms(100);
      const save = fixtureValue(latest);

      const saved = JSON.stringify(save.snapshot);
      if (saved === resumedFrom) {
        expect(sinceReload, "human commands with no newer save").toBeLessThan(
          150
        );
        continue;
      }
      resumedFrom = saved;
      live.close();
      const next = resume(save);
      live = next.live;
      next.boardReady();
      reloads++;
      sinceReload = 0;
    }

    const final = liveGame().snapshot();
    expect(final.phase).toBe(GamePhase.GAME_OVER);
    expect(final.turn.isHalf2).toBe(true);
    expect(reloads).toBeGreaterThan(3);

    await whenEngineQuiet();
    await ms(150);
    live.close();
    forgetMatch();
    expect(latest).toBeNull();
  }, 280_000);
});
