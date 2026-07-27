import { describe, expect, it } from "vitest";
import {
  checkOwnership,
  decisionOwner,
  GateContext,
} from "../../../src/network/OwnershipGate";
import { PendingDecision } from "../../../src/headless/protocol";
import { GamePhase } from "../../../src/types/GameState";

/**
 * Host/guest ownership for Sevens inducements and the Apothecary decision
 * (tasks.md 5.4): only the owning coach may answer an Apothecary offer or
 * submit their own team's pregame selection.
 */

const apothecaryPending: PendingDecision = {
  type: "apothecary",
  id: "apothecary-1",
  chooserTeamId: "team-a",
  playerId: "p1",
  resultKind: "ko",
  location: "pitch",
  position: { x: 1, y: 1 },
};

function baseContext(pending: PendingDecision | null = null): GateContext {
  return {
    activeTeamId: "team-a",
    pendingDecision: pending,
    teamIdOfPlayer: (playerId) => (playerId === "p1" ? "team-a" : "team-b"),
    hostTeamId: "team-a",
    phase: GamePhase.PLAY,
  };
}

describe("Apothecary decision ownership", () => {
  it("decisionOwner resolves to the injured player's own team", () => {
    expect(decisionOwner(apothecaryPending, baseContext())).toBe("team-a");
  });

  it("the owning coach may answer", () => {
    const ctx = baseContext(apothecaryPending);
    const verdict = checkOwnership(
      { type: "use-apothecary", accept: true },
      "team-a",
      ctx
    );
    expect(verdict.allowed).toBe(true);
  });

  it("the opposing coach's answer is rejected", () => {
    const ctx = baseContext(apothecaryPending);
    const verdict = checkOwnership(
      { type: "use-apothecary", accept: true },
      "team-b",
      ctx
    );
    expect(verdict).toEqual({ allowed: false, reason: "not-your-decision" });
  });

  it("no reply is accepted from anyone once nothing is pending", () => {
    const ctx = baseContext(null);
    const verdict = checkOwnership(
      { type: "use-apothecary", accept: true },
      "team-a",
      ctx
    );
    expect(verdict).toEqual({ allowed: false, reason: "no-decision-pending" });
  });
});

describe("Pregame inducement command ownership", () => {
  it("a team may select/remove/confirm its own inducements", () => {
    const ctx = baseContext(null);
    for (const command of [
      {
        type: "select-inducement" as const,
        teamId: "team-a",
        inducement: "Extra Team Training",
        quantity: 1,
      },
      {
        type: "remove-inducement" as const,
        teamId: "team-a",
        inducement: "Extra Team Training",
      },
      { type: "confirm-inducements" as const, teamId: "team-a" },
    ]) {
      expect(checkOwnership(command, "team-a", ctx).allowed).toBe(true);
    }
  });

  it("a coach cannot select/remove/confirm the other team's inducements", () => {
    const ctx = baseContext(null);
    const verdict = checkOwnership(
      {
        type: "select-inducement",
        teamId: "team-b",
        inducement: "Extra Team Training",
        quantity: 1,
      },
      "team-a",
      ctx
    );
    expect(verdict).toEqual({ allowed: false, reason: "not-your-player" });
  });

  it("offer-inducements is a query anyone may send", () => {
    const ctx = baseContext(null);
    expect(
      checkOwnership({ type: "offer-inducements" }, "team-b", ctx).allowed
    ).toBe(true);
  });
});
