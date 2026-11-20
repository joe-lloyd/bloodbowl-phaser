import { afterEach, describe, expect, it } from "vitest";
import { RosterName } from "../../src/types/Team";
import { createSimGame, runMatch } from "../../src/simulation/runMatch";
import { randomCoach } from "../../src/simulation/coaches/random";
import { type Coach } from "../../src/simulation/coach";
import {
  activateMatchFormat,
  SEVENS_FORMAT,
} from "../../src/game/variants/activeMatch";

interface Takeover {
  coach: Coach;
  boardAtTakeover: () => string | undefined;
}

function coachThatStartsAStreetBowlMatch(afterChoices: number): Takeover {
  let choices = 0;
  let board: string | undefined;
  return {
    coach: {
      name: "interrupted",
      choose(input) {
        choices += 1;
        if (choices === afterChoices) {
          board = JSON.stringify(input.game.snapshot());
          activateMatchFormat({ gameType: "street-bowl", venue: "street" });
        }
        return randomCoach.choose(input);
      },
    },
    boardAtTakeover: () => board,
  };
}

describe("a simulated match whose rules another match takes over", () => {
  afterEach(() => {
    activateMatchFormat(SEVENS_FORMAT);
  });

  it("stops before its next command under the other match's rules", async () => {
    const { coach, boardAtTakeover } = coachThatStartsAStreetBowlMatch(3);
    const rosters: [RosterName, RosterName] = [
      RosterName.HUMAN,
      RosterName.ORC,
    ];
    const game = createSimGame(7, rosters, 3);

    await expect(
      runMatch({
        seed: 7,
        rosters,
        coaches: [coach, coach],
        game,
        maxCommands: 40,
      })
    ).rejects.toThrow(
      "A street-bowl match on the street took over the rules while a sevens match on the stadium was running."
    );
    expect(JSON.stringify(game.snapshot())).toBe(boardAtTakeover());
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
