import { describe, expect, it } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { FormationManager } from "../../src/game/managers/FormationManager";
import { SetupValidator } from "../../src/game/validators/SetupValidator";
import { GAME_TYPES } from "../../src/game/variants/gameTypes";
import { gameTypeRules } from "../../src/game/variants/gameTypeRules";
import { withMatchFormat } from "../../src/game/variants/activeMatch";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { addPlayerToTeam, createTeam, RosterName } from "../../src/types/Team";
import { createPlayer } from "../../src/types/Player";

const GENERAL = ["Balanced", "Spread", "Bunker"];

function dwarfs() {
  const team = createTeam(
    "Deep Hold",
    RosterName.DWARF,
    { primary: 0, secondary: 0 },
    0
  );
  const roster = fixtureValue(getRosterByRosterName(RosterName.DWARF));
  const hire = (position: string) => {
    const template = fixtureValue(
      roster.playerTemplates.find((p) => p.positionName === position)
    );
    addPlayerToTeam(
      team,
      createPlayer(template, team.id, team.players.length + 1)
    );
  };
  [
    "Dwarf Lineman",
    "Dwarf Lineman",
    "Dwarf Lineman",
    "Dwarf Lineman",
    "Dwarf Runner",
    "Dwarf Blitzer",
    "Troll Slayer",
  ].forEach(hire);
  return team;
}

async function deploy(name: string, kicking: boolean) {
  const team1 = dwarfs();
  const game = new HeadlessGame({ seed: 5, team1 });
  if (!kicking) {
    await game.execute({
      type: "start-setup",
      kickingTeamId: game.ctx.team2.id,
    });
    const theirs = fixtureValue(
      new FormationManager()
        .getBuiltInFormations(false)
        .find((f) => f.name === "Balanced")
    );
    await game.execute({
      type: "apply-formation",
      teamId: game.ctx.team2.id,
      formation: theirs.positions,
    });
    await game.execute({ type: "confirm-setup", teamId: game.ctx.team2.id });
  } else {
    await game.execute({
      type: "start-setup",
      kickingTeamId: game.ctx.team1.id,
    });
  }
  const formation = fixtureValue(
    new FormationManager()
      .getBuiltInFormations(true)
      .find((f) => f.name === name)
  );
  const applied = await game.execute({
    type: "apply-formation",
    teamId: game.ctx.team1.id,
    formation: formation.positions,
  });
  expect(applied.ok).toBe(true);
  return Object.fromEntries(
    game.ctx.team1.players.map((p) => [
      p.positionName,
      p.gridPosition
        ? `${String(p.gridPosition.x)},${String(p.gridPosition.y)}`
        : "reserve",
    ])
  );
}

describe("deployments", () => {
  it("offers the general, kicking and receiving formations on the Sevens pitch", () => {
    for (const isTeam1 of [true, false])
      expect(
        new FormationManager().getBuiltInFormations(isTeam1).map((f) => f.name)
      ).toEqual([
        ...GENERAL,
        "Kick: Blitz line",
        "Kick: Press",
        "Kick: Screen",
        "Receive: Wedge",
        "Receive: Full line",
        "Receive: Flank",
      ]);
  });

  it("offers only legal formations, and always the general three, on every game type", () => {
    for (const gameType of GAME_TYPES)
      for (const venue of gameTypeRules(gameType).venues)
        withMatchFormat({ gameType, venue }, () => {
          for (const isTeam1 of [true, false]) {
            const offered = new FormationManager().getBuiltInFormations(
              isTeam1
            );
            expect(offered.map((f) => f.name)).toEqual(
              expect.arrayContaining(GENERAL)
            );
            for (const { positions } of offered)
              expect(
                new SetupValidator().validateFormation({ positions, isTeam1 })
                  .valid
              ).toBe(true);
          }
        });
  });

  it("sends the Runner with Sure Hands deep when receiving", async () => {
    const placed = await deploy("Receive: Wedge", false);
    expect(placed["Dwarf Runner"]).toBe("4,5");
  });

  it("keeps the Blitzer with Tackle and Diving Tackle back as the safety when kicking", async () => {
    const placed = await deploy("Kick: Press", true);
    expect(placed["Dwarf Blitzer"]).toBe("2,5");
    expect(placed["Troll Slayer"]).toMatch(/^6,/);
  });
});
