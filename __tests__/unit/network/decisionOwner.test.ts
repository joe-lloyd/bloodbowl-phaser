import { describe, it, expect } from "vitest";
import {
  checkOwnership,
  decisionOwner,
} from "../../../src/network/OwnershipGate";

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

describe("uphill block re-roll window", () => {
  it("belongs to the attacker before the defender picks", () => {
    expect(
      decisionOwner(
        {
          type: "block-dice",
          attackerId: "a1",
          defenderId: "d1",
          chooserTeamId: "defenders",
          options: [],
          choiceStage: "attacker-reroll",
        },
        ctx
      )
    ).toBe("attackers");
  });
});

it("the attacker cannot pick an uphill die during the re-roll window", () => {
  expect(
    checkOwnership({ type: "choose-block-result", index: 0 }, "attackers", {
      ...ctx,
      pendingDecision: {
        type: "block-dice",
        attackerId: "a1",
        defenderId: "d1",
        chooserTeamId: "defenders",
        options: [],
        choiceStage: "attacker-reroll",
      },
    })
  ).toEqual({ allowed: false, reason: "decision-pending" });
});
