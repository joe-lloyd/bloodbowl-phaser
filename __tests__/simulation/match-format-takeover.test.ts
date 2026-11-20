import { afterEach, describe, expect, it } from "vitest";
import { RosterName } from "../../src/types/Team";
import { runMatch } from "../../src/simulation/runMatch";
import { randomCoach } from "../../src/simulation/coaches/random";
import { type Coach } from "../../src/simulation/coach";
import {
  activateMatchFormat,
  SEVENS_FORMAT,
} from "../../src/game/variants/activeMatch";

function coachThatStartsAStreetBowlMatch(afterChoices: number): Coach {
  let choices = 0;
  return {
    name: "interrupted",
    choose(input) {
      choices += 1;
      if (choices === afterChoices)
        activateMatchFormat({ gameType: "street-bowl", venue: "street" });
      return randomCoach.choose(input);
    },
  };
}

describe("a simulated match whose rules another match takes over", () => {
  afterEach(() => {
    activateMatchFormat(SEVENS_FORMAT);
  });

  it("stops instead of playing on under the other match's rules", async () => {
    const coach = coachThatStartsAStreetBowlMatch(3);

    await expect(
      runMatch({
        seed: 7,
        rosters: [RosterName.HUMAN, RosterName.ORC],
        coaches: [coach, coach],
        maxCommands: 40,
      })
    ).rejects.toThrow(
      "A street-bowl match on the street took over the rules while a sevens match on the stadium was running."
    );
  });

  it("plays on when nothing else changes the rules", async () => {
    const recording = await runMatch({
      seed: 7,
      rosters: [RosterName.HUMAN, RosterName.ORC],
      coaches: [randomCoach, randomCoach],
      maxCommands: 40,
    });

    expect(recording.steps).toHaveLength(40);
  });
});
