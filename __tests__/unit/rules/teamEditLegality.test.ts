import { describe, expect, it } from "vitest";
import { RosterName, createTeam } from "../../../src/types/Team";
import { createPlayer } from "../../../src/types/Player";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import { canEdit } from "../../../src/game/rules/teamEditLegality";
import { stampFirstCompletedMatch } from "../../../src/game/rules/teamLifecycle";

function draftTeam() {
  return createTeam(
    "Test",
    RosterName.HUMAN,
    { primary: 0, secondary: 0 },
    50000
  );
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
      "reorder-players",
    ] as const) {
      expect(canEdit(t, { type }).allowed).toBe(true);
    }
    expect(canEdit(t, { type: "fire-player", playerId: "any" }).allowed).toBe(
      true
    );
  });

  it("refuses an active team's roster-type change with a named reason", () => {
    const t = activeTeam();
    const decision = canEdit(t, { type: "change-roster-type" });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/roster type/i);
  });

  it("refuses to fire a player once the team has played (L6)", () => {
    const decision = canEdit(activeTeam(), {
      type: "fire-player",
      playerId: "any",
    });
    expect(decision).toEqual({
      allowed: false,
      reason: "Sevens teams cannot fire players after a game.",
    });
  });

  it("still allows an active team to hire an eligible player", () => {
    const t = activeTeam();
    expect(canEdit(t, { type: "hire-player" }).allowed).toBe(true);
  });

  /**
   * The 2025 rulebook lowered some maxima (Dark Elf Blitzers 0-4 to 0-2) and
   * added shared Big Guy limits. An active team saved under the old ones
   * may release the surplus, and only the surplus, so it can play again.
   */
  function activeRoster(rosterName: RosterName, positions: string[]) {
    const t = createTeam("Old", rosterName, { primary: 0, secondary: 0 });
    const templates = getRosterByRosterName(rosterName).playerTemplates;
    t.players = positions.map((name, index) =>
      createPlayer(
        templates.find((template) => template.positionName === name)!,
        t.id,
        index + 1
      )
    );
    stampFirstCompletedMatch(t, 1);
    return t;
  }

  it("lets an active team release a player above a corrected maximum", () => {
    const t = activeRoster(RosterName.DARK_ELF, [
      ...Array(4).fill("Dark Elf Lineman"),
      ...Array(3).fill("Dark Elf Blitzer"),
    ]);
    const blitzer = t.players[4].id;
    const lineman = t.players[0].id;
    expect(canEdit(t, { type: "fire-player", playerId: blitzer })).toEqual({
      allowed: true,
    });
    expect(canEdit(t, { type: "fire-player", playerId: lineman })).toEqual({
      allowed: false,
      reason: "Sevens teams cannot fire players after a game.",
    });
  });

  it("lets an active team release a Big Guy above the shared limit", () => {
    const t = activeRoster(RosterName.UNDERWORLD_DENIZENS, [
      ...Array(5).fill("Underworld Goblin Lineman"),
      "Underworld Troll",
      "Mutant Rat Ogre",
    ]);
    expect(
      canEdit(t, { type: "fire-player", playerId: t.players[6].id }).allowed
    ).toBe(true);
    expect(
      canEdit(t, { type: "fire-player", playerId: t.players[0].id }).allowed
    ).toBe(false);
  });
});
