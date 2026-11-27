import { afterEach, describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import {
  kickoffEventSummary,
  kickoffMomentDetail,
  kickoffRevealLine,
} from "../../src/game/kickoff/kickoffMoment";
import {
  activateMatchFormat,
  type MatchFormat,
  SEVENS_FORMAT,
} from "../../src/game/variants/activeMatch";

const [team1, team2] = new HeadlessGame({ seed: 1 }).ctx.teams;

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

describe("kick-off text on each game type's table", () => {
  const FAN_FACTOR =
    "D6 + Fan Factor per coach; the higher total gains a team re-roll for this drive. A tie gives nothing.";
  const variants: MatchFormat[] = [
    { gameType: "street-bowl", venue: "street" },
    { gameType: "gutter-bowl", venue: "gutter-street" },
    { gameType: "gutter-bowl", venue: "gutter-sewer" },
  ];

  afterEach(() => {
    activateMatchFormat(SEVENS_FORMAT);
  });

  it.each(variants)(
    "Cheering Fans on the $venue is a fan factor re-roll, not an assist",
    (format) => {
      activateMatchFormat(format);
      expect(kickoffEventSummary(KickoffEvent.CHEERING_FANS)).toBe(FAN_FACTOR);
      expect(
        kickoffRevealLine(KickoffEvent.CHEERING_FANS, team1, team2)
      ).toBe(FAN_FACTOR);
    }
  );

  it("keeps the short Sevens line in a Sevens match", () => {
    expect(kickoffEventSummary(KickoffEvent.CHEERING_FANS)).toBe(
      "The winners gain an extra assist on their next turn's first Block."
    );
  });

  it("says what the Beach table changes about Brilliant Coaching and Charge", () => {
    activateMatchFormat({ gameType: "beach-bowl", venue: "beach" });
    expect(kickoffEventSummary(KickoffEvent.BRILLIANT_COACHING)).toContain(
      "A tie gives nothing."
    );
    expect(kickoffEventSummary(KickoffEvent.CHARGE)).toContain(
      "one may Throw Team-mate"
    );
  });
});
