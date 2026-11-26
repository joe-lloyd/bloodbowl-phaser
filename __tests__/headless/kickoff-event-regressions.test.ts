import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { type Scenario } from "../../src/types/Scenario";
import { GameEventNames } from "../../src/types/events";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { getDriveEffects } from "../../src/game/kickoff/driveEffects";
import { RosterName } from "../../src/types/Team";
import { SkillType } from "../../src/types/Skills";
import { type CommandResponse } from "../../src/headless/protocol";
import { createMatchSave } from "../../src/headless/serialization";
import {
  kick,
  findEveryEvent,
} from "./kickoffKicks";

describe("Kickoff table resolves exactly once per drive (regression: reroll after refresh)", () => {
  it("a save/restore mid-kickoff replays the same result instead of rolling again", async () => {
    const { game, result } = await kick(5);

    const state = game.ctx.gameService.getState();
    expect(state.kick?.resolution).toBeDefined();
    expect(state.kick?.resolution?.event).toBe(result.event);
    expect(state.kick?.resolution?.roll).toBe(result.roll);

    const bribesBeforeReplay = { ...game.snapshot().bribes };
    const driveEffectsBeforeReplay = structuredClone(
      game.snapshot().driveEffects ?? {}
    );

    const save = createMatchSave({
      state,
      teams: [game.ctx.team1, game.ctx.team2],
      drive: {
        kickingTeamId: game.ctx.team1.id,
        receivingTeamId: game.ctx.team2.id,
      },
      rng: game.ctx.rng.captureState(),
      matchStats: game.ctx.matchStats.captureState(),
      turnManager: game.ctx.gameService.captureTurnManagerState(),
    });

    const resumed = new HeadlessGame({ matchSave: save });
    expect(resumed.ctx.gameService.getState().kick?.resolution?.event).toBe(
      result.event
    );

    expect(resumed.ctx.rng.captureState()).toEqual(game.ctx.rng.captureState());

    expect(resumed.snapshot().bribes ?? {}).toEqual(bribesBeforeReplay);
    expect(resumed.snapshot().driveEffects ?? {}).toEqual(
      driveEffectsBeforeReplay
    );
  });

  it("clears the guard at end-of-drive teardown so the next drive can roll", async () => {
    const { game } = await kick(5);
    expect(game.ctx.gameService.getState().kick?.resolution).toBeDefined();

    game.ctx.gameService.resetDriveState();

    expect(game.ctx.gameService.getState().kick).toBeUndefined();
  });

  it("a save/restore mid-kickoff replays the same landing square through the resumed kick (no re-deviation)", async () => {
    const found = await findEveryEvent();
    const { game } = fixtureValue(found.get(KickoffEvent.CHARGE));

    expect(game.pendingDecision()?.type).toBe("kickoff-event");
    const originalBallPosition = game.snapshot().ballPosition;
    expect(originalBallPosition).not.toBeNull();
    const originalResolution =
      game.ctx.gameService.getState().kick?.resolution;
    expect(originalResolution?.event).toBe(KickoffEvent.CHARGE);
    expect(game.ctx.gameService.getState().kick?.kickingTeamId).toBe("team1");

    const save = createMatchSave({
      state: game.ctx.gameService.getState(),
      teams: [game.ctx.team1, game.ctx.team2],
      drive: {
        kickingTeamId: game.ctx.team1.id,
        receivingTeamId: game.ctx.team2.id,
      },
      rng: game.ctx.rng.captureState(),
      matchStats: game.ctx.matchStats.captureState(),
      turnManager: game.ctx.gameService.captureTurnManagerState(),
    });

    const resumed = new HeadlessGame({ matchSave: save });
    expect(resumed.ctx.gameService.getState().kick?.kickingTeamId).toBe("team1");
    expect(resumed.snapshot().ballPosition).toEqual(originalBallPosition);

    expect(resumed.pendingDecision()).toEqual(game.pendingDecision());
    const response = await resumed.execute({ type: "kickoff-skip" });

    expect(response.ok).toBe(true);

    const diceRollTypes = response.events
      .filter((event) => event.name === GameEventNames.DiceRoll)
      .map(
        (event) =>
          z.object({ rollType: z.string().exactOptional() }).parse(event.data)
            .rollType
      );
    expect(diceRollTypes).not.toContain("Kickoff Deviate Direction");
    expect(diceRollTypes).not.toContain("Kickoff Deviate Distance");
    expect(diceRollTypes).not.toContain("Kickoff Event");

    expect(resumed.ctx.gameService.getState().kick?.resolution).toEqual(
      originalResolution
    );

    const landing = z
      .union([
        z.object({
          landingSquare: z.union([
            z.object({ x: z.number(), y: z.number() }),
            z.null(),
          ]),
        }),
        z.undefined(),
      ])
      .parse(
        response.events.find(
          (event) => event.name === GameEventNames.KickoffBallLanding
        )?.data
      );
    expect(landing?.landingSquare).toEqual(originalBallPosition);
  });
});

function rushRolls(response: CommandResponse) {
  return response.events.filter(
    (event) =>
      event.name === GameEventNames.DiceRoll &&
      z
        .object({ rollType: z.string().exactOptional() })
        .parse(event.data)
        .rollType?.includes("Rush")
  );
}

describe("Dodgy Snack MA modifier applies before Rushes (regression)", () => {
  const maRushScenario: Scenario = {
    id: "dodgy-snack-ma-rush",
    name: "Dodgy Snack MA/Rush",
    description:
      "An MA 6 Human Lineman carrying a -1 Dodgy Snack MA modifier moves in " +
      "a straight clear line, so every step past effective MA is a Rush.",
    setup: {
      team1Placements: [{ playerIndex: 0, x: 3, y: 7 }],
      team2Placements: [{ playerIndex: 0, x: 20, y: 10 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      team1Roster: RosterName.HUMAN,
      team2Roster: RosterName.HUMAN,
    },
  };

  const sprintScenario: Scenario = {
    ...maRushScenario,
    id: "dodgy-snack-ma-rush-sprint",
    setup: {
      ...maRushScenario.setup,
      team1Placements: [
        { playerIndex: 0, x: 3, y: 7, skills: [SkillType.SPRINT] },
      ],
    },
  };

  it("an afflicted MA 6 player reaches 7 squares as 5 + 2 Rushes", async () => {
    const game = new HeadlessGame({ scenario: maRushScenario, seed: 2 });
    const playerId = fixtureValue(game.ctx.team1.players[0]).id;
    getDriveEffects(game.ctx.gameService.getState()).playerModifiers[playerId] =
      { maModifier: -1 };

    const path = [4, 5, 6, 7, 8, 9, 10].map((x) => ({ x, y: 7 }));
    const response = await game.execute({ type: "move", playerId, path });

    expect(response.ok).toBe(true);
    expect(
      response.events.some(
        (event) => event.name === GameEventNames.PlayerKnockedDown
      )
    ).toBe(false);

    expect(rushRolls(response)).toHaveLength(2);
    expect(fixtureValue(game.ctx.team1.players[0]).gridPosition).toEqual({
      x: 10,
      y: 7,
    });
  });

  it("a Sprint variant reaches 8 squares as 5 + 3 Rushes", async () => {
    const game = new HeadlessGame({ scenario: sprintScenario, seed: 2 });
    const playerId = fixtureValue(game.ctx.team1.players[0]).id;
    getDriveEffects(game.ctx.gameService.getState()).playerModifiers[playerId] =
      { maModifier: -1 };

    const path = [4, 5, 6, 7, 8, 9, 10, 11].map((x) => ({ x, y: 7 }));
    const response = await game.execute({ type: "move", playerId, path });

    expect(response.ok).toBe(true);
    expect(
      response.events.some(
        (event) => event.name === GameEventNames.PlayerKnockedDown
      )
    ).toBe(false);
    expect(rushRolls(response)).toHaveLength(3);
    expect(fixtureValue(game.ctx.team1.players[0]).gridPosition).toEqual({
      x: 11,
      y: 7,
    });
  });
});
