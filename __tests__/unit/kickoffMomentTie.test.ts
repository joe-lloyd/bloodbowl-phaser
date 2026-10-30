/**
 * A tied kick-off roll gives both teams the same thing, so the banner says
 * it favours nobody. Round 1 read "Favours Reikland Reavers and Altdorf
 * Nobles" after a tied Cheering Fans roll.
 */
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { kickoffMomentDetail } from "../../src/game/kickoff/kickoffMoment";

const { team1, team2 } = new HeadlessGame({ seed: 1 }).ctx;

describe("kick-off banner on a tie", () => {
  it("says a tied Cheering Fans roll favours neither team", () => {
    expect(
      kickoffMomentDetail(
        {
          event: KickoffEvent.CHEERING_FANS,
          meaning: "",
          perTeam: {
            [team1.id]: ["+1 assist"],
            [team2.id]: ["+1 assist"],
          },
        },
        team1,
        team2
      )
    ).toBe(
      "The winners gain an extra assist on their next turn's first Block. A tie, so it favours neither team."
    );
  });

  it("still names the one winner", () => {
    expect(
      kickoffMomentDetail(
        {
          event: KickoffEvent.BRILLIANT_COACHING,
          meaning: "",
          perTeam: { [team2.id]: ["free re-roll"] },
        },
        team1,
        team2
      )
    ).toBe(
      `The winners gain a free team re-roll for this drive. Favours ${team2.name}.`
    );
  });

  it("says a tied Pitch Invasion that spares both favours neither team", () => {
    expect(
      kickoffMomentDetail(
        { event: KickoffEvent.PITCH_INVASION, meaning: "", perTeam: {} },
        team1,
        team2
      )
    ).toBe(
      "The team that loses the roll has a player Stunned by the crowd. A tie, so it favours neither team."
    );
  });
});
