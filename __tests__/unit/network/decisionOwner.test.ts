import { describe, it, expect } from "vitest";
import { decisionOwner } from "../../../src/network/OwnershipGate";

const ctx = {
  activeTeamId: "attackers",
  pendingDecision: null,
  teamIdOfPlayer: (id: string) => (id === "a1" ? "attackers" : "defenders"),
  hostTeamId: "attackers",
};

describe("who owns a push", () => {
  it("is the attacker's coach for an ordinary push", () => {
    expect(
      decisionOwner(
        {
          type: "push-direction",
          attackerId: "a1",
          defenderId: "d1",
          resultType: "push",
          options: [],
        },
        ctx
      )
    ).toBe("attackers");
  });

  it("is the pushed player's coach when they Sidestep", () => {
    expect(
      decisionOwner(
        {
          type: "push-direction",
          attackerId: "a1",
          defenderId: "d1",
          resultType: "push",
          chooserTeamId: "defenders",
          options: [],
        },
        ctx
      )
    ).toBe("defenders");
  });
});
