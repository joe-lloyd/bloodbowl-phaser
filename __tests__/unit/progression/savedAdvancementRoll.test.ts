import { describe, expect, it } from "vitest";
import {
  dehydrateTeam,
  hydrateStoredTeam,
} from "../../../src/data/persistence/teamPersistence";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import {
  applyAdvancement,
  eligibleSkills,
  rollPendingCharacteristic,
  rollPendingRandomPrimary,
} from "../../../src/game/progression/progression";
import { createPlayer, Player } from "../../../src/types/Player";
import {
  calculateTeamValue,
  createTeam,
  RosterName,
  Team,
} from "../../../src/types/Team";

function buildTeam(): Team {
  const roster = getRosterByRosterName(RosterName.HUMAN);
  const team = createTeam(
    "Saved Roll Test",
    RosterName.HUMAN,
    { primary: 0, secondary: 0 },
    roster.rerollCost
  );
  team.players = roster.playerTemplates.map((template, index) =>
    createPlayer(template, team.id, index + 1)
  );
  team.teamValue = calculateTeamValue(team);
  return team;
}

function advancer(team: Team, spp: number): Player {
  const player = team.players.find((p) => (p.primary ?? []).length > 0)!;
  player.spp = spp;
  return player;
}

function dice(...values: number[]) {
  let index = 0;
  return { rollDie: () => values[index++ % values.length] };
}

/**
 * SPP advancement rolls are stored on the player as soon as they are made,
 * so a coach cannot escape a bad roll by reloading and rolling again.
 */
describe("saved SPP advancement rolls", () => {
  it("stores Random Primary candidates and refuses a second roll", () => {
    const player = advancer(buildTeam(), 20);
    const category = player.primary![0];
    const roll = rollPendingRandomPrimary(player, category, dice(1, 2, 4, 5));
    expect(player.pendingAdvancementRoll).toEqual(roll);
    expect(roll.kind).toBe("random-primary");
    expect(() =>
      rollPendingRandomPrimary(player, category, dice(6, 6))
    ).toThrow(/saved roll/);
    expect(() => rollPendingCharacteristic(player, dice(8))).toThrow(
      /saved roll/
    );
    expect(player.pendingAdvancementRoll).toEqual(roll);
  });

  it("only accepts one of the rolled skills, then clears the roll", () => {
    const player = advancer(buildTeam(), 20);
    const roll = rollPendingRandomPrimary(
      player,
      player.primary![0],
      dice(1, 2, 4, 5)
    );
    if (roll.kind !== "random-primary") throw new Error("unexpected roll");
    const rolled = roll.candidates.map((candidate) => candidate.skill);
    const other = eligibleSkills(player, player.primary!).find(
      (skill) => !rolled.includes(skill)
    )!;

    expect(() =>
      applyAdvancement(player, { kind: "random-primary", skill: other })
    ).toThrow(/rolled skills/);
    expect(() =>
      applyAdvancement(player, { kind: "chosen-primary", skill: other })
    ).toThrow(/rolled skills/);

    applyAdvancement(player, { kind: "random-primary", skill: rolled[0] });
    expect(player.pendingAdvancementRoll).toBeUndefined();
    expect(player.advancements?.[0].name).toBe(rolled[0]);
    expect(player.spp).toBe(17);
  });

  it("holds the Characteristic D8 to its saved result, including the skill fallback", () => {
    const player = advancer(buildTeam(), 20);
    rollPendingCharacteristic(player, dice(1));
    expect(player.pendingAdvancementRoll).toEqual({
      kind: "characteristic",
      roll: 1,
    });
    expect(() =>
      applyAdvancement(player, { kind: "characteristic", roll: 8, stat: "ST" })
    ).toThrow(/saved Characteristic roll of 1/);

    const [skill] = eligibleSkills(player, player.primary!);
    applyAdvancement(player, {
      kind: "characteristic-fallback",
      roll: 1,
      skill,
      access: "primary",
    });
    expect(player.pendingAdvancementRoll).toBeUndefined();
  });

  it("refuses to roll for an advancement the player cannot afford", () => {
    const player = advancer(buildTeam(), 4);
    expect(() => rollPendingCharacteristic(player, dice(5))).toThrow(
      /Not enough SPP/
    );
    expect(player.pendingAdvancementRoll).toBeUndefined();
  });

  it("survives a save and reload of the team", () => {
    const team = buildTeam();
    const player = advancer(team, 20);
    const roll = rollPendingRandomPrimary(
      player,
      player.primary![0],
      dice(3, 6, 4, 1)
    );
    const { team: reloaded } = hydrateStoredTeam(
      JSON.parse(JSON.stringify(dehydrateTeam(team)))
    );
    const again = reloaded.players.find((p) => p.id === player.id)!;
    expect(again.pendingAdvancementRoll).toEqual(roll);
  });
});
