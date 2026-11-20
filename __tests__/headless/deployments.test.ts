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
import { enumerateDecision } from "../../src/simulation/candidates";
import { plannerCoach } from "../../src/simulation/ai/planner";
import { createCoachRng } from "../../src/simulation/rng";
import { headlessCommandSchema } from "../../src/boundary/schemas/HeadlessCommand";
import { type MatchFormat } from "../../src/game/variants/activeMatch";

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

  async function computerSetup(format: MatchFormat, kicking: boolean) {
    const game = new HeadlessGame({ seed: 5, format });
    const kicker = kicking ? game.ctx.team1.id : game.ctx.team2.id;
    await game.execute({ type: "start-setup", kickingTeamId: kicker });
    if (!kicking) {
      const first = await enumerateDecision(game, null);
      const balanced = fixtureValue(
        first.candidates.find((c) => c.label.includes("Balanced"))
      );
      for (const command of balanced.commands) await game.execute(command);
    }
    const point = await enumerateDecision(game, null);
    const choice = await plannerCoach.choose({
      game,
      snapshot: game.snapshot(),
      point,
      rng: createCoachRng(1),
    });
    return {
      offered: point.candidates.map((c) => c.label),
      chosen: fixtureValue(point.candidates[choice.index]).label,
    };
  }

  it("has the computer kick from the Blitz line and receive in the Bunker on the Sevens pitch", async () => {
    const sevens: MatchFormat = { gameType: "sevens", venue: "stadium" };
    expect((await computerSetup(sevens, true)).chosen).toBe(
      "Set up in the Kick: Blitz line formation"
    );
    expect((await computerSetup(sevens, false)).chosen).toBe(
      "Set up in the Bunker formation"
    );
  });

  it("falls back to the Bunker where the Blitz line does not fit", async () => {
    const street = await computerSetup(
      { gameType: "street-bowl", venue: "street" },
      true
    );
    expect(street.offered).not.toContain(
      "Set up in the Kick: Blitz line formation"
    );
    expect(street.chosen).toBe("Set up in the Bunker formation");
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
});
