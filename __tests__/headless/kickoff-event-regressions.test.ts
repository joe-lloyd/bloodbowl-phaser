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
  type KickoffResult,
  kickoffResultSchema,
  kick,
  findEveryEvent,
} from "./kickoffKicks";

describe("Kickoff table resolves exactly once per drive (regression: reroll after refresh)", () => {
  it("a save/restore mid-kickoff replays the same result instead of rolling again", async () => {
    const { game, result } = await kick(5);

    const state = game.ctx.gameService.getState();
    expect(state.kickoffResolution).toBeDefined();
    expect(state.kickoffResolution?.event).toBe(result.event);
    expect(state.kickoffResolution?.roll).toBe(result.roll);

    const bribesBeforeReplay = { ...(game.snapshot().bribes ?? {}) };
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
    expect(resumed.ctx.gameService.getState().kickoffResolution?.event).toBe(
      result.event
    );

    const rngBeforeReplay = resumed.ctx.rng.captureState();
    let replayed: KickoffResult | undefined;
    resumed.ctx.eventBus.on(GameEventNames.KickoffResult, (data) => {
      replayed = data;
    });

    resumed.ctx.gameService.rollKickoff();

    expect(replayed).toBeDefined();
    expect(replayed?.roll).toBe(result.roll);
    expect(replayed?.event).toBe(result.event);
    expect(replayed?.outcome).toEqual(result.outcome);

    expect(resumed.ctx.rng.captureState()).toEqual(rngBeforeReplay);

    expect(resumed.snapshot().bribes ?? {}).toEqual(bribesBeforeReplay);
    expect(resumed.snapshot().driveEffects ?? {}).toEqual(
      driveEffectsBeforeReplay
    );
  });

  it("clears the guard at end-of-drive teardown so the next drive can roll", async () => {
    const { game } = await kick(5);
    expect(game.ctx.gameService.getState().kickoffResolution).toBeDefined();
    expect(game.ctx.gameService.getState().kickoffKickResolved).toBeDefined();

    game.ctx.gameService.resetDriveState();

    expect(game.ctx.gameService.getState().kickoffResolution).toBeUndefined();
    expect(game.ctx.gameService.getState().kickoffKickResolved).toBeUndefined();
  });

  it("a save/restore mid-kickoff replays the same landing square through the real kick-ball command (no re-deviation)", async () => {
    const found = await findEveryEvent();
    const { game } = fixtureValue(found.get(KickoffEvent.CHARGE));

    expect(game.pendingDecision()?.type).toBe("kickoff-event");
    const originalBallPosition = game.snapshot().ballPosition;
    expect(originalBallPosition).not.toBeNull();
    const originalResolution =
      game.ctx.gameService.getState().kickoffResolution;
    expect(originalResolution?.event).toBe(KickoffEvent.CHARGE);
    expect(game.ctx.gameService.getState().kickoffKickResolved).toEqual({
      isTeam1Kicking: true,
    });

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
    expect(resumed.ctx.gameService.getState().kickoffKickResolved).toEqual({
      isTeam1Kicking: true,
    });
    expect(resumed.snapshot().ballPosition).toEqual(originalBallPosition);

    const differentTarget =
      fixtureValue(originalBallPosition).x < 10
        ? {
            x: fixtureValue(originalBallPosition).x + 3,
            y: fixtureValue(originalBallPosition).y,
          }
        : {
            x: fixtureValue(originalBallPosition).x - 3,
            y: fixtureValue(originalBallPosition).y,
          };

    const response = await resumed.execute({
      type: "kick-ball",
      playerId: fixtureValue(resumed.ctx.team1.players[0]).id,
      x: differentTarget.x,
      y: differentTarget.y,
    });

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

    const replayedResult = kickoffResultSchema.parse(
      response.events.find(
        (event) => event.name === GameEventNames.KickoffResult
      )?.data
    );
    expect(replayedResult.roll).toBe(fixtureValue(originalResolution).roll);
    expect(replayedResult.event).toBe(fixtureValue(originalResolution).event);
    expect(replayedResult.outcome).toEqual(
      fixtureValue(originalResolution).outcome
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
