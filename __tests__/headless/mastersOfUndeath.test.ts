import { describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { InjuryOperation } from "../../src/game/operations/InjuryOperation";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { InjuryType, PlayerStatus } from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";
import { SkillType, getSkill } from "../../src/types/Skills";
import { createMatchSave } from "../../src/headless/serialization";
import { GameEventNames } from "../../src/types/events";
import {
  canKeepRaisedDead,
  offerRaisedDeadRecruit,
  resolveRaisedDeadRecruit,
} from "../../src/game/rules/raiseDead";
import {
  dehydrateTeam,
  readStoredTeam,
} from "../../src/data/persistence/teamPersistence";
import { eligibleSkillSelectionPlayers } from "../../src/game/progression/advancementModes";

function newGame(roster = RosterName.TOMB_KINGS) {
  return new HeadlessGame({
    seed: 1,
    progressionEnabled: true,
    scenario: {
      id: "raise-the-dead",
      name: "Raise the Dead",
      description: "An opposition player dies during a Sevens match",
      setup: {
        team1Roster: roster,
        team2Roster: RosterName.HUMAN,
        team1Placements: [{ playerIndex: 0, x: 4, y: 5 }],
        team2Placements: [
          { playerIndex: 0, x: 5, y: 5 },
          { playerIndex: 1, x: 7, y: 5 },
        ],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
      },
    },
  });
}

async function injure(game: HeadlessGame, playerId: string, total = 12) {
  vi.spyOn(game.ctx.gameService.getDiceController(), "roll2D6").mockReturnValue(
    total
  );
  let decisionRaised: () => void = () => {};
  const decision = new Promise<void>((resolve) => {
    decisionRaised = resolve;
  });
  game.ctx.eventBus.on(GameEventNames.DecisionRequested, decisionRaised);
  game.ctx.gameService.flowManager.add(new InjuryOperation(playerId));
  await Promise.race([game.ctx.gameService.flowManager.whenIdle(), decision]);
  game.ctx.eventBus.off(GameEventNames.DecisionRequested, decisionRaised);
}

describe("Masters of Undeath in Sevens", () => {
  it("raises a Skeleton in Reserves even when the death has no killer", async () => {
    const game = newGame();
    const size = game.ctx.team1.players.length;
    await injure(game, game.ctx.team2.players[0].id);
    expect(game.ctx.team1.players).toHaveLength(size + 1);
    const raised = game.ctx.team1.players.at(-1)!;
    expect(raised.positionName).toBe("Skeleton Lineman");
    expect(raised.status).toBe(PlayerStatus.RESERVE);
    expect(raised.gridPosition).toBeUndefined();
    expect(raised.stats).toEqual({ MA: 5, ST: 3, AG: 4, PA: 6, AV: 8 });
  });

  it.each([10, 11])(
    "does not raise anyone for injury total %i",
    async (total) => {
      const game = newGame();
      const size = game.ctx.team1.players.length;
      await injure(game, game.ctx.team2.players[0].id, total);
      expect(game.ctx.team1.players).toHaveLength(size);
    }
  );

  it.each(["strength", "stunty", "own team", "no special rule"])(
    "does not raise an ineligible victim: %s",
    async (reason) => {
      const game = newGame(
        reason === "no special rule" ? RosterName.HUMAN : RosterName.TOMB_KINGS
      );
      const victim =
        reason === "own team"
          ? game.ctx.team1.players[0]
          : game.ctx.team2.players[0];
      if (reason === "strength") victim.stats.ST = 5;
      if (reason === "stunty") victim.skills.push(getSkill(SkillType.STUNTY));
      if (reason === "own team") victim.skills = [];
      const size = game.ctx.team1.players.length;
      await injure(game, victim.id);
      expect(game.ctx.team1.players).toHaveLength(size);
    }
  );

  it("preserves the once-per-game limit through a saved match", async () => {
    const game = newGame();
    const size = game.ctx.team1.players.length;
    await injure(game, game.ctx.team2.players[0].id);
    const save = createMatchSave({
      state: game.ctx.gameService.getState(),
      teams: [game.ctx.team1, game.ctx.team2],
      drive: {
        kickingTeamId: game.ctx.team1.id,
        receivingTeamId: game.ctx.team2.id,
      },
      rng: game.ctx.rng.captureState(),
      matchStats: game.ctx.matchStats.captureState(),
    });
    const resumed = new HeadlessGame({ matchSave: save });
    await injure(resumed, resumed.ctx.team2.players[1].id);
    expect(resumed.ctx.team1.players).toHaveLength(size + 1);
  });

  it.each([true, false])(
    "waits for the Apothecary, saved = %s",
    async (saved) => {
      const game = newGame();
      const size = game.ctx.team1.players.length;
      game.ctx.team2.apothecary = true;
      await injure(game, game.ctx.team2.players[0].id);
      expect(game.pendingDecision()?.type).toBe("apothecary");
      expect(game.ctx.team1.players).toHaveLength(size);
      vi.spyOn(
        game.ctx.gameService.getDiceController(),
        "rollD6"
      ).mockReturnValue(saved ? 4 : 3);
      const response = await game.execute({
        type: "use-apothecary",
        accept: true,
      });
      expect(response.ok).toBe(true);
      expect(game.ctx.team1.players).toHaveLength(size + (saved ? 0 : 1));
    }
  );

  it("does not raise a player saved by Regeneration", async () => {
    const game = newGame();
    const size = game.ctx.team1.players.length;
    const victim = game.ctx.team2.players[0];
    victim.skills.push(getSkill(SkillType.REGENERATION));
    vi.spyOn(
      game.ctx.gameService.getDiceController(),
      "rollD6"
    ).mockReturnValue(4);
    await injure(game, victim.id);
    expect(victim.injuries).not.toContain(InjuryType.DEAD);
    expect(game.ctx.team1.players).toHaveLength(size);
  });

  it("records a raised player's subsequent participation and touchdown", async () => {
    const game = newGame();
    const size = game.ctx.team1.players.length;
    await injure(game, game.ctx.team2.players[0].id);
    expect(game.ctx.team1.players).toHaveLength(size + 1);
    const raised = game.ctx.team1.players.at(-1)!;
    game.ctx.eventBus.emit(GameEventNames.PlayerPlaced, {
      playerId: raised.id,
      x: 3,
      y: 3,
    });
    game.ctx.eventBus.emit(GameEventNames.Touchdown, {
      teamId: raised.teamId,
      scorerId: raised.id,
    });
    expect(
      game.ctx.matchStats
        .summary()
        .players.find((p) => p.playerId === raised.id)
    ).toMatchObject({
      participated: true,
      touchdowns: 1,
      sppEarned: 3,
    });
  });

  it("allows an ST 4 victim whose Regeneration fails", async () => {
    const game = newGame();
    const size = game.ctx.team1.players.length;
    const victim = game.ctx.team2.players[0];
    victim.stats.ST = 4;
    victim.skills.push(getSkill(SkillType.REGENERATION));
    vi.spyOn(
      game.ctx.gameService.getDiceController(),
      "rollD6"
    ).mockReturnValue(3);
    await injure(game, victim.id);
    expect(game.ctx.team1.players).toHaveLength(size + 1);
  });

  it("temporarily raises a Lineman even above the Sevens roster limit", async () => {
    const game = newGame();
    const size = game.ctx.team1.players.length;
    game.ctx.team1.maxRosterSize = size;
    await injure(game, game.ctx.team2.players[0].id);
    expect(game.ctx.team1.players).toHaveLength(size + 1);
  });
});

describe("Raised Lineman post-match recruitment", () => {
  async function offer() {
    const game = newGame();
    const team = game.ctx.team1;
    team.advancementMode = "advanced-league";
    await injure(game, game.ctx.team2.players[0].id);
    const raised = team.players.at(-1)!;
    expect(raised.positionName).toBe("Skeleton Lineman");
    offerRaisedDeadRecruit(team, raised.id);
    const pending = team.pendingDevelopment?.find(
      (entry) => entry.kind === "raised-dead-recruit"
    );
    if (!pending || pending.kind !== "raised-dead-recruit")
      throw new Error("No recruitment offer");
    return { team, raised, pending };
  }

  it("persists the choice without charging treasury and keeps the player's full value", async () => {
    const { team, raised, pending } = await offer();
    const treasury = team.treasury;
    const loaded = readStoredTeam(
      JSON.parse(JSON.stringify(dehydrateTeam(team)))
    ).team;
    expect(loaded.pendingDevelopment).toContainEqual(pending);
    resolveRaisedDeadRecruit(loaded, pending, true);
    expect(loaded.treasury).toBe(treasury);
    const hired = loaded.players.find((p) => p.id === raised.id)!;
    expect(hired.cost + hired.teamValue).toBe(40_000);
    expect(loaded.teamValue).toBe(320_000);
    expect(loaded.pendingDevelopment).toEqual([]);
  });

  it("lets the coach decline without firing an existing roster player", async () => {
    const { team, raised, pending } = await offer();
    const others = team.players
      .filter((p) => p.id !== raised.id)
      .map((p) => p.id);
    resolveRaisedDeadRecruit(team, pending, false);
    expect(team.players.map((p) => p.id)).toEqual(others);
    expect(team.pendingDevelopment).toEqual([]);
  });

  it("refuses to hire into a full roster and still permits release", async () => {
    const { team, raised, pending } = await offer();
    team.maxRosterSize = team.players.length - 1;
    expect(canKeepRaisedDead(team, raised.id)).toBe(false);
    expect(() => resolveRaisedDeadRecruit(team, pending, true)).toThrow(
      "no room"
    );
    expect(team.pendingDevelopment).toContainEqual(pending);
    resolveRaisedDeadRecruit(team, pending, false);
    expect(team.players).toHaveLength(team.maxRosterSize);
  });

  it("does not count departing Journeymen or dead players against hiring space", async () => {
    const { team, raised, pending } = await offer();
    team.maxRosterSize = team.players.length - 2;
    team.players[0].injuries.push(InjuryType.DEAD);
    team.players[1].playerKind = "journeyman";
    expect(canKeepRaisedDead(team, raised.id)).toBe(true);
    resolveRaisedDeadRecruit(team, pending, true);
    const loaded = readStoredTeam(
      JSON.parse(JSON.stringify(dehydrateTeam(team)))
    ).team;
    expect(loaded.players).toHaveLength(team.maxRosterSize);
    expect(loaded.players.map((p) => p.id)).toContain(raised.id);
  });

  it.each(["matched-play", "dead"])(
    "releases a temporary recruit after %s",
    async (reason) => {
      const { team, raised, pending } = await offer();
      team.pendingDevelopment = [];
      if (reason === "matched-play") team.advancementMode = "matched-play";
      else raised.injuries.push(InjuryType.DEAD);
      offerRaisedDeadRecruit(team, raised.id);
      expect(team.players.map((p) => p.id)).not.toContain(raised.id);
      expect(team.pendingDevelopment).not.toContainEqual(pending);
    }
  );

  it("does not duplicate a persisted offer on repeated confirmation", async () => {
    const { team, raised, pending } = await offer();
    offerRaisedDeadRecruit(team, raised.id);
    expect(team.pendingDevelopment).toEqual([pending]);
  });

  it("offers development only after the recruit has been hired", async () => {
    const { team, raised, pending } = await offer();
    expect(eligibleSkillSelectionPlayers(team)).not.toContain(raised.id);
    resolveRaisedDeadRecruit(team, pending, true);
    expect(eligibleSkillSelectionPlayers(team)).toContain(raised.id);
  });

  it("clears any advancement work for a declined recruit", async () => {
    const { team, raised, pending } = await offer();
    team.pendingDevelopment!.push({
      id: "raised-advancement",
      kind: "advanced-league-advancement",
      playerId: raised.id,
      createdAt: 1,
    });
    resolveRaisedDeadRecruit(team, pending, false);
    expect(team.pendingDevelopment).toEqual([]);
  });
});
