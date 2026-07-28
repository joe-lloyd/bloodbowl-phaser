import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { Scenario } from "../../src/types/Scenario";
import { GameEventNames } from "../../src/types/events";
import {
  INTERACTIVE_KICKOFF_EVENTS,
  KICKOFF_EVENT_MEANING,
  KICKOFF_TABLE,
  KickoffEvent,
} from "../../src/game/kickoff/kickoffEvents";
import {
  effectiveAV,
  effectiveMA,
  getDriveEffects,
} from "../../src/game/kickoff/driveEffects";
import { RosterName } from "../../src/types/Team";
import { SkillType } from "../../src/types/Skills";
import { CommandResponse } from "../../src/headless/protocol";
import { createMatchSave } from "../../src/headless/serialization";

const kickoffScenario: Scenario = {
  id: "kickoff-events",
  name: "Kickoff events",
  description: "Seven Open players per team and a team-one kick.",
  setup: {
    team1Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
      playerIndex,
      x: 5,
      y: playerIndex + 2,
    })),
    team2Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
      playerIndex,
      x: 14,
      y: playerIndex + 2,
    })),
    activeTeam: "team2",
    turn: 2,
    phase: GamePhase.KICKOFF,
    subPhase: SubPhase.ROLL_KICKOFF,
  },
};

type KickoffResult = {
  roll: number;
  event: KickoffEvent;
  meaning: string;
  outcome: {
    event: KickoffEvent;
    meaning: string;
    perTeam: Record<string, string[]>;
  };
};

async function kick(seed: number) {
  const game = new HeadlessGame({ scenario: kickoffScenario, seed });
  game.ctx.gameService.seedTurnCounts(2);
  const response = await game.execute({
    type: "kick-ball",
    playerId: game.ctx.team1.players[0].id,
    x: 14,
    y: 5,
  });
  const result = response.events.find(
    (event) => event.name === GameEventNames.KickoffResult
  )?.data as KickoffResult | undefined;
  if (!result) throw new Error(`seed ${seed} produced no kickoff result`);
  return { game, response, result };
}

async function findEveryEvent() {
  const found = new Map<
    KickoffEvent,
    Awaited<ReturnType<typeof kick>>
  >();
  for (let seed = 1; seed <= 800 && found.size < 11; seed++) {
    const run = await kick(seed);
    const needsPending = INTERACTIVE_KICKOFF_EVENTS.has(run.result.event);
    const hasPending = run.response.pendingDecision?.type === "kickoff-event";
    const highKickLandingEmpty =
      run.result.event !== KickoffEvent.HIGH_KICK ||
      (run.response.pendingDecision?.type === "kickoff-event" &&
        !!run.response.pendingDecision.landingSquare &&
        !run.game
          .snapshot()
          .teams.flatMap((team) => team.players)
          .some(
            (player) =>
              player.position?.x ===
                run.response.pendingDecision!.landingSquare!.x &&
              player.position?.y ===
                run.response.pendingDecision!.landingSquare!.y
          ));
    // High Kick can be suppressed by a touchback; retain a seed whose landing
    // square exists so the interactive requirement is actually exercised.
    if (
      !found.has(run.result.event) &&
      (!needsPending || hasPending) &&
      highKickLandingEmpty
    ) {
      found.set(run.result.event, run);
    } else if (hasPending) {
      await run.game.execute({ type: "kickoff-skip" });
    }
  }
  return found;
}

describe("Sevens kickoff events (seeded headless)", () => {
  it("maps every 2D6 total to the eleven Sevens events", () => {
    expect(Object.entries(KICKOFF_TABLE)).toEqual([
      ["2", KickoffEvent.GET_THE_REF],
      ["3", KickoffEvent.TIME_OUT],
      ["4", KickoffEvent.SOLID_DEFENCE],
      ["5", KickoffEvent.HIGH_KICK],
      ["6", KickoffEvent.CHEERING_FANS],
      ["7", KickoffEvent.BRILLIANT_COACHING],
      ["8", KickoffEvent.CHANGING_WEATHER],
      ["9", KickoffEvent.QUICK_SNAP],
      ["10", KickoffEvent.CHARGE],
      ["11", KickoffEvent.DODGY_SNACK],
      ["12", KickoffEvent.PITCH_INVASION],
    ]);
    expect(Object.values(KICKOFF_TABLE)).not.toContain("Blitz!");
    expect(Object.values(KICKOFF_TABLE)).not.toContain("Perfect Defence");
    expect(Object.values(KICKOFF_TABLE)).not.toContain("Throw a Rock");
  });

  it("reproduces and applies every result through the headless protocol", async () => {
    const found = await findEveryEvent();
    expect([...found.keys()].sort()).toHaveLength(11);

    for (const [event, run] of found) {
      expect(run.result.meaning).toBe(KICKOFF_EVENT_MEANING[event]);
      expect(run.result.outcome.event).toBe(event);
      expect(Object.keys(run.result.outcome.perTeam).length).toBeGreaterThan(0);
    }

    const getRef = found.get(KickoffEvent.GET_THE_REF)!;
    expect(getRef.game.snapshot().bribes).toEqual({ team1: 1, team2: 1 });

    const timeout = found.get(KickoffEvent.TIME_OUT)!;
    expect(timeout.game.ctx.gameService.getTurnNumber("team1")).toBe(3);
    // The receiving side immediately begins its turn after the event.
    expect(timeout.game.ctx.gameService.getTurnNumber("team2")).toBe(4);

    const cheering = found.get(KickoffEvent.CHEERING_FANS)!;
    expect(
      Object.keys(cheering.game.snapshot().driveEffects?.owedAssists ?? {})
        .length
    ).toBeGreaterThan(0);
    const cheeringLogs = cheering.response.events
      .filter(
        (eventRecord) =>
          eventRecord.name === GameEventNames.UI_GameLog &&
          String(eventRecord.data).includes("Cheering Fans")
      )
      .map((eventRecord) => String(eventRecord.data));
    expect(
      cheeringLogs.some((line) =>
        line.includes(cheering.game.ctx.team1.name)
      )
    ).toBe(true);
    expect(
      cheeringLogs.some((line) =>
        line.includes(cheering.game.ctx.team2.name)
      )
    ).toBe(true);
    expect(cheeringLogs.every((line) => line.includes("D6"))).toBe(true);

    const coaching = found.get(KickoffEvent.BRILLIANT_COACHING)!;
    expect(
      Object.values(
        coaching.game.snapshot().driveEffects?.freeRerolls ?? {}
      ).reduce((sum, count) => sum + count, 0)
    ).toBeGreaterThan(0);

    const weather = found.get(KickoffEvent.CHANGING_WEATHER)!;
    expect(
      weather.response.events.some(
        (eventRecord) => eventRecord.name === GameEventNames.WeatherChanged
      )
    ).toBe(true);

    const snack = found.get(KickoffEvent.DODGY_SNACK)!;
    const snackModifiers =
      snack.game.snapshot().driveEffects?.playerModifiers ?? {};
    expect(Object.keys(snackModifiers).length).toBeGreaterThan(0);
    for (const [playerId, modifier] of Object.entries(snackModifiers)) {
      const player = [...snack.game.ctx.team1.players, ...snack.game.ctx.team2.players]
        .find((candidate) => candidate.id === playerId)!;
      if (modifier.confinedToReserves) {
        expect(player.gridPosition).toBeUndefined();
        expect(player.status).toBe("Reserve");
      } else {
        expect(effectiveMA(player, snack.game.ctx.gameService.getState())).toBe(
          player.stats.MA - 1
        );
        expect(effectiveAV(player, snack.game.ctx.gameService.getState())).toBe(
          player.stats.AV - 1
        );
      }
    }

    const invasion = found.get(KickoffEvent.PITCH_INVASION)!;
    expect(
      invasion.game
        .snapshot()
        .teams.flatMap((team) => team.players)
        .some((player) => player.status === "Stunned")
    ).toBe(true);

    for (const event of INTERACTIVE_KICKOFF_EVENTS) {
      expect(found.get(event)?.response.pendingDecision).toMatchObject({
        type: "kickoff-event",
        event,
      });
    }

    const quick = found.get(KickoffEvent.QUICK_SNAP)!;
    expect(
      quick.response.events.some(
        (eventRecord) => eventRecord.name === GameEventNames.BallKicked
      )
    ).toBe(true);
    expect(
      quick.response.events.some(
        (eventRecord) =>
          eventRecord.name === GameEventNames.KickoffBallLanding
      )
    ).toBe(false);
    const quickSkipped = await quick.game.execute({ type: "kickoff-skip" });
    expect(
      quickSkipped.events.some(
        (eventRecord) =>
          eventRecord.name === GameEventNames.KickoffBallLanding
      )
    ).toBe(true);
    const quickLanding = quickSkipped.events.findIndex(
      (eventRecord) =>
        eventRecord.name === GameEventNames.KickoffBallLanding
    );
    const quickComplete = quickSkipped.events.findIndex(
      (eventRecord) =>
        eventRecord.name === GameEventNames.KickoffSequenceCompleted
    );
    const quickReady = quickSkipped.events.findIndex(
      (eventRecord) => eventRecord.name === GameEventNames.ReadyToStart
    );
    expect(quickLanding).toBeGreaterThanOrEqual(0);
    expect(quickComplete).toBeGreaterThan(quickLanding);
    expect(quickReady).toBeGreaterThan(quickComplete);

    const high = found.get(KickoffEvent.HIGH_KICK)!;
    const highBall = high.response.events.findIndex(
      (eventRecord) => eventRecord.name === GameEventNames.BallKicked
    );
    const highStep = high.response.events.findIndex(
      (eventRecord) =>
        eventRecord.name === GameEventNames.KickoffEventStepStarted
    );
    expect(highBall).toBeGreaterThanOrEqual(0);
    expect(highStep).toBeGreaterThan(highBall);

    for (const run of found.values()) {
      if (run.game.pendingDecision()?.type === "kickoff-event") {
        await run.game.execute({ type: "kickoff-skip" });
      }
    }
  });

  it("clears unused drive effects and restores effective MA/AV", () => {
    const game = new HeadlessGame({ scenario: kickoffScenario, seed: 1 });
    const player = game.ctx.team1.players[0];
    const baseMA = player.stats.MA;
    const baseAV = player.stats.AV;
    const effects = getDriveEffects(game.ctx.gameService.getState());
    effects.freeRerolls.team1 = 1;
    effects.owedAssists.team1 = { turn: 3, used: false };
    effects.playerModifiers[player.id] = {
      maModifier: -1,
      avModifier: -1,
    };
    effects.freeRerolls.team2 = 1;
    game.ctx.team2.rerolls = 0;
    expect(game.ctx.gameService.getRerollArbiter().teamRerollAvailable("team2")).toBe(
      true
    );
    game.ctx.gameService.getRerollArbiter().consumeTeamReroll("team2");
    expect(effects.freeRerolls.team2).toBeUndefined();
    expect(game.ctx.team2.rerolls).toBe(0);

    game.ctx.gameService.seedTurnCounts(2);
    effects.owedAssists.team2 = { turn: 2, used: false };
    game.ctx.gameService.endTurn();
    expect(effects.owedAssists.team2).toBeUndefined();

    expect(effectiveMA(player, game.ctx.gameService.getState())).toBe(
      baseMA - 1
    );
    expect(effectiveAV(player, game.ctx.gameService.getState())).toBe(
      baseAV - 1
    );

    game.ctx.gameService.resetDriveState();

    expect(game.snapshot().driveEffects).toEqual({
      freeRerolls: {},
      owedAssists: {},
      playerModifiers: {},
    });
    expect(effectiveMA(player, game.ctx.gameService.getState())).toBe(baseMA);
    expect(effectiveAV(player, game.ctx.gameService.getState())).toBe(baseAV);
  });

  it("redeploys Solid Defence directly on-pitch and resolves High Kick before landing", async () => {
    const found = await findEveryEvent();

    const solid = found.get(KickoffEvent.SOLID_DEFENCE)!;
    const solidPlayer = solid.game.ctx.team1.players[0];
    const original = { ...solidPlayer.gridPosition! };
    const occupied = new Set(
      [...solid.game.ctx.team1.players, ...solid.game.ctx.team2.players]
        .filter((player) => player.gridPosition)
        .map(
          (player) =>
            `${player.gridPosition!.x},${player.gridPosition!.y}`
        )
    );
    let destination: { x: number; y: number } | undefined;
    for (let x = 0; x <= 6 && !destination; x += 1) {
      for (let y = 0; y < 11; y += 1) {
        if (!occupied.has(`${x},${y}`)) {
          destination = { x, y };
          break;
        }
      }
    }
    expect(destination).toBeDefined();

    const invalidDrop = await solid.game.execute({
      type: "kickoff-place-player",
      playerId: solidPlayer.id,
      x: 7,
      y: original.y,
    });
    expect(invalidDrop.ok).toBe(false);
    expect(solidPlayer.gridPosition).toEqual(original);
    expect(solid.game.pendingDecision()).toMatchObject({
      selectedPlayerIds: [],
      movedPlayerIds: [],
    });

    const redeployed = await solid.game.execute({
      type: "kickoff-place-player",
      playerId: solidPlayer.id,
      x: destination!.x,
      y: destination!.y,
    });
    expect(redeployed.ok).toBe(true);
    expect(redeployed.pendingDecision).toMatchObject({
      selectedPlayerIds: [solidPlayer.id],
      movedPlayerIds: [solidPlayer.id],
      awaitingPlacement: [],
    });
    expect(solidPlayer.gridPosition).toEqual(destination);
    expect(solidPlayer.gridPosition).not.toEqual(original);

    const confirmed = await solid.game.execute({ type: "kickoff-confirm" });
    expect(confirmed.pendingDecision?.type).not.toBe("kickoff-event");
    expect(solidPlayer.gridPosition).toEqual(destination);

    const high = found.get(KickoffEvent.HIGH_KICK)!;
    const highPending = high.game.pendingDecision();
    expect(highPending?.type).toBe("kickoff-event");
    if (highPending?.type !== "kickoff-event") return;
    const landing = highPending.landingSquare!;
    const receiver = high.game.ctx.team2.players.find(
      (player) =>
        player.gridPosition &&
        (player.gridPosition.x !== landing.x ||
          player.gridPosition.y !== landing.y)
    )!;
    expect(
      (
        await high.game.execute({
          type: "kickoff-select-player",
          playerId: receiver.id,
        })
      ).ok
    ).toBe(true);
    const placed = await high.game.execute({
      type: "kickoff-place-player",
      playerId: receiver.id,
      x: landing.x,
      y: landing.y,
    });
    // A landing square already occupied by a different player cannot accept
    // High Kick; the seed finder ordinarily supplies an empty square.
    expect(placed.ok).toBe(true);
    expect(receiver.gridPosition).toEqual(landing);
  });

  it("spends Charge action budgets without consuming coming-turn activations", async () => {
    const found = await findEveryEvent();
    const { game } = found.get(KickoffEvent.CHARGE)!;
    const players = game.ctx.team1.players.slice(0, 2);
    for (const player of players) {
      await game.execute({
        type: "kickoff-select-player",
        playerId: player.id,
      });
    }
    await game.execute({ type: "kickoff-confirm" });

    expect(
      (
        await game.execute({
          type: "declare-action",
          playerId: players[0].id,
          action: "blitz",
        })
      ).ok
    ).toBe(true);
    expect(game.pendingDecision()).toMatchObject({
      type: "kickoff-event",
      charge: { budget: { blitz: 0 } },
    });
    await game.execute({
      type: "end-activation",
      playerId: players[0].id,
    });
    expect(game.pendingDecision()).toMatchObject({
      type: "kickoff-event",
      charge: { activePlayerId: players[1].id },
    });
    await game.execute({
      type: "declare-action",
      playerId: players[1].id,
      action: "move",
    });
    await game.execute({
      type: "end-activation",
      playerId: players[1].id,
    });

    expect(game.ctx.gameService.getKickoffEventStep()).toBeNull();
    expect(game.ctx.gameService.hasPlayerActed(players[0].id)).toBe(false);
    expect(game.ctx.gameService.hasPlayerActed(players[1].id)).toBe(false);
  });

  it("getKickoffEventStep() returns a fresh reference after each mutation (regression: frozen x/x counter)", async () => {
    const found = await findEveryEvent();
    const { game } = found.get(KickoffEvent.QUICK_SNAP)!;
    const beforeSelect = game.ctx.gameService.getKickoffEventStep();
    expect(beforeSelect?.selectedPlayerIds).toEqual([]);
    // Quick Snap belongs to the receiving coach — select one of their Open
    // players, not the kicking team's.
    const owningTeam =
      beforeSelect!.teamId === game.ctx.team1.id
        ? game.ctx.team1
        : game.ctx.team2;
    const player = owningTeam.players.find(
      (candidate) =>
        candidate.gridPosition &&
        candidate.gridPosition.x > 0 &&
        candidate.gridPosition.x < 20
    )!;

    const selectResponse = await game.execute({
      type: "kickoff-select-player",
      playerId: player.id,
    });
    expect(selectResponse.ok).toBe(true);
    const afterSelect = game.ctx.gameService.getKickoffEventStep();
    // A fresh object every call — not the same reference as before the
    // mutation, and not the same reference between two calls in a row.
    expect(afterSelect).not.toBe(beforeSelect);
    expect(afterSelect).not.toBe(game.ctx.gameService.getKickoffEventStep());
    expect(afterSelect?.selectedPlayerIds).toEqual([player.id]);
    // The two snapshots' array fields must be independent copies, not the
    // same mutable array leaking out to every caller.
    expect(afterSelect?.selectedPlayerIds).not.toBe(beforeSelect?.selectedPlayerIds);

    const toX = player.gridPosition!.x === 0 ? 1 : player.gridPosition!.x - 1;
    const moveResponse = await game.execute({
      type: "kickoff-move-player",
      playerId: player.id,
      x: toX,
      y: player.gridPosition!.y,
    });
    expect(moveResponse.ok).toBe(true);
    const afterMove = game.ctx.gameService.getKickoffEventStep();
    expect(afterMove).not.toBe(afterSelect);
    expect(afterMove?.movedPlayerIds).toEqual([player.id]);

    await game.execute({ type: "kickoff-skip" });
  });

  it("Charge!'s active player and step reference advance correctly across advanceCharge() (regression: frozen active player)", async () => {
    const found = await findEveryEvent();
    const { game } = found.get(KickoffEvent.CHARGE)!;
    const players = game.ctx.team1.players.slice(0, 2);
    for (const player of players) {
      await game.execute({
        type: "kickoff-select-player",
        playerId: player.id,
      });
    }

    const beforeConfirm = game.ctx.gameService.getKickoffEventStep();
    await game.execute({ type: "kickoff-confirm" });
    const afterConfirm = game.ctx.gameService.getKickoffEventStep();
    expect(afterConfirm).not.toBe(beforeConfirm);
    expect(afterConfirm?.charge?.activePlayerId).toBe(players[0].id);

    await game.execute({
      type: "declare-action",
      playerId: players[0].id,
      action: "move",
    });
    await game.execute({
      type: "end-activation",
      playerId: players[0].id,
    });
    const afterFirstAdvance = game.ctx.gameService.getKickoffEventStep();
    // The step reference must change and the active player must move on to
    // the second queued player — never stay frozen on the first.
    expect(afterFirstAdvance).not.toBe(afterConfirm);
    expect(afterFirstAdvance?.charge?.activePlayerId).toBe(players[1].id);
    expect(afterFirstAdvance?.charge?.activePlayerId).not.toBe(
      afterConfirm?.charge?.activePlayerId
    );

    await game.execute({
      type: "declare-action",
      playerId: players[1].id,
      action: "move",
    });
    await game.execute({
      type: "end-activation",
      playerId: players[1].id,
    });
    // Queue exhausted: the step closes.
    expect(game.ctx.gameService.getKickoffEventStep()).toBeNull();
  });

  it("aborts Charge immediately when the active player is knocked down", async () => {
    const found = await findEveryEvent();
    const { game } = found.get(KickoffEvent.CHARGE)!;
    const pending = game.pendingDecision();
    expect(pending?.type).toBe("kickoff-event");
    if (pending?.type !== "kickoff-event") return;

    const candidates = game.ctx.team1.players.slice(0, 2);
    for (const player of candidates) {
      expect(
        (
          await game.execute({
            type: "kickoff-select-player",
            playerId: player.id,
          })
        ).ok
      ).toBe(true);
    }
    expect((await game.execute({ type: "kickoff-confirm" })).ok).toBe(true);

    const active = game.pendingDecision();
    expect(active?.type).toBe("kickoff-event");
    if (active?.type !== "kickoff-event") return;
    const activeId = active.charge?.activePlayerId;
    expect(activeId).toBe(candidates[0].id);

    game.ctx.eventBus.emit(GameEventNames.PlayerKnockedDown, {
      playerId: activeId!,
    });
    await Promise.resolve();

    expect(game.ctx.gameService.getKickoffEventStep()).toBeNull();
    expect(game.ctx.gameService.hasPlayerActed(candidates[0].id)).toBe(false);
    expect(game.ctx.gameService.hasPlayerActed(candidates[1].id)).toBe(false);
  });
});

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
