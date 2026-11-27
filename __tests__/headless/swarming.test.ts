import { parseJson } from "../../src/boundary/json";
import { matchSaveSchema } from "../../src/boundary/schemas/MatchSave";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it, vi } from "vitest";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { FormationManager } from "../../src/game/managers/FormationManager";
import { chooseFirstLinemanAsVeteran } from "../../src/game/rules/veteran";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { createReadyMadeTeam } from "../../src/simulation/lineups";
import { enumerateDecision } from "../../src/simulation/candidates";
import { GamePhase } from "../../src/types/GameState";
import { createPlayer, PlayerStatus } from "../../src/types/Player";
import { createTeam, RosterName, type Team } from "../../src/types/Team";

function snotlings(linemen = 7): Team {
  const roster = getRosterByRosterName(RosterName.SNOTLING);
  const team = createTeam(
    "Swarm",
    RosterName.SNOTLING,
    { primary: 0, secondary: 1 },
    roster.rerollCost
  );

  const names = [
    "Fun-hoppa",
    "Fun-hoppa",
    "Stilty Runna",
    ...Array.from({ length: linemen }, () => "Snotling Lineman"),
    "Stilty Runna",
  ];
  team.players = names.map((name, index) =>
    createPlayer(
      fixtureValue(
        roster.playerTemplates.find((player) => player.positionName === name)
      ),
      team.id,
      index + 1
    )
  );
  chooseFirstLinemanAsVeteran(team);
  return team;
}

async function setUp(game: HeadlessGame) {
  const started = await game.execute({
    type: "start-setup",
    kickingTeamId: game.ctx.teams[0].id,
  });
  expect(started.ok).toBe(true);
  for (const [team, isTeam1] of [
    [game.ctx.teams[0], true],
    [game.ctx.teams[1], false],
  ] as const) {
    const formation = fixtureValue(
      new FormationManager().getBuiltInFormations(isTeam1)[0]
    ).positions;
    const applied = await game.execute({
      type: "apply-formation",
      teamId: team.id,
      formation,
    });
    expect(applied.ok).toBe(true);
    const confirmed = await game.execute({
      type: "confirm-setup",
      teamId: team.id,
    });
    expect(confirmed.ok).toBe(true);
  }
}

function gameWith(
  team1: Team,
  team2 = createReadyMadeTeam(RosterName.HUMAN, "Visitors", 1)
) {
  const game = new HeadlessGame({ seed: 17, teams: [team1, team2] });
  const rollDieSpy = vi.spyOn(game.ctx.rng, "rollDie").mockReturnValue(6);
  return Object.assign(game, { rollDieSpy });
}

describe("2025 Swarming through the match protocol", () => {
  it("rolls once per drive, refuses a setup restart, and rolls again for the next drive", async () => {
    const game = gameWith(snotlings());
    await setUp(game);
    const allowance = game.snapshot().setup?.swarming;
    expect(game.rollDieSpy.mock.calls).toHaveLength(1);
    await game.execute({
      type: "start-setup",
      kickingTeamId: game.ctx.teams[0].id,
    });
    expect(game.snapshot().setup?.swarming).toEqual(allowance);
    expect(game.rollDieSpy.mock.calls).toHaveLength(1);
    await game.execute({ type: "confirm-setup", teamId: game.ctx.teams[0].id });
    game.ctx.gameService.resetDriveState();
    await setUp(game);
    expect(game.rollDieSpy.mock.calls).toHaveLength(2);
    expect(
      game.ctx.gameService.getSetupStatus(game.ctx.teams[0].id)?.swarming
        ?.additionalPlayerCount
    ).toBe(0);
  });

  it("keeps Underworld Denizens at seven even though they have Snotlings", async () => {
    const game = gameWith(
      createReadyMadeTeam(RosterName.UNDERWORLD_DENIZENS, "Underworld", 1)
    );
    await setUp(game);
    expect(game.snapshot().phase).toBe(GamePhase.KICKOFF);
    expect(
      game.ctx.teams[0].players.filter((player) => player.gridPosition)
    ).toHaveLength(7);
    expect(game.rollDieSpy.mock.calls).toHaveLength(0);
  });

  it("adds reserve Linemen after both setups, with the usual placement restrictions", async () => {
    const game = gameWith(snotlings());
    await setUp(game);
    expect(game.snapshot().phase).toBe(GamePhase.SETUP);
    const legalResponse = await game.execute({ type: "legal-actions" });
    const legal = fixtureValue(fixtureValue(legalResponse.legalActions).setup);
    expect(legal.status.swarming).toEqual({
      roll: 3,
      maximumAdditionalPlayers: 3,
      additionalPlayerCount: 0,
    });
    expect(legal.canApplyPreset).toBe(false);
    expect(legal.canConfirm).toBe(true);
    const reserve = game.ctx.teams[0].players[7];
    const neutral = await game.execute({
      type: "place-player",
      playerId: fixtureValue(reserve).id,
      x: 7,
      y: 4,
    });
    expect(neutral.ok).toBe(false);
    expect(neutral.reason).toContain("between the Lines");
    for (const [index, y] of [2, 3, 7].entries()) {
      const placed = await game.execute({
        type: "place-player",
        playerId: fixtureValue(game.ctx.teams[0].players[7 + index]).id,
        x: 6,
        y,
      });
      expect(placed.ok).toBe(true);
    }
    expect(
      game.ctx.teams[0].players.filter((player) => player.gridPosition)
    ).toHaveLength(10);
    const team1Confirmed = await game.execute({
      type: "confirm-setup",
      teamId: game.ctx.teams[0].id,
    });
    expect(team1Confirmed.ok).toBe(true);
    expect(game.snapshot().phase).toBe(GamePhase.KICKOFF);
    expect(game.snapshot().activeTeamId).toBe(game.ctx.teams[1].id);
  });

  it("keeps confirmed players in place and refuses reserve positionals", async () => {
    const game = gameWith(snotlings());
    await setUp(game);
    const base = game.ctx.teams[0].players[0];
    const position = { ...fixtureValue(fixtureValue(base).gridPosition) };
    const basePlaced = await game.execute({
      type: "place-player",
      playerId: fixtureValue(base).id,
      x: 1,
      y: 2,
    });
    expect(basePlaced.ok).toBe(false);
    await game.execute({
      type: "remove-player",
      playerId: fixtureValue(base).id,
    });
    expect(fixtureValue(base).gridPosition).toEqual(position);
    const eighthPlaced = await game.execute({
      type: "place-player",
      playerId: fixtureValue(game.ctx.teams[0].players[10]).id,
      x: 1,
      y: 2,
    });
    expect(eighthPlaced.ok).toBe(false);
    const swapped = await game.execute({
      type: "swap-players",
      player1Id: fixtureValue(base).id,
      player2Id: fixtureValue(game.ctx.teams[0].players[7]).id,
    });
    expect(swapped.ok).toBe(false);
  });

  it("caps additions at the D3 result and allows declining them", async () => {
    const game = gameWith(snotlings());
    game.rollDieSpy.mockReturnValue(1);
    await setUp(game);
    const firstAddition = await game.execute({
      type: "place-player",
      playerId: fixtureValue(game.ctx.teams[0].players[7]).id,
      x: 5,
      y: 4,
    });
    expect(firstAddition.ok).toBe(true);
    const secondAddition = await game.execute({
      type: "place-player",
      playerId: fixtureValue(game.ctx.teams[0].players[8]).id,
      x: 5,
      y: 5,
    });
    expect(secondAddition.ok).toBe(false);
    const declined = gameWith(snotlings());
    await setUp(declined);
    await declined.execute({
      type: "confirm-setup",
      teamId: declined.ctx.teams[0].id,
    });
    expect(
      declined.ctx.teams[0].players.filter((player) => player.gridPosition)
    ).toHaveLength(7);
    expect(declined.snapshot().phase).toBe(GamePhase.KICKOFF);
  });

  it("works with a GW-legal eight-player roster and excludes unavailable reserves", async () => {
    const team = snotlings(4);

    team.players.unshift(fixtureValue(team.players.pop()));
    const game = gameWith(team);
    await setUp(game);
    expect(
      game.ctx.gameService.getSetupStatus(team.id)?.swarming
        ?.maximumAdditionalPlayers
    ).toBe(1);
    const hurt = snotlings();
    const noReserves = gameWith(hurt);
    for (const player of noReserves.ctx.teams[0].players.slice(7))
      player.status = PlayerStatus.KO;
    await setUp(noReserves);
    expect(noReserves.snapshot().phase).toBe(GamePhase.KICKOFF);
  });

  it("resumes a saved allowance and placements without rolling again", async () => {
    const game = gameWith(snotlings());
    await setUp(game);
    await game.execute({
      type: "place-player",
      playerId: fixtureValue(game.ctx.teams[0].players[7]).id,
      x: 5,
      y: 4,
    });
    const save = game.matchSave();
    const resumed = new HeadlessGame({
      matchSave: parseJson(JSON.stringify(save), matchSaveSchema),
    });
    const rng = resumed.ctx.rng.captureState();
    expect(
      resumed.ctx.gameService.getSetupStatus(game.ctx.teams[0].id)?.swarming
    ).toEqual({
      roll: 3,
      maximumAdditionalPlayers: 3,
      additionalPlayerCount: 1,
    });
    await resumed.execute({ type: "legal-actions" });
    expect(resumed.ctx.rng.captureState()).toEqual(rng);
    await resumed.execute({ type: "confirm-setup", teamId: game.ctx.teams[0].id });
    expect(
      resumed.ctx.teams[0].players.filter((player) => player.gridPosition)
    ).toHaveLength(8);
    expect(resumed.snapshot().phase).toBe(GamePhase.KICKOFF);
  });

  it("offers both coaches their own allowance and lets the computer place extras", async () => {
    const game = gameWith(snotlings(), snotlings());
    await setUp(game);
    for (const team of [game.ctx.teams[0], game.ctx.teams[1]]) {
      expect(game.snapshot().activeTeamId).toBe(team.id);
      const choice = await enumerateDecision(game, game.ctx.teams[0].id);
      expect(fixtureValue(choice.candidates[0]).label).toContain("Swarming");
      const commands = fixtureValue(choice.candidates[0]).commands;
      for (const command of commands) {
        const commandResult = await game.execute(command);
        expect(commandResult.ok).toBe(true);
      }
      expect(team.players.filter((player) => player.gridPosition)).toHaveLength(
        10
      );
    }
    expect(game.snapshot().phase).toBe(GamePhase.KICKOFF);
  });
});
