import { describe, expect, it } from "vitest";
import {
  turnProgress,
  spentActions,
  spentSummary,
  driveEffectText,
  weatherSummary,
} from "../../src/ui/components/hud/matchStripText";
import { weatherDescription } from "../../src/game/rules/weather";
import { GameService } from "../../src/services/GameService";
import { TeamFactory } from "../../src/game/TeamFactory";
import { RosterName } from "../../src/types/Team";

describe("match strip text", () => {
  it("names the turn out of six and clamps between halves", () => {
    expect(turnProgress(5)).toBe("Turn 5 of 6");
    expect(turnProgress(0)).toBe("Turn 0 of 6");
    expect(turnProgress(7)).toBe("Turn 6 of 6");
  });
  it("shows a short weather effect inline only when it changes play", () => {
    expect(weatherSummary("Nice")).toEqual({
      icon: "☀",
      word: "Nice",
      effect: null,
      text: "Nice",
      title: "Nice: No effect on play",
    });
    expect(weatherSummary("Pouring Rain")).toEqual({
      icon: "☂",
      word: "Rain",
      effect: "-1 catch, pick-up",
      text: "Rain: -1 catch, pick-up",
      title: "Pouring Rain: -1 pick-up, catch and interception",
    });
    expect(weatherSummary("Very Sunny").text).toBe("Sunny: -1 pass");
    expect(weatherSummary("Blizzard").text).toBe(
      "Blizzard: -1 rush, short passes"
    );
    expect(weatherSummary("Sweltering Heat").text).toBe(
      "Heat: players may faint"
    );
  });
  it("puts every spent action in one line, and nothing when none is spent", () => {
    expect(spentSummary(["Blitz", "Pass"])).toBe("Spent: Blitz, Pass");
    expect(spentSummary([])).toBeNull();
  });
  it("names only spent once-per-turn actions", () => {
    expect(
      spentActions({
        hasBlitzed: true,
        hasPassed: false,
        hasHandedOff: true,
        hasFouled: true,
      })
    ).toEqual(["Blitz", "Hand-off", "Foul"]);
    expect(
      spentActions({
        hasBlitzed: false,
        hasPassed: true,
        hasHandedOff: false,
        hasFouled: false,
      })
    ).toEqual(["Pass"]);
  });
  it("explains every weather result", () => {
    expect(weatherDescription("Nice")).toBe("No effect on play");
    expect(weatherDescription("Very Sunny")).toBe("-1 passing");
    expect(weatherDescription("Pouring Rain")).toBe(
      "-1 pick-up, catch and interception"
    );
    expect(weatherDescription("Blizzard")).toBe(
      "-1 rush; quick and short passes only"
    );
    expect(weatherDescription("Sweltering Heat")).toBe(
      "D3 players per team miss the next drive"
    );
  });
  it("hides consumed assists and names modified players on the owning team", () => {
    const team = TeamFactory.createTestTeam(RosterName.HUMAN, "Home");
    const other = TeamFactory.createTestTeam(RosterName.ORC, "Away");
    const state = GameService.createInitialState(team, other);
    state.driveEffects = {
      freeRerolls: {},
      owedAssists: { [team.id]: { turn: 1, used: true } },
      playerModifiers: { [team.players[0].id]: { confinedToReserves: true } },
    };
    expect(driveEffectText(state, team)).toEqual([
      `Dodgy Snack #${team.players[0].number}: reserves this drive`,
    ]);
    expect(driveEffectText(state, other)).toEqual([]);
  });
});
