import { describe, expect, it } from "vitest";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import { dehydratePlayer, hydratePlayer } from "../../../src/data/persistence/teamPersistence";
import { hirePlayer } from "../../../src/game/rules/teamPricing";
import { createTeam, RosterName, type Team } from "../../../src/types/Team";

function team(rosterName: RosterName): Team {
  return createTeam("Test", rosterName, { primary: 0x8b0000, secondary: 0 }, getRosterByRosterName(rosterName).rerollCost);
}

function hire(rosterName: RosterName, positionName: string) {
  const squad = team(rosterName);
  const template = getRosterByRosterName(rosterName).playerTemplates.find((t) => t.positionName === positionName);
  if (!template) throw new Error(`No ${positionName}`);
  const result = hirePlayer(squad, template);
  if (!result.player) throw new Error(result.reason ?? "not hired");
  return { squad, player: result.player };
}

describe("hiring a player", () => {
  it("gives a Vampire a look from its position's options and a name from its name book", () => {
    const { player } = hire(RosterName.VAMPIRE, "Vampire Blitzer");
    expect(["m", "f"]).toContain(player.appearance?.["body"]);
    expect(["winged", "cap", "bare"]).toContain(player.appearance?.["helmet"]);
    expect(player.playerName).not.toMatch(/#\d+$/);
  });

  it("leaves rosters without looks or name books as they were", () => {
    const { player } = hire(RosterName.HUMAN, "Human Lineman");
    expect(player.appearance).toBeUndefined();
    expect(player.playerName).toBe(`Human Lineman #${String(player.number)}`);
  });
});

describe("saving a player's look", () => {
  it("keeps the appearance through a save and load", () => {
    const { squad, player } = hire(RosterName.VAMPIRE, "Thrall Lineman");
    const stored = dehydratePlayer(player);
    expect(stored.appearance).toEqual(player.appearance);
    const loaded = hydratePlayer({ stored, teamId: squad.id, rosterName: RosterName.VAMPIRE, warnings: [] });
    expect(loaded.appearance).toEqual(player.appearance);
  });
});
