import { describe, expect, it } from "vitest";
import { confirmComputerPregame } from "../utils/computerPregame";
import { createCoachRng } from "../../src/simulation/rng";
import {
  ms,
  writtenOver,
  liveGame,
  startNew,
  humanStep,
} from "../utils/computerMatchSession";

describe("saving a match against the computer", () => {
  it("never saves while a block, push or kick-off choice is open", async () => {
    const live = startNew(0);
    await confirmComputerPregame(live);
    await live.run({ type: "start-setup", kickingTeamId: "team2" });
    const rng = createCoachRng(11);
    while (!liveGame().snapshot().turn.isHalf2) {
      if (live.mayAct()) await ms(100);
      await humanStep(live, rng);
    }

    expect(writtenOver.length).toBeGreaterThan(10);
    expect(writtenOver.filter((open) => open !== null)).toEqual([]);
  }, 120_000);
});
