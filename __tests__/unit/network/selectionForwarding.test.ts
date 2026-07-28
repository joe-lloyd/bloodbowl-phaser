import { describe, expect, it } from "vitest";
import {
  NO_CHANGE,
  nextSelectionToForward,
} from "../../../src/network/OnlineMatch";
import { createTestPlayer } from "../../fixtures/players";

/**
 * Pure decision logic behind the online "remote selection" red-ring
 * indicator (redesign-multiplayer-selection-visibility): a coach's own
 * selections are forwarded to the other side, opponent-inspection clicks
 * never are, and repeats of the same value are suppressed.
 */
describe("nextSelectionToForward", () => {
  const myTeamId = "my-team";
  const opponentTeamId = "their-team";

  it("forwards selecting one of my own team's players", () => {
    const player = createTestPlayer({ id: "p1", teamId: myTeamId });
    expect(nextSelectionToForward(myTeamId, null, player)).toBe("p1");
  });

  it("does not forward selecting an opponent's player (local inspection only)", () => {
    const player = createTestPlayer({ id: "p1", teamId: opponentTeamId });
    expect(nextSelectionToForward(myTeamId, null, player)).toBe(NO_CHANGE);
  });

  it("forwards a deselection that follows a previously-sent own selection", () => {
    expect(nextSelectionToForward(myTeamId, "p1", null)).toBeNull();
  });

  it("suppresses a deselection when nothing own-team was sent before", () => {
    expect(nextSelectionToForward(myTeamId, null, null)).toBe(NO_CHANGE);
  });

  it("suppresses re-selecting the same already-forwarded player", () => {
    expect(
      nextSelectionToForward(
        myTeamId,
        "p1",
        createTestPlayer({ id: "p1", teamId: myTeamId })
      )
    ).toBe(NO_CHANGE);
  });

  it("forwards switching from one own player to another", () => {
    const nextPlayer = createTestPlayer({ id: "p2", teamId: myTeamId });
    expect(nextSelectionToForward(myTeamId, "p1", nextPlayer)).toBe("p2");
  });

  it("switching from my own player to an opponent's clears via the intervening deselect", () => {
    // GameplayInteractionController.selectPlayer() always deselects first,
    // so a click on an opponent player arrives as two events: null, then
    // the opponent. The null half is what actually gets forwarded.
    expect(nextSelectionToForward(myTeamId, "p1", null)).toBeNull();
    const opponent = createTestPlayer({ id: "p9", teamId: opponentTeamId });
    expect(nextSelectionToForward(myTeamId, null, opponent)).toBe(NO_CHANGE);
  });
});
