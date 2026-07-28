import { describe, expect, it } from "vitest";
import { RosterName, createTeam } from "../../../src/types/Team";
import { canEdit } from "../../../src/game/rules/teamEditLegality";
import { stampFirstCompletedMatch } from "../../../src/game/rules/teamLifecycle";

function draftTeam() {
  return createTeam("Test", RosterName.HUMAN, { primary: 0, secondary: 0 }, 50000);
}

function activeTeam() {
  const t = draftTeam();
  stampFirstCompletedMatch(t, 1);
  return t;
}

describe("canEdit", () => {
  it("allows every operation on a draft team", () => {
    const t = draftTeam();
    for (const type of [
      "rename",
      "change-roster-type",
      "hire-player",
      "fire-player",
      "reorder-players",
      "buy-apothecary",
      "buy-dedicated-fans",
      "buy-coach",
      "buy-cheerleader",
    ] as const) {
      expect(canEdit(t, { type }).allowed).toBe(true);
    }
  });

  it("allows a draft team to buy a re-roll", () => {
    const t = draftTeam();
    expect(canEdit(t, { type: "buy-reroll" }).allowed).toBe(true);
  });

  it("refuses an active team's roster-type change with a named reason", () => {
    const t = activeTeam();
    const decision = canEdit(t, { type: "change-roster-type" });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/roster type/i);
  });

  it("refuses an active team's Dedicated Fans purchase with a named reason", () => {
    const t = activeTeam();
    const decision = canEdit(t, { type: "buy-dedicated-fans" });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/Dedicated Fans/);
  });

  it("still allows an active team to hire an eligible player", () => {
    const t = activeTeam();
    expect(canEdit(t, { type: "hire-player" }).allowed).toBe(true);
  });

  it("refuses an active team's re-roll purchase with a named reason", () => {
    const t = activeTeam();
    const decision = canEdit(t, { type: "buy-reroll" });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/re-rolls/i);
  });
});
