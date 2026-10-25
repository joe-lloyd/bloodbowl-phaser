import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { TeamAdvancementMode } from "../../src/types/Team";
import { forceDice } from "../utils/test-helpers";

/**
 * Update Dedicated Fans in the post-game sequence (2025 rulebook p.99),
 * kept between 1 and 5 for Sevens league teams (docs/SEVENS_RULES.md D7).
 * A win raises fans on a D6 at or over them; a loss lowers them on a D6
 * under them; a draw changes nothing.
 */

interface Side {
  fans: number;
  score: number;
  mode?: TeamAdvancementMode;
}

function fullTime(home: Side, away: Side, dice: number[]) {
  const game = new HeadlessGame({ seed: 1 });
  const { team1, team2, gameService, eventBus, rng } = game.ctx;
  team1.advancementMode = home.mode ?? "sevens-skill-selection";
  team2.advancementMode = away.mode ?? "sevens-skill-selection";
  team1.dedicatedFans = home.fans;
  team2.dedicatedFans = away.fans;
  gameService.getState().score[team1.id] = home.score;
  gameService.getState().score[team2.id] = away.score;
  forceDice(rng, dice);
  eventBus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.GAME_OVER });
  return [team1.dedicatedFans, team2.dedicatedFans];
}

describe("Dedicated Fans after a league game", () => {
  it("a win at or over the fans gains one, a loss under them loses one", () => {
    expect(fullTime({ fans: 2, score: 1 }, { fans: 3, score: 0 }, [2, 2])).toEqual([
      3, 2,
    ]);
  });

  it("a win under the fans and a loss at or over them change nothing", () => {
    expect(fullTime({ fans: 3, score: 2 }, { fans: 2, score: 1 }, [2, 2])).toEqual([
      3, 2,
    ]);
  });

  it("never rises above 5 or falls below 1", () => {
    expect(fullTime({ fans: 5, score: 1 }, { fans: 1, score: 0 }, [6, 1])).toEqual([
      5, 1,
    ]);
  });

  it("a draw changes nothing", () => {
    expect(fullTime({ fans: 2, score: 1 }, { fans: 2, score: 1 }, [6, 1])).toEqual([
      2, 2,
    ]);
  });

  it("leaves Matched Play teams alone: they have no post-game", () => {
    expect(
      fullTime(
        { fans: 0, score: 1, mode: "matched-play" },
        { fans: 0, score: 0, mode: "matched-play" },
        [6, 1]
      )
    ).toEqual([0, 0]);
  });
});
