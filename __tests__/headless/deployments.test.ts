import { describe, expect, it } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { FormationManager } from "../../src/game/managers/FormationManager";
import { SetupValidator } from "../../src/game/validators/SetupValidator";
import { GAME_TYPES } from "../../src/game/variants/gameTypes";
import { gameTypeRules } from "../../src/game/variants/gameTypeRules";
import {
  type MatchFormat,
  withMatchFormat,
} from "../../src/game/variants/activeMatch";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { addPlayerToTeam, createTeam, RosterName } from "../../src/types/Team";
import { createPlayer } from "../../src/types/Player";
import { headlessCommandSchema } from "../../src/boundary/schemas/HeadlessCommand";

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
  for (const position of [
    "Dwarf Lineman",
    "Dwarf Lineman",
    "Dwarf Lineman",
    "Dwarf Lineman",
    "Dwarf Runner",
    "Dwarf Blitzer",
    "Troll Slayer",
  ]) {
    hire(position);
  }
  return team;
}

async function deploy(name: string, kicking: boolean) {
  const team1 = dwarfs();
  const game = new HeadlessGame({ seed: 5, team1 });
  if (kicking) {
    await game.execute({
      type: "start-setup",
      kickingTeamId: game.ctx.team1.id,
    });
  } else {
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

  async function kickingBunker(format: MatchFormat) {
    const game = new HeadlessGame({ seed: 5, team1: dwarfs(), format });
    await game.execute({
      type: "start-setup",
      kickingTeamId: game.ctx.team1.id,
    });
    const bunker = fixtureValue(
      new FormationManager()
        .getBuiltInFormations(true)
        .find((f) => f.name === "Bunker")
    );
    await game.execute({
      type: "apply-formation",
      teamId: game.ctx.team1.id,
      formation: bunker.positions,
    });
    const line = game.ctx.gameService.getState().setup;
    const los = format.gameType === "sevens" ? 6 : 12;
    expect(line?.kickingTeamId).toBe(game.ctx.team1.id);
    return game.ctx.team1.players
      .filter((p) => p.gridPosition?.x === los)
      .map((p) => p.positionName)
      .sort();
  }

  it("stands the Blitz line's flankers on the inner row of each Wide Zone", () => {
    const flankRows = (format: MatchFormat) =>
      withMatchFormat(format, () =>
        fixtureValue(
          new FormationManager()
            .getBuiltInFormations(true)
            .find((f) => f.name === "Kick: Blitz line")
        )
          .positions.filter((p) => p.role === "flank")
          .map((p) => p.y)
          .sort((a, b) => a - b)
      );
    expect({
      sevens: flankRows({ gameType: "sevens", venue: "stadium" }),
      beach: flankRows({ gameType: "beach-bowl", venue: "beach" }),
      gutter: flankRows({ gameType: "gutter-bowl", venue: "gutter-street" }),
    }).toEqual({ sevens: [1, 9], beach: [1, 7], gutter: [3, 11] });
  });

  it("kicks with a fast line in Sevens but a sturdy one where the lines touch", async () => {
    expect({
      sevens: await kickingBunker({ gameType: "sevens", venue: "stadium" }),
      street: await kickingBunker({ gameType: "street-bowl", venue: "street" }),
    }).toEqual({
      sevens: ["Dwarf Lineman", "Dwarf Runner", "Troll Slayer"],
      street: ["Dwarf Lineman", "Dwarf Lineman", "Dwarf Lineman"],
    });
  });

  it("refuses a formation square with a role it does not know", () => {
    const command = (role: unknown) => ({
      type: "apply-formation",
      teamId: "team1",
      formation: [{ playerId: "0", x: 6, y: 5, role }],
    });
    expect(headlessCommandSchema.safeParse(command("line")).success).toBe(true);
    expect(headlessCommandSchema.safeParse(command("bogus")).success).toBe(
      false
    );
    expect(headlessCommandSchema.safeParse(command(7)).success).toBe(false);
  });

  it("refuses a bad role through the headless command and keeps the setup", async () => {
    const game = new HeadlessGame({ seed: 5 });
    await game.execute({
      type: "start-setup",
      kickingTeamId: game.ctx.team1.id,
    });
    const press = fixtureValue(
      new FormationManager()
        .getBuiltInFormations(true)
        .find((f) => f.name === "Kick: Press")
    );
    expect(
      (
        await game.execute({
          type: "apply-formation",
          teamId: game.ctx.team1.id,
          formation: press.positions,
        })
      ).ok
    ).toBe(true);
    const before = game.ctx.team1.players.map((p) => p.gridPosition);
    const refused = await game.execute({
      type: "apply-formation",
      teamId: game.ctx.team1.id,
      formation: press.positions.map((p) => ({ ...p, role: "bogus" })),
    });
    expect(refused.ok).toBe(false);
    expect(game.ctx.team1.players.map((p) => p.gridPosition)).toEqual(before);
  });

  it("keeps every preset name reserved, even on a pitch that does not offer it", () => {
    withMatchFormat({ gameType: "street-bowl", venue: "street" }, () => {
      const manager = new FormationManager();
      expect(
        manager.getBuiltInFormations(true).map((f) => f.name)
      ).not.toContain("Kick: Blitz line");
      expect(manager.isBuiltIn("Kick: Blitz line")).toBe(true);
    });
  });
});
