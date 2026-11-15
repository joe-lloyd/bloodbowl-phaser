/**
 * Kickoff regressions: the table resolves once per drive, and a Dodgy Snack
 * lowers MA before the Rushes are counted.
 */

import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { Scenario } from "../../src/types/Scenario";
import { GameEventNames } from "../../src/types/events";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { getDriveEffects } from "../../src/game/kickoff/driveEffects";
import { RosterName } from "../../src/types/Team";
import { SkillType } from "../../src/types/Skills";
import { CommandResponse } from "../../src/headless/protocol";
import { createMatchSave } from "../../src/headless/serialization";
import { KickoffResult, kick, findEveryEvent } from "./kickoffKicks";

describe("Kickoff table resolves exactly once per drive (regression: reroll after refresh)", () => {
  // Simulates the investigated bug vector: a stale re-entry into
  // ROLL_KICKOFF (page refresh / restored save / the KICKOFF phase being
  // re-entered) re-offering "Select Kicker & Target" after the table has
  // already resolved for the drive, and the coach (or the engine, via
  // BallManager.rollKickoff()) triggering a second resolution. A restored
  // game must reproduce the exact same event/outcome rather than rolling
  // again or re-applying resolver effects a second time.
  it("a save/restore mid-kickoff replays the same result instead of rolling again", async () => {
    const { game, result } = await kick(5);

    const state = game.ctx.gameService.getState();
    expect(state.kickoffResolution).toBeDefined();
    expect(state.kickoffResolution?.event).toBe(result.event);
    expect(state.kickoffResolution?.roll).toBe(result.roll);

    // If an interactive step is still open (e.g. this seed rolled Charge!),
    // that is exactly the "mid-kickoff" moment the bug report describes:
    // the table has resolved but the sequence has not finished.
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
      replayed = data as KickoffResult;
    });

    // The exact vector under investigation: BallManager.rollKickoff() (the
    // standalone path distinct from kickBall()'s normal flow) firing again
    // for a drive whose kickoff has already resolved.
    resumed.ctx.gameService.rollKickoff();

    expect(replayed).toBeDefined();
    expect(replayed?.roll).toBe(result.roll);
    expect(replayed?.event).toBe(result.event);
    expect(replayed?.outcome).toEqual(result.outcome);

    // No new dice were consumed — the RNG position is unchanged.
    expect(resumed.ctx.rng.captureState()).toEqual(rngBeforeReplay);

    // Resolver effects (bribes, free re-rolls, drive modifiers, ...) were
    // not re-applied a second time.
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
    // state.subPhase stays ROLL_KICKOFF for the *entire* kickoff sequence
    // (deviation, table roll, any interactive step, landing, placement) —
    // it only advances once play resumes. That means a refresh/restore, or
    // any other stale re-entry into the KICKOFF phase, can land back on
    // "Select Kicker & Target" no matter how far the original kick had
    // progressed, and the browser's click handler unconditionally calls
    // gameService.kickBall() again. Exercise that exact real path — not the
    // otherwise-uncalled rollKickoff() shortcut — with an event whose
    // interactive step is still genuinely open at save time (Charge!).
    const found = await findEveryEvent();
    const { game } = found.get(KickoffEvent.CHARGE)!;

    expect(game.pendingDecision()?.type).toBe("kickoff-event");
    const originalBallPosition = game.snapshot().ballPosition;
    expect(originalBallPosition).not.toBeNull();
    const originalResolution = game.ctx.gameService.getState().kickoffResolution;
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

    // Simulate the real bug vector: the coach picks a kicker and a
    // DIFFERENT target square, and the browser issues the same "kick-ball"
    // command a second time for this drive.
    const differentTarget =
      originalBallPosition!.x < 10
        ? { x: originalBallPosition!.x + 3, y: originalBallPosition!.y }
        : { x: originalBallPosition!.x - 3, y: originalBallPosition!.y };

    const response = await resumed.execute({
      type: "kick-ball",
      playerId: resumed.ctx.team1.players[0].id,
      x: differentTarget.x,
      y: differentTarget.y,
    });

    expect(response.ok).toBe(true);

    // No new deviation was rolled and no new kickoff-table roll was made.
    const diceRollTypes = response.events
      .filter((event) => event.name === GameEventNames.DiceRoll)
      .map((event) => (event.data as { rollType?: string })?.rollType);
    expect(diceRollTypes).not.toContain("Kickoff Deviate Direction");
    expect(diceRollTypes).not.toContain("Kickoff Deviate Distance");
    expect(diceRollTypes).not.toContain("Kickoff Event");

    // The kickoff result reported is identical to the original resolution.
    const replayedResult = response.events.find(
      (event) => event.name === GameEventNames.KickoffResult
    )?.data as KickoffResult | undefined;
    expect(replayedResult?.roll).toBe(originalResolution!.roll);
    expect(replayedResult?.event).toBe(originalResolution!.event);
    expect(replayedResult?.outcome).toEqual(originalResolution!.outcome);

    // The ball lands at the SAME square as the original resolution, not the
    // new target — this is the exact divergence a skeptical review
    // reproduced against the table-only guard (a different deviation roll
    // landing the ball on a different square across the restore). Read the
    // landing square off KickoffBallLanding rather than the final snapshot:
    // this second execute() runs the whole sequence uninterrupted (Charge!'s
    // interactive step isn't reopened on replay), so by the time it returns
    // the ball has already been caught/bounced onward from the landing
    // square — exactly as it would have with the original resolution too,
    // just now completed in one call instead of pausing for the coach.
    const landing = response.events.find(
      (event) => event.name === GameEventNames.KickoffBallLanding
    )?.data as { landingSquare: { x: number; y: number } | null } | undefined;
    expect(landing?.landingSquare).toEqual(originalBallPosition);
  });
});

describe("Dodgy Snack MA modifier applies before Rushes (regression)", () => {
  // A clear straight lane with the opposing player far out of the way, so
  // every step is a plain move/Rush with no dodges to consume dice rolls.
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
        (event.data as { rollType?: string })?.rollType?.includes("Rush")
    );
  }

  it("an afflicted MA 6 player reaches 7 squares as 5 + 2 Rushes", async () => {
    const game = new HeadlessGame({ scenario: maRushScenario, seed: 2 });
    const playerId = game.ctx.team1.players[0].id;
    getDriveEffects(game.ctx.gameService.getState()).playerModifiers[
      playerId
    ] = { maModifier: -1 };

    const path = [4, 5, 6, 7, 8, 9, 10].map((x) => ({ x, y: 7 }));
    const response = await game.execute({ type: "move", playerId, path });

    expect(response.ok).toBe(true);
    expect(
      response.events.some(
        (event) => event.name === GameEventNames.PlayerKnockedDown
      )
    ).toBe(false);
    // Effective MA is 5 (6 - 1): steps 6 and 7 are Rushes, not just step 7 —
    // the bug this guards against rushed only the raw-MA-6th step.
    expect(rushRolls(response)).toHaveLength(2);
    expect(game.ctx.team1.players[0].gridPosition).toEqual({ x: 10, y: 7 });
  });

  it("a Sprint variant reaches 8 squares as 5 + 3 Rushes", async () => {
    const game = new HeadlessGame({ scenario: sprintScenario, seed: 2 });
    const playerId = game.ctx.team1.players[0].id;
    getDriveEffects(game.ctx.gameService.getState()).playerModifiers[
      playerId
    ] = { maModifier: -1 };

    const path = [4, 5, 6, 7, 8, 9, 10, 11].map((x) => ({ x, y: 7 }));
    const response = await game.execute({ type: "move", playerId, path });

    expect(response.ok).toBe(true);
    expect(
      response.events.some(
        (event) => event.name === GameEventNames.PlayerKnockedDown
      )
    ).toBe(false);
    expect(rushRolls(response)).toHaveLength(3);
    expect(game.ctx.team1.players[0].gridPosition).toEqual({ x: 11, y: 7 });
  });
});
