import { describe, expect, it } from "vitest";
import {
  NO_CHANGE,
  nextSelectionToForward,
  isValidSelectionClaim,
} from "../../../src/network/OnlineMatch";
import { createTestPlayer } from "../../fixtures/players";
import { TeamBuilder } from "../../utils/test-builders";

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

/**
 * Receiver-side validation for an incoming "selection" envelope: a peer's
 * claimed playerId must actually belong to the team that peer controls.
 * Mirrors the trust model OwnershipGate.checkOwnership applies to
 * HeadlessCommands, for this cosmetic-only channel — without it, a
 * malicious/buggy peer could name any player (including the OTHER team's)
 * and have it rendered as "selected" on the receiving client.
 */
describe("isValidSelectionClaim", () => {
  const team1 = new TeamBuilder().withId("team-1").withPlayers(2).build();
  const team2 = new TeamBuilder().withId("team-2").withPlayers(2).build();
  const teams = [team1, team2];

  it("accepts a deselection (null) unconditionally", () => {
    expect(isValidSelectionClaim(null, team1.id, teams)).toBe(true);
  });

  it("accepts a player that actually belongs to the claimed sender's team", () => {
    expect(
      isValidSelectionClaim(team1.players[0].id, team1.id, teams)
    ).toBe(true);
  });

  it("rejects a player that belongs to the OTHER team", () => {
    expect(
      isValidSelectionClaim(team2.players[0].id, team1.id, teams)
    ).toBe(false);
  });

  it("rejects an unknown/forged player id", () => {
    expect(isValidSelectionClaim("no-such-player", team1.id, teams)).toBe(
      false
    );
  });
});
